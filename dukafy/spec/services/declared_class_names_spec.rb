require_relative "../spec_helper"

# Tailwind only emits a utility it has SEEN, and the publisher feeds it
# rendered HTML. Two things never render at bake time — the inside of a cart
# region (an empty placeholder until a visitor asks) and the losing half of
# every `visibleWhen` condition — so their classes reached the browser with no
# CSS behind them. A product card with an "Add to cart" button and a −/+
# stepper hits both at once.
class DeclaredClassNamesSpec < Minitest::Test
  def site
    {
      "styleRules" => {
        "tw-card" => { "name" => "rounded-xl border" },
        "tw-add" => { "name" => "bg-zinc-900 text-white" },
        "tw-minus" => { "name" => "h-9 w-9" },
        "tw-unused" => { "name" => "never-referenced" },
      },
    }
  end

  def node(id, children: [], class_ids: [], extra: {})
    { "id" => id, "moduleId" => "base.container", "children" => children,
      "props" => {}, "breakpointOverrides" => {}, "classIds" => class_ids }.merge(extra)
  end

  def document
    {
      "rootNodeId" => "card",
      "nodes" => {
        "card" => node("card", children: %w[region], class_ids: %w[tw-card]),
        "region" => node("region", children: %w[add minus], extra: { "actions" => { "region" => "cart" } }),
        "add" => node("add", class_ids: %w[tw-add],
                      extra: { "visibleWhen" => { "source" => "currentEntry", "field" => "inCart", "operator" => "isFalse" } }),
        "minus" => node("minus", class_ids: %w[tw-minus],
                        extra: { "visibleWhen" => { "source" => "currentEntry", "field" => "inCart", "operator" => "isTrue" } }),
      },
    }
  end

  def test_collects_class_names_the_render_never_emits
    names = DeclaredClassNames.call([document], site)

    # Inside a cart region AND behind opposite conditions — neither branch can
    # appear in the same baked page, so neither is in the rendered HTML.
    assert_includes names, "bg-zinc-900"
    assert_includes names, "h-9"
    assert_includes names, "rounded-xl"
  end

  def test_splits_multi_utility_rule_names
    names = DeclaredClassNames.call([document], site)

    assert_includes names, "border"
    assert_includes names, "text-white"
    refute_includes names, "rounded-xl border"
  end

  def test_ignores_rules_no_node_references
    refute_includes DeclaredClassNames.call([document], site), "never-referenced"
  end

  def test_tolerates_a_site_without_style_rules
    assert_empty DeclaredClassNames.call([document], nil)
    assert_empty DeclaredClassNames.call([document], {})
  end

  # The regression this exists to stop: bake the page with no visitor, then
  # check the compiled stylesheet actually covers the hidden branches.
  def test_baked_page_compiles_css_for_hidden_branches
    rendered = Dukafy::Publisher::RenderPage.call(
      document: document, registry: Dukafy::Publisher::REGISTRY, prefetched: {}, site: site
    ).html
    refute_includes rendered, "bg-zinc-900", "sanity: the add branch must NOT be in the baked HTML"

    css = TailwindCompiler.call(
      html: %(<body>#{rendered}</body>), classes: DeclaredClassNames.call([document], site)
    )

    assert_includes css, "bg-zinc-900"
    assert_includes css, "h-9"
  end
end
