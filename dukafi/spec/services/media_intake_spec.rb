require_relative "../spec_helper"
require "base64"

# Taking bytes in and making them a MediaAsset.
#
# Every test here is an attack or a foot-gun. The type is decided by SNIFFING
# THE BYTES, never by the caller's filename or declared content-type — a
# declared type is a string an attacker controls, and the admin's own multipart
# route still trusts `upload[:type]`.
#
# `from_url!` makes the SERVER issue a request to an address a caller chose,
# which is server-side request forgery unless it is fenced. On a container the
# interesting targets are loopback (the edit sidecar, the admin API) and
# link-local — 169.254.169.254 is cloud metadata, where credentials live.
class MediaIntakeSpec < Minitest::Test
  # A real 1×1 PNG; MediaVariants reads it with libvips, so it has to decode.
  PNG = ["89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478" \
         "9c636000000200010005fe02fea7c2b7ee0000000049454e44ae426082"].pack("H*").freeze

  def setup
    ProductImage.dataset.delete
    MediaAsset.dataset.delete
    @root = Dir.mktmpdir("dukafi-intake-")
    ENV["DUKAFI_STORAGE_ROOT"] = @root
  end

  def teardown
    ENV.delete("DUKAFI_STORAGE_ROOT")
    FileUtils.remove_entry(@root) if @root && Dir.exist?(@root)
  end

  def stored = Dir.glob(File.join(@root, "uploads", "*")).map { |path| File.basename(path) }

  def refusal(&block)
    block.call
    flunk "expected a refusal"
  rescue MediaIntake::Invalid => e
    e.message
  end

  # ── The happy path ───────────────────────────────────────────────────────

  def test_an_image_becomes_an_asset_with_its_dimensions
    asset = MediaIntake.from_bytes!(bytes: PNG, filename: "dot.png", alt_text: "A single pixel")

    assert_equal "image/png", asset.mime
    assert_equal 1, asset.width
    assert_equal "A single pixel", asset.alt_text
    assert_equal 1, stored.length
  end

  # The filename reaches the filesystem AND a public URL.
  def test_a_hostile_filename_cannot_escape_the_uploads_directory
    asset = MediaIntake.from_bytes!(bytes: PNG, filename: "../../etc/passwd.png")

    refute_includes asset.path, ".."
    assert asset.path.start_with?("uploads/")
    assert_equal 1, stored.length
  end

  # Two people uploading "photo.jpg" must not overwrite each other.
  def test_the_same_filename_twice_does_not_collide
    MediaIntake.from_bytes!(bytes: PNG, filename: "photo.png")
    MediaIntake.from_bytes!(bytes: PNG, filename: "photo.png")

    assert_equal 2, stored.length
  end

  # The extension comes from the BYTES, so a mislabelled file is stored under
  # what it actually is.
  def test_the_extension_follows_the_content_not_the_name
    asset = MediaIntake.from_bytes!(bytes: PNG, filename: "screenshot.jpg")

    assert asset.path.end_with?(".png")
  end

  # ── Refusals ─────────────────────────────────────────────────────────────

  # The one that matters: an HTML document named .png would be served from the
  # storefront's own origin.
  def test_html_wearing_a_png_name_is_refused
    message = refusal { MediaIntake.from_bytes!(bytes: "<html><script>alert(1)</script>", filename: "evil.png") }

    assert_match(/not an image/, message)
    assert_empty stored
  end

  def test_an_empty_file_is_refused
    assert_match(/empty/, refusal { MediaIntake.from_bytes!(bytes: "", filename: "x.png") })
  end

  def test_an_oversized_file_is_refused_before_it_is_written
    oversized = PNG + ("\0" * (MediaIntake::MAX_BYTES + 1))

    assert_match(/limit is 10 MB/, refusal { MediaIntake.from_bytes!(bytes: oversized, filename: "big.png") })
    assert_empty stored
  end

  # ── SSRF ─────────────────────────────────────────────────────────────────

  def test_only_https_is_fetched
    assert_match(/https/, refusal { MediaIntake.from_url!(url: "http://example.com/a.png") })
    assert_match(/https/, refusal { MediaIntake.from_url!(url: "file:///etc/passwd") })
  end

  # The sidecar and the admin API both listen on loopback.
  def test_loopback_is_refused
    assert_match(/private address/, refusal { MediaIntake.from_url!(url: "https://localhost/a.png") })
    assert_match(/private address/, refusal { MediaIntake.from_url!(url: "https://127.0.0.1/a.png") })
  end

  # Cloud metadata. Reaching this is how a container's credentials leak.
  def test_link_local_metadata_is_refused
    assert_match(/private address/,
                 refusal { MediaIntake.from_url!(url: "https://169.254.169.254/latest/meta-data/") })
  end

  def test_private_ranges_are_refused
    ["https://10.0.0.5/a.png", "https://192.168.1.1/a.png", "https://172.16.0.1/a.png"].each do |url|
      assert_match(/private address/, refusal { MediaIntake.from_url!(url: url) })
    end
  end

  # ── Sniffing ─────────────────────────────────────────────────────────────

  def test_known_formats_are_recognised_by_their_leading_bytes
    assert_equal "image/png", MediaIntake.sniff(PNG).first
    assert_equal "image/jpeg", MediaIntake.sniff("\xFF\xD8\xFF\xE0 rest".b).first
    assert_equal "image/gif", MediaIntake.sniff("GIF89a rest".b).first
    assert_equal "image/webp", MediaIntake.sniff("RIFF\0\0\0\0WEBPVP8 ".b).first
  end

  def test_anything_unrecognised_sniffs_as_nothing
    assert_nil MediaIntake.sniff("just some text".b)
    assert_nil MediaIntake.sniff("%PDF-1.4".b)
  end

  # SVG is markup, and markup can carry script that would run on the
  # storefront's own origin.
  def test_svg_is_stored_sanitised
    svg = %(<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="5"/></svg>)

    asset = MediaIntake.from_bytes!(bytes: svg, filename: "icon.svg")

    assert_equal "image/svg+xml", asset.mime
    written = File.read(File.join(@root, asset.path))
    refute_includes written, "<script"
    assert_includes written, "circle"
  end
end
