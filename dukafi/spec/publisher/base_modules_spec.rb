require_relative "../spec_helper"

class BaseModulesSpec < Minitest::Test
  def node(id, module_id, children: [], props: {})
    {
      "id" => id, "moduleId" => module_id, "children" => children,
      "props" => props, "breakpointOverrides" => {}, "classIds" => [],
    }
  end

  def test_six_base_modules_match_golden_output
    document = {
      "rootNodeId" => "root",
      "nodes" => {
        "root" => node("root", "base.body", children: ["container"]),
        "container" => node("container", "base.container", children: %w[text image button disabled link list], props: { "tag" => "section", "htmlAttributes" => { "aria-label" => "Hero" } }),
        "text" => node("text", "base.text", props: { "tag" => "h1", "text" => "Hello <store>\nToday" }),
        "image" => node("image", "base.image", props: { "src" => "/uploads/hero.jpg", "loading" => "eager", "fetchPriority" => "high" }),
        "button" => node("button", "base.button", props: { "label" => "Shop now", "href" => "/shop?x=1&y=2", "target" => "_blank" }),
        "disabled" => node("disabled", "base.button", props: { "label" => "Unavailable", "disabled" => true }),
        "link" => node("link", "base.link", children: ["strong"], props: { "href" => "/about" }),
        "strong" => node("strong", "base.text", props: { "tag" => "strong", "text" => "About us" }),
        "list" => node("list", "base.list", props: { "listType" => "ordered", "items" => "First & best\n\nSecond" }),
      },
    }
    prefetched = { "/uploads/hero.jpg" => { "altText" => "Summer & sun", "width" => 1200, "height" => 800 } }

    result = Dukafi::Publisher::RenderPage.call(document: document, registry: Dukafi::Publisher::REGISTRY, prefetched: prefetched)
    expected = File.read(File.expand_path("../golden/base_modules.html", __dir__)).chomp

    assert_equal expected, result.html
  end

  def test_unsafe_urls_attributes_and_custom_tags_are_neutralized
    document = {
      "rootNodeId" => "container",
      "nodes" => {
        "container" => node("container", "base.container", children: ["image"], props: { "tag" => "custom", "customTag" => "script", "htmlAttributes" => { "onclick" => "alert(1)", "title" => "Safe" } }),
        "image" => node("image", "base.image", props: { "src" => "\u0001javascript:alert(1)" }),
      },
    }

    result = Dukafi::Publisher::RenderPage.call(document: document, registry: Dukafi::Publisher::REGISTRY)

    assert_equal '<div title="Safe"></div>', result.html
  end

  def test_image_emits_responsive_variants_with_original_fallback
    definition = Dukafi::Publisher::REGISTRY.fetch("base.image")
    output = definition.render(
      { "src" => "/uploads/hero.jpg", "loading" => "lazy", "fetchPriority" => "auto", "decoding" => "async", "htmlAttributes" => {} },
      [], prefetched: { "/uploads/hero.jpg" => {
        "width" => 1_200, "height" => 800,
        "variants" => [
          { "path" => "/uploads/hero-w320.webp", "width" => 320 },
          { "path" => "/uploads/hero-w640.webp", "width" => 640 },
        ],
      } }
    )

    assert_includes output.fetch(:html), 'src="/uploads/hero.jpg"'
    assert_includes output.fetch(:html), 'srcset="/uploads/hero-w320.webp 320w, /uploads/hero-w640.webp 640w"'
    assert_includes output.fetch(:html), 'sizes="auto, 100vw"'
    assert_includes output.fetch(:html), 'width="1200" height="800"'
  end
end
