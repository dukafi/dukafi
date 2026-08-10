Sequel.migration do
  change do
    # `vendor` was a Shopify-CSV convention that never reached the storefront:
    # it was absent from CommercePrefetcher, so it could not be bound, shown
    # or filtered on. Stored, edited, and read by nobody.
    #
    # Shopify exports still carry a `vendor` column; the importer simply
    # ignores it now, the same as any other column we don't model.
    alter_table(:products) do
      drop_column :vendor
    end
  end
end
