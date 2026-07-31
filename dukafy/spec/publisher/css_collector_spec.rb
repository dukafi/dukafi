require_relative "../spec_helper"

class CssCollectorSpec < Minitest::Test
  def test_builds_deterministic_content_hashed_bundle_in_cascade_order
    collector = Dukafy::Publisher::CssCollector.new
    collector.add("base.text", ".text { color: inherit; }")
    collector.add("base.text", ".duplicate { display: block; }")

    first = collector.bundle(framework_css: ":root { --brand: #123456; }", page_css: ".hero { color: red; }")
    second = collector.bundle(framework_css: ":root { --brand: #123456; }", page_css: ".hero { color: red; }")

    assert_equal first, second
    assert_match(/\Asite-[0-9a-f]{12}\.css\z/, first.filename)
    assert_operator first.content.index(Dukafy::Publisher::RESET_CSS), :<, first.content.index(":root")
    assert_operator first.content.index(":root"), :<, first.content.index(".text")
    assert_operator first.content.index(".text"), :<, first.content.index(".hero")
    refute_includes first.content, ".duplicate"
  end

  def test_hash_changes_with_content_and_style_end_tags_are_neutralized
    collector = Dukafy::Publisher::CssCollector.new
    original = collector.bundle(page_css: ".a{}")
    changed = collector.bundle(page_css: ".a{color:red}</style><script>x</script>")

    refute_equal original.hash, changed.hash
    refute_match(%r{</style}i, changed.content)
    assert_includes changed.content, '<\\/style>'
  end
end
