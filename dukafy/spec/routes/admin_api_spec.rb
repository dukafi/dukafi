require_relative "../spec_helper"
require "rack/test"
require "tempfile"
require_relative "../../app"

class AdminApiSpec < Minitest::Test
  include Rack::Test::Methods

  def app
    Dukafy.app
  end

  def setup
    @uploaded_paths = []
    PluginSetting.dataset.delete
    PaymentAttempt.dataset.delete
    FormSubmission.dataset.delete
    OrderItem.dataset.delete
    Order.dataset.delete
    Customer.dataset.delete
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    ProductImage.dataset.delete
    MediaAsset.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    UserPreference.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    Admin.dataset.delete
    clear_cookies
    @published_root = Dir.mktmpdir("dukafy-admin-publish-")
    ENV["DUKAFY_PUBLISHED_ROOT"] = @published_root
  end

  def teardown
    @uploaded_paths.each { |path| File.delete(path) if File.file?(path) }
    ENV.delete("DUKAFY_PUBLISHED_ROOT")
    FileUtils.remove_entry(@published_root) if File.exist?(@published_root)
  end

  def json
    JSON.parse(last_response.body)
  end

  def post_json(path, payload)
    post path, JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  def setup_and_login
    post_json "/admin/api/cms/setup", {
      siteName: "Test Store", email: "owner@example.com", password: "correct-horse-battery",
    }
    assert_equal 201, last_response.status
    post_json "/admin/api/cms/login", { email: "owner@example.com", password: "correct-horse-battery" }
    assert_equal 200, last_response.status, last_response.body
  end

  def test_setup_login_and_session_probe
    get "/admin/api/cms/setup/status"
    assert_equal true, json.fetch("needsSetup")

    setup_and_login
    get "/admin/api/cms/me"

    assert_equal 200, last_response.status
    assert_equal "owner@example.com", json.dig("user", "email")
    assert_includes json.fetch("capabilities"), "pages.publish"
    assert_includes json.fetch("capabilities"), "site.read"
  end

  def test_site_load_and_save_round_trip
    setup_and_login
    get "/admin/api/cms/site"
    shell = json.fetch("site")
    get "/admin/api/cms/pages"
    row = json.fetch("rows").first
    body = row.dig("cells", "body")
    page = {
      "id" => row.fetch("id"), "slug" => "renamed", "title" => "Renamed",
      "nodes" => body.fetch("nodes"), "rootNodeId" => body.fetch("rootNodeId"),
    }

    put "/admin/api/cms/site-document", JSON.generate({
      mode: "incremental", site: shell.merge("name" => "Saved Store"),
      changedPages: [page], deletedPageIds: [],
    }), "CONTENT_TYPE" => "application/json"

    assert_equal 200, last_response.status
    assert_equal true, json.fetch("ok")
    assert_equal "renamed", Page.first.slug
    assert_equal "Saved Store", SiteState.first.site.fetch("name")
  end

  # Loads the seeded site shell + first page, returning both as the editor
  # would hold them in memory (the preview endpoint never reads Page rows).
  def draft_site_document
    get "/admin/api/cms/site"
    shell = json.fetch("site")
    get "/admin/api/cms/pages"
    row = json.fetch("rows").first
    body = row.dig("cells", "body")
    page = {
      "id" => row.fetch("id"), "slug" => "index", "title" => "Draft Title",
      "nodes" => body.fetch("nodes"), "rootNodeId" => body.fetch("rootNodeId"),
    }
    [shell.merge("pages" => [page]), page]
  end

  def test_runtime_preview_renders_an_unsaved_draft_page
    setup_and_login
    site, page = draft_site_document

    post_json "/admin/api/cms/runtime/preview", { site: site, pageId: page.fetch("id") }

    assert_equal 200, last_response.status, last_response.body
    html = json.fetch("html")
    assert_includes html, "<!doctype html>"
    # CSS must be INLINED, not linked — the client renders this in a
    # sandboxed srcdoc iframe where a relative href would never resolve.
    assert_includes html, "<style>"
    refute_includes html, %(<link rel="stylesheet")
    assert_equal "Draft Title", html[%r{<title>(.*?)</title>}, 1]
    assert_equal "text/css", json.fetch("assets").first.fetch("contentType")
    assert_equal [], json.fetch("diagnostics")
    assert_equal [], json.dig("runtimeAssets", "scripts")
  end

  def test_runtime_preview_reflects_edits_that_were_never_saved
    setup_and_login
    site, page = draft_site_document
    # Nothing is persisted — the posted document is the only source of truth.
    site["pages"].first["title"] = "Only In Memory"

    post_json "/admin/api/cms/runtime/preview", { site: site, pageId: page.fetch("id") }

    assert_equal 200, last_response.status, last_response.body
    assert_equal "Only In Memory", json.fetch("html")[%r{<title>(.*?)</title>}, 1]
    refute_equal "Only In Memory", Page.first.title
  end

  def test_runtime_preview_rejects_unknown_page_and_unauthenticated_callers
    post_json "/admin/api/cms/runtime/preview", { site: { "pages" => [] }, pageId: "1" }
    assert_equal 401, last_response.status
    assert_equal "unauthorized", json.dig("error", "code")

    setup_and_login
    site, _page = draft_site_document

    post_json "/admin/api/cms/runtime/preview", { site: site, pageId: "does-not-exist" }
    assert_equal 404, last_response.status, last_response.body
    assert_equal "page_not_found", json.dig("error", "code")

    post_json "/admin/api/cms/runtime/preview", { pageId: "1" }
    assert_equal 422, last_response.status
    assert_equal "invalid_site", json.dig("error", "code")
  end

  def test_runtime_preview_reports_a_broken_draft_as_422_not_500
    setup_and_login
    site, page = draft_site_document
    # Dangling root reference — a normal mid-edit state, not a server fault.
    site["pages"].first["rootNodeId"] = "missing-node"

    post_json "/admin/api/cms/runtime/preview", { site: site, pageId: page.fetch("id") }

    assert_equal 422, last_response.status, last_response.body
    assert_equal "preview_failed", json.dig("error", "code")
  end

  def test_orders_endpoint_lists_orders_with_lines_and_attached_submissions
    setup_and_login
    product = Product.create(title: "Canvas Bag", slug: "canvas-bag", status: "active",
                             description_document: "", created_at: Time.now, updated_at: Time.now)
    Variant.create(product_id: product.id, sku: "BAG-L", title: "Large", price_cents: 13_950,
                   currency: "USD", stock: 5, position: 0)
    customer = Customer.create(phone: "+254712345678", name: "Wanjiru",
                               created_at: Time.now, updated_at: Time.now)
    order = Order.create(customer_id: customer.id, phone: "+254712345678", status: "pending",
                         currency: "USD", subtotal_cents: 27_900, discount_cents: 0,
                         shipping_cents: 0, total_cents: 27_900, public_token: "tok",
                         created_at: Time.now, updated_at: Time.now)
    OrderItem.create(order_id: order.id, product_title: "Canvas Bag", variant_title: "Large",
                     sku: "BAG-L", unit_price_cents: 13_950, quantity: 2, created_at: Time.now)
    FormSubmission.create(form_id: "mpesa", payload: JSON.generate({ "mpesa_code" => "QWE123" }),
                          order_id: order.id, customer_id: customer.id, created_at: Time.now)

    get "/admin/api/cms/commerce/orders"

    assert_equal 200, last_response.status, last_response.body
    row = json.fetch("orders").first
    assert_equal 27_900, row.fetch("totalCents")
    assert_equal "Wanjiru", row.fetch("customerName")
    assert_equal 27_900, row.fetch("items").first.fetch("lineTotalCents")
    # Merchant-defined payloads come back as stored, not flattened.
    assert_equal({ "mpesa_code" => "QWE123" }, row.fetch("submissions").first.fetch("payload"))
  end

  def test_order_status_can_be_advanced_and_rejects_unknown_values
    setup_and_login
    order = Order.create(email: "b@example.com", status: "pending", currency: "USD",
                         subtotal_cents: 100, discount_cents: 0, shipping_cents: 0,
                         total_cents: 100, public_token: "tok2",
                         created_at: Time.now, updated_at: Time.now)

    patch "/admin/api/cms/commerce/orders/#{order.id}", JSON.generate({ status: "paid" }),
          "CONTENT_TYPE" => "application/json"
    assert_equal 200, last_response.status, last_response.body
    assert_equal "paid", Order[order.id].status

    patch "/admin/api/cms/commerce/orders/#{order.id}", JSON.generate({ status: "teleported" }),
          "CONTENT_TYPE" => "application/json"
    assert_equal 422, last_response.status
    assert_equal "paid", Order[order.id].status
  end

  def test_orders_endpoint_requires_authentication
    get "/admin/api/cms/commerce/orders"
    assert_equal 401, last_response.status
  end

  def test_plugin_settings_can_be_configured_but_secrets_never_come_back
    setup_and_login
    PluginSetting.dataset.delete

    get "/admin/api/cms/plugins"
    assert_equal 200, last_response.status, last_response.body
    payhero = json.fetch("plugins").find { |p| p.fetch("id") == "payhero" }
    assert_equal false, payhero.fetch("configured")
    assert_includes payhero.fetch("paymentProviders"), "payhero"

    put "/admin/api/cms/plugins/payhero/settings", JSON.generate({
      settings: { "api_token" => "super-secret", "channel_id" => "133",
                  "callback_base_url" => "https://shop.example" },
    }), "CONTENT_TYPE" => "application/json"
    assert_equal 200, last_response.status, last_response.body
    assert_equal true, json.fetch("configured")

    get "/admin/api/cms/plugins"
    payhero = json.fetch("plugins").find { |p| p.fetch("id") == "payhero" }
    token = payhero.fetch("settings").find { |s| s.fetch("key") == "api_token" }
    channel = payhero.fetch("settings").find { |s| s.fetch("key") == "channel_id" }

    # The secret is reported as SET but its value never travels to a browser.
    assert_equal true, token.fetch("secret")
    assert_equal true, token.fetch("isSet")
    assert_nil token.fetch("value")
    refute_includes last_response.body, "super-secret"
    # Non-secret settings round-trip so the form can prefill them.
    assert_equal "133", channel.fetch("value")
  end

  def test_resubmitting_a_blank_secret_leaves_the_stored_one_alone
    setup_and_login
    put "/admin/api/cms/plugins/payhero/settings",
        JSON.generate({ settings: { "api_token" => "keep-me" } }), "CONTENT_TYPE" => "application/json"

    # The form could not have shown the value, so blank means "unchanged" —
    # not "erase my credentials".
    put "/admin/api/cms/plugins/payhero/settings",
        JSON.generate({ settings: { "api_token" => "", "channel_id" => "7" } }),
        "CONTENT_TYPE" => "application/json"

    assert_equal "keep-me", Dukafy::Plugins.find("payhero").settings[:api_token]
    assert_equal 7, Dukafy::Plugins.find("payhero").settings[:channel_id]
  end

  def test_plugin_settings_require_authentication_and_a_real_plugin
    get "/admin/api/cms/plugins"
    assert_equal 401, last_response.status

    setup_and_login
    put "/admin/api/cms/plugins/nope/settings", JSON.generate({ settings: {} }),
        "CONTENT_TYPE" => "application/json"
    assert_equal 404, last_response.status
  end

  # Pages created in the editor (New page, or an import) carry a NANOID, not a
  # database id. `"V1StGXR8".to_i` is 0, so the save path used to find nothing,
  # re-create the page, and die on the unique slug the second time — and delete
  # silently removed nothing at all.
  NANOID = "V1StGXR8_Z5jdHi6B-myT".freeze

  def editor_page(id: NANOID, slug: "landing", title: "Landing")
    {
      "id" => id, "slug" => slug, "title" => title, "rootNodeId" => "r",
      "nodes" => { "r" => { "id" => "r", "moduleId" => "base.body", "children" => [],
                            "props" => {}, "classIds" => [], "breakpointOverrides" => {} } },
    }
  end

  def save_site!(shell, changed: [], deleted: [])
    put "/admin/api/cms/site-document",
        JSON.generate({ mode: "incremental", site: shell, changedPages: changed, deletedPageIds: deleted }),
        "CONTENT_TYPE" => "application/json"
  end

  def test_saving_an_editor_created_page_twice_updates_rather_than_duplicating
    setup_and_login
    get "/admin/api/cms/site"
    shell = json.fetch("site")

    save_site!(shell, changed: [editor_page])
    assert_equal 200, last_response.status, last_response.body
    after_first = Page.count

    save_site!(shell, changed: [editor_page])

    assert_equal 200, last_response.status, last_response.body
    assert_equal after_first, Page.count, "the second save duplicated the page"
  end

  def test_an_editor_created_page_can_be_renamed_after_its_first_save
    setup_and_login
    get "/admin/api/cms/site"
    shell = json.fetch("site")
    save_site!(shell, changed: [editor_page])

    save_site!(shell, changed: [editor_page(title: "Renamed")])

    assert_equal 200, last_response.status, last_response.body
    assert_equal "Renamed", Page.first(slug: "landing").title
  end

  def test_an_editor_created_page_can_actually_be_deleted
    setup_and_login
    get "/admin/api/cms/site"
    shell = json.fetch("site")
    save_site!(shell, changed: [editor_page])
    assert Page.first(slug: "landing")

    save_site!(shell, deleted: [NANOID])

    assert_equal 200, last_response.status, last_response.body
    assert_nil Page.first(slug: "landing"), "the delete was a silent no-op"
  end

  def test_a_stale_delete_id_does_not_take_out_an_unrelated_page
    setup_and_login
    get "/admin/api/cms/site"
    shell = json.fetch("site")
    save_site!(shell, changed: [editor_page])
    before = Page.count

    # An id that matches nothing must delete nothing — falling back to slug
    # here would let a stale id destroy whatever page now holds that slug.
    save_site!(shell, deleted: ["a-nanoid-that-was-never-saved"])

    assert_equal 200, last_response.status, last_response.body
    assert_equal before, Page.count
  end

  def test_protected_endpoint_returns_consistent_error_envelope
    get "/admin/api/cms/pages"

    assert_equal 401, last_response.status, last_response.body
    assert_equal "unauthorized", json.dig("error", "code")
  end

  def test_user_preferences_round_trip_and_reset
    setup_and_login

    get "/admin/api/cms/me/preferences/module-inserter"
    assert_equal 200, last_response.status
    assert_nil json.fetch("value")

    value = { favorites: [{ kind: "module", id: "base.text" }] }
    put "/admin/api/cms/me/preferences/module-inserter", JSON.generate({ value: value }),
        "CONTENT_TYPE" => "application/json"
    assert_equal 200, last_response.status, last_response.body
    assert_equal JSON.parse(JSON.generate(value)), json.fetch("value")

    get "/admin/api/cms/me/preferences/module-inserter"
    assert_equal "base.text", json.dig("value", "favorites", 0, "id")

    delete "/admin/api/cms/me/preferences/module-inserter"
    assert_equal 200, last_response.status
    assert_nil json.fetch("value")
  end

  def test_user_preferences_reject_unknown_keys_and_invalid_values
    setup_and_login

    get "/admin/api/cms/me/preferences/not-allowed"
    assert_equal 400, last_response.status

    put "/admin/api/cms/me/preferences/module-inserter", JSON.generate({ value: { favorites: [{ kind: "bad", id: "x" }] } }),
        "CONTENT_TYPE" => "application/json"
    assert_equal 422, last_response.status
  end

  def test_publish_snapshots_drafts_bakes_site_and_reports_freshness
    setup_and_login

    get "/admin/api/cms/publish/status"
    assert_equal false, json.fetch("hasPublishedVersion")
    assert_equal false, json.fetch("draftMatchesPublished")

    post "/admin/api/cms/publish"
    assert_equal 200, last_response.status, last_response.body
    assert_equal 1, json.fetch("publishedPages")
    assert File.file?(File.join(@published_root, "current", "index.html"))

    get "/admin/api/cms/publish/status"
    assert_equal true, json.fetch("hasPublishedVersion")
    assert_equal true, json.fetch("draftMatchesPublished")
    assert_equal 1, json.fetch("publishedPages")
    refute_nil json["lastPublishedAt"]

    page = Page.first
    patch "/admin/api/cms/pages/#{page.id}", JSON.generate({ title: "Changed through API" }),
          "CONTENT_TYPE" => "application/json"
    assert_equal 200, last_response.status
    get "/admin/api/cms/publish/status"
    assert_equal false, json.fetch("draftMatchesPublished")
  end

  def test_compiles_tailwind_classes_for_editor_preview
    setup_and_login

    post_json "/admin/api/cms/tailwind/compile", { classes: %w[flex p-4] }

    assert_equal 200, last_response.status, last_response.body
    assert_includes json.fetch("css"), ".flex{display:flex}"
    assert_includes json.fetch("css"), ".p-4{"
    refute_includes json.fetch("css"), ".hidden{"
  end

  def test_returns_catalog_product_preview_for_commerce_modules
    setup_and_login
    product = Product.create(title: "Canvas Bag", slug: "canvas-bag", status: "active")
    product.add_variant(sku: "BAG-1", title: "Default", price_cents: 12_900, currency: "USD", stock: 3, position: 0)

    get "/admin/api/cms/commerce/products/canvas-bag"

    assert_equal 200, last_response.status
    assert_equal "Canvas Bag", json.dig("product", "title")
    assert_equal 12_900, json.dig("product", "priceCents")
    assert_equal "/products/canvas-bag", json.dig("product", "href")
  end

  def test_media_upload_list_and_delete
    setup_and_login
    source = Tempfile.new(["dukafy-upload", ".txt"])
    source.write("hello media")
    source.rewind

    post "/admin/api/cms/media", {
      "file" => Rack::Test::UploadedFile.new(source.path, "text/plain", original_filename: "hello.txt"),
    }

    assert_equal 201, last_response.status, last_response.body
    asset = json.fetch("asset")
    stored_path = File.expand_path("../../#{asset.fetch('publicPath').delete_prefix('/')}", __dir__)
    @uploaded_paths << stored_path
    assert File.file?(stored_path)

    get "/admin/api/cms/media"
    assert_equal [asset.fetch("id")], json.fetch("assets").map { |item| item.fetch("id") }

    delete "/admin/api/cms/media/#{asset.fetch('id')}"
    assert_equal 204, last_response.status
    refute File.exist?(stored_path)
  ensure
    source&.close!
  end
end
