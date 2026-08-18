Sequel.migration do
  change do
    # Loop sources a published page subscribed to — `products`, `data/team`,
    # `reviews`, `collections/featured.products`. Product ids live on
    # `page_dependencies`; this table is the other half: pages that loop a
    # WHOLE catalogue, so adding a product or a team member can find them
    # without scanning every document.
    create_table(:page_sources) do
      String :page_path, null: false
      String :source, null: false
      index [:page_path, :source], unique: true
      index :source
    end
  end
end
