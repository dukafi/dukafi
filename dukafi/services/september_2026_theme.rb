# Quiet editorial starter — September 2026.
#
# White canvas, one ink, a shop loop, a journal CMS table. No brand story,
# no invented audience. Sample goods exist so the loops have something to
# render; replace them.
class September2026Theme
  ID = "september-2026"

  def self.payload
    new.payload
  end

  def payload
    pages = [home_page, shop_page, journal_page, about_page, search_page]
    templates = [product_template, collection_template]
    partials = [header_partial, footer_partial]
    packed = resolve_classes(
      "theme" => metadata,
      "media" => [],
      "shell" => shell,
      "pages" => pages,
      "templates" => templates,
      "partials" => partials,
      "tables" => [journal_table],
      "catalogue" => catalogue,
      "reviews" => [],
    )
    packed["theme"] = packed["theme"].merge("contents" => contents_of(packed))
    packed
  end

  def metadata
    JSON.parse(File.read(File.expand_path("../themes/september-2026.json", __dir__)))
  end

  private

  def shell
    {
      "settings" => { "language" => "en" },
      "styleRules" => {},
      "breakpoints" => StarterSite::BREAKPOINTS,
    }
  end

  def catalogue
    {
      "products" => [
        product("notebook", "Notebook", 2_500),
        product("tote", "Tote", 4_500),
        product("candle", "Candle", 1_800),
      ],
      "collections" => [{
        "slug" => "featured",
        "title" => "Featured",
        "description" => "",
        "sortOrder" => 0,
        "productSlugs" => %w[notebook tote candle],
      }],
    }
  end

  def product(slug, title, cents)
    {
      "slug" => slug,
      "title" => title,
      "status" => "active",
      "descriptionHtml" => "",
      "fields" => {},
      "images" => [],
      "variants" => [{
        "sku" => "#{slug.upcase}-1",
        "title" => "Default",
        "priceCents" => cents,
        "stock" => 12,
        "position" => 0,
        "fields" => {},
      }],
    }
  end

  def journal_table
    {
      "slug" => "journal",
      "name" => "Journal",
      "columns" => [
        { "id" => "title", "label" => "Title", "type" => "text" },
        { "id" => "excerpt", "label" => "Excerpt", "type" => "longText" },
        { "id" => "body", "label" => "Body", "type" => "longText" },
      ],
      "rows" => [{
        "slug" => "hello",
        "position" => 0,
        "cells" => {
          "title" => "A note from the shop",
          "excerpt" => "Replace this row in Dashboard → Tables with your own writing.",
          "body" => "This is a sample journal entry so the loop on /journal has something to show.",
        },
      }],
    }
  end

  def home_page
    page("index", "Home", "home-body", {
      "home-body" => node("home-body", "base.body", %w[home-hero home-featured]),
      "home-hero" => section("home-hero", "index__hero", %w[home-hero-inner],
                             %w[w-full bg-white px-6 py-16 md:py-24]),
      "home-hero-inner" => node("home-hero-inner", "base.container", %w[home-kicker home-title home-copy home-cta], {},
                                { "classIds" => %w[mx-auto max-w-3xl] }),
      "home-kicker" => text("home-kicker", "p", "September 2026",
                            %w[text-sm tracking-wide text-neutral-500]),
      "home-title" => text("home-title", "h1", "Goods for everyday use",
                           %w[mt-3 text-4xl font-semibold tracking-tight text-neutral-900 md:text-5xl]),
      "home-copy" => text("home-copy", "p", "Clear prices. Local checkout.",
                          %w[mt-4 text-base leading-relaxed text-neutral-600]),
      "home-cta" => link("home-cta", "Shop the range", "/shop",
                         %w[mt-8 inline-block bg-black px-5 py-2.5 text-white]),
      "home-featured" => section("home-featured", "index__featured", %w[home-featured-inner],
                                 %w[w-full px-6 py-16 md:py-24]),
      "home-featured-inner" => node("home-featured-inner", "base.container", %w[home-featured-heading home-featured-loop], {},
                                    { "classIds" => %w[mx-auto max-w-6xl] }),
      "home-featured-heading" => text("home-featured-heading", "h2", "Featured",
                                      %w[text-xl font-semibold text-neutral-900]),
    }.merge(product_loop("home-featured-loop", "feat", "collections/featured.products", 4)))
  end

  def shop_page
    page("shop", "Shop", "shop-body", {
      "shop-body" => node("shop-body", "base.body", %w[shop-main]),
      "shop-main" => section("shop-main", "shop__grid", %w[shop-inner],
                             %w[w-full px-6 py-16 md:py-24]),
      "shop-inner" => node("shop-inner", "base.container", %w[shop-title shop-loop], {},
                           { "classIds" => %w[mx-auto max-w-6xl] }),
      "shop-title" => text("shop-title", "h1", "Shop",
                           %w[text-3xl font-semibold tracking-tight text-neutral-900]),
    }.merge(product_loop("shop-loop", "grid", "products", 8)))
  end

  def journal_page
    page("journal", "Journal", "journal-body", {
      "journal-body" => node("journal-body", "base.body", %w[journal-main]),
      "journal-main" => section("journal-main", "journal__list", %w[journal-inner],
                                %w[w-full bg-white px-6 py-16 md:py-24]),
      "journal-inner" => node("journal-inner", "base.container",
                              %w[journal-title journal-copy journal-loop], {},
                              { "classIds" => %w[mx-auto max-w-3xl] }),
      "journal-title" => text("journal-title", "h1", "Journal",
                              %w[text-3xl font-semibold tracking-tight text-neutral-900]),
      "journal-copy" => text("journal-copy", "p",
                             "Notes from the shop. Add and edit rows in Dashboard → Tables.",
                             %w[mt-4 text-base leading-relaxed text-neutral-600]),
      "journal-loop" => node("journal-loop", "store.relationship-loop", %w[journal-card],
                             { "source" => "data/journal", "perPage" => 12 },
                             { "classIds" => %w[mt-10 grid gap-6] }),
      "journal-card" => node("journal-card", "base.container", %w[journal-card-title journal-card-excerpt],
                             { "tag" => "article" },
                             { "classIds" => %w[border border-neutral-200 p-6] }),
      "journal-card-title" => bind_text("journal-card-title", "h2", "Title", "title",
                                        %w[text-xl font-semibold text-neutral-900]),
      "journal-card-excerpt" => bind_text("journal-card-excerpt", "p", "Excerpt", "excerpt",
                                          %w[mt-2 text-base leading-relaxed text-neutral-600]),
    })
  end

  def about_page
    page("about", "About", "about-body", {
      "about-body" => node("about-body", "base.body", %w[about-main]),
      "about-main" => section("about-main", "about__copy", %w[about-inner],
                              %w[w-full bg-white px-6 py-16 md:py-24]),
      "about-inner" => node("about-inner", "base.container", %w[about-title about-copy], {},
                            { "classIds" => %w[mx-auto max-w-3xl] }),
      "about-title" => text("about-title", "h1", "About",
                            %w[text-3xl font-semibold tracking-tight text-neutral-900]),
      "about-copy" => text("about-copy", "p",
                           "Say what you sell, in your own words. This page is a placeholder.",
                           %w[mt-4 text-base leading-relaxed text-neutral-600]),
    })
  end

  def search_page
    document = SearchPage.document
    {
      "slug" => SearchPage::SLUG, "title" => "Search", "kind" => "page",
      "status" => "draft", "access" => "public", "document" => document,
    }
  end

  def product_template
    {
      "slug" => ProductTemplate::SLUG, "title" => "Product template", "kind" => "template",
      "status" => "draft", "access" => "public", "document" => ProductTemplate.document,
    }
  end

  def collection_template
    {
      "slug" => CollectionTemplate::SLUG, "title" => "Collection template", "kind" => "template",
      "status" => "draft", "access" => "public", "document" => CollectionTemplate.document,
    }
  end

  def header_partial
    {
      "slug" => SitePartials::HEADER_SLUG, "title" => "Site header", "kind" => "partial",
      "status" => "draft", "access" => "public", "document" => {
        "id" => "site-header", "slug" => SitePartials::HEADER_SLUG, "title" => "Site header",
        "rootNodeId" => "hdr-body",
        "nodes" => {
          "hdr-body" => node("hdr-body", "base.body", %w[hdr-bar]),
          "hdr-bar" => node("hdr-bar", "base.container", %w[hdr-inner], {},
                            { "classIds" => %w[sticky top-0 z-40 w-full border-b border-neutral-200 bg-white] }),
          "hdr-inner" => node("hdr-inner", "base.container",
                              %w[hdr-brand hdr-nav hdr-cart], {},
                              { "classIds" => %w[mx-auto flex w-full max-w-6xl items-center gap-8 px-6 py-4] }),
          "hdr-brand" => link("hdr-brand", "Store", "/",
                              %w[text-lg font-semibold tracking-tight text-neutral-900]),
          "hdr-nav" => node("hdr-nav", "base.container", %w[hdr-shop hdr-journal hdr-about], {},
                            { "classIds" => %w[hidden items-center gap-6 text-sm text-neutral-600 sm:flex] }),
          "hdr-shop" => link("hdr-shop", "Shop", "/shop", %w[hover:text-neutral-900]),
          "hdr-journal" => link("hdr-journal", "Journal", "/journal", %w[hover:text-neutral-900]),
          "hdr-about" => link("hdr-about", "About", "/about", %w[hover:text-neutral-900]),
          "hdr-cart" => node("hdr-cart", "base.container", %w[hdr-cart-link], {},
                             { "classIds" => %w[ml-auto flex items-center],
                               "actions" => { "region" => "cart" } }),
          "hdr-cart-link" => link("hdr-cart-link", "Cart ({cart.count})", "/checkout",
                                  %w[border border-neutral-300 px-4 py-1.5 text-sm text-neutral-800]),
        },
      },
    }
  end

  def footer_partial
    {
      "slug" => SitePartials::FOOTER_SLUG, "title" => "Site footer", "kind" => "partial",
      "status" => "draft", "access" => "public", "document" => {
        "id" => "site-footer", "slug" => SitePartials::FOOTER_SLUG, "title" => "Site footer",
        "rootNodeId" => "ftr-body",
        "nodes" => {
          "ftr-body" => node("ftr-body", "base.body", %w[ftr-bar]),
          "ftr-bar" => node("ftr-bar", "base.container", %w[ftr-inner], {},
                            { "classIds" => %w[mt-24 w-full border-t border-neutral-200] }),
          "ftr-inner" => node("ftr-inner", "base.container", %w[ftr-links], {},
                              { "classIds" => %w[mx-auto flex w-full max-w-6xl gap-6 px-6 py-12 text-sm text-neutral-600] }),
          "ftr-links" => node("ftr-links", "base.container", %w[ftr-shop ftr-journal ftr-about], {},
                              { "classIds" => %w[flex flex-wrap gap-6] }),
          "ftr-shop" => link("ftr-shop", "Shop", "/shop", %w[hover:text-neutral-900]),
          "ftr-journal" => link("ftr-journal", "Journal", "/journal", %w[hover:text-neutral-900]),
          "ftr-about" => link("ftr-about", "About", "/about", %w[hover:text-neutral-900]),
        },
      },
    }
  end

  def product_loop(loop_id, prefix, source, per_page)
    card = "#{prefix}-card"
    image = "#{prefix}-image"
    title = "#{prefix}-title"
    price = "#{prefix}-price"
    pager = "#{prefix}-pager"
    prev = "#{prefix}-prev"
    nxt = "#{prefix}-next"
    {
      loop_id => node(loop_id, "store.relationship-loop", [card, pager],
                      { "source" => source, "perPage" => per_page },
                      { "classIds" => %w[mt-6 grid grid-cols-2 gap-6 md:grid-cols-4] }),
      card => node(card, "base.link", [image, title, price], {},
                   { "classIds" => %w[border border-neutral-200 p-4] }).merge(
                     "dynamicBindings" => {
                       "href" => { "source" => "currentEntry", "field" => "href", "format" => "url", "fallback" => "static" },
                     }
                   ),
      image => bind_media(image, "imageUrl", %w[w-full]),
      title => bind_text(title, "h3", "Product title", "title", %w[mt-2 font-medium text-neutral-900]),
      price => bind_text(price, "p", "KES 0.00", "priceDisplay", %w[text-sm text-neutral-600]),
      pager => node(pager, "base.container", [prev, nxt], { "tag" => "nav" },
                    { "classIds" => %w[col-span-full mt-8 flex items-center justify-center gap-4],
                      "actions" => { "pagination" => "" } }),
      prev => node(prev, "base.link", [], { "text" => "Previous", "href" => "#" },
                   { "classIds" => %w[border border-neutral-300 px-4 py-2],
                     "actions" => { "click" => { "type" => "loop.previous" } },
                     "visibleWhen" => { "source" => "loop", "field" => "hasPrevious", "operator" => "isTrue" } }),
      nxt => node(nxt, "base.link", [], { "text" => "Next", "href" => "#" },
                  { "classIds" => %w[border border-neutral-300 px-4 py-2],
                    "actions" => { "click" => { "type" => "loop.next" } },
                    "visibleWhen" => { "source" => "loop", "field" => "hasNext", "operator" => "isTrue" } }),
    }
  end

  def page(slug, title, root, nodes)
    {
      "slug" => slug, "title" => title, "kind" => "page", "status" => "draft", "access" => "public",
      "document" => { "id" => slug, "slug" => slug, "title" => title, "rootNodeId" => root, "nodes" => nodes },
    }
  end

  def section(id, section_id, children, classes)
    node(id, "base.container", children,
         { "tag" => "section", "htmlAttributes" => { "id" => section_id, "data-section-id" => section_id } },
         { "classIds" => classes })
  end

  def node(id, module_id, children = [], props = {}, extra = {})
    { "id" => id, "moduleId" => module_id, "props" => props,
      "breakpointOverrides" => {}, "children" => children, "classIds" => [] }.merge(extra)
  end

  def text(id, tag, value, classes = [])
    node(id, "base.text", [], { "tag" => tag, "text" => value }, { "classIds" => classes })
  end

  def link(id, label, href, classes = [])
    node(id, "base.link", [], { "text" => label, "href" => href }, { "classIds" => classes })
  end

  def bind_text(id, tag, fallback, field, classes)
    text(id, tag, fallback, classes).merge(
      "dynamicBindings" => {
        "text" => { "source" => "currentEntry", "field" => field, "format" => "plain", "fallback" => "static" },
      }
    )
  end

  def bind_media(id, field, classes)
    node(id, "base.image", [], {}, { "classIds" => classes }).merge(
      "dynamicBindings" => {
        "src" => { "source" => "currentEntry", "field" => field, "format" => "media", "fallback" => "empty" },
      }
    )
  end

  def resolve_classes(payload)
    docs = Array(payload["pages"]) + Array(payload["templates"]) + Array(payload["partials"])
    names = docs.flat_map { |row| class_names(row["document"]) }.uniq
    rules = {}
    names.each do |name|
      id = SiteStyleRules.id_for(name)
      rules[id] = {
        "id" => id, "name" => name, "kind" => "class", "selector" => ".#{name}",
        "order" => rules.length, "styles" => {}, "contextStyles" => {},
        "createdAt" => 0, "updatedAt" => 0,
      }
    end
    mapping = names.to_h { |name| [name, SiteStyleRules.id_for(name)] }
    %w[pages templates partials].each do |key|
      payload[key] = Array(payload[key]).map do |row|
        row.merge("document" => rewrite_class_ids(row["document"], mapping))
      end
    end
    payload["shell"]["styleRules"] = rules
    payload
  end

  def class_names(document)
    nodes = document.is_a?(Hash) ? document["nodes"] : nil
    return [] unless nodes.is_a?(Hash)

    nodes.each_value.flat_map { |node| Array(node.is_a?(Hash) ? node["classIds"] : []) }.map(&:to_s)
  end

  def rewrite_class_ids(document, mapping)
    nodes = document["nodes"]
    return document unless nodes.is_a?(Hash)

    rewritten = nodes.transform_values do |node|
      next node unless node.is_a?(Hash)

      ids = Array(node["classIds"]).filter_map { |name| mapping[name.to_s] }
      node.merge("classIds" => ids)
    end
    document.merge("nodes" => rewritten)
  end

  def contents_of(payload)
    {
      "pages" => Array(payload["pages"]).length,
      "templates" => Array(payload["templates"]).length,
      "partials" => Array(payload["partials"]).length,
      "tables" => Array(payload["tables"]).length,
      "forms" => 0,
      "products" => Array(payload.dig("catalogue", "products")).length,
      "collections" => Array(payload.dig("catalogue", "collections")).length,
      "reviews" => Array(payload["reviews"]).length,
      "media" => Array(payload["media"]).length,
    }
  end
end
