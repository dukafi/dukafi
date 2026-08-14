Sequel.migration do
  change do
    add_column :site_states, :published_site_json, String, text: true
    add_column :site_states, :last_published_at, DateTime
  end
end
