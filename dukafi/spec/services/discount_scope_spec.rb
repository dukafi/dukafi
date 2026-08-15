require_relative "../spec_helper"

# What a discount code applies to.
#
# The expensive mistake here is arithmetic, not validation: a code limited to
# one collection that quietly takes its percentage off the whole cart gives
# away money on every order, looks correct in the admin screen, and is only
# discovered by reconciling takings. So most of this file is about the AMOUNT,
# evaluated against real carts.
class DiscountScopeSpec < Minitest::Test
  def setup
    CartItem.dataset.delete
    Cart.dataset.delete
    DB[:discount_products].delete
    DB[:discount_collections].delete
    CollectionProduct.dataset.delete
    Discount.dataset.delete
    Collection.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
  end

  def a_product(title, price_cents)
    slug = title.downcase.gsub(/[^a-z0-9]+/, "-")
    product = Product.create(title: title, slug: slug, status: "active",
                             created_at: Time.now, updated_at: Time.now)
    Variant.create(product_id: product.id, sku: "#{slug}-1", title: "Default",
                   price_cents: price_cents, currency: "USD", stock: 10, position: 0)
    product
  end

  def a_code(code, params = {})
    DiscountWrites.create!({ "code" => code, "kind" => "percentage", "value" => 20 }.merge(params))
  end

  # `{ productId, lineCents }` — the shape the evaluator takes, and what
  # `CartPayload` and the fragments route both build.
  def line(product, quantity = 1)
    variant = Variant.first(product_id: product.id)
    { "productId" => product.id, "lineCents" => variant.price_cents * quantity }
  end

  def lookup(code, lines)
    DiscountLookup.call(code, lines.sum { |entry| entry["lineCents"] }, lines: lines)
  end

  # ── Whole catalogue (the default) ────────────────────────────────────────

  def test_a_code_with_no_scope_covers_everything
    a_product("Sofa", 100_000)
    a_product("Mug", 1_000)
    discount = a_code("EVERYTHING")

    assert discount.whole_catalogue?
    assert_equal "catalogue", DiscountWrites.scope_of(discount).fetch("kind")

    result = lookup("EVERYTHING", [line(Product.first(slug: "sofa")), line(Product.first(slug: "mug"))])
    assert_equal 20_200, result.amount_cents
  end

  # ── Scoped to products ───────────────────────────────────────────────────

  # The whole point. 20% of the mug, nothing off the sofa.
  def test_a_product_scoped_code_discounts_only_that_product
    sofa = a_product("Sofa", 100_000)
    mug = a_product("Mug", 1_000)
    a_code("MUGONLY", "productSlugs" => ["mug"])

    result = lookup("MUGONLY", [line(sofa), line(mug)])

    assert result.ok?
    assert_equal 200, result.amount_cents
  end

  def test_quantity_counts_within_the_scope
    mug = a_product("Mug", 1_000)
    a_code("MUGONLY", "productSlugs" => ["mug"])

    assert_equal 600, lookup("MUGONLY", [line(mug, 3)]).amount_cents
  end

  # A valid code that covers nothing in this cart is not "invalid" — the
  # customer needs to be told something different, so it gets its own reason.
  def test_a_scoped_code_with_nothing_eligible_says_so
    sofa = a_product("Sofa", 100_000)
    a_product("Mug", 1_000)
    a_code("MUGONLY", "productSlugs" => ["mug"])

    result = lookup("MUGONLY", [line(sofa)])

    assert_equal "no_eligible_items", result.reason
    assert_equal 0, result.amount_cents
  end

  # A fixed amount must not spill onto lines the code does not cover: £20 off
  # a £10 mug is £10 off, not £20 off a cart also holding a sofa.
  def test_a_fixed_code_is_capped_by_the_eligible_portion_not_the_cart
    sofa = a_product("Sofa", 100_000)
    mug = a_product("Mug", 1_000)
    a_code("TENOFF", "kind" => "fixed", "value" => 5_000, "productSlugs" => ["mug"])

    assert_equal 1_000, lookup("TENOFF", [line(sofa), line(mug)]).amount_cents
  end

  # ── Scoped to collections ────────────────────────────────────────────────

  def test_a_collection_scoped_code_covers_its_members
    sofa = a_product("Sofa", 100_000)
    mug = a_product("Mug", 1_000)
    clearance = Collection.create(title: "Clearance", slug: "clearance", description: "", sort_order: 0)
    CollectionProduct.dataset.insert(collection_id: clearance.id, product_id: mug.id, position: 0)
    a_code("CLEAR20", "collectionSlugs" => ["clearance"])

    assert_equal 200, lookup("CLEAR20", [line(sofa), line(mug)]).amount_cents
  end

  # Membership is resolved when the code is USED, not when it is created —
  # otherwise "20% off everything in Clearance" would quietly mean "off the
  # things that were in Clearance last Tuesday".
  def test_a_product_added_to_the_collection_later_is_covered
    lamp = a_product("Lamp", 5_000)
    clearance = Collection.create(title: "Clearance", slug: "clearance", description: "", sort_order: 0)
    a_code("CLEAR20", "collectionSlugs" => ["clearance"])

    assert_equal "no_eligible_items", lookup("CLEAR20", [line(lamp)]).reason

    CollectionProduct.dataset.insert(collection_id: clearance.id, product_id: lamp.id, position: 0)

    assert_equal 1_000, lookup("CLEAR20", [line(lamp)]).amount_cents
  end

  # Both at once — "these two products, plus everything in Clearance".
  def test_products_and_collections_combine
    sofa = a_product("Sofa", 100_000)
    mug = a_product("Mug", 1_000)
    lamp = a_product("Lamp", 5_000)
    clearance = Collection.create(title: "Clearance", slug: "clearance", description: "", sort_order: 0)
    CollectionProduct.dataset.insert(collection_id: clearance.id, product_id: lamp.id, position: 0)
    discount = a_code("BOTH", "productSlugs" => ["mug"], "collectionSlugs" => ["clearance"])

    assert_equal "mixed", DiscountWrites.scope_of(discount).fetch("kind")
    # 20% of (mug 1,000 + lamp 5,000), and nothing off the sofa.
    assert_equal 1_200, lookup("BOTH", [line(sofa), line(mug), line(lamp)]).amount_cents
  end

  # A product in both lists is one product, not two.
  def test_a_product_named_twice_is_counted_once
    mug = a_product("Mug", 1_000)
    clearance = Collection.create(title: "Clearance", slug: "clearance", description: "", sort_order: 0)
    CollectionProduct.dataset.insert(collection_id: clearance.id, product_id: mug.id, position: 0)
    a_code("BOTH", "productSlugs" => ["mug"], "collectionSlugs" => ["clearance"])

    assert_equal 200, lookup("BOTH", [line(mug)]).amount_cents
  end

  # ── Editing the scope ────────────────────────────────────────────────────

  # A typo'd slug would otherwise widen the code silently, which is the
  # expensive direction to be wrong in.
  def test_an_unknown_slug_is_refused_and_leaves_nothing_behind
    error = assert_raises(DiscountWrites::Invalid) do
      a_code("TYPO", "productSlugs" => ["no-such-product"])
    end

    assert_includes error.message, "no product with the slug"
    assert_nil Discount.first(code: "TYPO")
  end

  def test_the_scope_can_be_replaced
    a_product("Mug", 1_000)
    a_product("Lamp", 5_000)
    discount = a_code("SWAP", "productSlugs" => ["mug"])

    DiscountWrites.update!(discount, { "productSlugs" => ["lamp"] })

    assert_equal ["lamp"], DiscountWrites.scope_of(discount).fetch("productSlugs")
  end

  # Widening a code back to the whole catalogue has to be sayable.
  def test_an_empty_list_widens_the_code_to_the_catalogue
    a_product("Mug", 1_000)
    discount = a_code("WIDEN", "productSlugs" => ["mug"])

    DiscountWrites.update!(discount, { "productSlugs" => [] })

    assert discount.whole_catalogue?
    assert_equal "catalogue", DiscountWrites.scope_of(discount).fetch("kind")
  end

  # An update that says nothing about scope must not silently clear it.
  def test_an_update_without_scope_keys_leaves_it_alone
    a_product("Mug", 1_000)
    discount = a_code("KEEP", "productSlugs" => ["mug"])

    DiscountWrites.update!(discount, { "value" => 30 })

    assert_equal ["mug"], DiscountWrites.scope_of(discount).fetch("productSlugs")
  end

  # ── Through the cart ─────────────────────────────────────────────────────

  # The end of the chain: `CartPayload` is what the storefront renders, and it
  # has to reach the same number as the evaluator did above.
  def test_the_cart_summary_discounts_only_the_eligible_lines
    sofa = a_product("Sofa", 100_000)
    mug = a_product("Mug", 1_000)
    a_code("MUGONLY", "productSlugs" => ["mug"])

    cart = Cart.create(session_key: "k", status: "active", created_at: Time.now, updated_at: Time.now)
    [sofa, mug].each do |product|
      CartItem.create(cart_id: cart.id, variant_id: Variant.first(product_id: product.id).id,
                      quantity: 1, created_at: Time.now, updated_at: Time.now)
    end

    summary = CartPayload.call(cart, discount_code: "MUGONLY").fetch("cart")

    assert_equal 101_000, summary.fetch("subtotalCents")
    assert_equal 200, summary.fetch("discountCents")
    assert_equal 100_800, summary.fetch("totalCents")
  end

  # A code that covers nothing reads as no discount at all, rather than as a
  # stale saving the customer thinks they are getting.
  def test_a_cart_with_nothing_eligible_reports_no_discount
    sofa = a_product("Sofa", 100_000)
    a_product("Mug", 1_000)
    a_code("MUGONLY", "productSlugs" => ["mug"])

    cart = Cart.create(session_key: "k", status: "active", created_at: Time.now, updated_at: Time.now)
    CartItem.create(cart_id: cart.id, variant_id: Variant.first(product_id: sofa.id).id,
                    quantity: 1, created_at: Time.now, updated_at: Time.now)

    summary = CartPayload.call(cart, discount_code: "MUGONLY").fetch("cart")

    assert_equal 0, summary.fetch("discountCents")
    assert_equal "", summary.fetch("discountCode")
    assert_equal 100_000, summary.fetch("totalCents")
  end
end
