class CollectionTemplate
  SLUG = "collection-template"

  def self.find
    Page.where(kind: "template").order(:id).all.find do |page|
      page.slug == SLUG || page.document_data.dig("template", "target", "tableSlugs")&.include?("collections")
    end
  end

  def self.ensure!
    find || Page.create(
      slug: SLUG, title: "Collection template", kind: "template", status: "draft", document: document
    )
  end

  def self.document
    loop_node = node("collection-products", "store.relationship-loop", ["product-row"], { "relationship" => "products", "sourceSlug" => "", "perPage" => 12 }).merge(
      "dynamicBindings" => { "sourceSlug" => { "source" => "currentEntry", "field" => "slug", "format" => "plain", "fallback" => "static" } }
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
        "product-row" => node("product-row", "base.link", %w[row-image row-title row-price]).merge(
          "dynamicBindings" => { "href" => { "source" => "currentEntry", "field" => "href", "format" => "url", "fallback" => "static" } }
        ),
        "row-image" => node("row-image", "base.image").merge(
          "dynamicBindings" => { "src" => { "source" => "currentEntry", "field" => "imageUrl", "format" => "media", "fallback" => "empty" } }
        ),
        "row-title" => node("row-title", "base.text", [], { "tag" => "h3", "text" => "Product title" }).merge(
          "dynamicBindings" => { "text" => { "source" => "currentEntry", "field" => "title", "format" => "plain", "fallback" => "static" } }
        ),
        "row-price" => node("row-price", "base.text", [], { "tag" => "span", "text" => "$0.00" }).merge(
          "dynamicBindings" => { "text" => { "source" => "currentEntry", "field" => "priceDisplay", "format" => "plain", "fallback" => "static" } }
        ),
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
