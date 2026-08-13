require "net/http"
require "uri"
require "fileutils"
require "securerandom"

# Download a Google font once, at install time, and self-host it.
#
# This is the ONLY place in Dukafy that talks to Google, and it happens while a
# merchant is clicking "Install" in the admin — never while a visitor is
# loading a page. The woff2 files land under `uploads/fonts/<slug>/` and the
# published stylesheet points at those, so a storefront makes no third-party
# request for fonts and leaks no visitor IPs to Google. That is the whole
# reason this installs rather than emitting a `<link>` to fonts.googleapis.com.
#
# Google's CSS2 endpoint shards a family across many `@font-face` blocks — one
# per (variant × unicode subset) — each with its own `unicode-range`. We keep
# that shape 1:1: every block becomes one downloaded file and one FontFile, so
# a browser still fetches only the slices the page's text actually needs.
class GoogleFontInstaller
  Result = Data.define(:font, :reason) do
    def ok? = reason.nil?
  end

  CSS2_ENDPOINT = "https://fonts.googleapis.com/css2".freeze
  # Only this host may be downloaded from. The URLs come out of a response
  # body, so without this a compromised or spoofed CSS response could point the
  # installer at any host on the network.
  ALLOWED_FILE_HOST = "fonts.gstatic.com".freeze
  # Google serves woff2 only to browsers it recognises; with a default Ruby
  # agent it returns legacy truetype instead.
  USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " \
               "Chrome/120.0.0.0 Safari/537.36".freeze

  OPEN_TIMEOUT = 5
  READ_TIMEOUT = 15
  # A single woff2 subset slice is a few KB; 5 MB is far beyond any legitimate
  # one and stops a bad response filling the disk.
  MAX_FILE_BYTES = 5 * 1024 * 1024

  UPLOADS_ROOT = File.expand_path("../uploads", __dir__).freeze

  # `/* latin */` immediately before a rule is how CSS2 labels each slice.
  FACE_BLOCK = %r{/\*\s*([a-z0-9\-\[\]]+)\s*\*/\s*@font-face\s*\{(.*?)\}}m
  VARIANT = /\A(\d{3})(italic)?\z/

  # ── Public API ────────────────────────────────────────────────────────────

  # Total download size for a selection, without committing anything. Lets the
  # picker show "selected: 42 KB" before the merchant commits to it.
  def self.estimate(family:, variants:, subsets:)
    resolved = GoogleFonts.resolve(family: family, variants: variants, subsets: subsets)
    return { "totalBytes" => 0, "fileCount" => 0 } unless resolved

    faces = fetch_faces(resolved)
    sizes = faces.filter_map { |face| content_length(face[:url]) }
    { "totalBytes" => sizes.sum, "fileCount" => sizes.length }
  rescue StandardError
    # An estimate is advisory. A network blip should grey the hint out, not
    # block the dialog.
    { "totalBytes" => 0, "fileCount" => 0 }
  end

  def self.install(family:, variants:, subsets:)
    resolved = GoogleFonts.resolve(family: family, variants: variants, subsets: subsets)
    return Result.new(font: nil, reason: "unknown_family") unless resolved

    faces = fetch_faces(resolved)
    return Result.new(font: nil, reason: "no_faces") if faces.empty?

    slug = family_slug(resolved.fetch("family"))
    return Result.new(font: nil, reason: "unknown_family") if slug.empty?

    directory = File.join(UPLOADS_ROOT, "fonts", slug)
    FileUtils.mkdir_p(directory)

    files = faces.each_with_index.filter_map do |face, index|
      bytes = download(face[:url])
      next unless bytes

      name = "#{face[:variant]}-#{sanitize_segment(face[:subset])}-#{index}.woff2"
      File.binwrite(File.join(directory, name), bytes)
      file = {
        "variant" => face[:variant], "subset" => face[:subset],
        "path" => "/uploads/fonts/#{slug}/#{name}", "format" => "woff2",
      }
      face[:unicode_range] ? file.merge("unicodeRange" => face[:unicode_range]) : file
    end

    if files.empty?
      # Leave no empty directory behind for a font that was never installed.
      FileUtils.rm_rf(directory)
      return Result.new(font: nil, reason: "download_failed")
    end

    now = (Time.now.to_f * 1000).round
    Result.new(reason: nil, font: {
      "id" => "font-#{slug}-#{SecureRandom.hex(4)}",
      "source" => "google",
      "family" => resolved.fetch("family"),
      # Report what was actually installed, not what was asked for — Google
      # occasionally drops a subset for a given weight.
      "variants" => files.map { |file| file["variant"] }.uniq,
      "subsets" => files.map { |file| file["subset"] }.uniq,
      "files" => files,
      "category" => resolved["category"].to_s,
      "createdAt" => now, "updatedAt" => now,
    })
  end

  # Remove the on-disk files for an installed Google family. The site document
  # is the client's to update; this only reclaims the bytes.
  def self.remove(family)
    slug = family_slug(family)
    return false if slug.empty?

    directory = File.join(UPLOADS_ROOT, "fonts", slug)
    # Belt and braces against a slug that somehow escaped `family_slug`: never
    # delete outside the fonts directory.
    return false unless File.expand_path(directory).start_with?(File.join(UPLOADS_ROOT, "fonts"))
    return false unless Dir.exist?(directory)

    FileUtils.rm_rf(directory)
    true
  end

  # "Noto Sans JP" -> "noto-sans-jp". Mirrors `familySlug` in the editor's
  # `core/fonts/css.ts` so settings, files and CSS variables stay aligned.
  def self.family_slug(family)
    family.to_s.downcase.gsub(/[^a-z0-9]+/, "-").gsub(/\A-+|-+\z/, "")
  end

  # ── Internals ─────────────────────────────────────────────────────────────

  def self.css2_url(resolved)
    axis = resolved.fetch("variants").filter_map { |variant| VARIANT.match(variant) }
                   .map { |match| [match[2] ? 1 : 0, match[1].to_i] }
                   .sort
                   .map { |italic, weight| "#{italic},#{weight}" }
                   .join(";")
    return nil if axis.empty?

    family = resolved.fetch("family").tr(" ", "+")
    "#{CSS2_ENDPOINT}?family=#{family}:ital,wght@#{axis}&display=swap"
  end
  private_class_method :css2_url

  def self.fetch_faces(resolved)
    url = css2_url(resolved)
    return [] unless url

    css = get(URI.parse(url))
    return [] unless css

    wanted = resolved.fetch("subsets")
    css.scan(FACE_BLOCK).filter_map do |subset, body|
      next unless wanted.include?(subset)

      variant = variant_of(body)
      source = body[/src:\s*url\(([^)]+)\)/, 1].to_s.delete("'\"").strip
      next unless variant && source.end_with?(".woff2")

      uri = begin
        URI.parse(source)
      rescue URI::InvalidURIError
        nil
      end
      next unless uri.is_a?(URI::HTTPS) && uri.host == ALLOWED_FILE_HOST

      { subset: subset, variant: variant, url: uri,
        unicode_range: body[/unicode-range:\s*([^;]+);/, 1]&.strip }
    end
  end
  private_class_method :fetch_faces

  def self.variant_of(body)
    weight = body[/font-weight:\s*(\d{3})/, 1]
    return nil unless weight

    body.match?(/font-style:\s*italic/) ? "#{weight}italic" : weight
  end
  private_class_method :variant_of

  def self.get(uri, limit = 3)
    return nil if limit.zero?

    response = request(uri) { |http, req| http.request(req) }
    case response
    when Net::HTTPSuccess then response.body
    when Net::HTTPRedirection
      location = response["location"]
      location ? get(URI.join(uri.to_s, location), limit - 1) : nil
    end
  rescue StandardError
    nil
  end
  private_class_method :get

  def self.download(uri)
    body = get(uri)
    return nil if body.nil? || body.empty? || body.bytesize > MAX_FILE_BYTES
    # woff2 files start with the ASCII signature "wOF2". Checking it means a
    # captive-portal HTML page or an error body never gets written out as a
    # font the browser will then fail to parse.
    return nil unless body.byteslice(0, 4) == "wOF2"

    body
  end
  private_class_method :download

  def self.content_length(uri)
    response = request(uri) do |http, _req|
      http.request(Net::HTTP::Head.new(uri, "User-Agent" => USER_AGENT))
    end
    return nil unless response.is_a?(Net::HTTPSuccess)

    length = response["content-length"]
    length && length.to_i.positive? ? length.to_i : nil
  rescue StandardError
    nil
  end
  private_class_method :content_length

  def self.request(uri)
    Net::HTTP.start(uri.host, uri.port, use_ssl: true,
                    open_timeout: OPEN_TIMEOUT, read_timeout: READ_TIMEOUT) do |http|
      yield http, Net::HTTP::Get.new(uri, "User-Agent" => USER_AGENT)
    end
  end
  private_class_method :request

  def self.sanitize_segment(value)
    cleaned = value.to_s.gsub(/[^a-zA-Z0-9_-]/, "-").gsub(/\A-+|-+\z/, "")
    cleaned.empty? ? "x" : cleaned
  end
  private_class_method :sanitize_segment
end
