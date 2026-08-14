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
        relationship = node["moduleId"] == "store.collection-loop" ? "products" : props.fetch("relationship", "products").to_s
        if relationship == "variants"
          slug = props["sourceSlug"].to_s
          product = slug.empty? ? current_entry : prefetched.dig("products", slug)
          ids << product["id"] if product.is_a?(Hash) && product["id"]
        else
          slug = props["sourceSlug"].to_s
          slug = props["collectionSlug"].to_s if slug.empty?
          slug = current_entry["slug"].to_s if slug.empty? && current_entry.is_a?(Hash)
          if slug.empty?
            # Matches render_page.rb's `relationship_items` fallback: no
            # collection picked means every active product is a dependency,
            # so any product edit correctly re-bakes this page.
            ids.concat(prefetched.fetch("products", {}).values.filter_map { |product| product["id"] })
          else
            collection = prefetched.dig("collections", slug)
            ids.concat(collection.fetch("products", []).filter_map { |product| product["id"] }) if collection
          end
        end
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
