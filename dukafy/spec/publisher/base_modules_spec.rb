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

    result = Dukafy::Publisher::RenderPage.call(document: document, registry: Dukafy::Publisher::REGISTRY, prefetched: prefetched)
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

    result = Dukafy::Publisher::RenderPage.call(document: document, registry: Dukafy::Publisher::REGISTRY)

    assert_equal '<div title="Safe"></div>', result.html
  end
end
