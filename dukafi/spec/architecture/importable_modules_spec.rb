require_relative "../spec_helper"

# Anything the HTML importer can produce must be publishable.
#
# The importer is how a paste — and now the AI assistant — turns markup into
# nodes, so every module id it can emit can end up in a SAVED document. When
# the publisher has no renderer for one, `RenderPage` raises `KeyError` and
# Publish fails *after* the edit was already stored, leaving the merchant with
# a document they cannot ship and an error naming a module id they never chose.
#
# That is exactly how `base.svg` shipped: the assistant wrote an `<svg>`, the
# importer mapped it the same way it maps a pasted logo, and Publish died with
# `key not found: "base.svg"`.
#
# Scanned from the TypeScript source rather than a generated manifest — the
# module id is returned from each rule's `map` function, so there is nothing
# static to export. Same approach as `render_page_call_sites_spec.rb`.
class ImportableModulesSpec < Minitest::Test
  RULES = File.expand_path("../../../dukafi-editor/src/core/htmlImport/rules.ts", __dir__)

  def importable_module_ids
    source = File.read(RULES)
    source.scan(/moduleId:\s*'((?:base|store)\.[a-z0-9-]+)'/).flatten.uniq.sort
  end

  def test_the_scanner_finds_the_rule_table
    ids = importable_module_ids

    refute_empty ids, "found no moduleIds in #{RULES} — the regex has drifted"
    # A sanity floor: the importer maps far more than a handful of elements.
    assert_operator ids.length, :>, 10
  end

  def test_every_importable_module_has_a_publisher_renderer
    missing = importable_module_ids.reject { |id| Dukafi::Publisher::REGISTRY.key?(id) }

    assert_empty missing,
                 "The HTML importer can produce these, but the publisher cannot render them — " \
                 "a document containing one saves fine and then fails to publish:\n" +
                 missing.map { |id| "  #{id}" }.join("\n")
  end
end
