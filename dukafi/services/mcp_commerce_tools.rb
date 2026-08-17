require "json"

# The catalogue, for an external agent.
#
# Kept apart from `McpTools` because these are a different KIND of thing. Page
# tools edit a draft nobody can see until `publish`; there is no draft for a
# price. A stock number changed here is the number a customer sees on the next
# request, and `set_price` is live the moment it returns.
#
# That is why every write here re-bakes immediately (via `CommerceWrites`) and
# why the tool descriptions say so plainly — a model that thinks it is editing
# a draft will happily "try" a price.
#
# All writes go through `CommerceWrites`, which the admin UI uses too, so the
# slug, currency and re-bake rules cannot drift between the two callers.
module McpCommerceTools
  MAX_LIMIT = 100
  DEFAULT_LIMIT = 50

  module_function

  def all
    [
      list_products, read_product, create_product, update_product, delete_product,
      set_variant, delete_variant, set_stock,
      list_collections, create_collection, update_collection, delete_collection,
      set_collection_products,
    ]
  end

  # Everything here changes the live store, so all of it is a write except the
  # two obvious reads.
  READ_TOOLS = %w[list_products read_product list_collections].freeze

  # ── Shapes ─────────────────────────────────────────────────────────────────

  def product_summary(product)
    variants = product.variants
    {
      "slug" => product.slug, "title" => product.title, "status" => product.status,
      "variants" => variants.length,
      # Whether a card would render a picture or a blank box. Cheap to include
      # and it is the first thing that matters when building a listing.
      "hasImage" => !product.media_assets.empty?,
      "priceFrom" => variants.map(&:price_cents).min,
      "currency" => variants.first&.currency,
      "stock" => variants.sum(&:stock),
    }
  end

  def product_detail(product)
    product_summary(product).merge(
      "images" => product.media_assets.map do |asset|
        { "path" => "/#{asset.path}", "altText" => asset.alt_text.to_s }
      end,
      "descriptionHtml" => product.description_document.to_s,
      "collections" => product.collections.map(&:slug),
      "variantList" => product.variants.map do |variant|
        {
          "id" => variant.id, "sku" => variant.sku, "title" => variant.title,
          "priceCents" => variant.price_cents, "currency" => variant.currency,
          "stock" => variant.stock, "position" => variant.position,
          "fields" => CatalogueFields.hash_for(variant.fields, owner: :variant),
        }
      end,
      "fields" => CatalogueFields.hash_for(product.fields, owner: :product),
    )
  end

  def collection_detail(collection)
    {
      "slug" => collection.slug, "title" => collection.title,
      "description" => collection.description.to_s,
      "sortOrder" => collection.sort_order,
      "products" => collection.products.map(&:slug),
    }
  end

  # Slug, not id: it is what `store.product-card` and the loops take as
  # `productSlug` / `sourceSlug`, so it is the handle that actually connects
  # the catalogue to a page.
  def find_product!(slug)
    value = slug.to_s.strip.downcase
    raise McpTools::ArgumentError, "slug is required" if value.empty?

    Product.first(slug: value) ||
      raise(McpTools::ArgumentError,
            "No product with slug #{value.inspect}. Call list_products to see what exists.")
  end

  def find_collection!(slug)
    value = slug.to_s.strip.downcase
    raise McpTools::ArgumentError, "slug is required" if value.empty?

    Collection.first(slug: value) ||
      raise(McpTools::ArgumentError,
            "No collection with slug #{value.inspect}. Call list_collections to see what exists.")
  end

  # `CommerceWrites` speaks its own error type; the MCP layer speaks
  # McpTools::ArgumentError, which comes back as an isError result the model
  # can read and retry from.
  def writing
    yield
  rescue CommerceWrites::Invalid => e
    raise McpTools::ArgumentError, e.message
  end

  def clamp_limit(value)
    (Integer(value, exception: false) || DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
  end

  # ── Reads ──────────────────────────────────────────────────────────────────

  def list_products
    {
      name: "list_products",
      title: "List products",
      description: "The catalogue — slug, title, status, price and total stock. " \
                   "The SLUG is the handle pages use: a product card takes " \
                   "productSlug, so start here before building one.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "status" => { "type" => "string", "enum" => %w[any draft active],
                        "description" => "Defaults to any. Only 'active' products appear on the storefront." },
          "limit" => { "type" => "integer", "minimum" => 1, "maximum" => MAX_LIMIT },
        },
        "additionalProperties" => false,
      },
      run: lambda do |args|
        status = args.fetch("status", "any").to_s
        unless %w[any draft active].include?(status)
          raise McpTools::ArgumentError, "status must be one of: any, draft, active"
        end

        dataset = Product.order(:slug)
        dataset = dataset.where(status: status) unless status == "any"
        { "products" => dataset.limit(clamp_limit(args["limit"])).map { |p| product_summary(p) },
          "total" => dataset.count }
      end,
    }
  end

  def read_product
    {
      name: "read_product",
      title: "Read a product",
      description: "One product in full, including every variant with its id, " \
                   "SKU, price and stock. Variant ids are what set_stock and " \
                   "set_variant target.",
      input_schema: {
        "type" => "object",
        "properties" => { "slug" => { "type" => "string" } },
        "required" => ["slug"], "additionalProperties" => false,
      },
      run: ->(args) { product_detail(find_product!(args["slug"])) },
    }
  end

  def list_collections
    {
      name: "list_collections",
      title: "List collections",
      description: "Collections and which products are in each. A collection " \
                   "loop on a page binds by collection SLUG.",
      input_schema: {
        "type" => "object",
        "properties" => { "limit" => { "type" => "integer", "minimum" => 1, "maximum" => MAX_LIMIT } },
        "additionalProperties" => false,
      },
      run: lambda do |args|
        rows = Collection.order(:sort_order, :slug).limit(clamp_limit(args["limit"]))
        { "collections" => rows.map { |c| collection_detail(c) }, "total" => Collection.count }
      end,
    }
  end

  # ── Product writes ─────────────────────────────────────────────────────────

  LIVE = "This changes the live storefront immediately — there is no draft for " \
         "catalogue data and no publish step.".freeze

  def create_product
    {
      name: "create_product",
      title: "Create a product",
      description: "Add a product. It starts as a DRAFT and stays off the " \
                   "storefront until its status is 'active'. A product with no " \
                   "variants has no price and cannot be bought — add one with " \
                   "set_variant.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "title" => { "type" => "string" },
          "slug" => { "type" => "string", "description" => "Optional; derived from the title if omitted." },
          "status" => { "type" => "string", "enum" => %w[draft active] },
          "descriptionHtml" => { "type" => "string" },
          "fields" => {
            "type" => "object",
            "description" => "Extra attributes a plugin declared (make, origin, mileage, …).",
          },
        },
        "required" => ["title"], "additionalProperties" => false,
      },
      run: lambda do |args|
        raise McpTools::ArgumentError, "title is required" if args["title"].to_s.strip.empty?

        product = writing { CommerceWrites.create_product!(args) }
        product_detail(product).merge("note" => "Created as a draft. Add a variant, then set status to active.")
      end,
    }
  end

  def update_product
    {
      name: "update_product",
      title: "Update a product",
      description: "Change a product's title, slug, status or description. " \
                   "Setting status to 'active' puts it on the storefront. " \
                   "Changing the SLUG changes its public URL and breaks existing " \
                   "links to it. #{LIVE}",
      input_schema: {
        "type" => "object",
        "properties" => {
          "slug" => { "type" => "string", "description" => "Which product to change." },
          "title" => { "type" => "string" },
          "newSlug" => { "type" => "string", "description" => "Only to move its URL." },
          "status" => { "type" => "string", "enum" => %w[draft active] },
          "descriptionHtml" => { "type" => "string" },
          "fields" => {
            "type" => "object",
            "description" => "Extra product attributes. Merged with what is already stored.",
          },
        },
        "required" => ["slug"], "additionalProperties" => false,
      },
      run: lambda do |args|
        product = find_product!(args["slug"])
        # Omitted fields keep their current value — a partial update must not
        # blank a title just because the caller did not resend it.
        params = {
          "title" => args.fetch("title", product.title),
          "slug" => args.fetch("newSlug", ""),
          "status" => args.fetch("status", product.status),
          "descriptionHtml" => args.fetch("descriptionHtml", product.description_document.to_s),
        }
        params["fields"] = args["fields"] if args.key?("fields")
        product_detail(writing { CommerceWrites.update_product!(product, params) })
      end,
    }
  end

  def delete_product
    {
      name: "delete_product",
      title: "Delete a product",
      description: "Permanently remove a product and all its variants. This " \
                   "cannot be undone, and it removes the product from every " \
                   "collection and every page that listed it. To take something " \
                   "off sale without destroying it, set its status to 'draft' " \
                   "instead.",
      input_schema: {
        "type" => "object",
        "properties" => { "slug" => { "type" => "string" } },
        "required" => ["slug"], "additionalProperties" => false,
      },
      run: lambda do |args|
        product = find_product!(args["slug"])
        rebaked = writing { CommerceWrites.delete_product!(product) }
        { "deleted" => product.slug, "rebakedPages" => rebaked }
      end,
    }
  end

  # ── Variants and stock ─────────────────────────────────────────────────────

  def set_variant
    {
      name: "set_variant",
      title: "Add or update a variant",
      description: "A variant carries the price and the stock — a product " \
                   "without one cannot be bought. Pass variantId to update an " \
                   "existing one, omit it to add another. Prices are in CENTS " \
                   "(1500 = 15.00). The store's own currency is always used. #{LIVE}",
      input_schema: {
        "type" => "object",
        "properties" => {
          "productSlug" => { "type" => "string" },
          "variantId" => { "type" => "integer", "description" => "Omit to create a new variant." },
          "sku" => { "type" => "string" },
          "title" => { "type" => "string", "description" => "E.g. \"Large / Blue\"." },
          "priceCents" => { "type" => "integer", "minimum" => 0, "description" => "In cents. 1500 = 15.00." },
          "stock" => { "type" => "integer", "minimum" => 0 },
          "position" => { "type" => "integer", "minimum" => 0 },
          "fields" => {
            "type" => "object",
            "description" => "Extra variant attributes a plugin declared (origin, mileage, …).",
          },
        },
        "required" => %w[productSlug], "additionalProperties" => false,
      },
      run: lambda do |args|
        product = find_product!(args["productSlug"])

        if args["variantId"]
          variant = product.variants_dataset.first(id: args["variantId"].to_i) ||
                    raise(McpTools::ArgumentError,
                          "No variant #{args['variantId']} on #{product.slug.inspect}. Call read_product for its ids.")
          params = {
            "sku" => args.fetch("sku", variant.sku),
            "title" => args.fetch("title", variant.title),
            "priceCents" => args.fetch("priceCents", variant.price_cents),
            "stock" => args.fetch("stock", variant.stock),
            "position" => args.fetch("position", variant.position),
          }
          params["fields"] = args["fields"] if args.key?("fields")
          writing { CommerceWrites.update_variant!(variant, params) }
        else
          writing { CommerceWrites.create_variant!(product, args) }
        end

        product_detail(product.refresh)
      end,
    }
  end

  def delete_variant
    {
      name: "delete_variant",
      title: "Delete a variant",
      description: "Remove one variant. Deleting the last one leaves the " \
                   "product unbuyable — it will still render, with no price.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "productSlug" => { "type" => "string" },
          "variantId" => { "type" => "integer" },
        },
        "required" => %w[productSlug variantId], "additionalProperties" => false,
      },
      run: lambda do |args|
        product = find_product!(args["productSlug"])
        variant = product.variants_dataset.first(id: args["variantId"].to_i) ||
                  raise(McpTools::ArgumentError, "No variant #{args['variantId']} on #{product.slug.inspect}.")
        writing { CommerceWrites.delete_variant!(variant) }
        product_detail(product.refresh)
      end,
    }
  end

  def set_stock
    {
      name: "set_stock",
      title: "Set stock",
      description: "Set a variant's stock level. Its own tool because it is the " \
                   "most common catalogue change and needs no price or SKU — " \
                   "resending those risks overwriting them. #{LIVE}",
      input_schema: {
        "type" => "object",
        "properties" => {
          "productSlug" => { "type" => "string" },
          "variantId" => { "type" => "integer" },
          "stock" => { "type" => "integer", "minimum" => 0 },
        },
        "required" => %w[productSlug variantId stock], "additionalProperties" => false,
      },
      run: lambda do |args|
        product = find_product!(args["productSlug"])
        variant = product.variants_dataset.first(id: args["variantId"].to_i) ||
                  raise(McpTools::ArgumentError, "No variant #{args['variantId']} on #{product.slug.inspect}.")
        writing { CommerceWrites.set_stock!(variant, args["stock"]) }
        product_detail(product.refresh)
      end,
    }
  end

  # ── Collection writes ──────────────────────────────────────────────────────

  def create_collection
    {
      name: "create_collection",
      title: "Create a collection",
      description: "A named group of products, served at /collections/<slug> " \
                   "and usable as the source of a collection loop.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "title" => { "type" => "string" },
          "slug" => { "type" => "string", "description" => "Optional; derived from the title." },
          "description" => { "type" => "string" },
          "sortOrder" => { "type" => "integer", "minimum" => 0 },
        },
        "required" => ["title"], "additionalProperties" => false,
      },
      run: lambda do |args|
        raise McpTools::ArgumentError, "title is required" if args["title"].to_s.strip.empty?

        collection_detail(writing { CommerceWrites.create_collection!(args) })
      end,
    }
  end

  def update_collection
    {
      name: "update_collection",
      title: "Update a collection",
      description: "Change a collection's title, slug, description or sort " \
                   "order. Changing the slug changes its public URL. #{LIVE}",
      input_schema: {
        "type" => "object",
        "properties" => {
          "slug" => { "type" => "string", "description" => "Which collection to change." },
          "title" => { "type" => "string" },
          "newSlug" => { "type" => "string" },
          "description" => { "type" => "string" },
          "sortOrder" => { "type" => "integer", "minimum" => 0 },
        },
        "required" => ["slug"], "additionalProperties" => false,
      },
      run: lambda do |args|
        collection = find_collection!(args["slug"])
        params = {
          "title" => args.fetch("title", collection.title),
          "slug" => args.fetch("newSlug", ""),
          "description" => args.fetch("description", collection.description.to_s),
          "sortOrder" => args.fetch("sortOrder", collection.sort_order),
        }
        collection_detail(writing { CommerceWrites.update_collection!(collection, params) })
      end,
    }
  end

  def delete_collection
    {
      name: "delete_collection",
      title: "Delete a collection",
      description: "Remove a collection. The PRODUCTS in it are not deleted — " \
                   "only the grouping and its /collections/<slug> page.",
      input_schema: {
        "type" => "object",
        "properties" => { "slug" => { "type" => "string" } },
        "required" => ["slug"], "additionalProperties" => false,
      },
      run: lambda do |args|
        collection = find_collection!(args["slug"])
        rebaked = writing { CommerceWrites.delete_collection!(collection) }
        { "deleted" => collection.slug, "rebakedPages" => rebaked,
          "note" => "The products themselves were not deleted." }
      end,
    }
  end

  def set_collection_products
    {
      name: "set_collection_products",
      title: "Set a collection's products",
      description: "Replace the whole membership list. Send every product slug " \
                   "that should be in it — anything omitted is REMOVED from the " \
                   "collection (though not deleted). Call list_collections first " \
                   "if you mean to add to what is already there. #{LIVE}",
      input_schema: {
        "type" => "object",
        "properties" => {
          "slug" => { "type" => "string", "description" => "The collection." },
          "productSlugs" => { "type" => "array", "items" => { "type" => "string" },
                              "description" => "The complete list, not a delta." },
        },
        "required" => %w[slug productSlugs], "additionalProperties" => false,
      },
      run: lambda do |args|
        collection = find_collection!(args["slug"])
        slugs = Array(args["productSlugs"]).map { |value| value.to_s.strip.downcase }.reject(&:empty?)
        # Resolved here so an unknown SLUG is named, rather than the id-level
        # error CommerceWrites would give.
        ids = slugs.map { |slug| find_product!(slug).id }

        writing { CommerceWrites.set_collection_products!(collection, ids) }
        collection_detail(collection.refresh)
      end,
    }
  end
end
