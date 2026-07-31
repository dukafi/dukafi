require "fileutils"
require "securerandom"

class PartialBake
  Result = Data.define(:page_count, :paths, :slot)
  SAFE_PATH = %r{\A/(?:[a-zA-Z0-9_-]+/?)*\z}

  def self.call(product:, old_slug: nil, state: SiteState.first, output_root: ENV.fetch("DUKAFY_PUBLISHED_ROOT", File.expand_path("../published", __dir__)))
    new(product:, old_slug:, state:, output_root:).call
  end

  def initialize(product:, old_slug:, state:, output_root:)
    @product = product
    @old_slug = old_slug
    @state = state
    @output_root = File.expand_path(output_root)
  end

  def call
    source_slot = current_slot
    return Result.new(page_count: 0, paths: [], slot: source_slot) unless publish_available?(source_slot)

    version = @state.publish_version + 1
    slot_name = "slot_#{version % 2}"
    slot_path = File.join(@output_root, slot_name)
    source_path = File.join(@output_root, source_slot)
    affected = PageDependency.where(product_id: @product.id).select_map(:page_path)
    old_product_path = "/products/#{@old_slug || @product.slug}"
    affected << "/products/#{@product.slug}" if @product.status == "active"
    affected = affected.uniq.select { |path| path.match?(SAFE_PATH) }
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
          write_entry(path, entry, slot_path, source_path, fallback_path: old_product_path)
          dependencies[path] = entry.fetch(:product_ids)
          rendered_paths << path
        else
          delete_html(path, slot_path)
          dependencies[path] = []
        end
      end
      if old_product_path != "/products/#{@product.slug}"
        delete_html(old_product_path, slot_path)
        dependencies[old_product_path] = []
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

  def publish_available?(slot)
    @state && @state.publish_version.positive? && slot && File.directory?(File.join(@output_root, slot))
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
      prefetched:, current_entry:
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
      description: site.dig("settings", "metaDescription"), css_href:
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
