require_relative "../spec_helper"

# Every stylesheet Dukafy builds must carry the site's fonts.
#
# `fonts_css:` is a keyword argument that defaults to empty, so forgetting it
# does not raise — it silently publishes a page whose `@font-face` rules and
# `--font-*` tokens are missing, and the merchant's chosen font quietly reverts
# to a system fallback on that one route.
#
# There are four builders (bake, two storefront paths, the editor preview) and
# they are easy to miss one of. That is not hypothetical: the identical mistake
# with `page_paths:` shipped internal links as `href="#"` from six of eight
# render call sites. So the invariant is structural rather than behavioural —
# if you build a CSS bundle, you pass the fonts.
class CssBundleCallSitesSpec < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)
  SCAN_DIRS = %w[routes services publisher].freeze

  def call_sites
    SCAN_DIRS.flat_map { |dir| Dir[File.join(ROOT, dir, "**", "*.rb")] }.flat_map do |path|
      File.read(path)
          .scan(/collector\.bundle\((?:[^()]|\([^()]*\))*\)/m)
          .map { |call| [path.sub("#{ROOT}/", ""), call] }
    end
  end

  def test_there_is_at_least_one_call_site_to_check
    refute_empty call_sites, "scanner found no collector.bundle call sites — the regex has drifted"
  end

  # Every ingredient a merchant can author but cannot see missing until they
  # look at the live site.
  REQUIRED = {
    "fonts_css" => "installed fonts silently vanish",
    "style_rules_css" => "every property set in the Styles panel silently vanishes",
  }.freeze

  def test_every_bundle_carries_every_authored_ingredient
    REQUIRED.each do |keyword, consequence|
      offenders = call_sites.reject { |_path, call| call.include?(keyword) }.map(&:first).uniq

      assert_empty offenders,
                   "collector.bundle without `#{keyword}:` — #{consequence}:\n" +
                   offenders.map { |path| "  #{path}" }.join("\n")
    end
  end
end
