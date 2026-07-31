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
end
