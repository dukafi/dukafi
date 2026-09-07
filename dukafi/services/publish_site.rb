class PublishSite
  Result = Data.define(:published_pages, :version)
  class InProgress < StandardError; end

  def self.call(
    state: SiteState.first,
    pages: nil,
    output_root: Paths.published_root
  )
    claimed = SchedulerLock.claim(id: 2)
    raise InProgress, "publish already in progress" unless claimed
    raise ArgumentError, "site state is required" unless state
    SearchPage.ensure!
    pages = pages.nil? ? Page.where(kind: "page").order(:id).all : pages
    raise ArgumentError, "site must contain at least one page" if pages.empty?
    # Partials publish alongside the templates: their content reaches the
    # storefront through the bake, so an edited header that never had its
    # `published_document` updated would simply never go live.
    templates = [ProductTemplate.ensure!, CollectionTemplate.ensure!, OrderTemplate.ensure!] +
                SitePartials.ensure!(store_name: state.site.dig("name").to_s)

    baked = Bake.call(
      state:, pages:, product_template: templates[0], collection_template: templates[1], output_root:, use_draft: true,
      commit: lambda do |version|
        DB.transaction do
          (pages + templates).each do |page|
            # `published_access` alongside the document: both decide what the
            # bake produced, so both have to be recorded for `status` to be
            # able to tell whether a re-bake would change anything.
            page.update(published_document: page.document, published_access: page.access,
                        status: "published")
          end
          state.published_site = state.site
          state.publish_version = version
          state.last_published_at = Time.now.utc
          state.save
        end
      end,
    )
    Result.new(published_pages: baked.page_count, version: baked.version)
  ensure
    SchedulerLock.release(id: 2) if claimed
  end

  def self.status(state: SiteState.first, pages: nil)
    SearchPage.ensure!
    pages = pages.nil? ? Page.where(kind: "page").order(:id).all : pages
    templates = [ProductTemplate.ensure!, CollectionTemplate.ensure!, OrderTemplate.ensure!] +
                SitePartials.ensure!(store_name: state&.site.is_a?(Hash) ? state.site["name"].to_s : "Store")
    documents = pages + templates
    published = documents.select { |page| page.status == "published" && page.published_document }
    matches = state && state.published_site_json == state.site_json &&
      published.length == documents.length &&
      documents.all? { |page| page.document == page.published_document && page.access == page.published_access }

    {
      hasPublishedVersion: !!(state && state.publish_version.positive?),
      draftMatchesPublished: !!matches,
      draftPages: pages.length,
      publishedPages: pages.count { |page| page.status == "published" && page.published_document },
      **(state&.last_published_at ? { lastPublishedAt: state.last_published_at.utc.iso8601 } : {}),
    }
  end
end
