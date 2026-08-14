require_relative "../spec_helper"

class CssCollectorSpec < Minitest::Test
  def test_builds_deterministic_content_hashed_bundle_in_cascade_order
    collector = Dukafi::Publisher::CssCollector.new
    collector.add("base.text", ".text { color: inherit; }")
    collector.add("base.text", ".duplicate { display: block; }")

    first = collector.bundle(framework_css: ":root { --brand: #123456; }", page_css: ".hero { color: red; }")
    second = collector.bundle(framework_css: ":root { --brand: #123456; }", page_css: ".hero { color: red; }")

    assert_equal first, second
    assert_match(/\Asite-[0-9a-f]{12}\.css\z/, first.filename)
    assert_operator first.content.index(Dukafi::Publisher::RESET_CSS), :<, first.content.index(":root")
    assert_operator first.content.index(":root"), :<, first.content.index(".text")
    assert_operator first.content.index(".text"), :<, first.content.index(".hero")
    refute_includes first.content, ".duplicate"
  end

  def test_hash_changes_with_content_and_style_end_tags_are_neutralized
    collector = Dukafi::Publisher::CssCollector.new
    original = collector.bundle(page_css: ".a{}")
    changed = collector.bundle(page_css: ".a{color:red}</style><script>x</script>")

    refute_equal original.hash, changed.hash
    refute_match(%r{</style}i, changed.content)
    assert_includes changed.content, '<\\/style>'
  end

  # A module's CSS is a DEFAULT. It used to come last at equal specificity and
  # therefore win: `.dukafy-collection-loop{grid-template-columns:repeat(auto-fit,...)}`
  # silently overrode an authored `lg:grid-cols-4`, so the published grid
  # disagreed with the editor canvas — one product filled the whole row.
  def test_module_css_is_layered_so_an_authored_utility_beats_it
    collector = Dukafi::Publisher::CssCollector.new
    collector.add("store.relationship-loop", ".dukafy-collection-loop{display:grid}")
    content = collector.bundle(tailwind_css: ".lg\\:grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}").content

    assert_match(/\A@layer dukafy-reset, dukafy-modules;/, content)
    assert_includes content, "@layer dukafy-modules {"
    # The utility stays UNLAYERED, and unlayered beats layered regardless of
    # specificity or source order.
    refute_includes content, "@layer dukafy-modules {\n.lg"
    utility_at = content.index(".lg")
    modules_at = content.index("@layer dukafy-modules {")
    assert_operator utility_at, :<, modules_at,
                    "the utility should sit outside (before) the modules layer"
  end

  def test_the_reset_is_layered_below_modules
    collector = Dukafi::Publisher::CssCollector.new
    collector.add("m", ".dukafy-buy-button{padding:.625rem 1rem}")
    content = collector.bundle.content

    # Order of first appearance in the @layer statement is the cascade order,
    # so a module's padding still beats the reset's `padding: 0`.
    assert_includes content, "@layer dukafy-reset {"
    assert_operator content.index("dukafy-reset"), :<, content.index("dukafy-modules")
  end

  def test_an_empty_module_set_emits_no_empty_layer_block
    content = Dukafi::Publisher::CssCollector.new.bundle.content

    refute_includes content, "@layer dukafy-modules {"
  end
end
