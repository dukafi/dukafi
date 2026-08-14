require_relative "../spec_helper"

# Authored style rules on the published page.
#
# Before this emitter the Ruby publisher read only a rule's NAME and handed it
# to Tailwind, discarding the declarations. Everything set in the Styles panel
# therefore rendered in the canvas (which applies the map client-side) and
# vanished on publish — including the framework colour utilities, which
# Tailwind cannot generate because `--primary` is not one of its theme colours.
class StyleRulesCssSpec < Minitest::Test
  def rule(overrides = {})
    { "name" => "a", "selector" => ".a", "order" => 0, "styles" => {}, "contextStyles" => {} }
      .merge(overrides)
  end

  def css(rules, breakpoints: [])
    Dukafi::Publisher::StyleRulesCss.call(
      "styleRules" => rules, "breakpoints" => breakpoints
    )
  end

  def test_a_site_with_no_rules_emits_nothing
    assert_equal "", Dukafi::Publisher::StyleRulesCss.call({})
    assert_equal "", css({})
  end

  def test_emits_the_declarations_a_merchant_authored
    result = css({ "a" => rule("selector" => ".mx-auto",
                             "styles" => { "fontFamily" => %("Saira", sans-serif) }) })

    assert_includes result, ".mx-auto {"
    assert_includes result, %(font-family: "Saira", sans-serif;)
  end

  # The exact case that started this: a font applied in the Styles panel showed
  # in the canvas and reverted to a system font on the live site.
  def test_camel_case_properties_become_css_property_names
    result = css({ "a" => rule("styles" => {
      "backgroundColor" => "red", "borderColor" => "blue", "fontFamily" => "Saira",
    }) })

    assert_includes result, "background-color: red;"
    assert_includes result, "border-color: blue;"
    assert_includes result, "font-family: Saira;"
  end

  def test_custom_properties_pass_through_unchanged
    assert_includes css({ "a" => rule("styles" => { "--brand" => "#fff" }) }), "--brand: #fff;"
  end

  def test_rules_without_declarations_emit_no_empty_block
    assert_equal "", css({ "a" => rule("styles" => {}) })
  end

  # Smaller `order` first, so a later override wins on equal specificity —
  # the cascade the editor shows.
  def test_rules_are_emitted_in_cascade_order
    result = css({
      "b" => rule("selector" => ".b", "order" => 5, "styles" => { "color" => "blue" }),
      "a" => rule("selector" => ".a", "order" => 1, "styles" => { "color" => "red" }),
    })

    assert_operator result.index(".a {"), :<, result.index(".b {")
  end

  # ── Responsive ───────────────────────────────────────────────────────────

  def test_breakpoint_overrides_become_media_queries
    result = css(
      { "a" => rule("styles" => { "fontSize" => "18px" },
                    "contextStyles" => { "mobile" => { "fontSize" => "14px" } }) },
      breakpoints: [{ "id" => "mobile", "mediaQuery" => "(max-width: 375px)" }],
    )

    assert_includes result, "@media (max-width: 375px) {"
    assert_includes result, "font-size: 14px;"
  end

  # An override keyed to a breakpoint the site no longer has would otherwise
  # emit a `@media` with no query at all.
  def test_an_override_for_an_unknown_breakpoint_is_skipped
    result = css({ "a" => rule("contextStyles" => { "gone" => { "color" => "red" } }) })

    refute_includes result, "@media"
    refute_includes result, "red"
  end

  def test_breakpoints_are_emitted_in_site_order_not_hash_order
    result = css(
      { "a" => rule("contextStyles" => {
        "desktop" => { "color" => "green" }, "mobile" => { "color" => "red" },
      }) },
      breakpoints: [
        { "id" => "mobile", "mediaQuery" => "(max-width: 375px)" },
        { "id" => "desktop", "mediaQuery" => "(max-width: 1440px)" },
      ],
    )

    assert_operator result.index("375px"), :<, result.index("1440px")
  end

  # ── Injection ────────────────────────────────────────────────────────────

  # Values are merchant-controlled and land inside a <style> block. Rejecting
  # outright beats stripping: a mangled value would render as something the
  # author never wrote.
  def test_a_value_that_would_start_a_new_rule_is_dropped
    result = css({ "a" => rule("styles" => {
      "color" => "red; } body { display: none", "backgroundColor" => "blue",
    }) })

    refute_includes result, "display: none"
    assert_includes result, "background-color: blue;"
  end

  def test_a_value_cannot_close_the_style_element
    assert_equal "", css({ "a" => rule("styles" => { "color" => "red</style><script>x()" }) })
  end

  def test_legacy_css_attack_vectors_are_dropped
    ["expression(alert(1))", "javascript:alert(1)", "url(data:text/html,x)"].each do |value|
      refute_includes css({ "a" => rule("styles" => { "color" => value }) }), "alert"
    end
    assert_equal "", css({ "a" => rule("styles" => { "behavior" => "url(x.htc)" }) })
  end

  def test_a_hostile_property_name_is_dropped
    assert_equal "", css({ "a" => rule("styles" => { "color: red; background" => "blue" }) })
  end

  def test_a_hostile_selector_drops_the_whole_rule
    assert_equal "", css({ "a" => rule("selector" => ".a { } body", "styles" => { "color" => "red" }) })
  end

  def test_a_hostile_media_query_is_not_emitted
    result = css(
      { "a" => rule("contextStyles" => { "m" => { "color" => "red" } }) },
      breakpoints: [{ "id" => "m", "mediaQuery" => "screen { } body { display:none" }],
    )

    refute_includes result, "display:none"
  end

  # ── Deliberately not ported ──────────────────────────────────────────────

  # `rawCss` rules (imported @keyframes) and custom `@`-condition contexts
  # exist in the editor's emitter. Nothing in Dukafi can author either yet, so
  # they are skipped rather than half-rendered — a wrong animation is worse
  # than an absent one.
  def test_raw_css_rules_are_skipped_rather_than_guessed
    result = css({ "a" => rule("rawCss" => "@keyframes spin { to { rotate: 360deg } }",
                             "styles" => { "color" => "red" }) })

    refute_includes result, "@keyframes"
  end
end
