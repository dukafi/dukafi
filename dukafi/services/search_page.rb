class SearchPage
  SLUG = "search"

  def self.find
    Page.first(slug: SLUG, kind: "page")
  end

  def self.ensure!
    find || Page.create(
      slug: SLUG, title: "Search", kind: "page", status: "draft", document: document
    )
  end

  def self.document
    {
      "id" => "search", "slug" => SLUG, "title" => "Search",
      "seoTitle" => "Search",
      "seoDescription" => "Search the catalogue.",
      "rootNodeId" => "search-body",
      "nodes" => {
        "search-body" => node("search-body", "base.body", ["search-main"]),
        "search-main" => node("search-main", "base.container", %w[search-title search-form search-results]),
        "search-title" => node("search-title", "base.text", [], { "tag" => "h1", "text" => "Search" }).merge(
          "dynamicBindings" => {
            "text" => { "source" => "route", "field" => "query.keyword", "format" => "plain", "fallback" => "static" },
          }
        ),
        "search-form" => node(
          "search-form", "base.form", %w[search-label search-input search-submit],
          { "mode" => "custom", "formId" => "search", "action" => "/search", "method" => "get" }
        ),
        "search-label" => node("search-label", "base.label", [], {
          "text" => "Search products", "targetMode" => "explicit", "targetId" => "keyword",
        }),
        "search-input" => node("search-input", "base.input", [], {
          "inputType" => "search", "fieldId" => "keyword", "name" => "keyword",
          "id" => "keyword", "placeholder" => "Search products",
        }).merge(
          "dynamicBindings" => {
            "value" => { "source" => "route", "field" => "query.keyword", "format" => "plain", "fallback" => "empty" },
          }
        ),
        "search-submit" => node("search-submit", "base.submit", [], { "label" => "Search" }),
        "search-results" => node(
          "search-results", "store.relationship-loop", ["product-row"],
          { "source" => "current-query", "relationship" => "currentQuery", "perPage" => 12 }
        ),
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
    }
  end

  def self.node(id, module_id, children = [], props = {})
    {
      "id" => id, "moduleId" => module_id, "props" => props,
      "breakpointOverrides" => {}, "children" => children, "classIds" => [],
    }
  end
end
