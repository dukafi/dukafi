require_relative "../spec_helper"
require "rack/test"
require "rack/lint"
require_relative "../../app"

# The fonts admin API.
#
# Nothing here touches the network: every case either stops at the directory
# snapshot (which is a build artefact) or at request validation, both of which
# run before `GoogleFontInstaller` opens a socket. The one live call this
# feature makes is a merchant clicking Install, and that is deliberately not
# something a test suite should depend on.
class FontsApiSpec < Minitest::Test
  include Rack::Test::Methods

  def app
    Rack::Lint.new(Dukafy.app)
  end

  def setup
    MediaAsset.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    Admin.dataset.delete
    clear_cookies
  end

  def sign_in!
    post_json "/admin/api/cms/setup",
              siteName: "Store", email: "owner@example.com", password: "correct-horse-battery"
    post_json "/admin/api/cms/login", email: "owner@example.com", password: "correct-horse-battery"
  end

  def body
    JSON.parse(last_response.body)
  end

  def post_json(path, payload)
    post path, JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  # ── Authentication ───────────────────────────────────────────────────────

  # The install endpoint downloads files onto the server's disk. It must never
  # be reachable without a session.
  def test_every_font_endpoint_requires_an_admin
    get "/admin/api/cms/fonts/google"
    assert_equal 401, last_response.status

    post_json "/admin/api/cms/fonts/install", { family: "Inter", variants: ["400"], subsets: ["latin"] }
    assert_equal 401, last_response.status

    delete "/admin/api/cms/fonts/family/Inter"
    assert_equal 401, last_response.status
  end

  # ── Directory ────────────────────────────────────────────────────────────

  def test_serves_the_bundled_google_directory
    sign_in!
    get "/admin/api/cms/fonts/google"

    assert_equal 200, last_response.status
    families = body.fetch("families")
    assert_operator families.length, :>, 100
    first = families.first
    assert first.key?("family") && first.key?("variants") && first.key?("subsets")
  end

  # ── Install validation ───────────────────────────────────────────────────

  # The family lands in a URL we fetch and in a directory name we write to, so
  # the bundled directory — not the request — decides what is installable.
  def test_rejects_a_family_that_is_not_in_the_directory
    sign_in!
    post_json "/admin/api/cms/fonts/install",
              { family: "../../etc/passwd", variants: ["400"], subsets: ["latin"] }

    assert_equal 422, last_response.status
    assert_equal "unknown_font_family", body.dig("error", "code")
  end

  def test_rejects_a_real_family_with_no_usable_variant
    sign_in!
    post_json "/admin/api/cms/fonts/install",
              { family: "Inter", variants: ["not-a-weight"], subsets: ["latin"] }

    assert_equal 422, last_response.status
    assert_equal "unknown_font_family", body.dig("error", "code")
  end

  def test_an_estimate_for_an_unknown_family_is_zero_rather_than_an_error
    sign_in!
    post_json "/admin/api/cms/fonts/estimate", { family: "Nope", variants: ["400"], subsets: ["latin"] }

    assert_equal 200, last_response.status
    assert_equal 0, body.fetch("totalBytes")
    assert_equal 0, body.fetch("fileCount")
  end

  # ── Custom fonts ─────────────────────────────────────────────────────────

  def test_registers_an_uploaded_font_from_the_media_library
    sign_in!
    asset = MediaAsset.create(path: "uploads/abc-my-font.woff2", mime: "font/woff2")

    post_json "/admin/api/cms/fonts/custom",
              { family: "My Font", files: [{ mediaAssetId: asset.id.to_s, variant: "400" }] }

    assert_equal 200, last_response.status
    font = body.fetch("font")
    assert_equal "custom", font.fetch("source")
    assert_equal "My Font", font.fetch("family")
    file = font.fetch("files").first
    assert_equal "/uploads/abc-my-font.woff2", file.fetch("path")
    assert_equal "woff2", file.fetch("format")
    assert_equal asset.id.to_s, file.fetch("mediaAssetId")
  end

  # The path comes from the asset row, never the request — otherwise a client
  # could point an `@font-face src` anywhere it liked.
  def test_a_client_supplied_path_is_ignored
    sign_in!
    asset = MediaAsset.create(path: "uploads/abc-my-font.woff2", mime: "font/woff2")

    post_json "/admin/api/cms/fonts/custom",
              { family: "My Font",
                files: [{ mediaAssetId: asset.id.to_s, variant: "400", path: "https://evil.example/x.woff2" }] }

    assert_equal "/uploads/abc-my-font.woff2", body.dig("font", "files", 0, "path")
  end

  def test_rejects_a_media_asset_that_is_not_a_font
    sign_in!
    asset = MediaAsset.create(path: "uploads/abc-photo.png", mime: "image/png")

    post_json "/admin/api/cms/fonts/custom",
              { family: "My Font", files: [{ mediaAssetId: asset.id.to_s, variant: "400" }] }

    assert_equal 422, last_response.status
    assert_equal "no_font_files", body.dig("error", "code")
  end

  def test_rejects_an_unparseable_variant
    sign_in!
    asset = MediaAsset.create(path: "uploads/abc-my-font.woff2", mime: "font/woff2")

    post_json "/admin/api/cms/fonts/custom",
              { family: "My Font", files: [{ mediaAssetId: asset.id.to_s, variant: "bold" }] }

    assert_equal 422, last_response.status
  end

  def test_requires_a_family_name
    sign_in!
    post_json "/admin/api/cms/fonts/custom", { family: "  ", files: [] }

    assert_equal 422, last_response.status
    assert_equal "invalid_family", body.dig("error", "code")
  end

  # ── Delete ───────────────────────────────────────────────────────────────

  # A custom font's bytes are shared media assets, so there is nothing on disk
  # to reclaim — removing it must still succeed rather than 404.
  def test_deleting_a_family_with_nothing_on_disk_succeeds
    sign_in!
    delete "/admin/api/cms/fonts/family/Never%20Installed"

    assert_equal 204, last_response.status
  end
end
