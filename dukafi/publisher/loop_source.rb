class Dukafi
  module Publisher
    # A loop's source path. One spelling, used by the renderer AND by the
    # rebuild index, so a page that iterates `data/team` cannot bake one way
    # and declare a different dependency.
    #
    #   products                        every active product
    #   collections/featured.products   one collection's products
    #   products/canvas-bag.variants    one product's variants
    #   data/team                       every row in that custom table
    #   reviews                         every approved review
    #   currentEntry.images             a list field of the entity in scope
    module LoopSource
      module_function

      def call(props, module_id: nil)
        props = props.is_a?(Hash) ? props : {}
        explicit = props["source"].to_s
        return explicit unless explicit.empty?

        relationship = module_id.to_s == "store.collection-loop" ? "products" : props.fetch("relationship", "products").to_s
        slug = props["sourceSlug"].to_s
        slug = props["collectionSlug"].to_s if slug.empty?
        case relationship
        when "cartItems" then "cart.items"
        when "dataRows" then slug.empty? ? "data" : "data/#{slug}"
        when "variants" then slug.empty? ? "currentEntry.variants" : "products/#{slug}.variants"
        else slug.empty? ? "products" : "collections/#{slug}.products"
        end
      end
    end
  end
end
