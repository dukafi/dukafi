require "securerandom"

# The header and footer that appear on every page.
#
# ── Why not the editor's "visual components" ────────────────────────────────
# The editor has a component system and a `base.visual-component-ref` module,
# but the server side of it does not exist: `GET /admin/api/cms/components`
# returns an empty list and the publisher has no renderer for that module. A
# header built as a component would therefore bake as NOTHING. This is the
# smaller thing that actually works.
#
# ── Partials are pages ──────────────────────────────────────────────────────
# `kind: "partial"` rather than a new table, because everything a header needs
# already exists for pages: a validated node document, editing on canvas,
# `read_page`/`apply_edits` over MCP, and — the one that matters — the
# published-document scan behind `find_published_node`, which is how a cart
# region or a form region inside the header gets found and re-rendered per
# visitor. A new table would have needed all of that rebuilt.
#
# Every `Page.where(kind: "page")` query in the app therefore skips them
# automatically, so a partial has no URL of its own and is never baked as a
# page. It only ever appears composed into one.
#
# ── Composition ────────────────────────────────────────────────────────────
# `compose` merges the partial's nodes into the page's document and splices
# its children around the page's own, keeping the ORIGINAL node ids. Not
# namespaced, deliberately: the fragment endpoints address nodes by id, so a
# renamed id would leave the header's cart badge unable to find itself.
class SitePartials
  HEADER_SLUG = "site-header".freeze
  FOOTER_SLUG = "site-footer".freeze
  KIND = "partial".freeze

  def self.header = find(HEADER_SLUG)
  def self.footer = find(FOOTER_SLUG)

  def self.find(slug)
    Page.first(slug: slug, kind: KIND)
  end

  def self.all = Page.where(kind: KIND).order(:id).all

  # Published content when there is any, else the draft — the same rule the
  # bake uses for pages, so a partial behaves like the pages it wraps.
  def self.document_for(page, use_draft: false)
    return nil unless page
    return page.document_data if use_draft

    page.published_document_data || page.document_data
  end

  # Page document + header + footer, as one document to render.
  #
  # Returns the document unchanged when there is nothing to add, so a store
  # with no partials renders byte-identically to before.
  def self.compose(document, header_document: nil, footer_document: nil)
    return document unless document.is_a?(Hash)
    return document if header_document.nil? && footer_document.nil?

    nodes = document.fetch("nodes").dup
    root_id = document.fetch("rootNodeId")
    root = nodes[root_id]
    return document unless root.is_a?(Hash)

    leading = splice(nodes, header_document, root_id)
    trailing = splice(nodes, footer_document, root_id)
    return document if leading.empty? && trailing.empty?

    nodes[root_id] = root.merge("children" => leading + root.fetch("children", []) + trailing)
    document.merge("nodes" => nodes)
  end

  # Copy a partial's nodes in and return the ids to splice into the page root.
  #
  # The partial's own root (a `base.body`) is dropped — one body per page —
  # and its children are re-parented onto the page's root so nothing thinks it
  # is still inside another document.
  def self.splice(nodes, partial, page_root_id)
    return [] unless partial.is_a?(Hash)

    partial_nodes = partial["nodes"]
    partial_root = partial["rootNodeId"]
    return [] unless partial_nodes.is_a?(Hash) && partial_nodes[partial_root].is_a?(Hash)

    children = partial_nodes[partial_root].fetch("children", [])
    return [] if children.empty?

    partial_nodes.each do |id, node|
      next if id == partial_root
      # A page node of the same id wins. Ids are random, so a collision means
      # something has gone wrong upstream, and silently replacing the page's
      # own node would be the worse failure.
      next if nodes.key?(id)

      nodes[id] = children.include?(id) ? node.merge("parentId" => page_root_id) : node
    end

    children.reject { |id| partial_nodes[id].nil? }
  end

  # Seed a header and footer that already do the job: the store name, a link
  # to everything, a live cart count, and an account area that shows Sign in
  # or Orders + Sign out depending on who is looking.
  def self.ensure!(store_name: "Store")
    [
      find(HEADER_SLUG) || create!(HEADER_SLUG, "Site header", header_document(store_name)),
      find(FOOTER_SLUG) || create!(FOOTER_SLUG, "Site footer", footer_document(store_name)),
    ]
  end

  # Class NAMES in the seeded documents are resolved to the site's class IDS
  # here — a document carrying raw names publishes with no styling at all, and
  # says nothing about why.
  def self.create!(slug, title, document)
    Page.create(slug: slug, title: title, kind: KIND, status: "draft",
                document: JSON.generate(SiteStyleRules.resolve_document!(document)))
  end

  def self.node(id, module_id, children = [], props = {}, extra = {})
    { "id" => id, "moduleId" => module_id, "props" => props,
      "breakpointOverrides" => {}, "children" => children, "classIds" => [] }.merge(extra)
  end

  def self.text(id, tag, value, classes = [], extra = {})
    node(id, "base.text", [], { "tag" => tag, "text" => value }, { "classIds" => classes }.merge(extra))
  end

  def self.link(id, label, href, classes = [], extra = {})
    node(id, "base.link", [], { "text" => label, "href" => href },
         { "classIds" => classes }.merge(extra))
  end

  def self.header_document(store_name)
    {
      "id" => "site-header", "slug" => HEADER_SLUG, "title" => "Site header",
      "rootNodeId" => "hdr-body",
      "nodes" => {
        "hdr-body" => node("hdr-body", "base.body", %w[hdr-bar]),
        # Sticky, so the cart and account stay reachable down a long catalogue
        # page. `z-40` leaves room above it for a cart drawer or overlay.
        "hdr-bar" => node("hdr-bar", "base.container", %w[hdr-inner], {},
                          { "classIds" => %w[sticky top-0 z-40 w-full border-b border-gray-200
                                             bg-white/90 backdrop-blur] }),
        "hdr-inner" => node("hdr-inner", "base.container", %w[hdr-brand hdr-nav hdr-cart hdr-account], {},
                            { "classIds" => %w[mx-auto flex w-full max-w-6xl items-center gap-8 px-6 py-4] }),
        "hdr-brand" => link("hdr-brand", store_name, "/",
                            %w[text-lg font-bold tracking-tight text-gray-900 transition hover:opacity-70]),
        "hdr-nav" => node("hdr-nav", "base.container", %w[hdr-shop hdr-contact], {},
                          { "classIds" => %w[hidden items-center gap-6 text-sm font-medium text-gray-600 sm:flex] }),
        "hdr-shop" => link("hdr-shop", "Shop", "/", %w[transition hover:text-gray-900]),
        "hdr-contact" => link("hdr-contact", "Contact", "/contact", %w[transition hover:text-gray-900]),

        # A cart REGION, so `{cart.count}` resolves. It bakes as a placeholder
        # that fetches itself and re-renders on every cart change — which is
        # what makes the count live on a static page.
        "hdr-cart" => node("hdr-cart", "base.container", %w[hdr-cart-link], {},
                           { "classIds" => %w[ml-auto flex items-center],
                             "actions" => { "region" => "cart" } }),
        "hdr-cart-link" => link("hdr-cart-link", "Cart ({cart.count})", "/checkout",
                                %w[rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium
                                   text-gray-800 transition hover:border-gray-900 hover:bg-gray-900
                                   hover:text-white]),

        # A form REGION, because `form.signedIn` resolves only inside one.
        # It bakes empty and fills itself per visitor, so the static file never
        # claims anyone is signed in.
        "hdr-account" => node("hdr-account", "base.container", %w[hdr-signin hdr-orders hdr-signout], {},
                              { "classIds" => %w[flex items-center gap-3 text-sm],
                                "actions" => { "region" => "form" } }),
        "hdr-signin" => link("hdr-signin", "Sign in", "/login",
                             %w[rounded-full bg-gray-900 px-4 py-1.5 font-medium text-white
                                transition hover:bg-gray-700],
                             { "visibleWhen" => { "source" => "form", "field" => "signedOut", "operator" => "isTrue" } }),
        "hdr-orders" => link("hdr-orders", "My orders", "/account",
                             %w[font-medium text-gray-700 transition hover:text-gray-900],
                             { "visibleWhen" => { "source" => "form", "field" => "signedIn", "operator" => "isTrue" } }),
        "hdr-signout" => node("hdr-signout", "base.button", [], { "label" => "Sign out" },
                              { "classIds" => %w[text-gray-400 transition hover:text-gray-900],
                                "actions" => { "click" => { "type" => "account.logout" } },
                                "visibleWhen" => { "source" => "form", "field" => "signedIn", "operator" => "isTrue" } }),
      },
    }
  end

  def self.footer_document(store_name)
    {
      "id" => "site-footer", "slug" => FOOTER_SLUG, "title" => "Site footer",
      "rootNodeId" => "ftr-body",
      "nodes" => {
        "ftr-body" => node("ftr-body", "base.body", %w[ftr-bar]),
        # `mt-auto` does nothing unless the page is a flex column, so the
        # separation is a border and generous top margin instead — which works
        # on every page regardless of how the merchant laid it out.
        "ftr-bar" => node("ftr-bar", "base.container", %w[ftr-inner], {},
                          { "classIds" => %w[mt-24 w-full border-t border-gray-200 bg-gray-50] }),
        "ftr-inner" => node("ftr-inner", "base.container", %w[ftr-brand ftr-links ftr-legal], {},
                            { "classIds" => %w[mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12] }),
        "ftr-brand" => text("ftr-brand", "p", store_name, %w[text-base font-semibold text-gray-900]),
        "ftr-links" => node("ftr-links", "base.container", %w[ftr-shop ftr-account ftr-contact], {},
                            { "classIds" => %w[flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600] }),
        "ftr-shop" => link("ftr-shop", "Shop", "/", %w[transition hover:text-gray-900]),
        "ftr-account" => link("ftr-account", "My orders", "/account", %w[transition hover:text-gray-900]),
        "ftr-contact" => link("ftr-contact", "Contact", "/contact", %w[transition hover:text-gray-900]),
        "ftr-legal" => text("ftr-legal", "p", "#{store_name} · Powered by Dukafi",
                            %w[border-t border-gray-200 pt-6 text-xs text-gray-400]),
      },
    }
  end
end
