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
end
