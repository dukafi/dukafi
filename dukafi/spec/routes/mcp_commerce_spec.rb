require_relative "../spec_helper"
require_relative "../../app"

# The catalogue, from MCP.
#
# These are a different kind of tool from the page ones and the tests reflect
# it: a page edit lands on a draft the merchant reviews, while everything here
# is LIVE the moment it returns. So the properties worth pinning are the ones
# that decide what a customer sees and is charged.
class McpCommerceSpec < Minitest::Test
  def setup
    CollectionProduct.dataset.delete
    Variant.dataset.delete
    Collection.dataset.delete
    Product.dataset.delete
  end

  def tool(name)
    definition = McpTools.all.find { |entry| entry.fetch(:name) == name }
    raise "no tool #{name}" if definition.nil?

    definition.fetch(:run)
  end

  def call(name, args = {}) = tool(name).call(args)

  def refusal(name, args = {})
    call(name, args)
    flunk "expected a refusal from #{name}"
  rescue McpTools::ArgumentError => e
    e.message
  end

  def a_product(title: "Blue Shirt", stock: 5, price: 2500, status: "active")
    product = call("create_product", { "title" => title, "status" => status })
    call("set_variant", { "productSlug" => product.fetch("slug"), "sku" => "SKU-1",
                          "title" => "Default", "priceCents" => price, "stock" => stock })
    Product.first(slug: product.fetch("slug"))
  end

  def variant_id(slug) = call("read_product", { "slug" => slug }).fetch("variantList").first.fetch("id")

  # ── Reads ────────────────────────────────────────────────────────────────

  # The slug is the join between the catalogue and a page: `store.product-card`
  # takes `productSlug`. A listing without it would be unusable.
  def test_listing_products_gives_the_slug_pages_bind_to
    a_product

    row = call("list_products").fetch("products").first

    assert_equal "blue-shirt", row.fetch("slug")
    assert_equal 2500, row.fetch("priceFrom")
    assert_equal 5, row.fetch("stock")
  end

  def test_products_can_be_filtered_to_what_is_actually_on_sale
    a_product(title: "Live One", status: "active")
    a_product(title: "Hidden One", status: "draft")

    active = call("list_products", { "status" => "active" }).fetch("products")

    assert_equal ["live-one"], active.map { |row| row.fetch("slug") }
  end

  # Variant ids are what set_stock and set_variant target, so read_product has
  # to expose them or the write tools are unusable.
  def test_reading_a_product_exposes_its_variant_ids
    a_product

    variant = call("read_product", { "slug" => "blue-shirt" }).fetch("variantList").first

    refute_nil variant.fetch("id")
    assert_equal "SKU-1", variant.fetch("sku")
  end

  # ── Products ─────────────────────────────────────────────────────────────

  # A product that appeared on the storefront the instant it was created would
  # be live before it had a price.
  def test_a_new_product_starts_as_a_draft
    outcome = call("create_product", { "title" => "Not Ready" })

    assert_equal "draft", outcome.fetch("status")
    assert_equal 0, outcome.fetch("variants")
    assert_match(/draft/i, outcome.fetch("note"))
  end

  def test_a_slug_is_derived_when_not_given
    assert_equal "summer-hat", call("create_product", { "title" => "Summer Hat" }).fetch("slug")
  end

  # Omitted fields must keep their value — a partial update that blanked the
  # title because the caller did not resend it would be silent vandalism.
  def test_updating_one_field_leaves_the_others_alone
    a_product

    call("update_product", { "slug" => "blue-shirt", "status" => "draft" })

    product = Product.first(slug: "blue-shirt")
    assert_equal "Blue Shirt", product.title
    assert_equal "draft", product.status
  end

  def test_deleting_a_product_takes_its_variants_with_it
    a_product

    call("delete_product", { "slug" => "blue-shirt" })

    assert_nil Product.first(slug: "blue-shirt")
    assert_equal 0, Variant.count
  end

  def test_an_unknown_product_says_how_to_find_the_right_one
    assert_match(/list_products/, refusal("read_product", { "slug" => "nope" }))
  end

  # ── Variants, price and stock ────────────────────────────────────────────

  def test_a_variant_gives_the_product_a_price
    call("create_product", { "title" => "Blue Shirt" })

    outcome = call("set_variant", { "productSlug" => "blue-shirt", "sku" => "A",
                                    "title" => "Default", "priceCents" => 1500, "stock" => 2 })

    assert_equal 1500, outcome.fetch("priceFrom")
    assert_equal 2, outcome.fetch("stock")
  end

  # v1 is single-currency. Whatever a caller thinks the currency is, the store's
  # own setting wins, or variants drift out of step with each other.
  def test_the_stores_currency_always_wins
    a_product

    assert_equal CommerceSettings.current.currency,
                 call("read_product", { "slug" => "blue-shirt" }).fetch("variantList").first.fetch("currency")
  end

  def test_setting_stock_leaves_price_and_sku_untouched
    a_product
    id = variant_id("blue-shirt")

    call("set_stock", { "productSlug" => "blue-shirt", "variantId" => id, "stock" => 42 })

    variant = call("read_product", { "slug" => "blue-shirt" }).fetch("variantList").first
    assert_equal 42, variant.fetch("stock")
    assert_equal 2500, variant.fetch("priceCents")
    assert_equal "SKU-1", variant.fetch("sku")
  end

  # Negative stock would render as a buyable product with an impossible count.
  def test_negative_stock_is_refused
    a_product
    id = variant_id("blue-shirt")

    assert_match(/negative/, refusal("set_stock", { "productSlug" => "blue-shirt",
                                                    "variantId" => id, "stock" => -5 }))
  end

  def test_updating_a_variant_keeps_the_fields_not_sent
    a_product
    id = variant_id("blue-shirt")

    call("set_variant", { "productSlug" => "blue-shirt", "variantId" => id, "priceCents" => 999 })

    variant = call("read_product", { "slug" => "blue-shirt" }).fetch("variantList").first
    assert_equal 999, variant.fetch("priceCents")
    assert_equal "SKU-1", variant.fetch("sku")
    assert_equal 5, variant.fetch("stock")
  end

  def test_a_variant_id_from_another_product_is_refused
    a_product
    other = a_product(title: "Red Hat")
    stray = other.variants.first.id

    assert_match(/No variant/, refusal("set_stock", { "productSlug" => "blue-shirt",
                                                      "variantId" => stray, "stock" => 1 }))
  end

  # ── Collections ──────────────────────────────────────────────────────────

  def test_a_collection_can_be_created_and_filled
    a_product

    call("create_collection", { "title" => "Summer" })
    outcome = call("set_collection_products", { "slug" => "summer", "productSlugs" => ["blue-shirt"] })

    assert_equal ["blue-shirt"], outcome.fetch("products")
  end

  # The tool replaces the whole list rather than appending, and its description
  # says so — this pins the behaviour that description promises.
  def test_setting_products_replaces_rather_than_appends
    a_product(title: "One")
    a_product(title: "Two")
    call("create_collection", { "title" => "Summer" })
    call("set_collection_products", { "slug" => "summer", "productSlugs" => %w[one two] })

    outcome = call("set_collection_products", { "slug" => "summer", "productSlugs" => ["two"] })

    assert_equal ["two"], outcome.fetch("products")
  end

  # An unknown slug must name the slug, not an internal id the model never saw.
  def test_an_unknown_product_slug_in_a_collection_is_named
    call("create_collection", { "title" => "Summer" })

    message = refusal("set_collection_products", { "slug" => "summer", "productSlugs" => ["ghost"] })

    assert_match(/ghost/, message)
  end

  # Deleting the grouping must not delete the goods.
  def test_deleting_a_collection_keeps_its_products
    a_product
    call("create_collection", { "title" => "Summer" })
    call("set_collection_products", { "slug" => "summer", "productSlugs" => ["blue-shirt"] })

    outcome = call("delete_collection", { "slug" => "summer" })

    assert_nil Collection.first(slug: "summer")
    refute_nil Product.first(slug: "blue-shirt")
    assert_match(/not deleted/, outcome.fetch("note"))
  end

  # ── Scopes ───────────────────────────────────────────────────────────────

  # A read-only connection must not be able to change a price. Anything not
  # explicitly a read counts as a write, so a new tool fails closed.
  def test_every_catalogue_write_requires_the_write_scope
    %w[create_product update_product delete_product set_variant delete_variant
       set_stock create_collection update_collection delete_collection
       set_collection_products].each do |name|
      assert McpTools.write_tool?(name), "#{name} must count as a write"
    end
  end

  def test_catalogue_reads_do_not_require_the_write_scope
    %w[list_products read_product list_collections].each do |name|
      refute McpTools.write_tool?(name), "#{name} should be readable without write scope"
    end
  end

  # Both the admin UI and MCP write through CommerceWrites; a second
  # implementation is how a rule starts applying in one client and not the
  # other.
  def test_writes_go_through_the_shared_service
    source = File.read(File.expand_path("../../services/mcp_commerce_tools.rb", __dir__))

    refute_match(/Product\.create|Variant\.create|Collection\.create/, source)
    assert_match(/CommerceWrites\./, source)
  end
end
