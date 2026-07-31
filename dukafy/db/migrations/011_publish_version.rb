Sequel.migration do
  change do
    add_column :site_states, :publish_version, Integer, null: false, default: 0
  end
end
