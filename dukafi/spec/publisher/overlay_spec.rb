require_relative "../spec_helper"

# Sheets and modals.
#
# A container marked as an overlay publishes as a native `<dialog>`, because
# that element is the feature: focus trapping, Escape, a backdrop, an inert
# background and `aria-modal` all come from `showModal()`. The runtime Dukafi
# ships is wiring, not an implementation.
class OverlaySpec < Minitest::Test
  def registry
    Dukafi::Publisher::Registry.new.tap do |registry|
      registry.register("base.body") { |_p, children, _c| { html: children.join } }
      registry.register("base.container") { |_p, children, _c| { html: %(<div class="card">#{children.join}</div>) } }
      registry.register("base.button", defaults: { "label" => "Go" }) do |props, _children, _c|
        { html: "<button>#{props.fetch('label')}</button>" }
      end
    end
  end

  def node(id, module_id, children: [], props: {}, extra: {})
    { "id" => id, "moduleId" => module_id, "children" => children, "props" => props,
      "classIds" => [], "breakpointOverrides" => {} }.merge(extra)
  end

  def render(nodes, root: "b")
    Dukafi::Publisher::RenderPage.call(
      document: { "rootNodeId" => root, "nodes" => nodes }, registry: registry, page_paths: {}
    )
  end

  def drawer(overlay: "sheet-right", extra: {})
    {
      "b" => node("b", "base.body", children: %w[trigger sheet]),
      "trigger" => node("trigger", "base.button", props: { "label" => "Cart" },
                        extra: { "actions" => { "click" => { "type" => "overlay.open", "target" => "sheet" } } }),
      "sheet" => node("sheet", "base.container", children: %w[close],
                      extra: { "actions" => { "overlay" => overlay }.merge(extra) }),
      "close" => node("close", "base.button", props: { "label" => "Close" },
                      extra: { "actions" => { "click" => { "type" => "overlay.close" } } }),
    }
  end

  def test_an_overlay_publishes_as_a_dialog
    html = render(drawer).html

    assert_includes html, '<dialog data-dukafy-overlay="sheet"'
    assert_includes html, 'data-dukafy-overlay-variant="sheet-right"'
    assert_includes html, "</dialog>"
  end

  # The element is REWRITTEN, not wrapped: the merchant's layout classes sit on
  # it, and a wrapper would put a stray box between them and their children.
  def test_the_merchants_own_classes_stay_on_the_dialog
    html = render(drawer).html

    assert_includes html, %(<dialog data-dukafy-overlay="sheet" data-dukafy-overlay-variant="sheet-right" class="card">)
    refute_includes html, "<div class=\"card\">"
  end

  def test_a_trigger_can_be_any_node
    html = render(drawer).html

    assert_includes html, '<button data-dukafy-overlay-open="sheet" class="dukafi-button">Cart</button>'
  end

  # A close button inside the drawer should not have to name the drawer it is
  # already inside.
  def test_close_without_a_target_means_the_enclosing_overlay
    assert_includes render(drawer).html, '<button data-dukafy-overlay-close="" class="dukafi-button">Close</button>'
  end

  def test_every_variant_is_carried_through
    %w[modal sheet-left sheet-right sheet-bottom].each do |variant|
      assert_includes render(drawer(overlay: variant)).html, %(data-dukafy-overlay-variant="#{variant}")
    end
  end

  # ── The runtime ──────────────────────────────────────────────────────────

  # A page with no overlay must stay JavaScript-free — that is the whole
  # reason runtimes are declared per module rather than always shipped.
  def test_the_runtime_ships_only_when_an_overlay_is_present
    with = render(drawer)
    without = render({ "b" => node("b", "base.body", children: []) })

    assert_includes with.runtimes, :overlay
    assert_empty without.runtimes
  end

  # ── Staying shut ─────────────────────────────────────────────────────────

  # The bug that shipped: a closed <dialog> is `display: none` from the USER
  # AGENT stylesheet, and any author `display` utility outranks that. A sheet
  # laid out with Tailwind's `flex` rendered permanently open on the live site.
  def test_a_closed_overlay_is_hidden_even_against_a_display_utility
    css = render(drawer).css

    assert_includes css, "dialog[data-dukafy-overlay]:not([open])"
    # Author-level `!important` is what beats `.flex{display:flex}`.
    assert_includes css, "display:none !important"
  end

  # Once open, the merchant's own layout classes must apply — the rule is
  # scoped to `:not([open])` precisely so it gets out of the way.
  def test_the_rule_does_not_apply_once_open
    refute_includes render(drawer).css, "dialog[data-dukafy-overlay][open]"
  end

  # The UA gives `<dialog>` a solid border, 1em padding, `fit-content` sizing
  # and `margin:auto`. Left in place, a sheet meant to hug the right edge
  # floats in the middle with a border round it, and `w-full` loses to
  # `max-width: calc(100% - 6px - 2em)`.
  def test_the_browsers_own_dialog_chrome_is_reset
    css = render(drawer).css

    assert_includes css, "border:0"
    assert_includes css, "padding:0"
    assert_includes css, "margin:0"
    assert_includes css, "max-width:none"
  end

  # Anchoring is the one thing the merchant's classes cannot do, because a
  # dialog is positioned by the UA rather than by the normal flow.
  def test_each_variant_anchors_where_its_name_says
    css = render(drawer).css

    assert_includes css, %(dialog[data-dukafy-overlay-variant="sheet-right"]{position:fixed;inset:0 0 0 auto;height:100%;})
    assert_includes css, %(dialog[data-dukafy-overlay-variant="sheet-left"]{position:fixed;inset:0 auto 0 0;height:100%;})
    assert_includes css, %(dialog[data-dukafy-overlay-variant="sheet-bottom"]{position:fixed;inset:auto 0 0 0;width:100%;})
  end

  def test_the_backdrop_is_dimmed
    assert_includes render(drawer).css, "::backdrop{background:rgb(0 0 0 / 0.5)}"
  end

  def test_a_page_without_an_overlay_carries_no_overlay_css
    css = render({ "b" => node("b", "base.body", children: []) }).css

    refute_includes css, "data-dukafy-overlay"
  end

  # ── Refusals ─────────────────────────────────────────────────────────────

  def test_an_unknown_variant_leaves_the_element_alone
    html = render(drawer(overlay: "lightbox")).html

    refute_includes html, "<dialog"
    assert_includes html, '<div class="card">'
  end

  # The target lands in an attribute the runtime reads; an id that is not a
  # node id could not resolve anyway, and this keeps the attribute clean.
  def test_an_open_trigger_with_no_usable_target_stays_inert
    nodes = drawer
    nodes["trigger"] = node("trigger", "base.button", props: { "label" => "Cart" },
                            extra: { "actions" => { "click" => { "type" => "overlay.open", "target" => 'x" onload="' } } })

    refute_includes render(nodes).html, "data-dukafy-overlay-open"
  end

  # ── The cart drawer ──────────────────────────────────────────────────────

  # The canonical case, and the one that broke first: a drawer is BOTH an
  # overlay and a cart region. The cart-region placeholder path returns early,
  # so without handling it there the drawer published as a plain hidden div
  # that nothing could open.
  def test_a_cart_drawer_is_both_an_overlay_and_a_live_region
    html = render(drawer(extra: { "region" => "cart" })).html

    assert_includes html, "<dialog"
    assert_includes html, 'data-dukafy-overlay="sheet"'
    assert_includes html, 'data-dukafy-cart-region="sheet"'
    assert_includes html, "/fragments/cart/region?node=sheet"
  end

  def test_a_cart_drawer_pulls_in_both_runtimes
    runtimes = render(drawer(extra: { "region" => "cart" })).runtimes

    assert_includes runtimes, :overlay
    assert_includes runtimes, :htmx
  end
end
