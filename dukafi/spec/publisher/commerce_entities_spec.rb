require_relative "../spec_helper"
require "json"

# The commerce entity schema declares what a merchant can bind to and loop
# over. It is generated from `dukafi-editor/src/core/commerce/entitySchema.ts`.
#
# This spec is the reason that schema can be trusted: it walks EVERY declared
# field against a REAL payload from CommercePrefetcher/CartPayload and fails if
# a field does not exist. Every schema/payload drift in this codebase so far
# failed silently — a binding that quietly resolves to nothing, discovered in a
# browser rather than a build — so the agreement is checked, not assumed.
class CommerceEntitiesSpec < Minitest::Test
  SCHEMA = JSON.parse(
    File.read(File.expand_path("../../publisher/schemas/commerce_entities.schema.json", __dir__))
  ).freeze

  def setup
    CartItem.dataset.delete
    Cart.dataset.delete
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    ProductImage.dataset.delete
    MediaAsset.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
  end

  # A product with everything populated: an image (with renditions) and two
  # variants, so no field is absent merely because the fixture is thin.
  def seed!
    product = Product.create(
      title: "Canvas Bag", slug: "canvas-bag", status: "active",
      description_document: "<p>Strong</p>", created_at: Time.now, updated_at: Time.now
    )
    Variant.create(product_id: product.id, sku: "BAG-L", title: "Large", price_cents: 13_950,
                   currency: "USD", stock: 3, position: 0)
    Variant.create(product_id: product.id, sku: "BAG-S", title: "Small", price_cents: 9_900,
                   currency: "USD", stock: 5, position: 1)
    asset = MediaAsset.create(
      path: "uploads/bag.jpg", mime: "image/jpeg", width: 1200, height: 1600,
      # `variants` is a derived reader over the `variants_json` column.
      variants_json: JSON.generate([{ "path" => "/uploads/bag-w320.webp", "width" => 320,
                                      "height" => 427, "format" => "webp", "sizeBytes" => 1234 }]),
      created_at: Time.now
    )
    ProductImage.dataset.insert(product_id: product.id, media_asset_id: asset.id, position: 0)
    collection = Collection.create(title: "Featured", slug: "featured", description: "Picks", sort_order: 0)
    CollectionProduct.dataset.insert(collection_id: collection.id, product_id: product.id, position: 0)

    cart = Cart.create(session_key: "k", status: "active", created_at: Time.now, updated_at: Time.now)
    CartItem.create(cart_id: cart.id, variant_id: Variant.first.id, quantity: 2,
                    created_at: Time.now, updated_at: Time.now)
    [CommercePrefetcher.call, CartPayload.call(cart)]
  end

  def assert_entity!(entity_id, sample, trail)
    schema = SCHEMA.fetch(entity_id)
    refute_nil sample, "#{trail}: no sample data to verify #{entity_id} against"

    schema.fetch("fields").each do |field|
      id = field.fetch("id")
      # Derived fields are computed at render time by joining the entity
      # against request state, so they are correctly absent from the prefetch
      # payload. They get a stronger check of their own below: an actual
      # render must produce them.
      next if field["derived"]

      assert sample.key?(id),
             "#{trail}.#{id} is declared on `#{entity_id}` but the runtime payload has no such key. " \
             "Declared: #{schema['fields'].map { |f| f['id'] }.sort.inspect}. " \
             "Actual: #{sample.keys.sort.inspect}"

      next unless field.fetch("kind") == "list"

      items = sample.fetch(id)
      assert_kind_of Array, items, "#{trail}.#{id} is declared as a list but the payload is #{items.class}"
      # Recurse into the nested entity — this is what makes looping into
      # `product.images` and then binding `currentEntry.url` safe.
      assert_entity!(field.fetch("of"), items.first, "#{trail}.#{id}[0]") if items.first
    end
  end

  def test_every_declared_product_field_exists_on_a_real_payload
    prefetched, = seed!
    assert_entity!("product", prefetched.fetch("products").values.first, "product")
  end

  def test_every_declared_collection_field_exists_including_nested_products
    prefetched, = seed!
    assert_entity!("collection", prefetched.fetch("collections").values.first, "collection")
  end

  def test_every_declared_cart_item_field_exists_on_a_real_payload
    _prefetched, cart = seed!
    assert_entity!("cartItem", cart.fetch("items").first, "cartItem")
  end

  def test_nested_image_renditions_are_reachable_and_complete
    prefetched, = seed!
    image = prefetched.fetch("products").values.first.fetch("images").first

    # Looping product.images then image.variants must land on real keys, or
    # a two-level nested loop binds to nothing.
    assert_entity!("image", image, "product.images[0]")
    assert_entity!("imageVariant", image.fetch("variants").first, "product.images[0].variants[0]")
  end

  # Derived fields are the ones a payload walk cannot see, so they are the
  # ones most likely to be declared and never actually produced. Rendering is
  # the only honest check: bind every derived field on a real loop and require
  # a real value out the other side.
  def test_every_derived_field_resolves_through_an_actual_render
    prefetched, cart = seed!

    %w[product variant].each do |entity_id|
      derived = SCHEMA.fetch(entity_id).fetch("fields").select { |f| f["derived"] }
      next if derived.empty?

      source = entity_id == "product" ? "products" : "products/canvas-bag.variants"
      nodes = {
        "body" => node("body", "base.body", %w[loop]),
        "loop" => node("loop", "store.relationship-loop", %w[row],
                       { "source" => source, "perPage" => 10 }),
        "row" => node("row", "base.container", derived.map { |f| "f-#{f['id']}" }),
      }
      derived.each do |field|
        nodes["f-#{field['id']}"] = node(
          "f-#{field['id']}", "base.text", [],
          { "tag" => "p", "text" => "#{field['id']}=[{currentEntry.#{field['id']}|MISSING}]" }
        )
      end

      html = Dukafi::Publisher::RenderPage.call(
        document: { "rootNodeId" => "body", "nodes" => nodes },
        registry: Dukafi::Publisher::REGISTRY, prefetched: prefetched, cart: cart
      ).html

      derived.each do |field|
        refute_includes html, "#{field['id']}=[MISSING]",
                        "`#{entity_id}.#{field['id']}` is declared as derived but no render produces it"
        assert_includes html, "#{field['id']}=[",
                        "`#{entity_id}.#{field['id']}` did not render at all"
      end
    end
  end

  # The cart holds 2 of BAG-L, and nothing of BAG-S. The join must reflect
  # that per entity rather than reporting the cart's total.
  def test_derived_cart_facts_carry_the_right_numbers
    prefetched, cart = seed!
    nodes = {
      "body" => node("body", "base.body", %w[loop]),
      "loop" => node("loop", "store.relationship-loop", %w[row],
                     { "source" => "products/canvas-bag.variants", "perPage" => 10 }),
      "row" => node("row", "base.text", [],
                    { "tag" => "p", "text" => "{currentEntry.sku}:{currentEntry.cartQuantity}:{currentEntry.inCart}" }),
    }

    html = Dukafi::Publisher::RenderPage.call(
      document: { "rootNodeId" => "body", "nodes" => nodes },
      registry: Dukafi::Publisher::REGISTRY, prefetched: prefetched, cart: cart
    ).html

    assert_includes html, "BAG-L:2:true"
    assert_includes html, "BAG-S:0:false"
  end

  def node(id, module_id, children = [], props = {})
    { "id" => id, "moduleId" => module_id, "children" => children,
      "props" => props, "breakpointOverrides" => {}, "classIds" => [] }
  end

  def test_every_list_field_points_at_an_entity_that_exists
    SCHEMA.each do |entity_id, schema|
      schema.fetch("fields").each do |field|
        next unless field.fetch("kind") == "list"

        assert SCHEMA.key?(field.fetch("of")),
               "#{entity_id}.#{field['id']} is a list of `#{field['of']}`, which is not a declared entity"
      end
    end
  end

  def test_schema_ids_and_labels_are_well_formed
    SCHEMA.each do |entity_id, schema|
      assert_equal entity_id, schema.fetch("id"), "entity key and id disagree"
      refute_empty schema.fetch("label")
      ids = schema.fetch("fields").map { |f| f.fetch("id") }
      assert_equal ids.uniq, ids, "#{entity_id} declares a duplicate field id"
      schema.fetch("fields").each do |field|
        refute_empty field.fetch("label"), "#{entity_id}.#{field['id']} has no label"
      end
    end
  end
end
