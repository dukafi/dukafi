require "bcrypt"
require "digest"
require "fileutils"
require "json"
require "securerandom"

class AdminApi < Roda
  plugin :all_verbs
  plugin :sessions, secret: ENV.fetch("SESSION_SECRET") { "dev-secret-change-me-" + "x" * 64 }
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
      id: product.id, title: product.title, slug: product.slug, vendor: product.vendor,
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

  def commerce_collection_payload(collection)
    memberships = CollectionProduct.where(collection_id: collection.id).order(:position).all
    {
      id: collection.id, title: collection.title, slug: collection.slug,
      description: collection.description.to_s, sortOrder: collection.sort_order,
      productIds: memberships.map(&:product_id),
    }
  end

  def commerce_product_attributes(params)
    {
      title: params.fetch("title", "").strip,
      slug: params.fetch("slug", "").strip.downcase,
      vendor: params.fetch("vendor", "").strip,
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

  def commerce_collection_attributes(params)
    {
      title: params.fetch("title", "").strip, slug: params.fetch("slug", "").strip.downcase,
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

  def save_page!(raw)
    id = raw.fetch("id").to_s
    page = Page[id.to_i]
    document = raw
    attrs = { slug: raw.fetch("slug"), title: raw.fetch("title"), document: document }
    if page
      page.update(attrs)
    else
      Page.create(attrs.merge(kind: "page", status: "draft"))
    end
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
              r.delete { variant.destroy; rebake_product(product); response.status = 204; "" }
            end
            r.patch do
              old_slug = product.slug
              DB.transaction do
                product.update(commerce_product_attributes(r.params))
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
            r.delete { product.destroy; response.status = 204; "" }
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
                collection.update(commerce_collection_attributes(r.params))
                SlugRedirect.record(resource_type: "collection", old_slug:, destination_slug: collection.slug)
              end
              { collection: commerce_collection_payload(collection), rebakedPages: rebake_collection(collection, old_slug:) }
            rescue Sequel::ValidationFailed, Sequel::UniqueConstraintViolation, ArgumentError => error
              halt_json(422, "invalid_collection", error.message)
            end
            r.delete { collection.destroy; response.status = 204; "" }
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
          r.params.fetch("deletedPageIds", []).each { |id| Page[id.to_i]&.destroy }
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
            response.status = 204
            ""
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
            response.status = 204
            ""
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
