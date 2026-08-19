require_relative "../spec_helper"
require_relative "../../app"

# Page-settings SEO from MCP — unique title/description/og:image on the
# document, not HTML tags. Draft until publish. Catalogue URLs stay on
# update_product / update_collection.
class McpPageSeoSpec < Minitest::Test
  def setup
    MediaAsset.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
  end

  def page!(slug: "about", title: "About")
    document = {
      "id" => slug, "slug" => slug, "title" => title, "rootNodeId" => "root",
      "nodes" => { "root" => { "id" => "root", "moduleId" => "base.body", "children" => [],
                               "props" => {}, "classIds" => [], "breakpointOverrides" => {} } },
    }
    Page.create(slug:, title:, kind: "page", status: "draft",
                document: JSON.generate(document), created_at: Time.now, updated_at: Time.now)
  end

  def site!
    state = SiteState.new
    state.site = { "styleRules" => {} }
    state.created_at = Time.now
    state.updated_at = Time.now
    state.save
    state
  end

  def asset!(path: "uploads/about.jpg")
    MediaAsset.create(path:, mime: "image/jpeg", width: 1200, height: 630,
                      variants_json: "[]", created_at: Time.now)
  end

  def set(args) = McpTools.run_set_page_seo(args)

  def refusal(args)
    set(args)
    flunk "expected a refusal"
  rescue McpTools::ArgumentError => e
    e.message
  end

  def test_it_writes_unique_title_and_description_on_the_draft
    page!(slug: "about")
    site!

    outcome = set({ "slug" => "about", "seoTitle" => "About the shop",
                    "seoDescription" => "Who we are and how to reach us." })

    assert_equal "about", outcome.fetch("slug")
    assert_equal "About the shop", outcome.fetch("seoTitle")
    assert_equal "Who we are and how to reach us.", outcome.fetch("seoDescription")
    document = Page.first(slug: "about").document_data
    assert_equal "About the shop", document.fetch("seoTitle")
    assert_equal "Who we are and how to reach us.", document.fetch("seoDescription")
  end

  def test_empty_string_clears_a_field
    page = page!(slug: "about")
    site!
    document = page.document_data.merge("seoTitle" => "Old")
    page.update(document: JSON.generate(document))

    set({ "slug" => "about", "seoTitle" => "" })

    refute Page.first(slug: "about").document_data.key?("seoTitle")
  end

  def test_og_image_must_be_a_library_path
    page!(slug: "about")
    site!
    asset!

    set({ "slug" => "about", "ogImage" => "/uploads/about.jpg" })
    assert_equal "/uploads/about.jpg", Page.first(slug: "about").document_data.fetch("ogImage")

    assert_match(/list_media/, refusal({ "slug" => "about", "ogImage" => "/uploads/missing.jpg" }))
  end

  def test_read_page_returns_seo_fields
    page = page!(slug: "about")
    site!
    document = page.document_data.merge("seoTitle" => "About the shop")
    page.update(document: JSON.generate(document))

    payload = McpTools.run_read_page({ "slug" => "about" })
    assert_equal "About the shop", payload.fetch("seoTitle")
  end

  def test_it_bumps_site_seq_so_the_editor_notices
    page!(slug: "about")
    state = site!
    set({ "slug" => "about", "seoTitle" => "About" })

    state.refresh
    assert_equal 1, state.seq
    assert_equal 1, Page.first(slug: "about").seq
  end

  def test_it_refuses_without_a_field_and_without_a_site
    page!(slug: "about")
    assert_match(/seoTitle/, refusal({ "slug" => "about" }))
    assert_match(/no site/i, refusal({ "slug" => "about", "seoTitle" => "About" }))
  end

  def test_setting_counts_as_a_write
    assert McpTools.write_tool?("set_page_seo")
  end
end
