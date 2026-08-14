class DemoStoreSeeder
  Result = Data.define(:products, :variants, :collections)
  COLLECTIONS = [
    {
      title: "Featured", slug: "featured", description: "A rotating edit of our current favorites.",
      products: %w[everyday-canvas-tote studio-ceramic-mug wool-throw brass-candle-holder market-basket glass-carafe],
    },
    {
      title: "Home Essentials", slug: "home-essentials", description: "Useful, enduring objects for everyday rooms.",
      products: %w[studio-ceramic-mug linen-table-runner oak-serving-board wool-throw brass-candle-holder glass-carafe],
    },
    {
      title: "Gifts Under $75", slug: "gifts-under-75", description: "Thoughtful gifts at approachable prices.",
      products: %w[everyday-canvas-tote studio-ceramic-mug linen-table-runner cotton-apron incense-set desk-tray travel-journal],
    },
  ].freeze

  def self.call(csv_path: File.expand_path("../db/seeds/demo_products.csv", __dir__))
    imported = ProductCsvImporter.call(File.read(csv_path))
    DB.transaction do
      COLLECTIONS.each_with_index do |definition, sort_order|
        collection = Collection.first(slug: definition[:slug]) || Collection.new(slug: definition[:slug])
        collection.set(title: definition[:title], description: definition[:description], sort_order:)
        collection.save
        CollectionProduct.where(collection_id: collection.id).delete
        definition[:products].each_with_index do |slug, position|
          product = Product.first!(slug:)
          CollectionProduct.dataset.insert(collection_id: collection.id, product_id: product.id, position:)
        end
      end
    end
    Result.new(products: imported.products, variants: imported.variants, collections: COLLECTIONS.length)
  end
end
