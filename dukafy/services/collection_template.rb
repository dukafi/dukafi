class CollectionTemplate
  SLUG = "_collection-template"

  def self.find
    Page.where(kind: "template").order(:id).all.find do |page|
      page.document_data.dig("template", "target", "tableSlugs")&.include?("collections")
    end
  end

  def self.ensure!
    find || Page.create(
      slug: SLUG, title: "Collection template", kind: "template", status: "draft", document: document
    )
  end

  def self.document
    loop_node = node("collection-products", "store.collection-loop", ["collection-card"], { "collectionSlug" => "", "perPage" => 12 }).merge(
      "dynamicBindings" => { "collectionSlug" => { "source" => "currentEntry", "field" => "slug", "format" => "plain", "fallback" => "static" } }
    )
    title_node = node("collection-title", "base.text", [], { "tag" => "h1", "text" => "Collection title" }).merge(
      "dynamicBindings" => { "text" => { "source" => "currentEntry", "field" => "title", "format" => "plain", "fallback" => "static" } }
    )
    {
      "id" => "collection-template", "slug" => SLUG, "title" => "Collection template",
      "rootNodeId" => "collection-body",
      "nodes" => {
        "collection-body" => node("collection-body", "base.body", ["collection-main"]),
        "collection-main" => node("collection-main", "base.container", %w[collection-title collection-products]),
        "collection-title" => title_node,
        "collection-products" => loop_node,
        "collection-card" => node("collection-card", "store.product-card"),
      },
      "template" => { "enabled" => true, "target" => { "kind" => "postTypes", "tableSlugs" => ["collections"] }, "priority" => 0 },
    }
  end

  def self.node(id, module_id, children = [], props = {})
    {
      "id" => id, "moduleId" => module_id, "props" => props,
      "breakpointOverrides" => {}, "children" => children, "classIds" => [],
    }
  end
end
