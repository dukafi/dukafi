Sequel.migration do
  change do
    # Media metadata. The editor has had a full UI for this since it shipped —
    # a per-asset alt text field, bulk editing, a smart folder listing images
    # MISSING alt text, and alt text in media search — writing to a `PATCH
    # /media/:id` route that does not exist. Every one of those saves 404s,
    # gets swallowed into a console.error, and reports nothing to the merchant.
    #
    # The visible cost: every published image ships `alt=""`, because
    # `MediaPrefetcher` had no alt text to give the publisher. That is an
    # accessibility failure and an SEO one, on every page, today.
    alter_table(:media_assets) do
      # The one that matters. Empty string rather than NULL so "not described
      # yet" and "deliberately decorative" stay distinguishable at the
      # application layer rather than through NULL semantics.
      add_column :alt_text, String, null: false, default: ""
      add_column :title, String, null: false, default: ""
      add_column :caption, String, null: false, default: ""
      # JSON array. Tags are a flat set here; a join table would be the right
      # shape for filtering at scale, and this is not that yet.
      add_column :tags_json, String, text: true
      add_column :updated_at, DateTime
    end
  end
end
