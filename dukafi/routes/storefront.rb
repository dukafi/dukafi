class Storefront < Roda
  # Same cookie as the fragments app, so a customer who signed in through
  # `/fragments/account/login` is recognised here. Without this the storefront
  # cannot tell a signed-in shopper from anyone else, and page gating would
  # have nothing to check.
  plugin :sessions, secret: SessionSecret.fetch

  TRACKING_PARAMS = %w[gclid fbclid msclkid].freeze
  SAFE_ASSET = /\Asite-[0-9a-f]{12}\.css\z/
  SAFE_SLUG = /\A[a-zA-Z0-9][a-zA-Z0-9_\/-]*\z/
  PUBLIC_FILE = SitemapWriter::PUBLIC_FILE

  def published_root
    Paths.published_root
  end

  def canonical_query_empty?(params)
    params.keys.all? { |key| key.start_with?("utm_") || TRACKING_PARAMS.include?(key) }
  end

  def request_slug(path)
    value = path.to_s.sub(%r{\A/+}, "").sub(%r{/+\z}, "")
    value = "index" if value.empty?
    return nil unless value.match?(SAFE_SLUG)
    return nil if value.split("/").include?("..")
    # Gated pages bake under `private/`. Without this line the gate is
    # decorative: `GET /private/checkout` would find the file on disk and
    # serve it before any session check ran.
    return nil if value == Page::PRIVATE_PREFIX || value.start_with?("#{Page::PRIVATE_PREFIX}/")

    value
  end

  def current_customer
    id = session["customer_id"]
    id && Customer[id]
  end

  def disk_page(slug)
    relative = slug == "index" ? "index.html" : "#{slug}.html"
    path = File.join(published_root, "current", relative)
    File.file?(path) ? File.binread(path) : nil
  end

  def disk_public_file(name)
    path = File.join(published_root, "current", name)
    File.file?(path) ? File.binread(path) : nil
  end

  # Where a signed-out visitor goes when they ask for a gated page. Nil when
  # the merchant has marked no sign-in page — see `gate!`.
  def sign_in_path
    page = Page.sign_in_page
    page && (page.slug == "index" ? "/" : "/#{page.slug}")
  end

  # The one decision that makes `access` mean anything. Called before ANY
  # content for a gated page is produced — disk or live — and it either
  # returns (the visitor is allowed) or halts.
  #
  # A missing sign-in page is a 404, not a redirect to `/`: sending someone to
  # a page that cannot sign them in would loop them back here forever, and
  # silently serving the gated page instead would defeat the whole feature.
  def gate!(page)
    return unless page&.gated?
    return if current_customer

    destination = sign_in_path
    request.halt([404, { "content-type" => "text/html; charset=utf-8" },
                  ["<!doctype html><html><body><h1>Page not found</h1></body></html>"]]) unless destination

    # `next` carries where they were going, so the merchant's sign-in page can
    # send them onward. A local path only — an absolute URL here would make
    # the sign-in page an open redirect.
    target = "#{destination}?next=#{CGI.escape(request.path)}"
    request.halt([302, { "location" => target, "cache-control" => "no-store" }, []])
  end

  def slug_redirect(slug)
    match = slug.match(%r{\A(products|collections)/([a-z0-9]+(?:-[a-z0-9]+)*)\z})
    return unless match

    resource_type = match[1] == "products" ? "product" : "collection"
    redirect = SlugRedirect.first(resource_type:, old_slug: match[2])
    "/#{match[1]}/#{redirect.destination_slug}" if redirect
  end

  def live_page(page, query_params = {})
    state = SiteState.first
    return nil unless state

    document = with_partials(page.published_document_data || page.document_data)
    prefetched = CommercePrefetcher.call
    rendered = Dukafi::Publisher::RenderPage.call(
      document:, registry: Dukafi::Publisher::REGISTRY, site: state.site,
      prefetched:, query_params:, page_paths: PagePaths.call
    )
    tailwind_html = %(<body class="#{rendered.body_classes.join(' ')}">#{rendered.html}</body>)
    tailwind_css = TailwindCompiler.call(
      html: tailwind_html, classes: DeclaredClassNames.call([document], state&.site),
      site: state&.site
    )
    collector = Dukafi::Publisher::CssCollector.new
    collector.add("page-modules", rendered.css)
    css = collector.bundle(
      framework_css: Dukafi::Publisher::FrameworkCss.call(state.site), tailwind_css: tailwind_css,
      fonts_css: Dukafi::Publisher::FontsCss.call(state.site),
      style_rules_css: Dukafi::Publisher::StyleRulesCss.call(state.site)
    ).content
    keyword = page.slug == SearchPage::SLUG ? SearchQuery.keyword(query_params) : nil
    hits = keyword ? SearchQuery.filter(prefetched.fetch("products", {}).values, keyword) : []
    listing_page = Dukafi::Publisher::ListingJsonLd.current_page(
      document, query_params, prefetched:, current_entry: nil
    )
    meta = if keyword
      Dukafi::Publisher::PageMeta.for_search(
        document, state.site, keyword:, count: hits.length, items: hits, page: listing_page
      )
    else
      Dukafi::Publisher::PageMeta.for_page(document, state.site, fallback_title: page.title)
    end
    if page.slug == SearchPage::SLUG
      meta = meta.merge(Dukafi::Publisher::PageHead.search(keyword: keyword))
    end
    json_path = keyword ? "search?keyword=#{CGI.escape(keyword)}" : page.bake_path
    Dukafi::Publisher::HtmlDocument.call(
      title: meta.fetch(:title),
      description: meta[:description],
      robots: meta[:robots],
      canonical: meta[:canonical],
      language: state.site.dig("settings", "language") || "en",
      body: rendered.html,
      body_classes: rendered.body_classes,
      css: css, runtimes: rendered.runtimes,
      json_ld: Dukafi::Publisher::ListingJsonLd.call(
        document:, prefetched:, path: json_path, title: meta.fetch(:title),
        description: meta[:description], query_params:, site: state.site
      ),
      open_graph: Dukafi::Publisher::OpenGraph.for_page(
        document, state.site, path: page.slug, title: meta.fetch(:title),
        description: meta[:description]
      ),
    )
  end

  # A `?keyword=` with no matching products is a 404 (Google faceted-nav).
  # The search page still renders so a shopper sees the empty results, not
  # a generic missing-page.
  def apply_search_status!(slug, params)
    return unless slug == SearchPage::SLUG
    keyword = SearchQuery.keyword(params)
    return unless keyword

    hits = SearchQuery.filter(CommercePrefetcher.call.fetch("products", {}).values, keyword)
    response.status = 404 if hits.empty?
  end

  # An order page: the order template rendered with ONE order as
  # `currentEntry`. Returns nil when there is no template, no such order, or
  # the order is not this customer's — all three are a 404, because
  # distinguishing them would confirm which tokens exist.
  #
  # Signed out, this redirects to sign-in rather than 404ing, so a customer
  # following the link in a confirmation email lands somewhere useful.
  def live_order(token)
    template = OrderTemplate.find
    return nil unless template&.status == "published"

    customer = current_customer
    unless customer
      destination = sign_in_path
      return nil unless destination

      request.halt([302, { "location" => "#{destination}?next=#{CGI.escape(request.path)}",
                           "cache-control" => "no-store" }, []])
    end

    entry = OrderPayload.for_customer_token(customer, token)
    return nil unless entry

    # What a `payment.initiate` button on this page pays for. Parked in the
    # session rather than posted from the page, so the amount and the order
    # are decided by something the customer cannot edit — and it is only ever
    # set to an order this session was just proven to own.
    session["order_token"] = entry.fetch("reference")

    document = with_partials(template.published_document_data)
    return nil unless document

    state = SiteState.first
    return nil unless state

    render_live(document, state, current_entry: entry, title: "Order #{entry.fetch('number')}")
  end

  # Render a document live, with an entry in scope. The third caller of this
  # shape (page, collection, order), so it is a method rather than a third
  # copy of the same CSS-bundling sequence.
  def render_live(document, state, current_entry: nil, title: nil, query_params: {})
    rendered = Dukafi::Publisher::RenderPage.call(
      document:, registry: Dukafi::Publisher::REGISTRY, site: state.site,
      prefetched: CommercePrefetcher.call, current_entry:, query_params:,
      page_paths: PagePaths.call
    )
    tailwind_html = %(<body class="#{rendered.body_classes.join(' ')}">#{rendered.html}</body>)
    collector = Dukafi::Publisher::CssCollector.new
    collector.add("page-modules", rendered.css)
    css = collector.bundle(
      framework_css: Dukafi::Publisher::FrameworkCss.call(state.site),
      fonts_css: Dukafi::Publisher::FontsCss.call(state.site),
      style_rules_css: Dukafi::Publisher::StyleRulesCss.call(state.site),
      tailwind_css: TailwindCompiler.call(
        html: tailwind_html, classes: DeclaredClassNames.call([document], state&.site), site: state&.site
      )
    ).content
    meta = Dukafi::Publisher::PageMeta.for_entry(state.site, title: title)
    Dukafi::Publisher::HtmlDocument.call(
      title: meta.fetch(:title),
      description: meta[:description],
      language: state.site.dig("settings", "language") || "en",
      body: rendered.html, body_classes: rendered.body_classes,
      css: css, runtimes: rendered.runtimes
    )
  end

  # The header and footer, around whatever is being rendered live. Same
  # composition the bake does, so a live-rendered page and a baked one are the
  # same page.
  def with_partials(document)
    SitePartials.compose(
      document,
      header_document: SitePartials.document_for(SitePartials.header),
      footer_document: SitePartials.document_for(SitePartials.footer),
    )
  end

  def live_collection(slug, query_params)
    template = CollectionTemplate.find
    return unless template&.status == "published"
    document = with_partials(template.published_document_data)
    return unless document
    prefetched = CommercePrefetcher.call
    collection = prefetched.dig("collections", slug)
    return unless collection

    state = SiteState.first
    return unless state

    rendered = Dukafi::Publisher::RenderPage.call(
      document:, registry: Dukafi::Publisher::REGISTRY, site: state.site,
      prefetched:, current_entry: collection, query_params:, page_paths: PagePaths.call
    )
    tailwind_html = %(<body class="#{rendered.body_classes.join(' ')}">#{rendered.html}</body>)
    collector = Dukafi::Publisher::CssCollector.new
    collector.add("page-modules", rendered.css)
    css = collector.bundle(
      framework_css: Dukafi::Publisher::FrameworkCss.call(state.site),
      fonts_css: Dukafi::Publisher::FontsCss.call(state.site),
      style_rules_css: Dukafi::Publisher::StyleRulesCss.call(state.site),
      tailwind_css: TailwindCompiler.call(
        html: tailwind_html, classes: DeclaredClassNames.call([document], state&.site),
        site: state&.site
      )
    ).content
    listing_page = Dukafi::Publisher::ListingJsonLd.current_page(
      document, query_params, prefetched:, current_entry: collection
    )
    meta = Dukafi::Publisher::PageMeta.for_collection(state.site, collection, page: listing_page)
    Dukafi::Publisher::HtmlDocument.call(
      title: meta.fetch(:title), language: state.site.dig("settings", "language") || "en",
      description: meta[:description], robots: meta[:robots], canonical: meta[:canonical],
      body: rendered.html,
      body_classes: rendered.body_classes, css:, runtimes: rendered.runtimes,
      json_ld: Dukafi::Publisher::ListingJsonLd.call(
        document:, prefetched:, current_entry: collection,
        path: "collections/#{slug}", title: meta.fetch(:title),
        description: meta[:description], query_params:, site: state.site
      ),
      open_graph: Dukafi::Publisher::OpenGraph.for_collection(
        collection, state.site, title: meta.fetch(:title), description: meta[:description]
      ),
    )
  end

  route do |r|
    r.get do
      path = r.remaining_path
      if path.start_with?("/assets/")
        filename = path.delete_prefix("/assets/")
        request.halt([404, { "content-type" => "text/plain" }, ["Asset not found"]]) unless filename.match?(SAFE_ASSET)
        asset = File.join(published_root, "current", "assets", filename)
        request.halt([404, { "content-type" => "text/plain" }, ["Asset not found"]]) unless File.file?(asset)
        response["Content-Type"] = "text/css; charset=utf-8"
        response["Cache-Control"] = "public, max-age=31536000, immutable"
        next File.binread(asset)
      end

      public_name = path.delete_prefix("/")
      if public_name.match?(PUBLIC_FILE)
        body = disk_public_file(public_name)
        request.halt([404, { "content-type" => "text/plain" }, ["Not found"]]) unless body
        response["Content-Type"] = public_name == "robots.txt" ? "text/plain; charset=utf-8" : "application/xml; charset=utf-8"
        response["Cache-Control"] = "public, max-age=300"
        next body
      end

      slug = request_slug(path)
      if slug && (destination = slug_redirect(slug))
        r.redirect(destination, 301)
      end

      # One order, for the customer who placed it. Never baked and never
      # cached: the token identifies the order, the SESSION decides whether
      # this visitor may see it.
      if slug&.start_with?("orders/")
        order_html = live_order(slug.delete_prefix("orders/"))
        if order_html
          response["Content-Type"] = "text/html; charset=utf-8"
          response["Cache-Control"] = "no-store, private"
          response["X-Dukafy-Render"] = "live"
          next order_html
        end
      end

      # Access is a property of the PAGE, so it has to be looked up before the
      # disk shortcut — a gated page is on disk too, just somewhere this
      # request cannot name.
      gated = slug && Page.first(slug: slug, kind: "page", status: "published", access: "customer")
      if gated
        gate!(gated)
        baked = canonical_query_empty?(r.params) && slug != SearchPage::SLUG ? disk_page(gated.bake_path) : nil
        response["Content-Type"] = "text/html; charset=utf-8"
        # Never store a gated page in a shared cache: the next visitor through
        # that proxy is a different person.
        response["Cache-Control"] = "no-store, private"
        apply_search_status!(slug, r.params) unless baked
        response["X-Dukafy-Render"] = baked ? "disk" : "live"
        next(baked || live_page(gated, r.params))
      end

      if slug && slug != SearchPage::SLUG && canonical_query_empty?(r.params)
        baked = disk_page(slug)
        if baked
          response["Content-Type"] = "text/html; charset=utf-8"
          response["X-Dukafy-Render"] = "disk"
          next baked
        end
      end

      if slug&.start_with?("collections/") && !canonical_query_empty?(r.params)
        collection_html = live_collection(slug.delete_prefix("collections/"), r.params)
        if collection_html
          response["Content-Type"] = "text/html; charset=utf-8"
          response["Cache-Control"] = "no-cache"
          response["X-Dukafy-Render"] = "live"
          next collection_html
        end
      end

      page = slug && Page.first(slug: slug, kind: "page", status: "published")
      if page
        apply_search_status!(slug, r.params)
        response["Content-Type"] = "text/html; charset=utf-8"
        response["Cache-Control"] = "no-cache"
        response["X-Dukafy-Render"] = "live"
        next live_page(page, r.params)
      end

      response.status = 404
      response["Content-Type"] = "text/html; charset=utf-8"
      not_found = canonical_query_empty?(r.params) && disk_page("404")
      not_found ||= begin
        page_404 = Page.first(slug: "404", kind: "page", status: "published")
        live_page(page_404) if page_404
      end
      not_found || "<!doctype html><html><head><title>Not found</title></head><body><h1>Page not found</h1></body></html>"
    end

    response.status = 405
    "Method not allowed"
  end
end
