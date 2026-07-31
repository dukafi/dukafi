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

  def live_page(page)
    state = SiteState.first
    return nil unless state

    document = page.published_document_data || page.document_data
    rendered = Dukafy::Publisher::RenderPage.call(
      document:, registry: Dukafy::Publisher::REGISTRY, site: state.site
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
      css: css,
    )
  end

  route do |r|
    r.get do
      path = r.remaining_path
      if path.start_with?("/assets/")
        filename = path.delete_prefix("/assets/")
        r.halt(404) unless filename.match?(SAFE_ASSET)
        asset = File.join(published_root, "current", "assets", filename)
        r.halt(404) unless File.file?(asset)
        response["Content-Type"] = "text/css; charset=utf-8"
        response["Cache-Control"] = "public, max-age=31536000, immutable"
        next File.binread(asset)
      end

      slug = request_slug(path)
      r.halt(404) unless slug
      if canonical_query_empty?(r.params)
        baked = disk_page(slug)
        if baked
          response["Content-Type"] = "text/html; charset=utf-8"
          response["X-Dukafy-Render"] = "disk"
          next baked
        end
      end

      page = Page.first(slug: slug, kind: "page", status: "published")
      if page
        response["Content-Type"] = "text/html; charset=utf-8"
        response["Cache-Control"] = "no-cache"
        response["X-Dukafy-Render"] = "live"
        next live_page(page)
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
