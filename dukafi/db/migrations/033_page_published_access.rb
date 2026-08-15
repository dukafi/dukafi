Sequel.migration do
  change do
    alter_table(:pages) do
      # The access level the LAST BAKE used, mirroring `published_document`.
      #
      # Access decides which directory a page's file is written to, so it is
      # part of what publishing produces — and without recording it, changing
      # a page from public to gated left the site reporting "nothing to
      # publish" while a stale public copy sat in the served tree.
      #
      # Defaults to "public" so existing rows, all of which are public and
      # already baked, compare equal instead of marking every store dirty.
      add_column :published_access, String, null: false, default: "public"
    end
  end
end
