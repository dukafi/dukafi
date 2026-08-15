require "fileutils"
require "ipaddr"
require "net/http"
require "resolv"
require "securerandom"
require "uri"

# Taking in a file and making it a MediaAsset.
#
# Shared by the admin's multipart upload and MCP's, so the validation cannot
# apply in one and not the other.
#
# The type is decided by SNIFFING THE BYTES, never by what the caller says it
# is. A declared content-type is just a string an attacker controls; the
# existing admin route trusts `upload[:type]`, which is how a `.png` that is
# really an HTML document ends up served from your own origin.
module MediaIntake
  class Invalid < StandardError; end

  # Generous for a product photo, far below anything that would exhaust a
  # small Railway instance's disk or memory.
  MAX_BYTES = 10 * 1024 * 1024

  # Leading bytes → mime. Anything not matched here is refused outright, so
  # the allow-list is the file format itself rather than its name.
  SIGNATURES = [
    ["\x89PNG\r\n\x1A\n".b, "image/png", ".png"],
    ["\xFF\xD8\xFF".b, "image/jpeg", ".jpg"],
    ["GIF87a".b, "image/gif", ".gif"],
    ["GIF89a".b, "image/gif", ".gif"],
  ].freeze

  module_function

  # RIFF....WEBP — the size sits between the two markers, so it needs its own
  # check rather than a prefix compare.
  def webp?(bytes)
    bytes.byteslice(0, 4) == "RIFF".b && bytes.byteslice(8, 4) == "WEBP".b
  end

  def svg?(bytes)
    head = bytes.byteslice(0, 1024).to_s
    head.include?("<svg") && (head.lstrip.start_with?("<?xml", "<svg", "<!--", "<!DOCTYPE"))
  end

  def sniff(bytes)
    SIGNATURES.each { |magic, mime, ext| return [mime, ext] if bytes.byteslice(0, magic.bytesize) == magic }
    return ["image/webp", ".webp"] if webp?(bytes)
    return ["image/svg+xml", ".svg"] if svg?(bytes)

    nil
  end

  # Never the caller's filename verbatim: it reaches the filesystem and a
  # public URL. The random prefix also stops two uploads of "photo.jpg" from
  # colliding.
  def stored_name(filename, extension)
    base = File.basename(filename.to_s).sub(/\.[^.]*\z/, "")
    safe = base.gsub(/[^a-zA-Z0-9._-]/, "-").sub(/\A[.-]+/, "")[0, 60]
    safe = "file" if safe.empty?
    "#{SecureRandom.hex(8)}-#{safe}#{extension}"
  end

  def from_bytes!(bytes:, filename:, alt_text: "")
    raise Invalid, "The file is empty" if bytes.nil? || bytes.empty?
    if bytes.bytesize > MAX_BYTES
      raise Invalid, "That file is #{(bytes.bytesize / 1_048_576.0).round(1)} MB; the limit is 10 MB."
    end

    sniffed = sniff(bytes.b)
    unless sniffed
      raise Invalid, "That is not an image Dukafi can use. Accepted: PNG, JPEG, WebP, GIF, SVG."
    end

    mime, extension = sniffed
    # SVG is markup, and markup can carry script that would run on the
    # storefront's own origin. It is stored sanitised or not at all.
    if mime == "image/svg+xml"
      bytes = SvgSanitizer.call(bytes.force_encoding(Encoding::UTF_8)).to_s
      raise Invalid, "That SVG could not be made safe to serve." if bytes.strip.empty?
    end

    relative_path = File.join("uploads", stored_name(filename, extension))
    destination = Paths.storage_file(relative_path)
    FileUtils.mkdir_p(File.dirname(destination))
    File.binwrite(destination, bytes)

    begin
      processed = MediaVariants.call(source: destination, relative_path: relative_path, mime: mime)
    rescue MediaVariants::Unavailable, MediaVariants::ProcessingError => e
      # Leave no orphan on disk for an asset row that will not exist.
      File.delete(destination) if File.file?(destination)
      raise Invalid, e.message
    end

    MediaAsset.create(
      path: relative_path, mime: mime,
      width: processed[:width], height: processed[:height],
      variants_json: JSON.generate(processed[:variants]),
      alt_text: alt_text.to_s.strip[0, MediaAsset::MAX_ALT_LENGTH],
      created_at: Time.now,
    )
  end

  # ── Fetching a URL ─────────────────────────────────────────────────────────
  #
  # This makes the SERVER issue a request to an address a caller chose, which
  # is server-side request forgery unless it is fenced. On a container the
  # interesting targets are loopback (the sidecar, the admin API itself) and
  # link-local (169.254.169.254 — cloud metadata, where credentials live).
  #
  # So: https only, and every resolved address is checked before connecting.

  OPEN_TIMEOUT = 5
  READ_TIMEOUT = 20
  MAX_REDIRECTS = 3

  def from_url!(url:, filename: nil, alt_text: "")
    uri = parse_url!(url)
    bytes = fetch!(uri)
    name = filename.to_s.strip
    name = File.basename(uri.path.to_s) if name.empty?
    name = "download" if name.empty?

    from_bytes!(bytes: bytes, filename: name, alt_text: alt_text)
  end

  def parse_url!(url)
    uri = URI.parse(url.to_s.strip)
    unless uri.is_a?(URI::HTTPS)
      raise Invalid, "Only https:// URLs can be fetched (got #{url.to_s[0, 60].inspect})."
    end

    check_address!(uri.host)
    uri
  rescue URI::InvalidURIError
    raise Invalid, "That is not a valid URL."
  end

  # Resolves the name and refuses anything that is not a public address.
  # Checking the resolved IP rather than the hostname is what stops a
  # public name that points at 127.0.0.1 or 169.254.169.254.
  def check_address!(host)
    raise Invalid, "The URL has no host." if host.to_s.empty?

    addresses = Resolv.getaddresses(host)
    raise Invalid, "Could not resolve #{host}." if addresses.empty?

    addresses.each do |address|
      ip = IPAddr.new(address)
      next unless ip.loopback? || ip.private? || ip.link_local?

      raise Invalid, "#{host} resolves to a private address and will not be fetched."
    rescue IPAddr::InvalidAddressError
      next
    end
  end

  def fetch!(uri, redirects = 0)
    raise Invalid, "Too many redirects." if redirects > MAX_REDIRECTS

    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true,
                               open_timeout: OPEN_TIMEOUT, read_timeout: READ_TIMEOUT) do |http|
      http.request(Net::HTTP::Get.new(uri))
    end

    case response
    when Net::HTTPSuccess
      # Trust the body, not the header — but refuse early if the server admits
      # up front that it is too big.
      declared = response["content-length"].to_i
      raise Invalid, "That file is larger than the 10 MB limit." if declared > MAX_BYTES

      body = response.body.to_s
      raise Invalid, "That file is larger than the 10 MB limit." if body.bytesize > MAX_BYTES

      body
    when Net::HTTPRedirection
      # Re-validated, because a redirect is exactly how an allowed URL becomes
      # a request to 169.254.169.254.
      fetch!(parse_url!(URI.join(uri, response["location"].to_s).to_s), redirects + 1)
    else
      raise Invalid, "Could not download that file (HTTP #{response.code})."
    end
  rescue Invalid
    raise
  rescue StandardError => e
    raise Invalid, "Could not download that file: #{e.class}"
  end
end
