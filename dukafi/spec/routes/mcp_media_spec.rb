require_relative "../spec_helper"
require "rack/test"
require "rack/lint"
require_relative "../../app"

# Media, from MCP — and the alt-text path that was missing entirely.
#
# The editor has had a full alt-text UI since it shipped (per-asset field, bulk
# edit, a smart folder for images MISSING alt text) posting to a route that did
# not exist. Every save 404d into a console.error, and every published image
# carried alt="". These tests pin the whole chain: stored, returned, and
# rendered.
class McpMediaSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Rack::Lint.new(Dukafi.app)

  def setup
    ProductImage.dataset.delete
    Variant.dataset.delete
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    Product.dataset.delete
    MediaAsset.dataset.delete
    Admin.dataset.delete
    clear_cookies
  end

  def asset!(path: "uploads/hero.png", mime: "image/png", alt: "")
    MediaAsset.create(path:, mime:, width: 1200, height: 800,
                      variants_json: "[]", alt_text: alt, created_at: Time.now)
  end

  def tool(name)
    McpTools.all.find { |entry| entry.fetch(:name) == name }.fetch(:run)
  end

  def call(name, args = {}) = tool(name).call(args)

  def refusal(name, args = {})
    call(name, args)
    flunk "expected a refusal"
  rescue McpTools::ArgumentError => e
    e.message
  end

  # ── The alt text chain ───────────────────────────────────────────────────

  def test_alt_text_survives_a_round_trip
    asset!

    call("update_media", { "reference" => "/uploads/hero.png", "altText" => "A blue cotton shirt" })

    assert_equal "A blue cotton shirt", call("read_media", { "reference" => "/uploads/hero.png" }).fetch("altText")
  end

  # `MediaPrefetcher` is what `register_image` reads; without alt text here the
  # publisher has nothing to put in the attribute no matter what was saved.
  def test_the_publisher_prefetch_carries_alt_text
    asset!(alt: "A blue cotton shirt")

    assert_equal "A blue cotton shirt", MediaPrefetcher.call.fetch("/uploads/hero.png").fetch("altText")
  end

  # The end of the chain, and the thing that was broken: rendered HTML.
  def test_a_published_image_carries_its_alt_text
    asset!(alt: "A blue cotton shirt")
    registry = Dukafi::Publisher::Registry.new
    Dukafi::Publisher::BaseModules.register(registry)
    document = {
      "rootNodeId" => "b",
      "nodes" => {
        "b" => { "id" => "b", "moduleId" => "base.body", "children" => ["i"],
                 "props" => {}, "classIds" => [], "breakpointOverrides" => {} },
        "i" => { "id" => "i", "moduleId" => "base.image", "children" => [],
                 "props" => { "src" => "/uploads/hero.png" }, "classIds" => [], "breakpointOverrides" => {} },
      },
    }

    html = Dukafi::Publisher::RenderPage.call(
      document:, registry:, prefetched: MediaPrefetcher.call, page_paths: {},
    ).html

    assert_includes html, 'alt="A blue cotton shirt"'
    refute_includes html, 'alt=""'
  end

  # Product photos announced themselves to a screen reader as nothing at all —
  # `CommercePrefetcher` hardcoded "alt" => "".
  def test_product_images_are_described_too
    asset!(alt: "A blue cotton shirt")
    call("create_product", { "title" => "Blue Shirt", "status" => "active" })
    call("set_product_images", { "productSlug" => "blue-shirt", "media" => ["/uploads/hero.png"] })

    images = CommercePrefetcher.call.fetch("products").fetch("blue-shirt").fetch("images")

    assert_equal "A blue cotton shirt", images.first.fetch("alt")
  end

  # The HTTP route the editor has always called and never had.
  def test_the_editor_can_finally_save_alt_text
    post "/admin/api/cms/setup", JSON.generate({ siteName: "S", email: "o@e.com",
                                                 password: "correct-horse-battery" }),
         "CONTENT_TYPE" => "application/json"
    post "/admin/api/cms/login", JSON.generate({ email: "o@e.com", password: "correct-horse-battery" }),
         "CONTENT_TYPE" => "application/json"
    record = asset!

    patch "/admin/api/cms/media/#{record.id}",
          JSON.generate({ altText: "A blue cotton shirt" }), "CONTENT_TYPE" => "application/json"

    assert_equal 200, last_response.status
    assert_equal "A blue cotton shirt", MediaAsset[record.id].alt_text
  end

  # ── Listing ──────────────────────────────────────────────────────────────

  # The path is what goes in an <img src>; without it an agent has to guess.
  def test_listing_gives_the_path_a_page_would_use
    asset!

    row = call("list_media").fetch("media").first

    assert_equal "/uploads/hero.png", row.fetch("path")
  end

  def test_images_without_a_description_are_flagged
    asset!(path: "uploads/described.png", alt: "Something")
    asset!(path: "uploads/bare.png")

    result = call("list_media")

    assert_equal 1, result.fetch("missingAltText")
    bare = result.fetch("media").find { |row| row.fetch("path") == "/uploads/bare.png" }
    assert bare.fetch("needsAltText")
  end

  def test_listing_can_be_narrowed_to_what_still_needs_describing
    asset!(path: "uploads/described.png", alt: "Something")
    asset!(path: "uploads/bare.png")

    rows = call("list_media", { "missingAltText" => true }).fetch("media")

    assert_equal ["/uploads/bare.png"], rows.map { |row| row.fetch("path") }
  end

  # A non-image has no alt text to be missing.
  def test_a_pdf_is_not_nagged_about_alt_text
    asset!(path: "uploads/terms.pdf", mime: "application/pdf")

    refute call("list_media").fetch("media").first.fetch("needsAltText")
  end

  def test_media_can_be_found_by_id_or_by_path
    record = asset!

    assert_equal "/uploads/hero.png", call("read_media", { "reference" => record.id.to_s }).fetch("path")
    assert_equal "/uploads/hero.png", call("read_media", { "reference" => "/uploads/hero.png" }).fetch("path")
  end

  def test_an_unknown_reference_says_how_to_find_the_right_one
    assert_match(/list_media/, refusal("read_media", { "reference" => "/uploads/ghost.png" }))
  end

  # ── Update rules ─────────────────────────────────────────────────────────

  def test_omitted_fields_keep_their_value
    asset!(alt: "Original")
    call("update_media", { "reference" => "/uploads/hero.png", "title" => "Hero" })

    result = call("read_media", { "reference" => "/uploads/hero.png" })
    assert_equal "Original", result.fetch("altText")
    assert_equal "Hero", result.fetch("title")
  end

  def test_an_update_with_nothing_to_change_is_refused
    asset!

    assert_match(/Nothing to change/, refusal("update_media", { "reference" => "/uploads/hero.png" }))
  end

  def test_tags_are_normalised_and_deduplicated
    asset!

    result = call("update_media", { "reference" => "/uploads/hero.png",
                                    "tags" => ["Shirt", "  shirt ", "Hero", ""] })

    assert_equal %w[shirt hero], result.fetch("tags")
  end

  # A caller that could change `path` could point an asset at any file on disk.
  def test_the_stored_path_cannot_be_rewritten
    record = asset!

    call("update_media", { "reference" => "/uploads/hero.png", "altText" => "x" })

    assert_equal "uploads/hero.png", MediaAsset[record.id].path
  end

  # ── Product images ───────────────────────────────────────────────────────

  def test_images_can_be_linked_to_a_product
    asset!(alt: "A blue cotton shirt")
    call("create_product", { "title" => "Blue Shirt" })

    outcome = call("set_product_images", { "productSlug" => "blue-shirt", "media" => ["/uploads/hero.png"] })

    assert outcome.fetch("hasImage")
    assert_equal "/uploads/hero.png", outcome.fetch("images").first.fetch("path")
  end

  # Cards and listings show the first image, so order is meaningful.
  def test_the_first_image_stays_first
    asset!(path: "uploads/one.png")
    asset!(path: "uploads/two.png")
    call("create_product", { "title" => "Blue Shirt" })

    outcome = call("set_product_images", { "productSlug" => "blue-shirt",
                                           "media" => ["/uploads/two.png", "/uploads/one.png"] })

    assert_equal ["/uploads/two.png", "/uploads/one.png"],
                 outcome.fetch("images").map { |image| image.fetch("path") }
  end

  # Detaching must not destroy the file — it may be used elsewhere.
  def test_replacing_the_list_detaches_without_deleting
    asset!(path: "uploads/one.png")
    asset!(path: "uploads/two.png")
    call("create_product", { "title" => "Blue Shirt" })
    call("set_product_images", { "productSlug" => "blue-shirt",
                                 "media" => ["/uploads/one.png", "/uploads/two.png"] })

    outcome = call("set_product_images", { "productSlug" => "blue-shirt", "media" => ["/uploads/two.png"] })

    assert_equal ["/uploads/two.png"], outcome.fetch("images").map { |image| image.fetch("path") }
    refute_nil MediaAsset.first(path: "uploads/one.png")
  end

  def test_a_product_share_image_can_be_a_later_gallery_image
    first = asset!(path: "uploads/one.png")
    hero = asset!(path: "uploads/hero.png")
    call("create_product", { "title" => "Blue Shirt" })
    call("set_product_images", { "productSlug" => "blue-shirt",
                                 "media" => ["/uploads/one.png", "/uploads/hero.png"] })

    outcome = call("set_product_og_image", { "productSlug" => "blue-shirt", "media" => "/uploads/hero.png" })

    assert_equal "/uploads/hero.png", outcome.fetch("ogImage")
    cleared = call("set_product_og_image", { "productSlug" => "blue-shirt", "media" => "" })
    assert_nil cleared.fetch("ogImage")
    refute_nil first
    refute_nil hero
  end

  def test_a_product_knows_whether_it_has_a_picture_at_all
    call("create_product", { "title" => "Blue Shirt" })

    refute call("list_products").fetch("products").first.fetch("hasImage")
  end

  def test_reading_media_shows_which_products_use_it
    asset!
    call("create_product", { "title" => "Blue Shirt" })
    call("set_product_images", { "productSlug" => "blue-shirt", "media" => ["/uploads/hero.png"] })

    assert_equal ["blue-shirt"], call("read_media", { "reference" => "/uploads/hero.png" }).fetch("usedByProducts")
  end

  def test_a_collection_cover_is_set_from_a_media_path
    asset!
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    call("create_collection", { "title" => "Summer" })

    outcome = call("set_collection_image", { "slug" => "summer", "media" => "/uploads/hero.png" })

    assert_equal true, outcome.fetch("hasImage")
    assert_equal "/uploads/hero.png", outcome.fetch("imageUrl")
    listed = call("list_collections")
    assert_equal true, listed.fetch("collections").first.fetch("hasImage")

    cleared = call("set_collection_image", { "slug" => "summer", "media" => "" })
    assert_equal false, cleared.fetch("hasImage")
    assert_equal "", cleared.fetch("imageUrl")
  end

  # ── Scopes ───────────────────────────────────────────────────────────────

  def test_describing_media_needs_the_write_scope
    assert McpTools.write_tool?("update_media")
    assert McpTools.write_tool?("set_product_images")
    assert McpTools.write_tool?("set_product_og_image")
    assert McpTools.write_tool?("set_collection_image")
    refute McpTools.write_tool?("list_media")
    refute McpTools.write_tool?("read_media")
  end

  # Deleting an asset breaks every page referencing it, with no draft and no
  # undo. Adding a file is recoverable; removing one is not, so upload exists
  # and delete deliberately does not.
  def test_there_is_no_tool_that_deletes_media
    names = McpTools.all.map { |entry| entry.fetch(:name) }

    refute_includes names, "delete_media"
    assert_includes names, "upload_media"
  end

  def test_uploading_needs_the_write_scope
    assert McpTools.write_tool?("upload_media")
  end
end
