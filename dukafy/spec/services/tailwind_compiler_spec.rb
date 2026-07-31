require_relative "../spec_helper"

class TailwindCompilerSpec < Minitest::Test
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
end
