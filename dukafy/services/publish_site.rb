class PublishSite
  Result = Data.define(:published_pages, :version)

  def self.call(
    state: SiteState.first,
    pages: Page.where(kind: "page").order(:id).all,
    output_root: ENV.fetch("DUKAFY_PUBLISHED_ROOT", File.expand_path("../published", __dir__))
  )
    raise ArgumentError, "site state is required" unless state
    raise ArgumentError, "site must contain at least one page" if pages.empty?

    baked = Bake.call(
      state:, pages:, output_root:, use_draft: true,
      commit: lambda do |version|
        DB.transaction do
          pages.each do |page|
            page.update(published_document: page.document, status: "published")
          end
          state.published_site = state.site
          state.publish_version = version
          state.last_published_at = Time.now.utc
          state.save
        end
      end,
    )
    Result.new(published_pages: baked.page_count, version: baked.version)
  end

  def self.status(state: SiteState.first, pages: Page.where(kind: "page").order(:id).all)
    published = pages.select { |page| page.status == "published" && page.published_document }
    matches = state && state.published_site_json == state.site_json &&
      published.length == pages.length && pages.all? { |page| page.document == page.published_document }

    {
      hasPublishedVersion: !!(state && state.publish_version.positive?),
      draftMatchesPublished: !!matches,
      draftPages: pages.length,
      publishedPages: published.length,
      **(state&.last_published_at ? { lastPublishedAt: state.last_published_at.utc.iso8601 } : {}),
    }
  end
end
