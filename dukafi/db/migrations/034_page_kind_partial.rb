Sequel.migration do
  up do
    # `partial` joins page and template: the site header and footer.
    #
    # A partial is a page in every way that matters — a validated node
    # document, editable on canvas, reachable through the page tools — except
    # that it has no URL of its own. Every `kind: "page"` query in the app
    # therefore skips it, and it reaches the storefront only by being composed
    # into the pages it wraps (`SitePartials.compose`).
    #
    # SQLite cannot alter a CHECK constraint in place, so the table is rebuilt.
    # Sequel's `alter_table` does that by copying, which preserves the rows.
    alter_table(:pages) do
      drop_constraint(:pages_kind_check, type: :check) rescue nil
    end
    alter_table(:pages) do
      add_constraint(:pages_kind_check) { kind =~ %w[page template partial] }
    end
  end

  down do
    alter_table(:pages) do
      drop_constraint(:pages_kind_check, type: :check) rescue nil
    end
    alter_table(:pages) do
      add_constraint(:pages_kind_check) { kind =~ %w[page template] }
    end
  end
end
