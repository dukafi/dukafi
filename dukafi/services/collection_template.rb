require "json"

class CollectionTemplate
  SLUG = "collection-template"

  def self.find
    Page.where(kind: "template").order(:id).all.find do |page|
      page.slug == SLUG || page.document_data.dig("template", "target", "tableSlugs")&.include?("collections")
    end
  end

  def self.ensure!
    page = find
    page ? patch_cover!(page) : Page.create(
      slug: SLUG, title: "Collection template", kind: "template", status: "draft", document: document
    )
  end

  def self.patch_cover!(page)
    page.update(document: with_cover(page.document_data))
    if page.published_document
      page.update(published_document: JSON.generate(with_cover(page.published_document_data)))
    end
    page
  end

  def self.with_cover(doc)
    nodes = doc.is_a?(Hash) ? doc["nodes"] : nil
    return doc unless nodes.is_a?(Hash)
    return doc if nodes["collection-cover"]

    main = nodes["collection-main"]
    return doc unless main.is_a?(Hash)

    nodes["collection-cover"] = node("collection-cover", "base.image").merge(
      "dynamicBindings" => { "src" => { "source" => "currentEntry", "field" => "imageUrl", "format" => "media", "fallback" => "empty" } }
    )
    children = Array(main["children"])
    main["children"] = ["collection-cover"] + children.reject { |id| id == "collection-cover" }
    doc
  end

  def self.document
    loop_node = node("collection-products", "store.relationship-loop", ["product-row"], { "relationship" => "products", "sourceSlug" => "", "perPage" => 12 }).merge(
      "dynamicBindings" => { "sourceSlug" => { "source" => "currentEntry", "field" => "slug", "format" => "plain", "fallback" => "static" } }
    )
    title_node = node("collection-title", "base.text", [], { "tag" => "h1", "text" => "Collection title" }).merge(
      "dynamicBindings" => { "text" => { "source" => "currentEntry", "field" => "title", "format" => "plain", "fallback" => "static" } }
    )
    cover_node = node("collection-cover", "base.image").merge(
      "dynamicBindings" => { "src" => { "source" => "currentEntry", "field" => "imageUrl", "format" => "media", "fallback" => "empty" } }
    )
    {
      "id" => "collection-template", "slug" => SLUG, "title" => "Collection template",
      "rootNodeId" => "collection-body",
      "nodes" => {
        "collection-body" => node("collection-body", "base.body", ["collection-main"]),
        "collection-main" => node("collection-main", "base.container", %w[collection-cover collection-title collection-products]),
        "collection-cover" => cover_node,
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
        "row-price" => node("row-price", "base.text", [], { "tag" => "span", "text" => "KES 0.00" }).merge(
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
