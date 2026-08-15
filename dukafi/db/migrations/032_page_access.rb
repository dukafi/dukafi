Sequel.migration do
  change do
    alter_table(:pages) do
      # Who may see this page.
      #
      #   public   — anyone. Baked to `published/<slot>/` and served from disk.
      #   customer — only a signed-in shopper. Baked to
      #              `published/<slot>/private/`, which the storefront refuses
      #              to serve by path, so the ONLY way to it is through the
      #              session check.
      #
      # The two-directory split is the whole mechanism. A gated page that
      # still lived in the public slot would be one `curl` away from being
      # public — and under the planned Caddy config (MILESTONES M6), which
      # serves the slot directly and knows nothing about sessions, it would
      # simply BE public.
      add_column :access, String, null: false, default: "public"

      # The page a signed-out visitor is sent to when they ask for a gated
      # one. A flag on a page rather than a slug in settings: the merchant
      # already has the page in front of them, and a settings field holding a
      # slug goes stale the moment the page is renamed.
      #
      # At most one page carries it; `Page.mark_auth_redirect!` clears the
      # others rather than trusting a unique index that SQLite would enforce
      # only over non-null values.
      add_column :auth_redirect, TrueClass, null: false, default: false
    end
  end
end
