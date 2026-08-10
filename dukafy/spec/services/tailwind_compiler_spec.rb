require_relative "../spec_helper"

# Regression cover for a silent, whole-category CSS failure: every padding and
# margin utility computed correctly and then never applied.
class TailwindCompilerSpec < Minitest::Test
  def compile(*classes)
    TailwindCompiler.call(classes: classes)
  end

  def test_compiles_only_utilities_found_in_published_html
    css = TailwindCompiler.call(html: '<main class="flex p-4 text-red-500">The hidden grid stays prose.</main>')

    assert_includes css, ".flex{display:flex}"
    assert_includes css, ".p-4{"
    assert_includes css, ".text-red-500{"
    refute_includes css, ".hidden{"
    refute_includes css, ".grid{"
  end

  def test_skips_compiler_when_html_has_no_classes
    assert_equal "", TailwindCompiler.call(html: "<main>Plain</main>", binary: "/missing")
  end

  def test_compiles_spacing_families_responsive_variants_and_arbitrary_values
    classes = %w[
      p-8 px-8 py-8 pt-8 pr-8 pb-8 pl-8 ps-8 pe-8
      m-8 mx-8 my-8 mt-8 mr-8 mb-8 ml-8 ms-8 me-8
      -mt-8 gap-8 gap-x-8 gap-y-8 space-x-8 space-y-8
      md:px-8 hover:p-8 w-[37px]
    ]
    css = TailwindCompiler.call(html: %(<main class="#{classes.join(" ")}"></main>))

    classes.each do |class_name|
      escaped_selector = class_name.gsub(/([:\[\]])/, '\\\\\1')
      assert_includes css, ".#{escaped_selector}", "expected Tailwind to compile #{class_name}"
    end
  end

  def test_utilities_are_emitted_unlayered_so_the_reset_cannot_defeat_them
    css = compile("p-5", "px-6")

    # Dukafy's reset is `:where(*) { margin: 0; padding: 0 }` — UNLAYERED. In
    # the CSS cascade an unlayered declaration beats a layered one regardless
    # of specificity, so `@layer utilities` made the zero-specificity reset win
    # over every spacing utility.
    refute_includes css, "@layer utilities"
    assert_includes css, ".p-5"
    assert_includes css, ".px-6"
  end

  def test_spacing_utilities_resolve_against_a_defined_variable
    css = compile("p-5", "gap-6", "py-20")

    # `calc(var(--spacing) * 5)` is inert if --spacing was never emitted.
    assert_includes css, "--spacing"
    assert_includes css, "padding:calc(var(--spacing)"
  end

  def test_the_reset_loses_to_a_padding_utility_in_the_assembled_bundle
    bundle = Dukafy::Publisher::CssCollector.new.bundle(
      framework_css: "", tailwind_css: compile("p-5")
    )

    reset_at = bundle.content.index(":where(*) { margin")
    utility_at = bundle.content.index(".p-5")
    refute_nil reset_at
    refute_nil utility_at
    # Same origin, both unlayered: `.p-5` (0,1,0) beats `:where(*)` (0,0,0),
    # and it also comes later, so it wins on either rule.
    assert_operator utility_at, :>, reset_at
  end

  def test_responsive_and_state_variants_still_compile
    css = compile("sm:grid-cols-2", "lg:grid-cols-4", "hover:bg-zinc-700")

    assert_includes css, "sm\\:grid-cols-2"
    assert_includes css, "lg\\:grid-cols-4"
    assert_includes css, "hover\\:bg-zinc-700"
    assert_includes css, "@media"
  end

  def test_no_candidates_yields_no_stylesheet
    assert_equal "", TailwindCompiler.call(classes: [])
  end
end
