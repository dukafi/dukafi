require_relative "../spec_helper"

# Every render must be able to resolve `cms:page:<id>` links.
#
# `page_paths` is a keyword argument that defaults to empty, so forgetting it
# does not raise — it silently publishes every internal page link as `href="#"`.
# That is exactly how this shipped: the fix went into the bake and the
# storefront, and the six OTHER call sites kept emitting dead links. The one
# that mattered was the cart region, which renders a subtree of its own.
#
# So the invariant is structural rather than behavioural: if you call
# RenderPage, you pass page_paths.
class RenderPageCallSitesSpec < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)
  SCAN_DIRS = %w[routes services publisher].freeze

  def call_sites
    SCAN_DIRS.flat_map { |dir| Dir[File.join(ROOT, dir, "**", "*.rb")] }.flat_map do |path|
      File.read(path)
          .scan(/Dukafi::Publisher::RenderPage\.call\((?:[^()]|\([^()]*\))*\)/m)
          .map { |call| [path.sub("#{ROOT}/", ""), call] }
    end
  end

  def test_there_is_at_least_one_call_site_to_check
    refute_empty call_sites, "scanner found no RenderPage call sites — the regex has drifted"
  end

  def test_every_render_call_passes_page_paths
    offenders = call_sites.reject { |_path, call| call.include?("page_paths") }.map(&:first).uniq

    assert_empty offenders,
                 "RenderPage.call without `page_paths:` — internal page links render as '#':\n" +
                 offenders.map { |path| "  #{path}" }.join("\n")
  end
end
