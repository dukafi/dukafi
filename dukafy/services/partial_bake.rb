require "fileutils"
require "securerandom"

class PartialBake
  Result = Data.define(:page_count, :paths, :slot)
  SAFE_PATH = %r{\A/(?:[a-zA-Z0-9_-]+/?)*\z}

  def self.call(product: nil, collection: nil, old_slug: nil, state: SiteState.first, output_root: ENV.fetch("DUKAFY_PUBLISHED_ROOT", File.expand_path("../published", __dir__)))
    raise ArgumentError, "PartialBake needs exactly one of product: or collection:" if product.nil? == collection.nil?

    new(product:, collection:, old_slug:, state:, output_root:).call
  end

  def initialize(product:, collection:, old_slug:, state:, output_root:)
    @product = product
    @collection = collection
    @old_slug = old_slug
    @state = state
    @output_root = File.expand_path(output_root)
  end

  def call
    source_slot = current_slot
    return Result.new(page_count: 0, paths: [], slot: source_slot) unless publish_available?(source_slot)

    version = @state.publish_version + 1
    # Target the slot we are NOT serving from, derived from the live symlink
    # rather than from `publish_version % 2`.
    #
    # Those two can disagree — a bake that wrote elsewhere still advances the
    # version, and any drift made this target its own source. Since the first
    # thing below is `rm_rf(slot_path)`, that deleted the LIVE SITE and then
    # died on `cp_r` with "same file". Deriving from the symlink cannot
    # collide however far the version has drifted.
    slot_name = source_slot == "slot_0" ? "slot_1" : "slot_0"
    slot_path = File.join(@output_root, slot_name)
    raise "refusing to bake into the slot being served (#{slot_name})" if slot_path == source_path_for(source_slot)
    source_path = File.join(@output_root, source_slot)
    affected, old_path, current_path = affected_paths
    rendered_paths = []

    FileUtils.rm_rf(slot_path)
    FileUtils.mkdir_p(slot_path)
    FileUtils.cp_r(File.join(source_path, "."), slot_path, preserve: true)
    begin
      prefetched = CommercePrefetcher.call
      dependencies = {}
      affected.each do |path|
        entry = render_path(path, prefetched)
        if entry
          write_entry(path, entry, slot_path, source_path, fallback_path: old_path)
          dependencies[path] = entry.fetch(:product_ids)
          rendered_paths << path
        else
          delete_html(path, slot_path)
          dependencies[path] = []
        end
      end
      if old_path != current_path
        delete_html(old_path, slot_path)
        dependencies[old_path] = []
      end

      flip_current(slot_name)
      DB.transaction do
        dependencies.each do |path, product_ids|
          PageDependency.where(page_path: path).delete
          product_ids.each { |product_id| PageDependency.dataset.insert(page_path: path, product_id:) }
        end
        @state.update(publish_version: version)
      end
    rescue StandardError
      flip_current(source_slot) if current_slot != source_slot
      FileUtils.rm_rf(slot_path)
      raise
    end

    Result.new(page_count: rendered_paths.length, paths: rendered_paths.sort, slot: slot_name)
  end

  private

  def source_path_for(slot)
    File.join(@output_root, slot.to_s)
  end

  def publish_available?(slot)
    @state && @state.publish_version.positive? && slot && File.directory?(File.join(@output_root, slot))
  end

  # Returns [affected_paths, old_path, current_path]. `old_path` is the
  # slug-before-rename path (equal to `current_path` when nothing renamed) —
  # used to delete the stale file when a product/collection slug changes.
  def affected_paths
    if @product
      current_path = "/products/#{@product.slug}"
      old_path = "/products/#{@old_slug || @product.slug}"
      affected = PageDependency.where(product_id: @product.id).select_map(:page_path)
      affected << current_path if @product.status == "active"
    else
      current_path = "/collections/#{@collection.slug}"
      old_path = "/collections/#{@old_slug || @collection.slug}"
      affected = [current_path]
    end
    [affected.uniq.select { |path| path.match?(SAFE_PATH) }, old_path, current_path]
  end

  def render_path(path, prefetched)
    if (match = path.match(%r{\A/products/([a-z0-9-]+)\z}))
      product = prefetched.dig("products", match[1])
      template = ProductTemplate.find
      return unless product && template&.published_document_data
      return entry(template.published_document_data, prefetched, product, product.fetch("title"))
    end
    if (match = path.match(%r{\A/collections/([a-z0-9-]+)\z}))
      collection = prefetched.dig("collections", match[1])
      template = CollectionTemplate.find
      return unless collection && template&.published_document_data
      return entry(template.published_document_data, prefetched, collection, collection.fetch("title"))
    end

    slug = path == "/" ? "index" : path.delete_prefix("/")
    page = Page.first(slug:, kind: "page", status: "published")
    return unless page
    document = page.published_document_data || page.document_data
    entry(document, prefetched, nil, page.title)
  end

  def entry(document, prefetched, current_entry, title)
    rendered = Dukafy::Publisher::RenderPage.call(
      document:, registry: Dukafy::Publisher::REGISTRY, site: @state.published_site || @state.site,
      prefetched:, current_entry:, page_paths: PagePaths.call
    )
    { rendered:, title:, product_ids: DependencyTracker.product_ids(document:, prefetched:, current_entry:) }
  end

  def write_entry(path, entry, slot_path, source_path, fallback_path:)
    destination = html_file(path, slot_path)
    source_html = [html_file(path, source_path), html_file(fallback_path, source_path)].find { |file| File.file?(file) }
    css_href = source_html && File.read(source_html)[%r{href="(/assets/site-[0-9a-f]{12}\.css)"}, 1]
    css_href ||= Dir[File.join(source_path, "assets", "site-*.css")].sort.first&.sub(source_path, "")
    rendered = entry.fetch(:rendered)
    site = @state.published_site || @state.site
    html = Dukafy::Publisher::HtmlDocument.call(
      title: site.dig("settings", "metaTitle") || entry.fetch(:title),
      body: rendered.html, body_classes: rendered.body_classes,
      language: site.dig("settings", "language") || "en",
      description: site.dig("settings", "metaDescription"), css_href:,
      runtimes: rendered.runtimes
    )
    FileUtils.mkdir_p(File.dirname(destination))
    File.write(destination, html)
  end

  def html_file(path, root)
    relative = path == "/" ? "index.html" : "#{path.delete_prefix('/')}.html"
    File.join(root, relative)
  end

  def delete_html(path, root)
    file = html_file(path, root)
    File.delete(file) if File.file?(file)
  end

  def current_slot
    current = File.join(@output_root, "current")
    File.symlink?(current) ? File.readlink(current) : nil
  end

  def flip_current(slot_name)
    current = File.join(@output_root, "current")
    temporary = File.join(@output_root, ".current-#{SecureRandom.hex(6)}")
    File.symlink(slot_name, temporary)
    File.rename(temporary, current)
  ensure
    File.delete(temporary) if temporary && File.symlink?(temporary)
  end
end
