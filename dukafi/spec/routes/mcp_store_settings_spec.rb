require_relative "../spec_helper"
require_relative "../../app"

# Site settings from MCP — store name, fallback title/description, language,
# favicon, default og:image. Draft until publish. Page SEO stays on set_page_seo.
class McpStoreSettingsSpec < Minitest::Test
  def setup
    MediaAsset.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
  end

  def site!(name: "Shop", settings: {})
    state = SiteState.new
    state.site = { "name" => name, "settings" => settings }
    state.created_at = Time.now
    state.updated_at = Time.now
    state.save
    state
  end

  def asset!(path: "uploads/share.jpg")
    MediaAsset.create(path:, mime: "image/jpeg", width: 1200, height: 630,
                      variants_json: "[]", created_at: Time.now)
  end

  def tool(name) = McpTools.all.find { |entry| entry.fetch(:name) == name }.fetch(:run)
  def call(name, args = {}) = tool(name).call(args)

  def refusal(args)
    call("update_store_settings", args)
    flunk "expected a refusal"
  rescue McpTools::ArgumentError => e
    e.message
  end

  def test_writes_name_title_and_description
    site!

    payload = call("update_store_settings", {
      "name" => "Kanga",
      "metaTitle" => "Kanga — cloth from Nairobi",
      "metaDescription" => "Printed cotton for everyday wear.",
    })

    assert_equal "Kanga", payload.fetch("name")
    assert_equal "Kanga — cloth from Nairobi", payload.fetch("metaTitle")
    assert_equal "Printed cotton for everyday wear.", payload.fetch("metaDescription")
    assert_equal "en", payload.fetch("language")
    assert_match(/publish/i, payload.fetch("note"))

    site = SiteState.first.site
    assert_equal "Kanga", site.fetch("name")
    assert_equal "Kanga — cloth from Nairobi", site.dig("settings", "metaTitle")
    assert_equal "Printed cotton for everyday wear.", site.dig("settings", "metaDescription")
  end

  def test_default_og_image_must_be_a_library_path
    site!
    asset!

    payload = call("update_store_settings", { "ogImage" => "/uploads/share.jpg" })
    assert_equal "/uploads/share.jpg", payload.fetch("ogImage")
    assert_equal "/uploads/share.jpg", SiteState.first.site.dig("settings", "ogImageUrl")

    assert_match(/list_media/, refusal({ "ogImage" => "/uploads/missing.jpg" }))
  end

  def test_empty_string_clears_a_field
    site!(settings: { "metaTitle" => "Old", "ogImageUrl" => "/uploads/share.jpg" })
    asset!

    call("update_store_settings", { "metaTitle" => "", "ogImage" => "" })

    settings = SiteState.first.site.fetch("settings")
    refute settings.key?("metaTitle")
    refute settings.key?("ogImageUrl")
    payload = StoreSettings.payload
    assert_nil payload.fetch("metaTitle")
    assert_nil payload.fetch("ogImage")
  end

  def test_name_cannot_be_empty
    site!
    assert_match(/name cannot be empty/i, refusal({ "name" => "  " }))
    assert_equal "Shop", SiteState.first.site.fetch("name")
  end

  def test_refuses_without_a_field_and_without_a_site
    assert_match(/no site/i, refusal({ "name" => "Kanga" }))
    site!
    assert_match(/name/, refusal({}))
  end

  def test_it_bumps_site_seq_so_the_editor_notices
    state = site!
    call("update_store_settings", { "name" => "Kanga" })

    state.refresh
    assert_equal 1, state.seq
  end

  def test_get_store_context_includes_settings
    site!(name: "Kanga", settings: {
      "metaTitle" => "Kanga", "language" => "sw", "ogImageUrl" => "/uploads/share.jpg",
    })

    payload = StoreContext.call
    assert_equal "Kanga", payload.dig("settings", "name")
    assert_equal "Kanga", payload.dig("settings", "metaTitle")
    assert_equal "sw", payload.dig("settings", "language")
    assert_equal "/uploads/share.jpg", payload.dig("settings", "ogImage")
  end

  def test_is_a_write
    assert McpTools.write_tool?("update_store_settings")
  end
end
