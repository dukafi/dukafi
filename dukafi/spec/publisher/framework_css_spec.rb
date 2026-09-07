require_relative "../spec_helper"

class FrameworkCssSpec < Minitest::Test
  def test_emits_minimal_color_tokens_and_drops_injection_values
    site = {
      "settings" => {
        "framework" => {
          "colors" => {
            "tokens" => [
              { "slug" => "brand", "lightValue" => "#6366f1" },
              { "slug" => "surface-1", "lightValue" => "rgb(255 255 255)" },
              { "slug" => "bad;name", "lightValue" => "red" },
              { "slug" => "attack", "lightValue" => "red; --owned: yes" },
            ],
          },
        },
      },
    }

    css = Dukafi::Publisher::FrameworkCss.call(site)

    assert_equal ":root {\n  --brand: #6366f1;\n  --surface-1: rgb(255 255 255);\n}", css
  end

  def test_empty_framework_emits_no_css
    assert_equal "", Dukafi::Publisher::FrameworkCss.call("settings" => {})
  end

  def test_emits_h1_through_p_defaults_when_typography_is_present
    css = Dukafi::Publisher::FrameworkCss.call(
      "settings" => { "framework" => { "typography" => { "groups" => [] } } },
    )

    assert_includes css, ":where(h1)"
    assert_includes css, ":where(p)"
    assert_includes css, "font-size: 3rem;"
    assert_includes css, "--container-width: var(--container-wide);"
    assert_includes css, "--space-horizontal: 1.5rem;"
  end

  def test_font_size_follows_the_first_scale_group
    css = Dukafi::Publisher::FrameworkCss.call(
      "settings" => {
        "framework" => {
          "typography" => {
            "groups" => [{ "namingConvention" => "text", "steps" => "xs,s,m,l,xl,2xl,3xl,4xl" }],
          },
        },
      },
    )

    assert_includes css, "font-size: var(--text-4xl, 3rem);"
    assert_includes css, "font-size: var(--text-m, 1rem);"
  end

  def test_stored_type_styles_override_defaults
    css = Dukafi::Publisher::FrameworkCss.call(
      "settings" => {
        "framework" => {
          "typography" => {
            "groups" => [],
            "styles" => [{ "tag" => "h1", "fontSize" => "4rem", "fontWeight" => "800" }],
          },
        },
      },
    )

    assert_includes css, "font-size: 4rem;"
    assert_includes css, "font-weight: 800;"
  end

  def test_emits_spacing_preset_defaults_when_spacing_is_present
    css = Dukafi::Publisher::FrameworkCss.call(
      "settings" => { "framework" => { "spacing" => { "groups" => [] } } },
    )

    assert_includes css, "--container-narrow: 48rem;"
    assert_includes css, "--container-width: var(--container-wide);"
    assert_includes css, "--card-padding: 1.5rem;"
    assert_includes css, "--space-vertical: 5rem;"
    assert_includes css, "--space-horizontal: 1.5rem;"
    assert_includes css, "--radius: var(--radius-md);"
    assert_includes css, "--radius-button: var(--radius);"
    assert_includes css, ":where(button"
    assert_includes css, ":where(img, video)"
    assert_includes css, ":where(article, div)"
    assert_includes css, "--icon-color: var(--scheme-accent, currentColor);"
    assert_includes css, ":where(svg)"
  end

  def test_stored_spacing_presets_override_defaults
    css = Dukafi::Publisher::FrameworkCss.call(
      "settings" => {
        "framework" => {
          "spacing" => {
            "groups" => [],
            "presets" => {
              "containerWidth" => "narrow",
              "cardPadding" => "roomy",
              "vertical" => "xs",
              "horizontal" => "xl",
              "radius" => "full",
            },
          },
        },
      },
    )

    assert_includes css, "--container-width: var(--container-narrow);"
    assert_includes css, "--card-padding: 2rem;"
    assert_includes css, "--space-vertical: 2rem;"
    assert_includes css, "--space-horizontal: 2.5rem;"
    assert_includes css, "--radius: var(--radius-full);"
  end

  def test_emits_button_defaults_and_safe_custom_presets
    css = Dukafi::Publisher::FrameworkCss.call(
      "settings" => {
        "framework" => {
          "buttons" => {
            "primaryColor" => "heading", "padding" => "7", "radius" => "7",
            "radiusLinked" => false, "fontVariable" => "font-primary",
            "fontSize" => "6", "fontWeight" => "7", "casing" => "uppercase",
            "letterSpacing" => "6",
          },
        },
      },
    )

    assert_includes css, "--button-primary-color: var(--scheme-heading, currentColor);"
    assert_includes css, "--button-padding: 1.125rem 1.75rem;"
    assert_includes css, "--button-radius: 9999px;"
    assert_includes css, "--button-font-family: var(--font-primary, inherit);"
    assert_includes css, "--button-text-transform: uppercase;"
    assert_includes css, ":where(.dukafi-button)"
    assert_includes css, ":where(.dukafi-button.button-secondary)"
    refute_includes css, "!important"
  end

  def test_rejects_unsafe_button_font_variable
    css = Dukafi::Publisher::FrameworkCss.call(
      "settings" => { "framework" => { "buttons" => { "fontVariable" => "x);color:red" } } },
    )
    assert_includes css, "--button-font-family: inherit;"
    refute_includes css, "color:red"
  end

  def test_emits_overridable_input_defaults_and_safe_custom_presets
    css = Dukafi::Publisher::FrameworkCss.call(
      "settings" => {
        "framework" => {
          "inputs" => {
            "backgroundColor" => "background", "textColor" => "heading",
            "borderColor" => "border", "focusColor" => "accent", "padding" => "7",
            "radius" => "7", "radiusLinked" => false, "borderWidth" => "4",
            "fontVariable" => "font-primary", "fontSize" => "6", "fontWeight" => "7",
          },
        },
      },
    )

    assert_includes css, "--input-background: var(--scheme-background, currentColor);"
    assert_includes css, "--input-padding: 1.125rem 1.25rem;"
    assert_includes css, "--input-radius: 9999px;"
    assert_includes css, "--input-border-width: 2px;"
    assert_includes css, "--input-font-family: var(--font-primary, inherit);"
    assert_includes css, ":where(.dukafi-input)"
    assert_includes css, ":where(.dukafi-input):focus-visible"
    refute_includes css, "!important"
  end
end
