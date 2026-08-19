# Which published pages a catalogue write must re-bake.
#
# Two indexes, filled at bake:
#   page_dependencies  this page listed these product ids
#   page_sources       this page loops this source (`products`, `data/team`, …)
#
# The first finds "the product page and every listing that already showed
# this row". The second finds "every listing that would show a NEW row" —
# adding a product, adding a team member — without walking every document.
#
# Writes look up; they do not scan. `export` is the same map an agent or the
# dashboard can read.
module RebuildIndex
  LOOP_MODULES = %w[store.relationship-loop store.collection-loop].freeze
  # Request-time loops never bake, so they are not rebuild targets.
  SKIP_SOURCE_ROOTS = %w[cart orders currentEntry parentEntry current-query].freeze

  module_function

  def page_path_for(page)
    path = page.bake_path
    path == "index" ? "/" : "/#{path}"
  end

  def sources(document, current_entry: nil)
    return [] unless document.is_a?(Hash)

    found = []
    document.fetch("nodes", {}).each_value do |node|
      next unless LOOP_MODULES.include?(node["moduleId"])

      source = Dukafi::Publisher::LoopSource.call(node.fetch("props", {}), module_id: node["moduleId"])
      next if source.empty?
      if source == "currentEntry.related"
        Array(current_entry.is_a?(Hash) ? current_entry["collectionSlugs"] : nil).each do |slug|
          next if slug.to_s.empty?

          found << "collections/#{slug}.products"
        end
        next
      end
      next if SKIP_SOURCE_ROOTS.include?(source.split(%r{[/.]}, 2).first)

      if source == "products" && current_entry.is_a?(Hash) && current_entry.key?("products") && current_entry["slug"]
        source = "collections/#{current_entry["slug"]}.products"
      end
      found << source
    end
    found.uniq.sort
  end

  def record_path!(path, product_ids:, sources:)
    PageDependency.where(page_path: path).delete
    PageSource.where(page_path: path).delete
    insert_path(path, product_ids:, sources:)
  end

  def replace_all!(entries)
    PageDependency.dataset.delete
    PageSource.dataset.delete
    entries.each do |path, data|
      insert_path(path, product_ids: data[:product_ids] || data["product_ids"] || [],
                        sources: data[:sources] || data["sources"] || [])
    end
  end

  def targets_for_product(product)
    ensure_recorded!
    paths = PageDependency.where(product_id: product.id).select_map(:page_path)
    paths.concat(PageSource.where(source: "products").select_map(:page_path))
    product.collections.each do |collection|
      paths.concat(PageSource.where(source: "collections/#{collection.slug}.products").select_map(:page_path))
    end
    paths << "/products/#{product.slug}" if product.status == "active"
    sanitize(paths)
  end

  def targets_for_collection(collection)
    ensure_recorded!
    paths = ["/collections/#{collection.slug}"]
    paths.concat(PageSource.where(source: "collections/#{collection.slug}.products").select_map(:page_path))
    sanitize(paths)
  end

  def targets_for_data(slug)
    ensure_recorded!
    sanitize(PageSource.where(source: "data/#{slug}").select_map(:page_path))
  end

  def targets_for_reviews
    ensure_recorded!
    sanitize(PageSource.where(source: "reviews").select_map(:page_path))
  end

  def targets_for_source(source)
    ensure_recorded!
    sanitize(PageSource.where(source: source.to_s).select_map(:page_path))
  end

  # The whole map. This is what "export the rebuild graph" means: every
  # published path and the sources/products that would rebuild it.
  def export
    paths = (PageSource.select_map(:page_path) + PageDependency.select_map(:page_path)).uniq.sort
    paths.map do |path|
      {
        "path" => path,
        "sources" => PageSource.where(page_path: path).select_map(:source).sort,
        "productIds" => PageDependency.where(page_path: path).select_map(:product_id).sort,
      }
    end
  end

  def ensure_recorded!
    return unless PageSource.empty?

    backfill_from_published_pages!
  end

  def backfill_from_published_pages!
    Page.where(status: "published", kind: "page").all.each do |page|
      document = page.published_document_data || page.document_data
      found = sources(document)
      next if found.empty?

      path = page_path_for(page)
      found.each do |source|
        next if PageSource.where(page_path: path, source: source).first

        PageSource.dataset.insert(page_path: path, source: source)
      end
    end
  end

  def insert_path(path, product_ids:, sources:)
    Array(product_ids).uniq.each do |product_id|
      PageDependency.dataset.insert(page_path: path, product_id: product_id)
    end
    Array(sources).uniq.each do |source|
      next if source.to_s.empty?

      PageSource.dataset.insert(page_path: path, source: source.to_s)
    end
  end
  private_class_method :insert_path

  def sanitize(paths)
    paths.compact.uniq.select { |path| path.match?(PartialBake::SAFE_PATH) }.sort
  end
  private_class_method :sanitize
end
