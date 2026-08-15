Sequel.migration do
  change do
    # Customer reviews — the source the homepage testimonials will read.
    #
    # The hardcoded testimonials on the home page today claim "Verified Buyer"
    # under invented names. Linking a review to an ORDER is what makes that
    # claim true rather than decorative, and it is the reason this hangs off
    # customers and orders instead of being a free-standing content table.
    create_table(:reviews) do
      primary_key :id

      # All three are nullable on purpose. A review left before accounts
      # existed, or by someone who checked out as a guest, is still a real
      # review — it simply cannot be marked verified.
      foreign_key :customer_id, :customers, on_delete: :set_null
      foreign_key :order_id, :orders, on_delete: :set_null
      # Null means a review of the STORE rather than of one product, which is
      # what a homepage testimonial usually is.
      foreign_key :product_id, :products, on_delete: :cascade

      # Denormalised deliberately. A customer may delete their account, and a
      # published page must not change its attribution because someone edited
      # their profile two years later.
      String :author_name, null: false
      Integer :rating, null: false, default: 5
      String :body, text: true, null: false

      # Moderation. User-submitted text on a public storefront must never
      # publish itself — NULL means waiting, and only approved rows are ever
      # given to the publisher.
      DateTime :approved_at
      DateTime :created_at, null: false
      DateTime :updated_at, null: false

      index :approved_at
      index [:product_id, :approved_at]
    end
  end
end
