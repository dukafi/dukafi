Sequel.migration do
  change do
    # Which code produced the discount on this order.
    #
    # `discount_cents` has always been recorded, but not what caused it — so
    # "how did WEEKEND20 do" was unanswerable from the database. `usage_count`
    # on the discount is a running total that says nothing about when, or what
    # those orders were worth.
    #
    # The CODE, not a foreign key: a discount can be deleted, and the order it
    # applied to is a permanent record of what the customer was actually
    # charged. A dangling reference would be worse than a string.
    alter_table(:orders) do
      add_column :discount_code, String
    end
  end
end
