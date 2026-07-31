require_relative "../spec_helper"

class RenderPageSpec < Minitest::Test
  def registry
    Dukafy::Publisher::Registry.new.tap do |registry|
      registry.register("base.body") do |_props, children, _context|
        { html: children.join }
      end
      registry.register(
        "base.box",
        schema: {
          "label" => { type: :text },
          "gap" => { type: :text, breakpoint_overridable: true },
        },
        defaults: { "label" => "Box", "gap" => "0" },
      ) do |props, children, _context|
        { html: %(<section data-label="#{props.fetch('label')}" data-gap="#{props.fetch('gap')}">#{children.join}</section>), css: ".box{}" }
      end
      registry.register("base.text", schema: { "text" => { type: :text } }) do |props, _children, _context|
        { html: "<p>#{props.fetch('text')}</p>", css: ".text{}" }
      end
    end
  end

  def node(id, module_id, children: [], props: {}, overrides: {})
    {
      "id" => id, "moduleId" => module_id, "children" => children,
      "props" => props, "breakpointOverrides" => overrides, "classIds" => [],
    }
  end

  def test_walks_bottom_up_escapes_props_and_deduplicates_css
    document = {
      "rootNodeId" => "root",
      "nodes" => {
        "root" => node("root", "base.body", children: %w[box other]),
        "box" => node("box", "base.box", children: ["text"], props: { "label" => %(<unsafe ") }),
        "text" => node("text", "base.text", props: { "text" => "Hello <script>" }),
        "other" => node("other", "base.text", props: { "text" => "Again" }),
      },
    }

    result = Dukafy::Publisher::RenderPage.call(document: document, registry: registry)

    assert_equal '<section data-label="&lt;unsafe &quot;" data-gap="0"><p>Hello &lt;script&gt;</p></section><p>Again</p>', result.html
    assert_equal ".text{}\n.box{}", result.css
  end

  def test_only_approved_breakpoint_props_override_base_content
    document = {
      "rootNodeId" => "box",
      "nodes" => {
        "box" => node(
          "box", "base.box", props: { "label" => "Base", "gap" => "1" },
          overrides: { "mobile" => { "label" => "Wrong", "gap" => "8" } },
        ),
      },
    }

    result = Dukafy::Publisher::RenderPage.call(
      document: document, registry: registry, breakpoint_id: "mobile"
    )

    assert_includes result.html, 'data-label="Base"'
    assert_includes result.html, 'data-gap="8"'
  end

  def test_rejects_missing_nodes_and_cycles
    missing = { "rootNodeId" => "root", "nodes" => { "root" => node("root", "base.body", children: ["gone"]) } }
    assert_raises(ArgumentError) do
      Dukafy::Publisher::RenderPage.call(document: missing, registry: registry)
    end

    cyclic = { "rootNodeId" => "root", "nodes" => { "root" => node("root", "base.body", children: ["root"]) } }
    assert_raises(ArgumentError) do
      Dukafy::Publisher::RenderPage.call(document: cyclic, registry: registry)
    end
  end
end
