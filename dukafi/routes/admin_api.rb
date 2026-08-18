require "bcrypt"
require "digest"
require "fileutils"
require "json"
require "securerandom"

class AdminApi < Roda
  plugin :all_verbs
  plugin :sessions, secret: SessionSecret.fetch
  plugin :json
  plugin :json_parser

  CAPABILITIES = %w[
    content.create content.edit.any content.manage content.publish.any
    data.custom.tables.read data.system.tables.read media.delete media.read media.replace media.write
    pages.edit pages.publish site.read site.content.edit site.structure.edit site.style.edit system
  ].freeze

  USER_PREFERENCE_KEYS = %w[dashboard-layout module-inserter].freeze
  MODULE_INSERTER_KINDS = %w[module savedLayout component].freeze

  def error_payload(code, message)
    { error: { code: code, message: message } }
  end

  # 204 means "no content", and Rack forbids a content-type header on one.
  # Roda's `json` plugin stamps `application/json` onto every response, so
  # every delete endpoint here was emitting an invalid 204 — which
  # `Rack::Lint` turns into a 500 in development. The delete itself had
  # already committed by then, which is why the row vanished on refresh while
  # the request looked like it failed.
  #
  # Halting with an explicit triplet is the only way to be sure: it bypasses
  # the response object the plugin has already decorated.
  def no_content!
    request.halt([204, {}, []])
  end

  # A font request as posted by the picker. Everything is re-checked against
  # the bundled directory inside `GoogleFonts.resolve` — this only shapes it.
  def font_selection(request_scope)
    {
      family: request_scope.params["family"].to_s,
      variants: Array(request_scope.params["variants"]),
      subsets: Array(request_scope.params["subsets"]),
    }
  end

  FONT_INSTALL_ERRORS = {
    "unknown_family" => [422, "unknown_font_family", "That font is not in the bundled Google directory."],
    "no_faces" => [422, "no_font_faces", "Google returned no matching faces for that selection."],
    "download_failed" => [502, "font_download_failed", "Could not download the font files from Google."],
  }.freeze

  # Reason -> HTTP. `not_configured` is 409 rather than 500: nothing is broken,
  # the merchant simply has not chosen a model yet, and the editor uses that to
  # point them at the settings form instead of showing a failure.
  AI_CHAT_ERRORS = {
    "not_configured" => [409, "ai_not_configured", "Add a model and base URL in the AI plugin settings first."],
    "invalid_base_url" => [422, "ai_invalid_base_url",
                           "That base URL is not usable. Use https://, or http:// only for a local model."],
    "empty_conversation" => [422, "ai_empty_conversation", "There was nothing to send."],
    "request_too_large" => [413, "ai_request_too_large", "That conversation is too large to send."],
    "provider_rejected" => [502, "ai_provider_rejected", "The provider rejected the API key."],
    "provider_unreachable" => [502, "ai_provider_unreachable", "Could not reach the model."],
    "empty_reply" => [502, "ai_empty_reply", "The model returned nothing."],
  }.freeze

  # Timestamps reach us as a Time from a model read and as a String from an
  # aggregate; the client only ever wants one shape.
  def iso_time(value)
    return nil if value.nil?

    value.respond_to?(:iso8601) ? value.iso8601 : value.to_s
  end

  def ai_chat_error(reason)
    AI_CHAT_ERRORS.fetch(reason, [502, "ai_provider_error", "The model could not answer."])
  end

  def font_install_error(reason)
    FONT_INSTALL_ERRORS.fetch(reason, [502, "font_install_failed", "Could not install that font."])
  end

  # Turn posted media-asset ids into FontFile entries.
  #
  # The PATH comes from the asset row, never from the request — a client that
  # supplied its own path could point an `@font-face src` anywhere. The format
  # is derived from the stored extension for the same reason.
  FONT_FORMAT_FOR_EXTENSION = {
    ".woff2" => "woff2", ".woff" => "woff", ".ttf" => "ttf", ".otf" => "otf"
  }.freeze

  def custom_font_files(entries)
    return [] unless entries.is_a?(Array)

    entries.filter_map do |entry|
      next unless entry.is_a?(Hash)

      variant = entry["variant"].to_s
      next unless variant.match?(/\A\d{3}(italic)?\z/)

      asset = MediaAsset[entry["mediaAssetId"].to_s]
      next unless asset

      format = FONT_FORMAT_FOR_EXTENSION[File.extname(asset.path.to_s).downcase]
      next unless format

      {
        "variant" => variant, "subset" => "latin",
        "path" => "/#{asset.path}", "format" => format,
        "mediaAssetId" => asset.id.to_s,
      }
    end
  end

  def halt_json(status, code, message)
    request.halt([status, { "content-type" => "application/json" }, [JSON.generate(error_payload(code, message))]])
  end

  def plugin_page_payload
    yield
  rescue PluginPages::Error => error
    halt_json(error.http_status, error.code, error.message)
  end

  def catalogue_status(error)
    case error.code
    when "plugin_not_found" then 404
    when "unreachable", "too_many_redirects" then 502
    else 422
    end
  end

  def current_admin
    admin_id = session["admin_id"]
    admin_id && Admin[admin_id]
  end

  def require_admin!
    current_admin || halt_json(401, "unauthorized", "Authentication required")
  end

  def valid_user_preference?(key, value)
    return false unless value.is_a?(Hash)

    case key
    when "module-inserter"
      favorites = value["favorites"]
      favorites.is_a?(Array) && favorites.length <= 12 && favorites.all? do |item|
        item.is_a?(Hash) && MODULE_INSERTER_KINDS.include?(item["kind"]) &&
          item["id"].is_a?(String)
      end
    when "dashboard-layout"
      items = value["items"]
      value.key?("onboardingDismissed") && [true, false].include?(value["onboardingDismissed"]) &&
        items.is_a?(Array) && items.all? do |item|
          item.is_a?(Hash) && item["id"].is_a?(String) && item["size"].is_a?(Numeric) &&
            %w[rows col row].all? { |field| !item.key?(field) || item[field].is_a?(Numeric) }
        end && (!value.key?("libraryHeight") || value["libraryHeight"].is_a?(Numeric))
    else
      false
    end
  end

  def user_payload(admin)
    timestamp = admin.created_at.utc.iso8601
    role = {
      id: "owner", slug: "owner", name: "Owner", description: "Store owner",
      isSystem: true, capabilities: CAPABILITIES,
    }
    {
      id: admin.id.to_s, email: admin.email, displayName: admin.email.split("@").first,
      status: "active", role: role, capabilities: CAPABILITIES, lastLoginAt: nil,
      failedLoginCount: 0, lockedUntil: nil, passwordUpdatedAt: nil, mfaEnabled: false,
      mfaEnabledAt: nil, mfaRecoveryCodesRemaining: 0, stepUpAuthMode: "disabled",
      stepUpWindowMinutes: 15, avatarMediaId: nil, avatarUrl: nil,
      gravatarHash: Digest::SHA256.hexdigest(admin.email.strip.downcase),
      createdAt: timestamp, updatedAt: admin.updated_at.utc.iso8601,
    }
  end

  def data_row(page)
    document = page.document_data
    now = page.updated_at.utc.iso8601
    {
      id: page.id.to_s, tableId: "pages",
      # `page`, `template` or `partial`. The editor needs it to tell the site
      # header and footer apart from ordinary pages — it composes them around
      # whatever is being edited, the way the bake does.
      kind: page.kind,
      cells: {
        title: page.title, slug: page.slug,
        body: { nodes: document.fetch("nodes"), rootNodeId: document.fetch("rootNodeId") },
      },
      slug: page.slug, status: page.status == "published" ? "published" : "draft", seq: page.seq.to_i,
      # Publication properties, like `status` — they live on the row, not in
      # the document, because they describe how the page is SERVED rather
      # than what is on it.
      access: page.access, authRedirect: page.auth_redirect,
      authorUserId: nil, createdByUserId: nil, updatedByUserId: nil, publishedByUserId: nil,
      author: nil, createdBy: nil, updatedBy: nil, publishedBy: nil,
      createdAt: page.created_at.utc.iso8601, updatedAt: now, publishedAt: nil,
      scheduledPublishAt: nil, deletedAt: nil,
    }
  end

  # One discount row, as both the table and the edit form need it.
  #
  # `status` and the performance figures come from the same places the MCP
  # tools read them — `McpDiscountTools.status_of` and `DiscountWrites` — so a
  # merchant looking at this screen and an agent calling `list_discounts` can
  # never be told different things about the same code.
  def discount_payload(discount)
    {
      id: discount.id.to_s,
      code: discount.code,
      kind: discount.kind,
      value: discount.value,
      status: McpDiscountTools.status_of(discount),
      startsAt: discount.starts_at&.utc&.iso8601,
      endsAt: discount.ends_at&.utc&.iso8601,
      usageLimit: discount.usage_limit,
      scope: DiscountWrites.scope_of(discount),
    }.merge(DiscountWrites.performance(discount).transform_keys(&:to_sym))
  end

  def review_payload(review)
    {
      id: review.id.to_s,
      authorName: review.author_name,
      rating: review.rating,
      body: review.body,
      status: review.approved? ? "approved" : "pending",
      # A fact about the data, never a settable flag: true only when the
      # review is attached to a real order.
      verified: review.verified?,
      productSlug: review.product&.slug,
      createdAt: review.created_at&.utc&.iso8601,
    }
  end

  def media_payload(asset)
    full_path = Paths.storage_file(asset.path)
    {
      id: asset.id.to_s, filename: File.basename(asset.path), mimeType: asset.mime,
      sizeBytes: File.exist?(full_path) ? File.size(full_path) : 0,
      publicPath: "/#{asset.path}", uploadedByUserId: nil, createdAt: asset.created_at.utc.iso8601,
      width: asset.width, height: asset.height, variants: asset.variants,
      altText: asset.alt_text.to_s, title: asset.title.to_s,
      caption: asset.caption.to_s, tags: asset.tags,
    }
  end

  def commerce_product_payload(product)
    {
      id: product.id, title: product.title, slug: product.slug,
      status: product.status, descriptionHtml: product.description_document.to_s,
      variants: product.variants.map do |variant|
        {
          id: variant.id, sku: variant.sku, title: variant.title,
          priceCents: variant.price_cents, currency: variant.currency,
          stock: variant.stock, position: variant.position,
          fields: CatalogueFields.hash_for(variant.fields, owner: :variant),
          fieldList: CatalogueFields.list_for(variant.fields, owner: :variant),
        }
      end,
      images: product.media_assets.map do |asset|
        { id: asset.id, publicPath: "/#{asset.path}", width: asset.width, height: asset.height }
      end,
      fields: CatalogueFields.hash_for(product.fields, owner: :product),
      fieldList: CatalogueFields.list_for(product.fields, owner: :product),
    }
  end

  def commerce_order_payload(order)
    submissions = FormSubmission.where(order_id: order.id).order(:id).all
    {
      id: order.id, status: order.status, currency: order.currency,
      email: order.email, phone: order.phone,
      customerId: order.customer_id,
      customerName: order.customer&.name,
      subtotalCents: order.subtotal_cents, discountCents: order.discount_cents,
      shippingCents: order.shipping_cents, totalCents: order.total_cents,
      createdAt: order.created_at.utc.iso8601, updatedAt: order.updated_at.utc.iso8601,
      items: OrderItem.where(order_id: order.id).order(:id).map do |item|
        {
          id: item.id, sku: item.sku, productTitle: item.product_title,
          variantTitle: item.variant_title, quantity: item.quantity,
          unitPriceCents: item.unit_price_cents,
          lineTotalCents: item.unit_price_cents * item.quantity,
        }
      end,
      # Every attempt to pay, newest first. The FAILURES are the point: a
      # merchant chasing "the customer says they paid" needs to see the three
      # refusals and what the provider said about them, not just whether the
      # order is marked paid.
      payments: PaymentAttempt.where(order_id: order.id).reverse(:updated_at, :id).map do |attempt|
        {
          id: attempt.id, provider: attempt.provider, status: attempt.status,
          amountCents: attempt.amount_cents, currency: attempt.currency,
          receipt: attempt.receipt.to_s, reference: attempt.provider_reference.to_s,
          error: attempt.error.to_s,
          createdAt: attempt.created_at&.utc&.iso8601,
          updatedAt: attempt.updated_at&.utc&.iso8601,
        }
      end,
      # Merchant-defined forms filed against this order (delivery address,
      # M-Pesa confirmation, whatever they invented). Payloads are returned as
      # stored — Dukafi never chose their shape, so it can't flatten them.
      submissions: submissions.map do |row|
        { id: row.id, formId: row.form_id, payload: row.payload_data,
          createdAt: row.created_at.utc.iso8601 }
      end,
    }
  end

  def commerce_collection_payload(collection)
    memberships = CollectionProduct.where(collection_id: collection.id).order(:position).all
    {
      id: collection.id, title: collection.title, slug: collection.slug,
      description: collection.description.to_s, sortOrder: collection.sort_order,
      productIds: memberships.map(&:product_id),
    }
  end

  def find_custom_table(identifier)
    if identifier.to_s.match?(/\A\d+\z/)
      CustomTable[identifier.to_i]
    else
      CustomTable.first(slug: identifier.to_s)
    end
  end

  def rebuild_targets_payload(params)
    McpTools.run_list_rebuild_targets(params)
  rescue McpTools::ArgumentError => error
    halt_json(422, "invalid_rebuild_query", error.message)
  end

  # `existing_id` excludes the product being edited from the collision check,
  # so saving a product without touching its slug doesn't rename it.
  # `current_slug` is the slug the product already has (nil when creating).
  # It matters because a slug is a URL: on CREATE a blank one is derived from
  # the title, but on EDIT a blank one KEEPS the existing slug rather than
  # regenerating it. Otherwise renaming a product would silently move its live
  # page, and every inbound link would depend on the redirect table catching it.
  def commerce_product_attributes(params, existing_id: nil, current_slug: nil, existing_fields: "{}")
    title = params.fetch("title", "").strip
    submitted = params.fetch("slug", "").strip.downcase
    slug = if !submitted.empty?
      # A slug the merchant typed is normalised but otherwise respected.
      normalized = Product.slugify(submitted)
      normalized.empty? ? (current_slug || Product.unique_slug(title, exclude_id: existing_id)) : normalized
    elsif current_slug
      current_slug
    else
      Product.unique_slug(title, exclude_id: existing_id)
    end
    {
      title: title,
      slug: slug,
      status: params.fetch("status", "draft"),
      description_document: RichTextSanitizer.call(params.fetch("descriptionHtml", "")),
    }.merge(commerce_fields_attribute(params, existing_fields, :product))
  end

  def commerce_variant_attributes(params, existing_fields: "{}")
    {
      sku: params.fetch("sku", "").strip, title: params.fetch("title", "").strip,
      price_cents: Integer(params.fetch("priceCents", 0)),
      # v1 is single-currency (VISION.md's post-1.0 parking lot defers
      # multi-currency) — the store's configured currency always wins,
      # regardless of what a caller posts, so every variant stays consistent.
      currency: CommerceSettings.current.currency,
      stock: Integer(params.fetch("stock", 0)), position: Integer(params.fetch("position", 0)),
    }.merge(commerce_fields_attribute(params, existing_fields, :variant))
  end

  def commerce_fields_attribute(params, existing, owner)
    incoming = params["fields"]
    return {} if incoming.nil?

    { fields: CatalogueFields.merge(existing, incoming, owner: owner) }
  end

  # Same slug rules as products, and for the same reason: a collection slug
  # is a public URL. Blank on CREATE derives from the title; blank on EDIT
  # keeps the existing slug rather than silently moving a live page.
  def commerce_collection_attributes(params, existing_id: nil, current_slug: nil)
    title = params.fetch("title", "").strip
    submitted = params.fetch("slug", "").strip.downcase
    slug = if !submitted.empty?
      normalized = Collection.slugify(submitted)
      normalized.empty? ? (current_slug || Collection.unique_slug(title, exclude_id: existing_id)) : normalized
    elsif current_slug
      current_slug
    else
      Collection.unique_slug(title, exclude_id: existing_id)
    end
    {
      title: title, slug: slug,
      description: params.fetch("description", "").strip,
      sort_order: Integer(params.fetch("sortOrder", 0)),
    }
  end

  def commerce_settings_payload
    settings = CommerceSettings.current
    { currency: settings.currency, lowStockThreshold: settings.low_stock_threshold }
  end

  def commerce_settings_attributes(params)
    {
      currency: params.fetch("currency", "USD").to_s.strip.upcase,
      low_stock_threshold: Integer(params.fetch("lowStockThreshold", 5)),
    }
  end

  def rebake_product(product, old_slug: nil)
    PartialBake.call(product:, old_slug:).page_count
  end

  def rebake_collection(collection, old_slug: nil)
    PartialBake.call(collection:, old_slug:).page_count
  end

  # v1 is single-currency: changing the store's configured currency must
  # retag every existing variant too, not just ones written after the
  # change (commerce_variant_attributes only enforces the invariant going
  # forward). Re-bakes every affected product so already-published prices
  # update immediately, the same way any other catalog edit does — no
  # separate "Publish" step required.
  def retag_variants_with_store_currency(_old_currency, new_currency)
    product_ids = Variant.exclude(currency: new_currency).distinct.select_map(:product_id)
    Variant.dataset.update(currency: new_currency)
    Product.where(id: product_ids).each { |product| rebake_product(product) }
  end

  # Find the row a client-side page id refers to.
  #
  # Pages loaded FROM the database carry their numeric id. Pages created in the
  # editor (New page, or an import) carry a nanoid, and `"V1StGXR8".to_i` is
  # `0` — so a naive `Page[id.to_i]` found nothing, meaning every save after
  # the first tried to CREATE the page again and died on the unique slug, and
  # every delete silently removed nothing.
  #
  # The stored document keeps whatever id the editor gave it, so that is what
  # a non-numeric id is matched against. Slug is a last resort for rows written
  # before this existed.
  def find_page_for(editor_id, slug = nil)
    id = editor_id.to_s
    return Page[id.to_i] if id.match?(/\A\d+\z/)
    return nil if id.empty?

    by_document = Page.where(JsonPath.text(:document, "id") => id).first
    by_document || (slug && Page.first(slug: slug))
  end

  # Rows this save would overwrite that have moved on since the client loaded
  # them. Empty means the save is safe.
  #
  # Only in `incremental` mode: a `replace` is an import or a bootstrap, which
  # replaces deliberately and has nothing to conflict with.
  # A MISSING base is treated as "no information", not as a conflict.
  #
  # `core/persistence/saveConflict.ts` says a shipped row the client has no
  # base for should also be rejected. That is stricter than is safe to enforce:
  # a client that ships no base seqs at all — an older build, a script, a
  # test — would get a 409 it can never clear, because reloading does not give
  # it a mechanism it lacks. A save that can never succeed is worse than a
  # missed conflict.
  #
  # The case that actually matters is still caught: the editor DOES send bases,
  # so when MCP writes a page the open tab is holding, the tab's base is stale
  # and the overwrite is refused.
  def save_conflicts(state, params)
    return [] unless params["mode"].to_s == "incremental"

    base_seqs = params["baseSeqs"].is_a?(Hash) ? params["baseSeqs"] : {}
    conflicts = []

    # The shell is checked coarsely, and only when the incoming one actually
    # differs — otherwise every save that merely touches a page would collide
    # with any unrelated settings change.
    shell_base = params["shellBaseSeq"]
    if shell_base && params.key?("site") && state.site != params["site"] &&
       state.seq > shell_base.to_i
      conflicts << { table: "site", rowId: "default", seq: state.seq }
    end

    ids = params.fetch("changedPages", []).filter_map { |page| page["id"] } +
          params.fetch("deletedPageIds", [])

    ids.each do |id|
      base = base_seqs[id.to_s]
      next if base.nil?

      page = find_page_for(id)
      # No row means the client is CREATING one — nothing to overwrite.
      next if page.nil? || page.seq.to_i <= base.to_i

      conflicts << { table: "pages", rowId: id.to_s, seq: page.seq.to_i }
    end

    conflicts
  end

  def save_page!(raw)
    page = find_page_for(raw.fetch("id"), raw.fetch("slug"))
    attrs = { slug: raw.fetch("slug"), title: raw.fetch("title"), document: raw }
    if page
      page.update(attrs)
    else
      Page.create(attrs.merge(kind: "page", status: "draft"))
    end
  end

  # Render one page of an UNSAVED editor draft to a standalone HTML document.
  #
  # The editor posts its whole in-memory SiteDocument, so this never reads the
  # Page rows — that's the point: preview must show edits the user hasn't
  # persisted yet. Rendering goes through the same RenderPage + CssCollector
  # pipeline Bake uses, so preview and publish can't drift.
  #
  # CSS is INLINED rather than linked: the client renders the result in an
  # `<iframe sandbox="" srcdoc>`, which has an opaque origin, so a relative
  # `/assets/...` stylesheet href would never resolve.
  def build_runtime_preview(site, page, template_context)
    prefetched = CommercePrefetcher.call
    # entryStack is ordered outermost→innermost; the top frame is `currentEntry`.
    entry_stack = template_context.is_a?(Hash) ? template_context["entryStack"] : nil
    current_entry = entry_stack.is_a?(Array) ? entry_stack.last : nil

    rendered = Dukafi::Publisher::RenderPage.call(
      document: page, registry: Dukafi::Publisher::REGISTRY, site: site,
      prefetched: prefetched, current_entry: current_entry, page_paths: PagePaths.call
    )

    collector = Dukafi::Publisher::CssCollector.new
    collector.add("page-modules", rendered.css)
    bundle = collector.bundle(
      framework_css: Dukafi::Publisher::FrameworkCss.call(site),
      fonts_css: Dukafi::Publisher::FontsCss.call(site),
      style_rules_css: Dukafi::Publisher::StyleRulesCss.call(site),
      tailwind_css: TailwindCompiler.call(
        html: %(<body class="#{rendered.body_classes.join(' ')}">#{rendered.html}</body>),
        site: site
      )
    )

    html = Dukafi::Publisher::HtmlDocument.call(
      # Same title/language/description precedence Bake uses, so what the user
      # previews is what publishing will emit.
      title: site.dig("settings", "metaTitle") || page["title"].to_s,
      body: rendered.html, body_classes: rendered.body_classes,
      language: site.dig("settings", "language") || "en",
      description: site.dig("settings", "metaDescription"),
      css: bundle.content, runtimes: rendered.runtimes
    )

    {
      html: html,
      assets: [{
        path: "assets/#{bundle.filename}", publicPath: "/assets/#{bundle.filename}",
        content: bundle.content, contentType: "text/css",
      }],
      # Deliberately empty: this field describes USER-AUTHORED site scripts
      # (fileId/placement/timing/priority), which Dukafi doesn't have yet.
      # Built-in runtimes like htmx are a different concept and are already
      # emitted as <script> tags inside `html` above — squeezing them in here
      # would fail the client's schema and break preview outright.
      runtimeAssets: { scripts: [] },
      diagnostics: [],
    }
  end

  route do |r|
    r.get("health") { { ok: true } }

    r.on("cms") do
      r.get("setup", "status") do
        has_admin = !Admin.first.nil?
        { hasSite: !SiteState.first.nil?, hasAdmin: has_admin, hasOwner: has_admin, needsSetup: !has_admin }
      end

      r.get("public-site") do
        state = SiteState.first
        { name: state&.site&.fetch("name", nil), faviconUrl: nil }
      end

      r.post("setup") do
        halt_json(409, "already_setup", "Setup is already complete") if Admin.first
        password = r.params.fetch("password", "")
        halt_json(422, "invalid_password", "Password must be at least 12 characters") if password.length < 12
        email = r.params.fetch("email").strip.downcase
        DB.transaction do
          Admin.create(email: email, password_digest: BCrypt::Password.create(password))
          StarterSite.create!(name: r.params.fetch("siteName", "Dukafi Store"))
        end
        response.status = 201
        { ok: true }
      end

      r.post("login") do
        admin = Admin.first(email: r.params.fetch("email", "").strip.downcase)
        valid = admin && BCrypt::Password.new(admin.password_digest) == r.params.fetch("password", "")
        halt_json(401, "invalid_credentials", "Invalid email or password") unless valid
        session["admin_id"] = admin.id
        { ok: true, mfaRequired: false }
      end

      r.post("logout") do
        session.delete("admin_id")
        { ok: true }
      end

      r.get("me") do
        admin = require_admin!
        { user: user_payload(admin), role: user_payload(admin)[:role], capabilities: CAPABILITIES }
      end


      r.on("me", "preferences", String) do |key|
        admin = require_admin!
        halt_json(400, "invalid_preference_key", "Unknown user preference") unless USER_PREFERENCE_KEYS.include?(key)

        preference = UserPreference.first(admin_id: admin.id, key: key)
        r.get { { value: preference&.value } }
        r.put do
          value = r.params["value"]
          halt_json(422, "invalid_preference", "Invalid user preference value") unless valid_user_preference?(key, value)

          if preference
            preference.value = value
            preference.save
          else
            preference = UserPreference.new(admin_id: admin.id, key: key)
            preference.value = value
            preference.save
          end
          { value: preference.value }
        end
        r.delete do
          preference&.destroy
          { value: nil }
        end
      end

      r.on("publish") do
        require_admin!
        r.get("status") { PublishSite.status }
        r.get("rebuild-targets") { rebuild_targets_payload(r.params) }
        r.post do
          result = PublishSite.call
          { publishedPages: result.published_pages }
        end
      end

      r.post("tailwind", "compile") do
        require_admin!
        classes = r.params["classes"]
        valid = classes.is_a?(Array) && classes.length <= 500 && classes.all? do |name|
          name.is_a?(String) && name.length.between?(1, 200) && !name.match?(/\s/)
        end
        halt_json(422, "invalid_tailwind_classes", "Tailwind classes must be an array of at most 500 class tokens") unless valid

        { css: TailwindCompiler.call(classes: classes) }
      end

      # ── Fonts ───────────────────────────────────────────────────────────
      #
      # Fonts are SELF-HOSTED. Installing downloads the woff2 files once, here,
      # and the published stylesheet points at our own /uploads/ — a storefront
      # never contacts fonts.googleapis.com, so visitor IPs never reach Google.
      # See `GoogleFontInstaller` for why that is worth a download step.
      r.on("fonts") do
        require_admin!

        # The bundled directory snapshot, served rather than imported so the
        # editor stays a thin client and both sides read one file.
        r.get("google") { { families: GoogleFonts.families } }

        r.post("estimate") do
          { **GoogleFontInstaller.estimate(**font_selection(r)) }
        end

        r.post("install") do
          result = GoogleFontInstaller.install(**font_selection(r))
          unless result.ok?
            halt_json(*font_install_error(result.reason))
          end
          { font: result.font }
        end

        # Custom fonts are already in the media library — the binaries were
        # uploaded through the media route. This only turns chosen assets into
        # a FontEntry; nothing is downloaded or written.
        r.post("custom") do
          family = r.params["family"].to_s.strip
          halt_json(422, "invalid_family", "A font family name is required") if family.empty?

          files = custom_font_files(r.params["files"])
          halt_json(422, "no_font_files", "No usable font files were supplied") if files.empty?

          now = (Time.now.to_f * 1000).round
          {
            font: {
              "id" => "font-#{GoogleFontInstaller.family_slug(family)}-#{SecureRandom.hex(4)}",
              "source" => "custom", "family" => family,
              "variants" => files.map { |file| file["variant"] }.uniq,
              "subsets" => ["latin"],
              "files" => files, "category" => "",
              "createdAt" => now, "updatedAt" => now,
            },
          }
        end

        # Reclaims the installed woff2 files. The site document is the
        # client's to update; a family with nothing on disk still succeeds so
        # removing a custom font (whose bytes are shared media assets) is not
        # an error.
        r.delete("family", String) do |family|
          GoogleFontInstaller.remove(family)
          no_content!
        end
      end

      r.post("runtime", "preview") do
        require_admin!
        site = r.params["site"]
        page_id = r.params["pageId"]
        halt_json(422, "invalid_site", "A site document is required") unless site.is_a?(Hash)
        pages = site["pages"]
        halt_json(422, "invalid_site", "Site document has no pages") unless pages.is_a?(Array)

        page = pages.find { |candidate| candidate.is_a?(Hash) && candidate["id"].to_s == page_id.to_s }
        halt_json(404, "page_not_found", "Page #{page_id.inspect} is not in the posted site document") unless page
        unless page["nodes"].is_a?(Hash) && page["rootNodeId"]
          halt_json(422, "invalid_page", "Page #{page_id.inspect} has no node tree to render")
        end

        begin
          build_runtime_preview(site, page, r.params["templateContext"])
        rescue StandardError => e
          # A half-built draft (dangling node ref, bad prop) is normal mid-edit
          # and must read as "preview couldn't build", not a 500 crash.
          halt_json(422, "preview_failed", "Could not build preview: #{e.message}")
        end
      end

      r.get("site") do
        require_admin!
        state = SiteState.first || halt_json(404, "site_not_found", "Site has not been created")
        { site: state.site, seq: state.seq }
      end

      # Just the version, for polling.
      #
      # Deliberately its own route rather than reusing GET /site: an open
      # editor asks this every few seconds, and shipping the whole site
      # document each time to compare one integer would be absurd.
      r.get("site-version") do
        require_admin!
        state = SiteState.first || halt_json(404, "site_not_found", "Site has not been created")
        { seq: state.seq }
      end

      r.get("pages") do
        require_admin!
        ProductTemplate.ensure!
        CollectionTemplate.ensure!
        { rows: Page.order(:kind, :id).map { |page| data_row(page) } }
      end

      # Submissions are schemaless by design, so this returns the payload as
      # stored rather than flattening it into columns Dukafi chose.
      r.get("form-submissions") do
        require_admin!
        rows = FormSubmission.order(Sequel.desc(:created_at)).limit(500).all
        {
          rows: rows.map do |row|
            {
              id: row.id, formId: row.form_id, payload: row.payload_data,
              orderId: row.order_id, customerId: row.customer_id,
              createdAt: row.created_at.utc.iso8601,
            }
          end,
        }
      end

      # Plugin configuration — API tokens, channel ids, endpoints.
      #
      # Secret values are WRITE-ONLY: the admin can set one and see THAT it is
      # set, but the value never travels back to a browser. Sending a token to
      # the client so a form can prefill it is how tokens end up in screen
      # recordings and browser caches.
      # Bearer tokens for machine clients (Cursor, Lovable) to reach
      # /admin/api/mcp. Same rule as plugin secrets above: the token is
      # returned exactly once, by the request that creates it, and is never
      # readable afterwards.
      r.on("tokens") do
        require_admin!
        r.is do
          r.get { { tokens: PersonalAccessToken.order(Sequel.desc(:created_at)).map(&:to_payload) } }

          r.post do
            name = r.params["name"].to_s
            halt_json(422, "name_required", "Give the token a name so you can recognise it later") if name.strip.empty?

            record, plaintext = PersonalAccessToken.issue!(name: name)
            response.status = 201
            # `token` appears here and nowhere else, ever.
            { token: record.to_payload.merge(token: plaintext) }
          end
        end

        r.on(String) do |id|
          token = PersonalAccessToken[id.to_i] || halt_json(404, "token_not_found", "No such token")
          # Revoked rather than deleted: `lastUsedAt` on a revoked row is how
          # a merchant answers "was this being used before I killed it?".
          r.delete do
            token.revoke!
            no_content!
          end
        end
      end

      r.on("plugins") do
        require_admin!
        r.is do
          r.get { { plugins: Dukafi::Plugins.visible.map(&:to_admin_payload) } }
        end

        r.get("catalogue") do
          begin
            PluginCatalogue.list(
              q: r.params["q"],
              category: r.params["category"],
              licensed: r.params["licensed"],
              limit: r.params["limit"],
              offset: r.params["offset"],
            )
          rescue PluginCatalogue::Error => error
            halt_json(catalogue_status(error), error.code, error.message)
          end
        end

        r.post("install") do
          id = r.params["id"].to_s
          halt_json(422, "id_required", "Which plugin?") if id.strip.empty?

          begin
            payload = PluginInstaller.call(id)
            response.status = 201
            { plugin: payload }
          rescue PluginCatalogue::Error, PluginInstaller::Error => error
            halt_json(catalogue_status(error), error.code, error.message)
          end
        end

        r.on(String) do |plugin_id|
          r.post("export") do
            plugin = Dukafi::Plugins.find_visible(plugin_id) ||
                     halt_json(404, "plugin_not_found", "Plugin not found")
            begin
              archive = PluginPackager.call(
                plugin,
                name: r.params["name"] || plugin.name,
                version: r.params["version"] || plugin.version,
              )
            rescue PluginPackager::Error => error
              halt_json(422, error.code, error.message)
            end

            # Bypass the json plugin: this is a gzip, not an object. The
            # checksum is a header rather than a file inside the archive —
            # including it in the tarball would change the digest.
            request.halt([
              200,
              {
                "content-type" => "application/gzip",
                "content-disposition" => %(attachment; filename="#{archive.filename}"),
                "x-checksum-sha256" => archive.sha256,
                "x-plugin-id" => archive.id,
                "x-plugin-name" => archive.name,
                "x-plugin-version" => archive.version,
              },
              [archive.bytes],
            ])
          end

          r.on("pages") do
            visible = Dukafi::Plugins.find_visible(plugin_id) ||
                      halt_json(404, "plugin_not_found", "Plugin not found")
            r.is do
              r.get { { pages: PluginPages.manifest(visible) } }
            end
            r.on(String) do |page_id|
              r.get("data") { plugin_page_payload { PluginPages.data(visible, page_id) } }
              r.on("tables", String) do |table_id|
                r.get do
                  plugin_page_payload do
                    PluginPages.table(
                      visible, page_id, table_id,
                      limit: r.params["limit"], offset: r.params["offset"],
                      query: r.params["q"]
                    )
                  end
                end
              end
              r.on("actions", String) do |action_id|
                r.post do
                  incoming = r.params["params"]
                  incoming = {} unless incoming.is_a?(Hash)
                  plugin_page_payload { PluginPages.action(visible, page_id, action_id, params: incoming) }
                end
              end
              r.get { plugin_page_payload { { page: PluginPages.page(visible, page_id) } } }
            end
          end

          plugin = Dukafi::Plugins.find(plugin_id) || halt_json(404, "plugin_not_found", "Plugin not found")
          r.put("settings") do
            submitted = r.params["settings"]
            halt_json(422, "invalid_settings", "Settings must be an object") unless submitted.is_a?(Hash)

            values = plugin.settings
            plugin.settings_schema.each do |setting|
              next unless submitted.key?(setting.key)

              incoming = submitted[setting.key].to_s
              # An empty submission for a secret means "leave it alone" — the
              # form could not have shown the current value to resubmit.
              next if setting.secret && incoming.empty?

              values[setting.key] = incoming
            end
            { ok: true, configured: values.configured? }
          end

          r.delete do
            visible = Dukafi::Plugins.find_visible(plugin_id) ||
                      halt_json(404, "plugin_not_found", "Plugin not found")
            begin
              PluginUninstaller.call(visible)
            rescue PluginUninstaller::Error => error
              halt_json(422, error.code, error.message)
            end
            no_content!
          end
        end
      end

      r.get("components") { require_admin!; { rows: [] } }
      r.get("layouts") { require_admin!; { rows: [] } }

      r.on("commerce") do
        require_admin!
        r.get("fields") { CatalogueFields.schema_payload }
        r.post("import") do
          upload = r.params["file"]
          tempfile = upload.is_a?(Hash) && (upload[:tempfile] || upload["tempfile"])
          halt_json(422, "file_required", "Choose a CSV file") unless tempfile
          csv = tempfile.read(5_000_001)
          halt_json(422, "file_too_large", "CSV must be 5 MB or smaller") if csv.bytesize > 5_000_000
          result = ProductCsvImporter.call(csv)
          { products: result.products, variants: result.variants }
        rescue ProductCsvImporter::Error => error
          halt_json(422, "invalid_csv", error.message)
        end
        r.on("products") do
          r.is do
            r.get { { products: Product.order(Sequel.desc(:updated_at)).map { |product| commerce_product_payload(product) } } }
            r.post do
              product = Product.create(commerce_product_attributes(r.params))
              response.status = 201
              { product: commerce_product_payload(product), rebakedPages: rebake_product(product) }
            rescue Sequel::ValidationFailed, Sequel::UniqueConstraintViolation, CatalogueFields::Invalid => error
              halt_json(422, "invalid_product", error.message)
            end
          end
          r.on(String) do |identifier|
            r.get do
              if identifier.match?(/\A\d+\z/)
                product = Product[identifier.to_i] || halt_json(404, "product_not_found", "Product not found")
                { product: commerce_product_payload(product) }
              else
                product = CommercePrefetcher.call.dig("products", identifier) || halt_json(404, "product_not_found", "Product not found")
                { product: product }
              end
            end
            product = Product[identifier.to_i] || halt_json(404, "product_not_found", "Product not found")
            r.post("variants") do
              variant = product.add_variant(commerce_variant_attributes(r.params))
              rebake_product(product)
              response.status = 201
              { variant: commerce_product_payload(product)[:variants].find { |item| item[:id] == variant.id } }
            rescue Sequel::ValidationFailed, ArgumentError, CatalogueFields::Invalid => error
              halt_json(422, "invalid_variant", error.message)
            end
            r.on("variants", String) do |variant_id|
              variant = product.variants_dataset.first(id: variant_id.to_i) || halt_json(404, "variant_not_found", "Variant not found")
              r.patch do
                variant.update(commerce_variant_attributes(r.params, existing_fields: variant.fields))
                rebake_product(product)
                { variant: commerce_product_payload(product)[:variants].find { |item| item[:id] == variant.id } }
              rescue Sequel::ValidationFailed, ArgumentError, CatalogueFields::Invalid => error
                halt_json(422, "invalid_variant", error.message)
              end
              r.delete { variant.destroy; rebake_product(product); no_content! }
            end
            r.patch do
              old_slug = product.slug
              DB.transaction do
                product.update(commerce_product_attributes(
                  r.params, existing_id: product.id, current_slug: product.slug,
                  existing_fields: product.fields
                ))
                SlugRedirect.record(resource_type: "product", old_slug:, destination_slug: product.slug)
              end
              { product: commerce_product_payload(product), rebakedPages: rebake_product(product, old_slug:) }
            rescue Sequel::ValidationFailed, Sequel::UniqueConstraintViolation, CatalogueFields::Invalid => error
              halt_json(422, "invalid_product", error.message)
            end
            r.put("images") do
              ids = r.params.fetch("mediaAssetIds", []).map { |value| Integer(value) }
              valid_ids = MediaAsset.where(id: ids).select_map(:id)
              halt_json(422, "invalid_images", "One or more media assets do not exist") unless ids.uniq.sort == valid_ids.sort
              DB.transaction do
                ProductImage.where(product_id: product.id).delete
                ids.uniq.each_with_index do |media_asset_id, position|
                  ProductImage.dataset.insert(product_id: product.id, media_asset_id:, position:)
                end
              end
              { product: commerce_product_payload(product), rebakedPages: rebake_product(product) }
            rescue ArgumentError
              halt_json(422, "invalid_images", "Media asset IDs must be integers")
            end
            r.put("collections") do
              ids = r.params.fetch("collectionIds", []).map { |value| Integer(value) }
              valid_ids = Collection.where(id: ids).select_map(:id)
              halt_json(422, "invalid_collections", "One or more collections do not exist") unless ids.uniq.sort == valid_ids.sort
              current_ids = CollectionProduct.where(product_id: product.id).select_map(:collection_id)
              to_add = ids.uniq - current_ids
              to_remove = current_ids - ids.uniq
              DB.transaction do
                CollectionProduct.where(product_id: product.id, collection_id: to_remove).delete unless to_remove.empty?
                to_add.each do |collection_id|
                  next_position = (CollectionProduct.where(collection_id:).max(:position) || -1) + 1
                  CollectionProduct.dataset.insert(collection_id:, product_id: product.id, position: next_position)
                end
              end
              rebaked = (to_add + to_remove).sum { |collection_id| rebake_collection(Collection[collection_id]) }
              { collectionIds: ids.uniq.sort, rebakedPages: rebaked }
            rescue ArgumentError
              halt_json(422, "invalid_collections", "Collection IDs must be integers")
            end
            r.delete { product.destroy; no_content! }
          end
        end
        r.on("collections") do
          r.is do
            r.get { { collections: Collection.order(:sort_order, :title).map { |collection| commerce_collection_payload(collection) } } }
            r.post do
              collection = Collection.create(commerce_collection_attributes(r.params))
              response.status = 201
              { collection: commerce_collection_payload(collection) }
            rescue Sequel::ValidationFailed, Sequel::UniqueConstraintViolation, ArgumentError => error
              halt_json(422, "invalid_collection", error.message)
            end
          end
          r.on(String) do |id|
            collection = Collection[id.to_i] || halt_json(404, "collection_not_found", "Collection not found")
            r.patch do
              old_slug = collection.slug
              DB.transaction do
                collection.update(commerce_collection_attributes(
                  r.params, existing_id: collection.id, current_slug: collection.slug
                ))
                SlugRedirect.record(resource_type: "collection", old_slug:, destination_slug: collection.slug)
              end
              { collection: commerce_collection_payload(collection), rebakedPages: rebake_collection(collection, old_slug:) }
            rescue Sequel::ValidationFailed, Sequel::UniqueConstraintViolation, ArgumentError => error
              halt_json(422, "invalid_collection", error.message)
            end
            r.delete { collection.destroy; no_content! }
            r.put("products") do
              ids = r.params.fetch("productIds", []).map { |value| Integer(value) }
              valid_ids = Product.where(id: ids).select_map(:id)
              halt_json(422, "invalid_products", "One or more products do not exist") unless ids.uniq.sort == valid_ids.sort
              DB.transaction do
                CollectionProduct.where(collection_id: collection.id).delete
                ids.uniq.each_with_index do |product_id, position|
                  CollectionProduct.dataset.insert(collection_id: collection.id, product_id:, position:)
                end
              end
              { collection: commerce_collection_payload(collection), rebakedPages: rebake_collection(collection) }
            rescue ArgumentError
              halt_json(422, "invalid_products", "Product IDs must be integers")
            end
          end
        end
        r.on("tables") do
          r.is do
            r.get { { tables: CustomTable.order(:name).map { |table| CustomTableWrites.table_payload(table) } } }
            r.post do
              table = CustomTableWrites.create_table!(r.params)
              response.status = 201
              { table: CustomTableWrites.table_payload(table) }
            rescue CustomTableWrites::Invalid => error
              halt_json(422, "invalid_table", error.message)
            end
          end
          r.on(String) do |identifier|
            table = find_custom_table(identifier) || halt_json(404, "table_not_found", "Data table not found")
            # Exact-path only. Without `r.is`, PATCH/DELETE on /rows/:id would
            # update or destroy the TABLE — Roda's method matchers do not
            # consume leftover path.
            r.is do
              r.get do
                { table: CustomTableWrites.table_payload(table).merge(
                  "rows" => CustomTableWrites.admin_rows(table),
                ) }
              end
              r.patch do
                updated = CustomTableWrites.update_table!(table, r.params)
                { table: CustomTableWrites.table_payload(updated) }
              rescue CustomTableWrites::Invalid => error
                halt_json(422, "invalid_table", error.message)
              end
              r.delete do
                CustomTableWrites.delete_table!(table)
                no_content!
              end
            end
            r.on("rows") do
              r.is do
                r.get { { rows: CustomTableWrites.admin_rows(table) } }
                r.post do
                  row = CustomTableWrites.create_row!(table, r.params)
                  response.status = 201
                  { row: CustomTableWrites.row_payload(row) }
                rescue CustomTableWrites::Invalid => error
                  halt_json(422, "invalid_row", error.message)
                end
              end
              r.on(String) do |row_id|
                row = table.custom_rows_dataset.first(id: row_id.to_i) || halt_json(404, "row_not_found", "Row not found")
                r.patch do
                  updated = CustomTableWrites.update_row!(row, r.params)
                  { row: CustomTableWrites.row_payload(updated) }
                rescue CustomTableWrites::Invalid => error
                  halt_json(422, "invalid_row", error.message)
                end
                r.delete do
                  CustomTableWrites.delete_row!(row)
                  no_content!
                end
              end
            end
          end
        end
        r.on("orders") do
          r.is do
            r.get do
              { orders: Order.order(Sequel.desc(:id)).limit(500).map { |order| commerce_order_payload(order) } }
            end
          end
          r.on(String) do |id|
            order = Order[id.to_i] || halt_json(404, "order_not_found", "Order not found")
            r.get { commerce_order_payload(order) }
            r.patch do
              status = r.params["status"].to_s
              unless Order::STATUSES.include?(status)
                halt_json(422, "invalid_status", "Status must be one of #{Order::STATUSES.join(', ')}")
              end
              order.update(status: status, updated_at: Time.now)
              commerce_order_payload(order)
            end
          end
        end

        r.on("settings") do
          r.get { { settings: commerce_settings_payload } }
          r.patch do
            settings = CommerceSettings.current
            old_currency = settings.currency
            settings.update(commerce_settings_attributes(r.params))
            retag_variants_with_store_currency(old_currency, settings.currency) if settings.currency != old_currency
            { settings: commerce_settings_payload }
          rescue Sequel::ValidationFailed, ArgumentError => error
            halt_json(422, "invalid_settings", error.message)
          end
        end
      end

      r.put("site-document") do
        require_admin!
        state = SiteState.first || halt_json(404, "site_not_found", "Site has not been created")
        changed_pages = r.params.fetch("changedPages", [])

        # The editor has always shipped these; until MCP existed there was no
        # second writer to conflict with, so nothing checked them. Now there
        # is. See `core/persistence/saveConflict.ts` for the shared contract.
        conflicts = save_conflicts(state, r.params)
        if conflicts.any?
          # 409 and NOTHING is written — a partial save would leave the store
          # in a state neither writer intended.
          request.halt([409, { "content-type" => "application/json" },
                        [JSON.generate({ error: "save_conflict", conflicts: conflicts })]])
        end

        DB.transaction do
          state.site = r.params.fetch("site")
          seq = state.bump_seq!
          # Each page records the site seq it was written at, which is what a
          # later save compares its base against.
          changed_pages.each { |page| save_page!(page)&.update(seq: seq) }
          # Deleting by slug fallback would be wrong here — a stale id must not
          # take out whatever page happens to hold that slug now.
          r.params.fetch("deletedPageIds", []).each { |id| find_page_for(id)&.destroy }
        end
        { ok: true, seq: state.seq }
      end

      r.on("pages") do
        require_admin!
        r.post do
          page = save_page!(r.params)
          response.status = 201
          { row: data_row(page) }
        end
        r.on(String) do |id|
          page = Page[id.to_i] || halt_json(404, "page_not_found", "Page not found")

          # Just the serving properties, so the settings dialog can show what
          # is currently set without pulling every page's whole document to
          # find two fields.
          r.get("access") do
            { access: page.access, authRedirect: page.auth_redirect,
              signInPageSlug: Page.sign_in_page&.slug }
          end

          # Separate from the document PATCH: access is not content, and a
          # save of the page tree must not be able to change who can see it.
          r.patch("access") do
            if (access = r.params["access"])
              unless Page::ACCESS_LEVELS.include?(access.to_s)
                halt_json(422, "invalid_access", "access must be one of: #{Page::ACCESS_LEVELS.join(', ')}")
              end

              page.update(access: access.to_s)
            end

            case r.params["authRedirect"]
            when true then Page.mark_auth_redirect!(page)
            when false then page.update(auth_redirect: false)
            end

            { access: page.access, authRedirect: page.auth_redirect,
              signInPageSlug: Page.sign_in_page&.slug }
          rescue Sequel::ValidationFailed => error
            halt_json(422, "invalid_access", error.message)
          end

          r.patch do
            attrs = r.params.slice("slug", "title").transform_keys(&:to_sym)
            document = page.document_data.merge(
              "slug" => attrs.fetch(:slug, page.slug),
              "title" => attrs.fetch(:title, page.title),
            )
            attrs[:document] = document
            page.update(attrs)
            { row: data_row(page) }
          end
          r.delete do
            page.destroy
            no_content!
          end
        end
      end

      r.on("media") do
        require_admin!
        r.is do
          r.get { { assets: MediaAsset.order(Sequel.desc(:created_at)).map { |asset| media_payload(asset) } } }
          r.post do
            upload = r.params["file"] || halt_json(422, "file_required", "A file is required")
            original = File.basename(upload[:filename].to_s)
            safe_name = original.gsub(/[^a-zA-Z0-9._-]/, "-")
            stored_name = "#{SecureRandom.hex(8)}-#{safe_name}"
            relative_path = File.join("uploads", stored_name)
            destination = Paths.storage_file(relative_path)
            FileUtils.mkdir_p(File.dirname(destination))
            FileUtils.copy_file(upload[:tempfile].path, destination)
            mime = upload[:type] || "application/octet-stream"
            processed = MediaVariants.call(source: destination, relative_path:, mime:)
            asset = MediaAsset.create(
              path: relative_path, mime:, width: processed[:width], height: processed[:height],
              variants_json: JSON.generate(processed[:variants])
            )
            response.status = 201
            { asset: media_payload(asset) }
          rescue MediaVariants::Unavailable => error
            File.delete(destination) if destination && File.file?(destination)
            halt_json(503, "image_processing_unavailable", error.message)
          rescue MediaVariants::ProcessingError => error
            File.delete(destination) if destination && File.file?(destination)
            halt_json(422, "invalid_image", error.message)
          end
        end
        r.get("folders") { { folders: [] } }
        r.on(String) do |id|
          asset = MediaAsset[id.to_i] || halt_json(404, "media_not_found", "Media asset not found")

          # The editor has POSTed here since it shipped — alt text, titles,
          # captions and tags — against a route that did not exist. Every save
          # 404d and was swallowed, which is why published images all carry
          # `alt=""`.
          r.patch do
            { asset: media_payload(asset.apply_metadata!(r.params)) }
          rescue Sequel::ValidationFailed => error
            halt_json(422, "invalid_media", error.message)
          end

          r.delete do
            path = Paths.storage_file(asset.path)
            File.delete(path) if File.file?(path)
            asset.variants.each do |variant|
              variant_path = Paths.storage_file(variant.fetch("path"))
              File.delete(variant_path) if File.file?(variant_path)
            end
            asset.destroy
            no_content!
          end
        end
      end

      # ── Forms ────────────────────────────────────────────────────────────
      #
      # Every merchant-defined form posts to /forms/<id> and lands in
      # `form_submissions` with a SCHEMALESS payload — the merchant invents the
      # fields, so there is no fixed column set to render. Submissions have been
      # collected since the forms route shipped with no way to read them back,
      # which makes a contact form a black hole.
      # Reviews. Moderation goes through `ReviewModeration` so the admin and
      # MCP cannot disagree about what "approved" does — in particular, both
      # rebuild the pages that list reviews, because those are static files.
      r.on("discounts") do
        require_admin!

        r.is do
          r.get do
            discounts = Discount.order(Sequel.desc(:created_at)).all
            {
              discounts: discounts.map { |discount| discount_payload(discount) },
              total: discounts.length,
              # The form needs it to label a fixed amount, and the table to
              # render one. Sent once rather than repeated on every row.
              currency: CommerceSettings.current.currency,
            }
          end

          r.post do
            discount = DiscountWrites.create!(r.params)
            response.status = 201
            { discount: discount_payload(discount) }
          rescue DiscountWrites::Invalid => error
            halt_json(422, "invalid_discount", error.message)
          end
        end

        r.on(String) do |id|
          discount = Discount[id.to_i] || halt_json(404, "discount_not_found", "Discount not found")

          r.patch do
            { discount: discount_payload(DiscountWrites.update!(discount, r.params)) }
          rescue DiscountWrites::Invalid => error
            halt_json(422, "invalid_discount", error.message)
          end

          # A redeemed code is ended rather than destroyed, so this answers
          # with the row when one survives — the caller cannot assume it is
          # gone. Same rule as `delete_discount` over MCP.
          r.delete do
            outcome = DiscountWrites.destroy!(discount)
            next no_content! if outcome == :deleted

            { discount: discount_payload(discount), deleted: false }
          rescue DiscountWrites::Invalid => error
            halt_json(422, "invalid_discount", error.message)
          end
        end
      end

      r.on("reviews") do
        require_admin!

        r.is do
          r.get do
            status = r.params["status"].to_s
            dataset = Review.newest_first
            dataset = dataset.approved if status == "approved"
            dataset = dataset.pending if status == "pending"

            {
              reviews: dataset.limit(200).map { |review| review_payload(review) },
              total: Review.count,
              pending: Review.pending.count,
            }
          end

          r.post do
            review = ReviewModeration.create!(r.params)
            response.status = 201
            { review: review_payload(review) }
          rescue ReviewModeration::Invalid => error
            halt_json(422, "invalid_review", error.message)
          end
        end

        r.on(String) do |id|
          review = Review[id.to_i] || halt_json(404, "review_not_found", "Review not found")

          r.post("approve") { { review: review_payload(ReviewModeration.approve!(review)) } }
          r.post("unapprove") { { review: review_payload(ReviewModeration.unapprove!(review)) } }
          r.delete do
            ReviewModeration.destroy!(review)
            no_content!
          end
        end
      end

      r.on("forms") do
        require_admin!

        # One row per form the site has ever received, newest activity first —
        # the list is derived from submissions rather than from published
        # documents, so a form deleted from a page still shows what it caught.
        r.get(true) do
          rows = FormSubmission.group_and_count(:form_id).all.map do |row|
            # `max` is an aggregate, so it comes back as a raw String from
            # SQLite rather than through Sequel's column typecasting.
            latest = FormSubmission.where(form_id: row[:form_id]).max(:created_at)
            { id: row[:form_id], count: row[:count], lastAt: iso_time(latest) }
          end
          { forms: rows.sort_by { |row| row[:lastAt].to_s }.reverse }
        end

        # Paged rather than capped. A busy contact form quietly loses its
        # oldest messages behind a fixed limit, and those are exactly the ones
        # a merchant goes looking for — the enquiry from three weeks ago.
        #
        # `total` comes back so the UI can say how many remain instead of
        # guessing from a short page.
        r.get(String) do |form_id|
          rows = FormSubmission.where(form_id: form_id)
          total = rows.count
          limit = [[Integer(r.params.fetch("limit", "50"), exception: false) || 50, 1].max, 200].min
          offset = [Integer(r.params.fetch("offset", "0"), exception: false) || 0, 0].max

          submissions = rows
            .order(Sequel.desc(:created_at), Sequel.desc(:id))
            .limit(limit, offset)
            .map do |submission|
              {
                id: submission.id,
                createdAt: iso_time(submission.created_at),
                # The payload is whatever the merchant's own fields were named.
                fields: submission.payload_data,
                orderId: submission.order_id,
                customerId: submission.customer_id,
              }
            end
          {
            formId: form_id, submissions: submissions, total: total,
            # Derived here rather than compared client-side: a page that
            # happens to be exactly `limit` long is not proof there is more.
            hasMore: offset + submissions.length < total,
          }
        end

        r.delete(String, Integer) do |_form_id, id|
          submission = FormSubmission[id]
          halt_json(404, "not_found", "That submission no longer exists.") unless submission

          submission.destroy
          no_content!
        end
      end

      # ── AI assistant ─────────────────────────────────────────────────────
      # A thin authenticated proxy. The editor composes the whole conversation
      # (system prompt, page snapshot, user turn); this attaches the stored
      # credential and returns the reply verbatim. Nothing here interprets the
      # model's output — the editor validates and applies it, so a hallucinated
      # edit can never reach the document without passing the same parser a
      # hand-pasted one does.
      r.on("ai") do
        require_admin!

        r.post("chat") do
          result = AiChat.call(messages: r.params["messages"])
          unless result.ok?
            status, code, message = ai_chat_error(result.reason)
            # The provider's own words, appended verbatim. Debugging a rejected
            # request without them means guessing between a wrong model id, a
            # max_tokens over the model's ceiling, an expired key and a DNS
            # failure — all of which looked identical before.
            message = "#{message} #{result.detail}".strip if result.detail
            halt_json(status, code, message)
          end

          { reply: result.reply }
        end

        # Everything the assistant's own settings popover needs, so choosing a
        # model is a two-click job in the panel rather than a trip to the
        # plugin admin. `hasKey` — never the key itself.
        r.is("config") do
          r.get do
            settings = AiChat.settings
            {
              baseUrl: settings[:base_url].to_s,
              model: settings[:model].to_s,
              hasKey: !settings[:api_key].to_s.strip.empty?,
            }
          end

          r.put do
            settings = AiChat.settings
            settings[:base_url] = r.params["baseUrl"].to_s.strip
            settings[:model] = r.params["model"].to_s.strip
            # Same rule the generic plugin form follows: a blank key means
            # "leave it alone", because the form was never shown the current
            # one to resubmit. Clearing is explicit, via `clearKey`.
            key = r.params["apiKey"].to_s
            settings[:api_key] = "" if r.params["clearKey"] == true
            settings[:api_key] = key.strip unless key.strip.empty?
            no_content!
          end
        end

        # The provider's catalogue, so the merchant picks a model instead of
        # typing an id. Accepts the not-yet-saved base URL and key from the
        # popover — the key goes browser -> server only, never back.
        r.post("models") do
          { models: AiChat.list_models(base_url: r.params["baseUrl"], api_key: r.params["apiKey"]) }
        end
      end

      halt_json(404, "not_found", "API endpoint not found")
    end

    r.on("auth") do
      r.post("login") { r.redirect("/admin/api/cms/login", 307) }
      r.get("me") { r.redirect("/admin/api/cms/me", 307) }
    end

    halt_json(404, "not_found", "API endpoint not found")
  rescue Sequel::ValidationFailed, Sequel::UniqueConstraintViolation, KeyError => e
    halt_json(422, "validation_error", e.message)
  rescue JSON::ParserError => e
    halt_json(400, "invalid_json", e.message)
  end
end
