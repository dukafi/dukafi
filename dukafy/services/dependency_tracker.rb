class DependencyTracker
  STORE_PRODUCT_MODULES = %w[
    store.product-card store.price store.image-gallery store.variant-picker
    store.buy-button store.stock-badge
  ].freeze

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
      when "store.collection-loop"
        collection_slug = props["collectionSlug"].to_s
        if collection_slug.empty? && current_entry.is_a?(Hash)
          collection_slug = current_entry["slug"].to_s
        end
        collection = prefetched.dig("collections", collection_slug)
        ids.concat(collection.fetch("products", []).filter_map { |product| product["id"] }) if collection
      end
    end
    ids.compact.map { |id| Integer(id) }.uniq.sort
  end

  def self.replace!(dependencies)
    PageDependency.dataset.delete
    dependencies.each do |page_path, product_ids|
      product_ids.each { |product_id| PageDependency.dataset.insert(page_path:, product_id:) }
    end
  end
end
