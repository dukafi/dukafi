Sequel.migration do
  change do
    create_table(:orders) do
      primary_key :id
      foreign_key :cart_id, :carts, null: true, on_delete: :set_null
      String :email, null: false
      String :status, null: false, default: "pending"
      String :currency, null: false, default: "USD"
      Integer :subtotal_cents, null: false, default: 0
      Integer :discount_cents, null: false, default: 0
      Integer :shipping_cents, null: false, default: 0
      Integer :total_cents, null: false, default: 0
      String :stripe_checkout_session_id, unique: true
      String :stripe_payment_intent_id
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
    end

    create_table(:order_items) do
      primary_key :id
      foreign_key :order_id, :orders, null: false, on_delete: :cascade
      foreign_key :variant_id, :variants, null: true, on_delete: :set_null
      String :product_title, null: false
      String :variant_title, null: false
      String :sku, null: false
      Integer :unit_price_cents, null: false
      Integer :quantity, null: false, default: 1
      DateTime :created_at, null: false
    end

    create_table(:addresses) do
      primary_key :id
      foreign_key :order_id, :orders, null: false, on_delete: :cascade
      String :kind, null: false
      String :name, null: false
      String :line1, null: false
      String :line2
      String :city, null: false
      String :region
      String :postal_code, null: false
      String :country, null: false
      DateTime :created_at, null: false
    end

    create_table(:discounts) do
      primary_key :id
      String :code, null: false, unique: true
      String :kind, null: false
      Integer :value, null: false
      DateTime :starts_at, null: false
      DateTime :ends_at
      Integer :usage_limit
      Integer :usage_count, null: false, default: 0
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
    end
  end
end
