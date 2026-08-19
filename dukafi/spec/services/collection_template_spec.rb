require_relative "../spec_helper"

class CollectionTemplateSpec < Minitest::Test
  def setup
    Page.dataset.delete
  end

  def test_ensure_adds_the_cover_node_to_a_published_template_that_lacks_it
    page = Page.create(
      slug: CollectionTemplate::SLUG,
      title: "Collection template",
      kind: "template",
      status: "published",
      document: CollectionTemplate.document,
      published_document: JSON.generate(without_cover(CollectionTemplate.document))
    )

    CollectionTemplate.ensure!
    page.refresh

    assert page.document_data.dig("nodes", "collection-cover")
    cover = page.published_document_data.dig("nodes", "collection-cover")
    assert cover, "rebakes read published_document, so the cover has to land there too"
    assert_equal "base.image", cover.fetch("moduleId")
    assert_equal "imageUrl", cover.dig("dynamicBindings", "src", "field")
    assert_equal "collection-cover", page.published_document_data.dig("nodes", "collection-main", "children").first
  end

  private

  def without_cover(doc)
    nodes = doc.fetch("nodes")
    nodes.delete("collection-cover")
    main = nodes.fetch("collection-main")
    main["children"] = Array(main["children"]).reject { |id| id == "collection-cover" }
    doc
  end
end
