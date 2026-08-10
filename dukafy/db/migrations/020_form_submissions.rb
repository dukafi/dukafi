Sequel.migration do
  change do
    # Deliberately schemaless in the payload: a merchant invents their own
    # form (emergency contact, M-Pesa confirmation, delivery notes) and we
    # store whatever fields they defined. Giving each form a table would mean
    # a migration per form, which is the opposite of the point.
    #
    # `order_id` and `customer_id` are both nullable: a submission may stand
    # alone (a contact form), belong to a person, or be attached to an order.
    # That progression is the CRM.
    create_table(:form_submissions) do
      primary_key :id
      String :form_id, null: false
      String :payload, null: false, default: "{}"
      foreign_key :order_id, :orders, null: true, on_delete: :set_null
      foreign_key :customer_id, :customers, null: true, on_delete: :set_null
      DateTime :created_at, null: false
      index :form_id
      index :order_id
      index :customer_id
      index :created_at
    end
  end
end
