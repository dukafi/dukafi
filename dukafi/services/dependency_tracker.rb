class DependencyTracker
  STORE_PRODUCT_MODULES = %w[
    store.product-card store.price store.image-gallery store.variant-picker
    store.buy-button store.stock-badge
  ].freeze
  RELATIONSHIP_LOOP_MODULES = %w[store.relationship-loop store.collection-loop].freeze

  def self.product_ids(document:, prefetched:, current_entry: nil)
    ids = []
    if current_entry.is_a?(Hash) && current_entry["id"] && current_entry.key?("variants")
      ids << current_entry["id"]
    end
    document.fetch("nodes", {}).each_value do |node|
      props = node.fetch("props", {})
      case node["moduleId"]
      when *STORE_PRODUCT_MODULES
        product = prefetched.dig("products", props["productSlug"].to_s)
        ids << product["id"] if product
      when *RELATIONSHIP_LOOP_MODULES
        source = Dukafi::Publisher::LoopSource.call(props, module_id: node["moduleId"])
        ids.concat(ids_for_loop_source(source, prefetched, current_entry))
      end
    end
    ids.compact.map { |id| Integer(id) }.uniq.sort
  end

  def self.replace!(dependencies)
    entries = dependencies.to_h do |page_path, value|
      if value.is_a?(Hash)
        [page_path, { product_ids: value[:product_ids] || value["product_ids"] || [],
                      sources: value[:sources] || value["sources"] || [] }]
      else
        [page_path, { product_ids: value, sources: [] }]
      end
    end
    RebuildIndex.replace_all!(entries)
  end

  def self.ids_for_loop_source(source, prefetched, current_entry)
    kind, rest = source.split("/", 2)
    fields = []
    if rest&.include?(".")
      slug, *fields = rest.split(".")
    elsif source.include?(".")
      kind, *fields = source.split(".")
      slug = nil
    else
      slug = rest
    end

    case kind
    when "products"
      if slug.nil? && fields.empty?
        if current_entry.is_a?(Hash) && current_entry.key?("products")
          current_entry.fetch("products", []).filter_map { |product| product["id"] }
        else
          prefetched.fetch("products", {}).values.filter_map { |product| product["id"] }
        end
      elsif fields == ["variants"]
        product = slug ? prefetched.dig("products", slug) : current_entry
        product.is_a?(Hash) ? [product["id"]] : []
      else
        []
      end
    when "collections"
      return [] unless fields == ["products"] && slug

      collection = prefetched.dig("collections", slug)
      collection ? collection.fetch("products", []).filter_map { |product| product["id"] } : []
    when "currentEntry"
      if fields == ["related"]
        return [] unless current_entry.is_a?(Hash)

        ids = [current_entry["id"]]
        ids.concat(Array(current_entry["related"]).filter_map { |item| item["id"] if item.is_a?(Hash) })
        ids
      elsif fields == ["variants"]
        current_entry.is_a?(Hash) ? [current_entry["id"]] : []
      else
        []
      end
    else
      []
    end
  end
  private_class_method :ids_for_loop_source
end
