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
end
