require_relative "../spec_helper"

class ProductSlugSpec < Minitest::Test
  def setup
    Variant.dataset.delete
    Product.dataset.delete
  end

  def make(title, slug)
    Product.create(title: title, slug: slug, status: "active",
                   description_document: "", created_at: Time.now, updated_at: Time.now)
  end

  def test_slugify_collapses_punctuation_accents_and_spacing
    assert_equal "canvas-bag", Product.slugify("Canvas & Bag")
    assert_equal "canvas-bag", Product.slugify("  Canvas   Bag  ")
    assert_equal "canvas-bag", Product.slugify("Canvas—Bag!")
    assert_equal "cafe-au-lait", Product.slugify("Café au lait")
    # Everything it produces must satisfy the model's own format rule.
    assert_match(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/, Product.slugify("Canvas & Bag"))
  end

  def test_a_title_with_no_usable_characters_still_yields_a_slug
    # A model validation error is not an acceptable outcome for a real title.
    assert_equal "product", Product.unique_slug("!!!")
    assert_equal "product", Product.unique_slug("")
  end

  def test_a_free_slug_is_used_as_is
    assert_equal "canvas-bag", Product.unique_slug("Canvas Bag")
  end

  def test_a_taken_slug_gets_a_random_suffix_not_a_counter
    make("Canvas Bag", "canvas-bag")

    slug = Product.unique_slug("Canvas Bag")

    refute_equal "canvas-bag", slug
    assert_match(/\Acanvas-bag-[0-9a-f]{4}\z/, slug)
    # A counter would leak how many similar products exist, and two concurrent
    # creates would compute the same next number.
    refute_equal "canvas-bag-2", slug
  end

  def test_suffixed_slugs_keep_being_unique
    make("Canvas Bag", "canvas-bag")
    seen = 12.times.map { Product.unique_slug("Canvas Bag") }

    assert_equal 12, seen.uniq.length, "generated slugs collided with each other"
    seen.each { |slug| assert_match(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/, slug) }
  end

  def test_a_product_does_not_collide_with_itself
    product = make("Canvas Bag", "canvas-bag")

    # Re-deriving while editing the same product must return its own slug,
    # not a suffixed one.
    assert_equal "canvas-bag", Product.unique_slug("Canvas Bag", exclude_id: product.id)
  end
end
