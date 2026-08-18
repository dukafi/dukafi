Sequel.migration do
  # The product default is Kenyan shillings. Existing stores that still have
  # the old USD factory default (and variants tagged USD only because of it)
  # pick this up on migrate. A merchant who actually wanted USD can set it
  # back in Commerce → Settings.
  up do
    alter_table(:commerce_settings) { set_column_default :currency, "KES" }
    alter_table(:variants) { set_column_default :currency, "KES" }
    alter_table(:orders) { set_column_default :currency, "KES" }

    from(:commerce_settings).where(currency: "USD").update(currency: "KES")
    from(:variants).where(currency: "USD").update(currency: "KES")
  end

  down do
    alter_table(:commerce_settings) { set_column_default :currency, "USD" }
    alter_table(:variants) { set_column_default :currency, "USD" }
    alter_table(:orders) { set_column_default :currency, "USD" }
  end
end
