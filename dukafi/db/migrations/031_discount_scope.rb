Sequel.migration do
  change do
    # What a discount applies to.
    #
    # NO `scope_kind` column, deliberately. A kind plus a list is two facts
    # that can disagree — `scope_kind = "products"` with no rows is a code
    # that silently discounts nothing, and there is no way to tell that state
    # from a merchant who has not finished choosing. Here the rows ARE the
    # scope: none means the whole catalogue, and anything else means exactly
    # what is listed.
    #
    # Two tables rather than one polymorphic one because they are joined
    # differently — a product is matched directly, a collection is matched
    # through its membership — and both can be present at once ("these two
    # products, plus everything in Clearance").
    create_table(:discount_products) do
      foreign_key :discount_id, :discounts, null: false, on_delete: :cascade
      foreign_key :product_id, :products, null: false, on_delete: :cascade
      primary_key %i[discount_id product_id]
      index :product_id
    end

    create_table(:discount_collections) do
      foreign_key :discount_id, :discounts, null: false, on_delete: :cascade
      foreign_key :collection_id, :collections, null: false, on_delete: :cascade
      primary_key %i[discount_id collection_id]
      index :collection_id
    end
  end
end
