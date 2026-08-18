class ProductTemplate
  SLUG = "product-template"

  def self.find
    Page.where(kind: "template").order(:id).all.find do |page|
      page.slug == SLUG || page.document_data.dig("template", "target", "tableSlugs")&.include?("products")
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
      "product-main" => node("product-main", "base.container", %w[product-title product-image product-price product-variants product-stock product-buy]),
      "product-title" => node("product-title", "base.text", [], { "tag" => "h1", "text" => "Product title" }).merge(
        "dynamicBindings" => { "text" => { "source" => "currentEntry", "field" => "title", "format" => "plain", "fallback" => "static" } }
      ),
      "product-image" => node("product-image", "base.image").merge(
        "dynamicBindings" => { "src" => { "source" => "currentEntry", "field" => "imageUrl", "format" => "media", "fallback" => "empty" } }
      ),
      "product-price" => node("product-price", "base.text", [], { "tag" => "span", "text" => "KES 0.00" }).merge(
        "dynamicBindings" => { "text" => { "source" => "currentEntry", "field" => "priceDisplay", "format" => "plain", "fallback" => "static" } }
      ),
      "product-variants" => node("product-variants", "store.variant-picker"),
      "product-stock" => node("product-stock", "store.stock-badge", [], { "lowStockThreshold" => CommerceSettings.current.low_stock_threshold }),
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
