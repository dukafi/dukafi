Sequel.migration do
  change do
    # One attempt to pay for an order through one provider.
    #
    # An order has MANY attempts on purpose: an M-Pesa STK push the customer
    # ignores, then a retry, is two attempts and one order. Collapsing them
    # would lose the trail exactly when a customer disputes a payment.
    create_table(:payment_attempts) do
      primary_key :id
      foreign_key :order_id, :orders, null: false, on_delete: :cascade
      String :provider, null: false
      String :status, null: false, default: "pending"
      Integer :amount_cents, null: false
      String :currency, null: false
      # Ours: unguessable, doubles as the callback URL secret and the
      # idempotency key a provider echoes back.
      String :reference, null: false, unique: true
      # Theirs: whatever handle the provider uses to identify the transaction.
      String :provider_reference
      # The receipt a customer would quote — M-Pesa code, card auth code.
      String :receipt
      String :request_payload, text: true
      String :response_payload, text: true
      String :error, text: true
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
      index :order_id
      index :provider_reference
    end
  end
end
