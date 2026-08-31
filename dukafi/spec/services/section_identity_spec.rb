require_relative "../spec_helper"

class SectionIdentitySpec < Minitest::Test
  def document
    {
      "rootNodeId" => "root",
      "nodes" => {
        "root" => { "id" => "root", "moduleId" => "base.body", "children" => %w[hero about],
                    "props" => {}, "classIds" => [] },
        "hero" => { "id" => "hero", "moduleId" => "base.container", "children" => ["inner"],
                    "props" => { "htmlAttributes" => { "id" => "index__hero", "data-section-id" => "index__hero" } },
                    "classIds" => [] },
        "about" => { "id" => "about", "moduleId" => "base.container", "children" => [],
                     "props" => { "htmlAttributes" => { "id" => "index__about" } },
                     "classIds" => [] },
        "inner" => { "id" => "inner", "moduleId" => "base.text", "children" => [],
                     "props" => { "text" => "nested", "htmlAttributes" => { "id" => "pagination" } },
                     "classIds" => [] },
      },
    }
  end

  def test_prefers_data_section_id_over_html_id
    node = { "props" => { "htmlAttributes" => { "id" => "featured", "data-section-id" => "index__products" } } }
    assert_equal "index__products", SectionIdentity.of(node)
  end

  def test_falls_back_to_html_id
    assert_equal "index__about", SectionIdentity.of(document.dig("nodes", "about"))
  end

  def test_finds_a_node_by_stable_id_in_document_order
    node = SectionIdentity.find_node(document, "index__hero")
    assert_equal "hero", node.fetch("id")
  end

  def test_resolve_prefers_section_id_over_node_id
    id = SectionIdentity.resolve_node_id!(document, node_id: "about", section_id: "index__hero")
    assert_equal "hero", id
  end

  def test_unknown_section_id_is_an_argument_error
    error = assert_raises(ArgumentError) do
      SectionIdentity.resolve_node_id!(document, section_id: "missing")
    end
    assert_match(/list_children/, error.message)
  end
end
