class Storefront < Roda
  TRACKING_PARAMS = %w[gclid fbclid msclkid].freeze
  SAFE_ASSET = /\Asite-[0-9a-f]{12}\.css\z/
  SAFE_SLUG = /\A[a-zA-Z0-9][a-zA-Z0-9_\/-]*\z/

  def published_root
    File.expand_path(ENV.fetch("DUKAFY_PUBLISHED_ROOT", File.expand_path("../published", __dir__)))
  end

  def canonical_query_empty?(params)
    params.keys.all? { |key| key.start_with?("utm_") || TRACKING_PARAMS.include?(key) }
  end

  def request_slug(path)
    value = path.to_s.sub(%r{\A/+}, "").sub(%r{/+\z}, "")
    value = "index" if value.empty?
    return nil unless value.match?(SAFE_SLUG)
    return nil if value.split("/").include?("..")

    value
  end

  def disk_page(slug)
    relative = slug == "index" ? "index.html" : "#{slug}.html"
    path = File.join(published_root, "current", relative)
    File.file?(path) ? File.binread(path) : nil
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

    document = page.published_document_data || page.document_data
    rendered = Dukafy::Publisher::RenderPage.call(
      document:, registry: Dukafy::Publisher::REGISTRY, site: state.site,
      prefetched: CommercePrefetcher.call, query_params:
    )
    tailwind_html = %(<body class="#{rendered.body_classes.join(' ')}">#{rendered.html}</body>)
    tailwind_css = TailwindCompiler.call(html: tailwind_html)
    collector = Dukafy::Publisher::CssCollector.new
    collector.add("page-modules", rendered.css)
    css = collector.bundle(
      framework_css: Dukafy::Publisher::FrameworkCss.call(state.site), tailwind_css: tailwind_css
    ).content
    Dukafy::Publisher::HtmlDocument.call(
      title: state.site.dig("settings", "metaTitle") || page.title,
      description: state.site.dig("settings", "metaDescription"),
      language: state.site.dig("settings", "language") || "en",
      body: rendered.html,
      body_classes: rendered.body_classes,
      css: css, runtimes: rendered.runtimes,
    )
  end

  def live_collection(slug, query_params)
    template = CollectionTemplate.find
    return unless template&.status == "published"
    document = template.published_document_data
    return unless document
    prefetched = CommercePrefetcher.call
    collection = prefetched.dig("collections", slug)
    return unless collection

    state = SiteState.first
    return unless state

    rendered = Dukafy::Publisher::RenderPage.call(
      document:, registry: Dukafy::Publisher::REGISTRY, site: state.site,
      prefetched:, current_entry: collection, query_params:
    )
    tailwind_html = %(<body class="#{rendered.body_classes.join(' ')}">#{rendered.html}</body>)
    collector = Dukafy::Publisher::CssCollector.new
    collector.add("page-modules", rendered.css)
    css = collector.bundle(
      framework_css: Dukafy::Publisher::FrameworkCss.call(state.site),
      tailwind_css: TailwindCompiler.call(html: tailwind_html)
    ).content
    Dukafy::Publisher::HtmlDocument.call(
      title: collection.fetch("title"), language: state.site.dig("settings", "language") || "en",
      description: collection["description"], body: rendered.html,
      body_classes: rendered.body_classes, css:, runtimes: rendered.runtimes
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

      slug = request_slug(path)
      if slug && (destination = slug_redirect(slug))
        r.redirect(destination, 301)
      end
      if slug && canonical_query_empty?(r.params)
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
