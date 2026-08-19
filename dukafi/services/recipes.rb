# Operational recipes — the Dukafi-specific HTML an agent cannot guess.
#
# Products and collections are ordinary CRUD. Loops, CMS binds, forms, and
# cart state are not: they are `data-dukafy-*` overlays. Assist already
# teaches those in its system prompt. External agents (Cursor, Lovable)
# only see MCP, so this snapshot is how they learn — filled with THIS
# store's collection slugs and table columns, then pasted into apply_edits.
module Recipes
  TOPICS = %w[loops cms forms cart overlays components seo design].freeze
  # Membership collections used to spotlight SKUs on home (not a pin primitive).
  SPOTLIGHT_SLUGS = %w[featured on-sale deals sale clearance].freeze

  module_function

  def snapshot(topic = nil)
    wanted = topic.to_s.strip.downcase
    wanted = nil if wanted.empty?
    raise ArgumentError, "topic must be one of: #{TOPICS.join(', ')}." if wanted && !TOPICS.include?(wanted)

    store = store_index
    recipes = all_recipes(store)
    recipes = recipes.select { |row| row["topic"] == wanted } if wanted

    {
      "note" => "These overlays are Dukafi-specific. Paste the html into apply_edits. " \
                "Do not invent {{ }} templates, React, or module ids. One repeated card " \
                "inside a loop; an optional pagination sibling is not repeated. " \
                "Call publish when the draft looks right. For 'rank for …' / optimize SEO, " \
                "or to put a product on the homepage, pass topic seo or loops.",
      "topics" => TOPICS,
      "thisStore" => store,
      "recipes" => recipes,
    }
  end

  def summary
    store = store_index
    sources = ["products", "current-query", "currentEntry.related"]
    store["collections"].each { |row| sources << "collections/#{row['slug']}.products" }
    store["tables"].each { |row| sources << "data/#{row['slug']}" }
    {
      "topics" => TOPICS,
      "loopSources" => sources.first(12),
      "note" => "Call get_recipes before a product grid, search, homepage spotlight, " \
                "CMS loop, form, cart, saved component, SEO / 'rank for' job, or a " \
                "vague restyle. Pass topic (loops, cms, forms, cart, overlays, " \
                "components, seo, design) to get one family.",
    }
  end

  def store_index
    {
      "collections" => Collection.order(:sort_order, :slug).limit(12).map { |row|
        { "slug" => row.slug, "title" => row.title.to_s }
      },
      "tables" => CustomTable.order(:name).limit(12).map { |table|
        {
          "slug" => table.slug,
          "name" => table.name.to_s,
          "columns" => table.column_list.first(12).filter_map { |col|
            next unless col.is_a?(Hash)

            id = col["id"].to_s
            next if id.empty?

            { "id" => id, "type" => col["type"].to_s, "label" => col["label"].to_s }
          },
        }
      },
      "components" => VisualComponents.roster(SiteState.first&.site).first(12).map { |row|
        { "id" => row["id"].to_s, "name" => row["name"].to_s }
      },
    }
  end

  def all_recipes(store)
    collection = store["collections"].first
    spotlight = merchandising_collection(store)
    table = store["tables"].first
    component = store["components"].first
    [
      product_grid,
      search_grid,
      collection_grid(collection),
      homepage_spotlight(spotlight),
      related_grid,
      rank_for(collection),
      page_seo,
      quiet_section,
      quiet_hero,
      cms_loop(table),
      cms_form(table),
      account_form,
      product_card,
      cart_drawer,
      insert_component(component),
    ]
  end

  def merchandising_collection(store)
    collections = Array(store["collections"])
    SPOTLIGHT_SLUGS.each do |slug|
      found = collections.find { |row| row["slug"] == slug }
      return found if found
    end
    collections.first
  end

  def product_grid
    recipe(
      "product-grid", "loops",
      "Product grid — every active product",
      <<~HTML.strip,
        <section id="products" class="w-full px-6 py-16 md:py-24">
          <div class="mx-auto max-w-6xl">
            <div data-dukafy-loop="products" data-dukafy-loop-per-page="8" class="grid grid-cols-2 gap-6 md:grid-cols-4">
              <article class="rounded-lg border p-4">
                <a data-dukafy-bind-href="currentEntry.href"><img data-dukafy-bind-src="currentEntry.imageUrl" alt="" class="w-full"></a>
                <h3 data-dukafy-bind-text="currentEntry.title" class="mt-2 font-medium"></h3>
                <p data-dukafy-bind-text="currentEntry.priceDisplay" class="text-sm"></p>
              </article>
              #{pager_nav}
            </div>
          </div>
        </section>
      HTML
      [
        "Exactly one repeated child inside the loop — that child is the card.",
        "A sibling with data-dukafy-pagination (or id=pagination) is NOT looped. Style it with any elements. Attach data-dukafy-action=loop.previous / loop.next to a link, button, div, or text.",
        "Give the wrapping section an id (products, featured, …). Pager links keep that hash so the visitor stays on the section instead of jumping to the top of the page.",
        "Hide prev/next with loop.hasPrevious / loop.hasNext. Optional binds: loop.page, loop.pageCount. Use col-span-full so the pager spans the grid.",
        "Inside a loop, currentEntry is the product. Fields: title, priceDisplay, imageUrl, href, slug, stock, inCart, cartQuantity.",
        "Options: data-dukafy-loop-per-page, data-dukafy-loop-order-by (price|title|newest|manual), data-dukafy-loop-direction=desc.",
        "The wrapping section is full width. Do not put this grid inside max-w-3xl — that is the about column, not a catalogue.",
      ],
    )
  end

  def search_grid
    recipe(
      "search-grid", "loops",
      "Search results — products matching /search?keyword=",
      <<~HTML.strip,
        <form action="/search" method="get" class="flex gap-2">
          <label class="sr-only">Search products</label>
          <input type="search" name="keyword" placeholder="Search products" data-dukafy-bind-value="route.query.keyword" class="flex-1 rounded-full border px-4 py-2">
          <button type="submit" class="rounded-full bg-black px-5 py-2 text-white">Search</button>
        </form>
        <section id="search-results">
          <div data-dukafy-loop="current-query" data-dukafy-loop-per-page="12" class="mt-8 grid grid-cols-2 gap-6 md:grid-cols-4">
            <article class="rounded-lg border p-4">
              <a data-dukafy-bind-href="currentEntry.href"><img data-dukafy-bind-src="currentEntry.imageUrl" alt="" class="w-full"></a>
              <h3 data-dukafy-bind-text="currentEntry.title" class="mt-2 font-medium"></h3>
              <p data-dukafy-bind-text="currentEntry.priceDisplay" class="text-sm"></p>
            </article>
            #{pager_nav}
          </div>
        </section>
      HTML
      [
        "The dedicated search page lives at slug search. The form MUST GET /search with name=keyword — not q.",
        "data-dukafy-loop=current-query is request-time: it filters active products by that keyword. Empty keyword shows no rows; a keyword with no hits is HTTP 404 (the search page still renders; no JSON-LD).",
        "Search is always noindex, follow and is omitted from the sitemap. Do not use /search?keyword= to rank. For 'rank for X' see topic seo.",
        "Pager: data-dukafy-pagination sibling, loop.next / loop.previous, wrap the results in a section with an id so paging does not jump to the top.",
      ],
    )
  end

  def collection_grid(collection)
    slug = collection ? collection["slug"] : "featured"
    recipe(
      "collection-grid", "loops",
      collection ? "Products in collection #{slug}" : "Products in one collection (create a collection first)",
      <<~HTML.strip,
        <section id="#{escape(slug)}" class="w-full px-6 py-16 md:py-24">
          <div class="mx-auto max-w-6xl">
            <div data-dukafy-loop="collections/#{slug}.products" data-dukafy-loop-per-page="8" class="grid grid-cols-2 gap-6 md:grid-cols-4">
              <article class="rounded-lg border p-4">
                <a data-dukafy-bind-href="currentEntry.href"><img data-dukafy-bind-src="currentEntry.imageUrl" alt="" class="w-full"></a>
                <h3 data-dukafy-bind-text="currentEntry.title" class="mt-2 font-medium"></h3>
                <p data-dukafy-bind-text="currentEntry.priceDisplay" class="text-sm"></p>
              </article>
              #{pager_nav}
            </div>
          </div>
        </section>
      HTML
      [
        "Bind by collection SLUG, not title. Call list_collections if you need another.",
        "Nested lists use currentEntry.variants or currentEntry.images inside this card.",
        "A product can belong to many collections. Spotlight it on home by ALSO adding it to Featured or on-sale — see homepage-spotlight. Do not invent a pin-inside-loop overlay.",
        "Collection listings must not use standalone Product schema as the page type. Page 1 with products is indexable; empty or page 2+ is noindex.",
        "The section id is the scroll target for pager links. data-dukafy-pagination is not repeated; style next/previous however you want.",
      ],
    )
  end

  def homepage_spotlight(collection)
    slug = collection ? collection["slug"] : "featured"
    heading = collection ? collection["title"] : "Featured"
    recipe(
      "homepage-spotlight", "loops",
      collection ? "Homepage spotlight — #{heading} (collections/#{slug}.products)" :
        "Homepage spotlight (create a Featured or on-sale collection first)",
      <<~HTML.strip,
        <section id="#{escape(slug)}" class="w-full px-6 py-16 md:py-24">
          <div class="mx-auto max-w-6xl">
            <h2 class="text-xl font-semibold">#{escape(heading)}</h2>
            <div data-dukafy-loop="collections/#{slug}.products" data-dukafy-loop-per-page="4" class="mt-6 grid grid-cols-2 gap-6 md:grid-cols-4">
            <article class="rounded-lg border p-4">
              <a data-dukafy-bind-href="currentEntry.href"><img data-dukafy-bind-src="currentEntry.imageUrl" alt="" class="w-full"></a>
              <h3 data-dukafy-bind-text="currentEntry.title" class="mt-2 font-medium"></h3>
              <p data-dukafy-bind-text="currentEntry.priceDisplay" class="text-sm"></p>
            </article>
            #{pager_nav}
          </div>
          </div>
        </section>
      HTML
      [
        "'Put this product on the homepage' / 'it is on discount, make it seen' is membership, not a pin. Keep the SKU in its category collection AND add it to Featured, on-sale, deals, or clearance.",
        "set_collection_products REPLACES the whole membership list. Call list_collections first, keep every slug that should stay, then append the new one.",
        "On the homepage (slug index), loop collections/<slug>.products — paste this html via apply_edits. There is no data-dukafy-loop=discounts: list_discounts is checkout codes only. A sale row is a collection of those SKUs.",
        "One SKU only: still a one-item collection loop. Do not invent module ids or a pin-this-SKU overlay.",
        "The section id (featured, on-sale, …) is required so Next/Previous stay on this block instead of scrolling the visitor to the top of the page. Style the data-dukafy-pagination sibling freely.",
      ],
    )
  end

  def rank_for(collection)
    slug = collection ? collection["slug"] : "keyword"
    recipe(
      "rank-for", "seo",
      "Rank for a keyword — indexable collection or landing page, never /search",
      <<~HTML.strip,
        <section class="w-full px-6 py-16 md:py-24">
          <div class="mx-auto max-w-3xl">
            <h1 class="text-3xl font-semibold">Write a unique heading for this phrase</h1>
            <p class="mt-4 text-gray-600">One short intro in the merchant's words. Do not invent shipping, origin stories, or reviews.</p>
          </div>
          <div class="mx-auto mt-10 max-w-6xl">
            <div data-dukafy-loop="collections/#{slug}.products" data-dukafy-loop-per-page="12" class="grid grid-cols-2 gap-6 md:grid-cols-4">
              <article class="rounded-lg border p-4">
                <a data-dukafy-bind-href="currentEntry.href"><img data-dukafy-bind-src="currentEntry.imageUrl" alt="" class="w-full"></a>
                <h2 data-dukafy-bind-text="currentEntry.title" class="mt-2 font-medium"></h2>
                <p data-dukafy-bind-text="currentEntry.priceDisplay" class="text-sm"></p>
              </article>
              #{pager_nav}
            </div>
          </div>
        </section>
      HTML
      [
        "When the merchant says 'rank for …', 'optimize SEO', or 'appear on Google for', call get_recipes topic=seo. Do not send that phrase to /search?keyword= — search is always noindex and is not in the sitemap.",
        "Prefer a collection whose title matches the phrase (create_collection or reuse). Put matching products in it. set_collection_products replaces membership — list current members first.",
        "Collection URLs (/collections/<slug>) already get unique title/description from the collection name and its products. update_collection for that copy. Page 1 with products is index,follow; empty or page 2+ is noindex. Do not put Product schema on a listing grid.",
        "Optional CMS landing page: create_page, paste this loop, unique H1, then set_page_seo. Unique title/description per page — never meta keywords, never the same meta on every page. Do not set_page_seo on product-template or collection-template; those URLs use catalogue copy.",
        "Product PDPs: unique title and descriptionHtml via update_product; share image via set_product_og_image. Do not invent facts the merchant did not give.",
        "After URL or catalogue changes, publish (or generate_sitemaps). Search Console uses /sitemap.xml. Gated pages and search are omitted.",
      ],
    )
  end

  def page_seo
    recipe(
      "page-seo", "seo",
      "Unique SEO title, description, and share image on a CMS page",
      "",
      [
        "CMS pages: set_page_seo with slug, seoTitle, seoDescription, optional ogImage (a path from list_media). Empty string clears that field. Draft until publish.",
        "seoTitle is the search-result title (leave blank to use the page title). seoDescription is a short pitch — what this page is, who it is for. Not a keyword list. Never emit <meta name=\"keywords\"> or a <title> tag in apply_edits.",
        "Collections and products do not use this tool: update_collection / update_product, and set_product_og_image / set_collection_image.",
        "Search (slug search) is noindex regardless of these fields. Ranking copy belongs on an indexable collection or landing page (recipe rank-for).",
      ],
    )
  end

  def quiet_section
    recipe(
      "quiet-section", "design",
      "Quiet storefront section — the default when the merchant is vague",
      <<~HTML.strip,
        <section class="w-full bg-white px-6 py-16 md:py-24">
          <div class="mx-auto max-w-3xl">
            <p class="text-sm tracking-wide text-neutral-500">A short kicker</p>
            <h2 class="mt-3 text-3xl font-semibold tracking-tight text-neutral-900">One clear heading</h2>
            <p class="mt-4 text-base leading-relaxed text-neutral-600">One or two sentences. Products and photos carry color. This block stays plain.</p>
            <a href="/collections/featured" class="mt-8 inline-block rounded-lg bg-black px-5 py-2.5 text-white">Shop the range</a>
          </div>
        </section>
      HTML
      [
        "Vague prompts ('make it look better', 'build me a landing page', 'add a section') use this: white canvas, one ink, one muted body, one black (or text-primary / bg-primary) accent. Do not invent a palette.",
        "Never bg-gradient-*, from-/via-/to-*, indigo/purple/pink/cyan washes, blobs, backdrop-blur, shadow-xl, or emoji headings. 'Look better' is more space and fewer colors — setClasses — not a new wrapper.",
        "If get_design_tokens lists primary, swap bg-black/text-neutral-900 for bg-primary/text-primary. Match the page's px/py and type size when a pattern already exists; do not copy a decorative gradient from a sampled section.",
        "Composition: this recipe is the ABOUT / CONTACT column (max-w-3xl inside a full-width section). Hero uses quiet-hero (split). Product grids stay full width (max-w-6xl) — never wrap a loop in max-w-3xl.",
        "Photos and product loops sit on this plain ground. Do not put a gradient behind a grid.",
      ],
    )
  end

  def quiet_hero
    recipe(
      "quiet-hero", "design",
      "Quiet hero — type and photo side by side, not a stacked article",
      <<~HTML.strip,
        <section class="w-full bg-white px-6 py-16 md:py-24">
          <div class="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
            <div>
              <h1 class="text-4xl font-semibold tracking-tight text-neutral-900 md:text-5xl">One promise from the catalogue</h1>
              <p class="mt-4 text-base leading-relaxed text-neutral-600">One sentence. No origin story. No extra palette.</p>
              <a href="/collections/featured" class="mt-8 inline-block rounded-lg bg-black px-5 py-2.5 text-white">Shop the range</a>
            </div>
            <img alt="" class="w-full">
          </div>
        </section>
      HTML
      [
        "Vague landing pages start here, not with a gradient banner. Copy on one side, one photo on the other (md:grid-cols-2). On a small screen they stack.",
        "Set the img src from list_media (or currentEntry.imageUrl inside a loop). Never placehold.co, unsplash, or an invented URL.",
        "Do not put bg-gradient-* behind this. The photo carries color. If SITE TOKENS list primary, use bg-primary on the button.",
      ],
    )
  end

  def related_grid
    recipe(
      "related-grid", "loops",
      "Related products — other products in the same collection, on a product page",
      <<~HTML.strip,
        <section id="related" class="mt-16">
          <h2 class="text-xl font-semibold">Related products</h2>
          <div data-dukafy-loop="currentEntry.related" data-dukafy-loop-per-page="4" class="mt-6 grid grid-cols-2 gap-6 md:grid-cols-4">
            <article class="rounded-lg border p-4">
              <a data-dukafy-bind-href="currentEntry.href"><img data-dukafy-bind-src="currentEntry.imageUrl" alt="" class="w-full"></a>
              <h3 data-dukafy-bind-text="currentEntry.title" class="mt-2 font-medium"></h3>
              <p data-dukafy-bind-text="currentEntry.priceDisplay" class="text-sm"></p>
            </article>
            #{pager_nav}
          </div>
        </section>
      HTML
      [
        "Put this on the product template, below the buy button. currentEntry is the product being viewed; currentEntry.related is other products that share a collection with it.",
        "A product in both a tight category (Milk) and Featured lists Milk siblings first. The current product is never included.",
        "Drop the section if you do not want related products on this shop.",
      ],
    )
  end

  def cms_loop(table)
    slug = table ? table["slug"] : "team"
    binds = cms_bind_fields(table)
    inner = binds.empty? ? '<p data-dukafy-bind-text="currentEntry.name"></p>' : binds.join("\n    ")
    recipe(
      "cms-loop", "cms",
      table ? "Loop CMS table #{slug}" : "Loop a CMS table (create_data_table first)",
      <<~HTML.strip,
        <div data-dukafy-loop="data/#{slug}" class="grid gap-6 md:grid-cols-3">
          <article class="rounded-lg border p-4">
            #{inner}
          </article>
        </div>
      HTML
      [
        "Source is data/<table-slug>. Column ids become currentEntry.<id>.",
        "Media columns use data-dukafy-bind-src. Text columns use data-dukafy-bind-text.",
        "Call list_data_tables / list_data_rows for the rows. A page loop bakes them at publish.",
      ],
    )
  end

  def cms_form(table)
    slug = table ? table["slug"] : "contact"
    fields = cms_form_fields(table)
    inner = fields.empty? ? '<label>Email</label><input type="email" name="email" required class="rounded border px-3 py-2">' : fields.join("\n  ")
    recipe(
      "cms-form", "cms",
      table ? "Form that writes into table #{slug}" : "Form connected to a CMS table (create the table first)",
      <<~HTML.strip,
        <form data-dukafy-form-mode="cms" data-dukafy-form-id="#{slug}" data-dukafy-target-table="#{slug}" class="flex flex-col gap-3">
          #{inner}
          <button type="submit" class="rounded bg-black px-4 py-2 text-white">Send</button>
        </form>
      HTML
      [
        "data-dukafy-form-mode=cms plus data-dukafy-target-table=<table-slug> is what connects the form. A plain <form> is custom and does not save rows.",
        "Each input name must match a column id on that table.",
        "Account login/register is a different recipe (topic forms) — those use data-dukafy-region=form and an action, not a table.",
      ],
    )
  end

  def account_form
    recipe(
      "account-form", "forms",
      "Sign-in form (account, not CMS)",
      <<~HTML.strip,
        <form data-dukafy-region="form" class="flex flex-col gap-3">
          <p data-dukafy-visible-when="form.hasError:isTrue" data-dukafy-bind-text="form.error" class="text-sm"></p>
          <input type="email" name="email" required class="rounded border px-3 py-2">
          <input type="password" name="password" required class="rounded border px-3 py-2">
          <button type="submit" data-dukafy-action="account.login" class="rounded bg-black px-4 py-2 text-white">Sign in</button>
        </form>
      HTML
      [
        "Wrap account/checkout forms in data-dukafy-region=form or errors have nowhere to render.",
        "Verbs: account.login, account.register, account.logout, cart.createOrder, payment.initiate.",
        "A form that saves CMS rows is topic cms (data-dukafy-form-mode=cms), not this recipe.",
      ],
    )
  end

  def product_card
    recipe(
      "product-card-cart", "cart",
      "Product card with add-to-cart and in-cart quantity",
      <<~HTML.strip,
        <article class="rounded-lg border p-4">
          <a data-dukafy-bind-href="currentEntry.href"><img data-dukafy-bind-src="currentEntry.imageUrl" alt="" class="w-full"></a>
          <h3 data-dukafy-bind-text="currentEntry.title" class="mt-2 font-medium"></h3>
          <p data-dukafy-bind-text="currentEntry.priceDisplay"></p>
          <div data-dukafy-region="cart" class="mt-3">
            <button data-dukafy-action="cart.addItem" data-dukafy-action-quantity="1"
                    data-dukafy-visible-when="currentEntry.inCart:isFalse"
                    class="w-full rounded bg-black px-4 py-2 text-white">Add to cart</button>
            <div data-dukafy-visible-when="currentEntry.inCart:isTrue" class="flex items-center gap-2">
              <button data-dukafy-action="cart.setQuantity" data-dukafy-action-delta="-1" class="rounded border px-3 py-1">-</button>
              <span data-dukafy-bind-text="currentEntry.cartQuantity" class="min-w-8 text-center"></span>
              <button data-dukafy-action="cart.setQuantity" data-dukafy-action-delta="1" class="rounded border px-3 py-1">+</button>
            </div>
          </div>
        </article>
      HTML
      [
        "data-dukafy-region=cart is required for per-visitor state. Without it, inCart is always false.",
        "Two elements with opposite visible-when is how either/or works. A false condition renders nothing.",
        "Put this card inside a product loop (topic loops) so currentEntry is a product.",
      ],
    )
  end

  def cart_drawer
    recipe(
      "cart-drawer", "overlays",
      "Cart drawer: overlay + cart.items loop + totals",
      <<~HTML.strip,
        <button data-dukafy-action="overlay.open" data-dukafy-action-target="CART_OVERLAY_UID" class="rounded border px-3 py-2">Cart</button>
        <div data-dukafy-overlay="sheet-right" data-dukafy-region="cart" class="ml-auto h-full w-full max-w-md bg-white p-6">
          <button data-dukafy-action="overlay.close" class="ml-auto block text-2xl">&times;</button>
          <p data-dukafy-visible-when="cart.isEmpty:isTrue">Your cart is empty.</p>
          <div data-dukafy-loop="cart.items" data-dukafy-visible-when="cart.isEmpty:isFalse">
            <div class="flex justify-between gap-4 py-3">
              <span data-dukafy-bind-text="currentEntry.title"></span>
              <span data-dukafy-bind-text="currentEntry.cartQuantity"></span>
            </div>
          </div>
          <p data-dukafy-bind-text="cart.totalDisplay" class="mt-4 font-medium"></p>
          <a href="/checkout" data-dukafy-visible-when="cart.isEmpty:isFalse" class="mt-4 block rounded bg-black px-4 py-2 text-center text-white">Checkout</a>
        </div>
      HTML
      [
        "Insert the overlay first. read_page to get its node id, then set data-dukafy-action-target on the trigger to that uid.",
        "Variants: modal, sheet-left, sheet-right, sheet-bottom.",
        "cart fields: count, isEmpty, subtotalDisplay, discountDisplay, totalDisplay, currency.",
      ],
    )
  end

  def insert_component(component)
    id = component ? component["id"] : "cmp_newsletter"
    name = component ? component["name"] : "Newsletter form"
    recipe(
      "insert-component", "components",
      component ? "Insert saved component #{name}" : "Insert a saved component (create one first)",
      %(<div data-dukafy-component="#{escape(id)}"></div>),
      [
        "Call list_components before rebuilding a newsletter, promo bar, or other repeated section.",
        "This tag is the instance. Edits to the component (update_component, or Edit in the canvas) update every page that uses it.",
        "Do not copy the inner HTML onto the page unless the merchant wants a one-off — that is Detach, which is editor-only.",
        "Create with create_component, then paste this tag via apply_edits.",
      ],
    )
  end

  def cms_bind_fields(table)
    return [] unless table

    table["columns"].first(4).filter_map do |col|
      id = col["id"]
      next if id.to_s.empty?

      if col["type"].to_s == "media"
        %(<img data-dukafy-bind-src="currentEntry.#{id}" alt="" class="w-full">)
      else
        %(<p data-dukafy-bind-text="currentEntry.#{id}"></p>)
      end
    end
  end

  def cms_form_fields(table)
    return [] unless table

    table["columns"].reject { |col| col["type"].to_s == "media" }.first(4).map do |col|
      id = col["id"]
      label = col["label"].to_s
      label = id if label.empty?
      type = id.include?("email") ? "email" : "text"
      if col["type"].to_s == "longText"
        %(<label>#{escape(label)}</label>\n  <textarea name="#{id}" class="rounded border px-3 py-2"></textarea>)
      else
        %(<label>#{escape(label)}</label>\n  <input type="#{type}" name="#{id}" class="rounded border px-3 py-2">)
      end
    end
  end

  def pager_nav
    <<~HTML.strip
      <nav data-dukafy-pagination class="col-span-full mt-8 flex items-center justify-center gap-4">
        <a data-dukafy-action="loop.previous" data-dukafy-visible-when="loop.hasPrevious:isTrue" class="rounded border px-4 py-2">Previous</a>
        <a data-dukafy-action="loop.next" data-dukafy-visible-when="loop.hasNext:isTrue" class="rounded border px-4 py-2">Next</a>
      </nav>
    HTML
  end

  def recipe(id, topic, title, html, rules)
    {
      "id" => id,
      "topic" => topic,
      "title" => title,
      "html" => html,
      "rules" => rules,
    }
  end

  def escape(value)
    value.to_s.gsub("&", "&amp;").gsub("<", "&lt;").gsub(">", "&gt;").gsub('"', "&quot;")
  end
end
