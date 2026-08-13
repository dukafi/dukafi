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

  def halt_json(status, code, message)
    request.halt([status, { "content-type" => "application/json" }, [JSON.generate(error_payload(code, message))]])
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
      cells: {
        title: page.title, slug: page.slug,
        body: { nodes: document.fetch("nodes"), rootNodeId: document.fetch("rootNodeId") },
      },
      slug: page.slug, status: page.status == "published" ? "published" : "draft", seq: 0,
      authorUserId: nil, createdByUserId: nil, updatedByUserId: nil, publishedByUserId: nil,
      author: nil, createdBy: nil, updatedBy: nil, publishedBy: nil,
      createdAt: page.created_at.utc.iso8601, updatedAt: now, publishedAt: nil,
      scheduledPublishAt: nil, deletedAt: nil,
    }
  end

  def media_payload(asset)
    full_path = File.expand_path("../#{asset.path}", __dir__)
    {
      id: asset.id.to_s, filename: File.basename(asset.path), mimeType: asset.mime,
      sizeBytes: File.exist?(full_path) ? File.size(full_path) : 0,
      publicPath: "/#{asset.path}", uploadedByUserId: nil, createdAt: asset.created_at.utc.iso8601,
      width: asset.width, height: asset.height, variants: asset.variants,
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
        }
      end,
      images: product.media_assets.map do |asset|
        { id: asset.id, publicPath: "/#{asset.path}", width: asset.width, height: asset.height }
      end,
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
      # Merchant-defined forms filed against this order (delivery address,
      # M-Pesa confirmation, whatever they invented). Payloads are returned as
      # stored — Dukafy never chose their shape, so it can't flatten them.
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

  # `existing_id` excludes the product being edited from the collision check,
  # so saving a product without touching its slug doesn't rename it.
  # `current_slug` is the slug the product already has (nil when creating).
  # It matters because a slug is a URL: on CREATE a blank one is derived from
  # the title, but on EDIT a blank one KEEPS the existing slug rather than
  # regenerating it. Otherwise renaming a product would silently move its live
  # page, and every inbound link would depend on the redirect table catching it.
  def commerce_product_attributes(params, existing_id: nil, current_slug: nil)
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
    }
  end

  def commerce_variant_attributes(params)
    {
      sku: params.fetch("sku", "").strip, title: params.fetch("title", "").strip,
      price_cents: Integer(params.fetch("priceCents", 0)),
      # v1 is single-currency (VISION.md's post-1.0 parking lot defers
      # multi-currency) — the store's configured currency always wins,
      # regardless of what a caller posts, so every variant stays consistent.
      currency: CommerceSettings.current.currency,
      stock: Integer(params.fetch("stock", 0)), position: Integer(params.fetch("position", 0)),
    }
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

    by_document = Page.where(
      Sequel.lit("json_extract(document, '$.id') = ?", id)
    ).first
    by_document || (slug && Page.first(slug: slug))
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

    rendered = Dukafy::Publisher::RenderPage.call(
      document: page, registry: Dukafy::Publisher::REGISTRY, site: site,
      prefetched: prefetched, current_entry: current_entry, page_paths: PagePaths.call
    )

    collector = Dukafy::Publisher::CssCollector.new
    collector.add("page-modules", rendered.css)
    bundle = collector.bundle(
      framework_css: Dukafy::Publisher::FrameworkCss.call(site),
      tailwind_css: TailwindCompiler.call(
        html: %(<body class="#{rendered.body_classes.join(' ')}">#{rendered.html}</body>)
      )
    )

    html = Dukafy::Publisher::HtmlDocument.call(
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
      # (fileId/placement/timing/priority), which Dukafy doesn't have yet.
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
          StarterSite.create!(name: r.params.fetch("siteName", "Dukafy Store"))
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

      r.get("pages") do
        require_admin!
        ProductTemplate.ensure!
        CollectionTemplate.ensure!
        { rows: Page.order(:kind, :id).map { |page| data_row(page) } }
      end

      # Submissions are schemaless by design, so this returns the payload as
      # stored rather than flattening it into columns Dukafy chose.
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
      r.on("plugins") do
        require_admin!
        r.is do
          r.get do
            {
              plugins: Dukafy::Plugins.all.map do |plugin|
                values = plugin.settings
                {
                  id: plugin.id, name: plugin.name, version: plugin.version,
                  configured: values.configured?,
                  paymentProviders: plugin.payment_providers.keys,
                  settings: plugin.settings_schema.map do |setting|
                    stored = values[setting.key].to_s
                    {
                      key: setting.key, label: setting.label, type: setting.type.to_s,
                      secret: setting.secret,
                      isSet: !stored.empty?,
                      value: setting.secret ? nil : stored,
                    }
                  end,
                }
              end,
            }
          end
        end

        r.on(String) do |plugin_id|
          plugin = Dukafy::Plugins.find(plugin_id) || halt_json(404, "plugin_not_found", "Plugin not found")
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
        end
      end

      r.get("components") { require_admin!; { rows: [] } }
      r.get("layouts") { require_admin!; { rows: [] } }

      r.on("commerce") do
        require_admin!
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
            rescue Sequel::ValidationFailed, Sequel::UniqueConstraintViolation => error
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
            rescue Sequel::ValidationFailed, ArgumentError => error
              halt_json(422, "invalid_variant", error.message)
            end
            r.on("variants", String) do |variant_id|
              variant = product.variants_dataset.first(id: variant_id.to_i) || halt_json(404, "variant_not_found", "Variant not found")
              r.patch do
                variant.update(commerce_variant_attributes(r.params))
                rebake_product(product)
                { variant: commerce_product_payload(product)[:variants].find { |item| item[:id] == variant.id } }
              rescue Sequel::ValidationFailed, ArgumentError => error
                halt_json(422, "invalid_variant", error.message)
              end
              r.delete { variant.destroy; rebake_product(product); no_content! }
            end
            r.patch do
              old_slug = product.slug
              DB.transaction do
                product.update(commerce_product_attributes(
                  r.params, existing_id: product.id, current_slug: product.slug
                ))
                SlugRedirect.record(resource_type: "product", old_slug:, destination_slug: product.slug)
              end
              { product: commerce_product_payload(product), rebakedPages: rebake_product(product, old_slug:) }
            rescue Sequel::ValidationFailed, Sequel::UniqueConstraintViolation => error
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
        DB.transaction do
          state.site = r.params.fetch("site")
          state.seq += 1
          state.save
          changed_pages.each { |page| save_page!(page) }
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
            destination = File.expand_path("../#{relative_path}", __dir__)
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
          r.delete do
            path = File.expand_path("../#{asset.path}", __dir__)
            File.delete(path) if File.file?(path)
            asset.variants.each do |variant|
              variant_path = File.expand_path("../#{variant.fetch('path').delete_prefix('/')}", __dir__)
              File.delete(variant_path) if File.file?(variant_path)
            end
            asset.destroy
            no_content!
          end
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
