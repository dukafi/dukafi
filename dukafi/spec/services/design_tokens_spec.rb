require_relative "../spec_helper"

class DesignTokensSpec < Minitest::Test
  def setup
    Page.dataset.delete
    SiteState.dataset.delete
  end

  def site!(payload)
    SiteState.create(site: payload, seq: 0, created_at: Time.now, updated_at: Time.now)
  end

  def test_snapshot_lists_color_classes_and_font_tokens
    site!(
      "settings" => {
        "framework" => {
          "colors" => {
            "tokens" => [{
              "id" => "primary-token", "slug" => "primary", "category" => "Brand",
              "lightValue" => "hsla(238, 100%, 62%, 1)",
              "generateUtilities" => { "text" => true, "background" => true, "border" => false, "fill" => false },
            }],
          },
          "spacing" => { "groups" => [] },
        },
        "fonts" => {
          "items" => [{ "id" => "f1", "family" => "Inter", "source" => "google" }],
          "tokens" => [{ "name" => "Primary", "variable" => "font-primary", "familyId" => "f1", "fallback" => "sans-serif" }],
        },
      },
    )

    payload = DesignTokens.snapshot
    color = payload.fetch("colors").fetch(0)
    assert_equal "primary", color.fetch("slug")
    assert_equal "--primary", color.fetch("cssVar")
    assert_includes color.fetch("classes"), "text-primary"
    assert_includes color.fetch("classes"), "bg-primary"
    refute_includes color.fetch("classes"), "border-primary"

    font = payload.dig("fonts", "tokens", 0)
    assert_equal "font-primary", font.fetch("variable")
    assert_equal "Inter", font.fetch("family")
    assert_equal "var(--container-wide)", payload.dig("layout", "--container-width")
    assert_equal "1.5rem", payload.dig("layout", "--card-padding")
    assert_equal "5rem", payload.dig("layout", "--space-vertical")
    assert_equal "1.5rem", payload.dig("layout", "--space-horizontal")
    assert_equal "var(--radius-md)", payload.dig("layout", "--radius")
    assert_equal "var(--radius)", payload.dig("layout", "--radius-button")
    assert_equal "var(--scheme-accent, currentColor)", payload.dig("layout", "--icon-color")
  end

  def test_updating_primary_rewrites_the_variable_and_keeps_bound_classes
    site!(
      "settings" => {
        "framework" => {
          "colors" => {
            "tokens" => [{
              "id" => "primary-token", "slug" => "primary",
              "lightValue" => "#111111",
              "generateUtilities" => { "text" => true, "background" => true },
            }],
          },
        },
      },
      "styleRules" => {
        "framework:color:primary-token:base:text" => {
          "name" => "text-primary", "selector" => ".text-primary",
          "styles" => { "color" => "var(--primary)" },
        },
      },
    )

    result = DesignTokens.apply!("colors" => [{ "slug" => "primary", "value" => "#be123c" }])
    assert_includes result.fetch("changed"), "updated color primary"
    assert_equal "#be123c", result.dig("tokens", "colors", 0, "value")
    assert_equal "var(--primary)", SiteState.first.site.dig("styleRules", "framework:color:primary-token:base:text", "styles", "color")
  end

  def test_adding_a_color_creates_locked_utility_rules
    site!("settings" => {})

    DesignTokens.apply!("colors" => [{ "slug" => "accent", "value" => "hsla(12, 80%, 50%, 1)" }])
    site = SiteState.first.site
    token = site.dig("settings", "framework", "colors", "tokens").fetch(0)
    assert_equal "accent", token.fetch("slug")
    rule = site.fetch("styleRules").values.find { |row| row["name"] == "text-accent" }
    assert_equal "var(--accent)", rule.dig("styles", "color")
  end

  def test_font_remap_requires_an_installed_family
    site!(
      "settings" => {
        "fonts" => {
          "items" => [{ "id" => "f1", "family" => "Inter" }],
          "tokens" => [{ "variable" => "font-primary", "familyId" => "f1" }],
        },
      },
    )

    error = assert_raises(ArgumentError) do
      DesignTokens.apply!("fonts" => [{ "variable" => "font-primary", "family" => "Comic Sans" }])
    end
    assert_match(/not installed/, error.message)

    DesignTokens.apply!("fonts" => [{ "variable" => "primary", "family" => "Inter" }])
    assert_equal "f1", SiteState.first.site.dig("settings", "fonts", "tokens", 0, "familyId")
  end

  def test_rejects_css_injection_in_a_color_value
    site!("settings" => {})
    assert_raises(ArgumentError) do
      DesignTokens.apply!("colors" => [{ "slug" => "primary", "value" => "red; } </style>" }])
    end
  end
end
