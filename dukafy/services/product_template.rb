class ProductTemplate
  SLUG = "_product-template"

  def self.find
    Page.where(kind: "template").order(:id).all.find do |page|
      page.document_data.dig("template", "target", "tableSlugs")&.include?("products")
    end
  end

  def self.ensure!
    find || Page.create(
      slug: SLUG, title: "Product template", kind: "template", status: "draft", document: document
    )
  end

  def self.document
    nodes = {
      "product-body" => node("product-body", "base.body", ["product-main"]),
      "product-main" => node("product-main", "base.container", %w[product-title product-gallery product-price product-variants product-stock product-buy]),
      "product-title" => node("product-title", "base.text", [], { "tag" => "h1", "text" => "Product title" }).merge(
        "dynamicBindings" => { "text" => { "source" => "currentEntry", "field" => "title", "format" => "plain", "fallback" => "static" } }
      ),
      "product-gallery" => node("product-gallery", "store.image-gallery"),
      "product-price" => node("product-price", "store.price"),
      "product-variants" => node("product-variants", "store.variant-picker"),
      "product-stock" => node("product-stock", "store.stock-badge"),
      "product-buy" => node("product-buy", "store.buy-button"),
    }
    {
      "id" => "product-template", "slug" => SLUG, "title" => "Product template",
      "rootNodeId" => "product-body", "nodes" => nodes,
      "template" => { "enabled" => true, "target" => { "kind" => "postTypes", "tableSlugs" => ["products"] }, "priority" => 0 },
    }
  end

  def self.node(id, module_id, children = [], props = {})
    {
      "id" => id, "moduleId" => module_id, "props" => props,
      "breakpointOverrides" => {}, "children" => children, "classIds" => [],
    }
  end
end
