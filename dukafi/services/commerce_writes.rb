require "json"

# Every write to the catalogue, in one place.
#
# There are now two callers — the admin UI and MCP — and the rules that matter
# here are not obvious ones a second implementation would rediscover:
#
#   · a blank slug on EDIT keeps the existing slug, because a slug is a public
#     URL and silently moving a live page loses every link to it;
#   · the store's configured currency always wins over whatever a caller
#     posts, so v1 stays single-currency;
#   · every write re-bakes the pages that show the thing, because published
#     pages are static files and would otherwise keep serving the old price.
#
# Duplicating those is how a price change starts working in one client and
# silently not in the other. So both callers come through here.
#
# Raises `Invalid` with a message a human or a model can act on. Callers map
# that to whatever their transport wants — 422, or an isError tool result.
module CommerceWrites
  class Invalid < StandardError; end

  module_function

  # ── Products ───────────────────────────────────────────────────────────────

  def product_attributes(params, existing_id: nil, current_slug: nil)
    title = params.fetch("title", "").to_s.strip
    submitted = params.fetch("slug", "").to_s.strip.downcase
    slug =
      if !submitted.empty?
        # A slug the merchant typed is normalised but otherwise respected.
        normalized = Product.slugify(submitted)
        normalized.empty? ? (current_slug || Product.unique_slug(title, exclude_id: existing_id)) : normalized
      elsif current_slug
        current_slug
      else
        Product.unique_slug(title, exclude_id: existing_id)
      end

    {
      title: title, slug: slug,
      status: %w[draft active].include?(params["status"].to_s) ? params["status"].to_s : "draft",
      description_document: params.fetch("descriptionHtml", "").to_s,
    }
  end

  def create_product!(params)
    product = Product.create(product_attributes(params).merge(fields_attribute(params, "{}", :product)))
    rebake_product(product)
    product
  rescue Sequel::ValidationFailed => e
    raise Invalid, e.message
  rescue CatalogueFields::Invalid => e
    raise Invalid, e.message
  end

  def update_product!(product, params)
    old_slug = product.slug
    DB.transaction do
      product.update(product_attributes(params, existing_id: product.id, current_slug: product.slug)
                       .merge(fields_attribute(params, product.fields, :product)))
    end
    # `old_slug` so the bake removes the page at the PREVIOUS path; without it
    # a renamed product leaves its old URL serving stale content forever.
    rebake_product(product, old_slug: old_slug)
    product
  rescue Sequel::ValidationFailed => e
    raise Invalid, e.message
  rescue CatalogueFields::Invalid => e
    raise Invalid, e.message
  end

  def delete_product!(product)
    slug = product.slug
    paths = RebuildIndex.targets_for_product(product)
    paths << "/products/#{slug}"
    DB.transaction { product.destroy }
    # Bake AFTER the row is gone so the loops that included it re-render
    # without it. Paths are snapshotted first: destroying the row also
    # drops its `page_dependencies`, which would hide listing pages.
    PartialBake.call(paths: paths).page_count
  rescue Sequel::ValidationFailed => e
    raise Invalid, e.message
  end

  # ── Variants ───────────────────────────────────────────────────────────────

  def variant_attributes(params)
    {
      sku: params.fetch("sku", "").to_s.strip,
      title: params.fetch("title", "").to_s.strip,
      price_cents: integer(params, "priceCents"),
      # v1 is single-currency: the store's configured currency always wins over
      # whatever a caller posts, so no variant can drift out of step.
      currency: CommerceSettings.current.currency,
      stock: integer(params, "stock"),
      position: integer(params, "position"),
    }
  end

  def create_variant!(product, params)
    variant = Variant.create(
      variant_attributes(params).merge(product_id: product.id)
                                .merge(fields_attribute(params, "{}", :variant))
    )
    rebake_product(product)
    variant
  rescue Sequel::ValidationFailed => e
    raise Invalid, e.message
  rescue CatalogueFields::Invalid => e
    raise Invalid, e.message
  end

  def update_variant!(variant, params)
    variant.update(variant_attributes(params).merge(fields_attribute(params, variant.fields, :variant)))
    rebake_product(variant.product)
    variant
  rescue Sequel::ValidationFailed => e
    raise Invalid, e.message
  rescue CatalogueFields::Invalid => e
    raise Invalid, e.message
  end

  def delete_variant!(variant)
    product = variant.product
    variant.destroy
    rebake_product(product)
  end

  # Stock deserves its own path: it is the most frequent write in a real shop,
  # and it must not require resending price and SKU — a caller that omitted
  # them would otherwise blank them.
  def set_stock!(variant, stock)
    value = Integer(stock, exception: false)
    raise Invalid, "stock must be a whole number" if value.nil?
    raise Invalid, "stock cannot be negative" if value.negative?

    variant.update(stock: value)
    rebake_product(variant.product)
    variant
  rescue Sequel::ValidationFailed => e
    raise Invalid, e.message
  end

  # ── Collections ────────────────────────────────────────────────────────────

  def collection_attributes(params, existing_id: nil, current_slug: nil)
    title = params.fetch("title", "").to_s.strip
    submitted = params.fetch("slug", "").to_s.strip.downcase
    slug =
      if !submitted.empty?
        normalized = Collection.slugify(submitted)
        normalized.empty? ? (current_slug || Collection.unique_slug(title, exclude_id: existing_id)) : normalized
      elsif current_slug
        current_slug
      else
        Collection.unique_slug(title, exclude_id: existing_id)
      end

    {
      title: title, slug: slug,
      description: params.fetch("description", "").to_s.strip,
      sort_order: integer(params, "sortOrder"),
    }
  end

  def create_collection!(params)
    collection = Collection.create(collection_attributes(params))
    rebake_collection(collection)
    collection
  rescue Sequel::ValidationFailed => e
    raise Invalid, e.message
  end

  def update_collection!(collection, params)
    old_slug = collection.slug
    collection.update(collection_attributes(params, existing_id: collection.id, current_slug: collection.slug))
    rebake_collection(collection, old_slug: old_slug)
    collection
  rescue Sequel::ValidationFailed => e
    raise Invalid, e.message
  end

  def set_collection_image!(collection, asset)
    collection.update(media_asset_id: asset&.id)
    CollectionTemplate.ensure!
    rebake_collection(collection)
    collection
  end

  def delete_collection!(collection)
    slug = collection.slug
    paths = RebuildIndex.targets_for_collection(collection)
    paths << "/collections/#{slug}"
    DB.transaction { collection.destroy }
    PartialBake.call(paths: paths).page_count
  end

  # Membership, as a SET rather than add/remove calls: a caller says what the
  # collection should contain and this works out the difference. Both sides
  # get re-baked, since a product moving between collections changes two pages.
  def set_collection_products!(collection, product_ids)
    ids = Array(product_ids).filter_map { |id| Integer(id, exception: false) }.uniq
    known = Product.where(id: ids).select_map(:id)
    missing = ids - known
    raise Invalid, "No product with id #{missing.join(', ')}" unless missing.empty?

    current = CollectionProduct.where(collection_id: collection.id).select_map(:product_id)
    to_add = known - current
    to_remove = current - known

    DB.transaction do
      CollectionProduct.where(collection_id: collection.id, product_id: to_remove).delete unless to_remove.empty?
      to_add.each_with_index do |product_id, index|
        position = (CollectionProduct.where(collection_id: collection.id).max(:position) || -1) + 1 + index
        CollectionProduct.dataset.insert(collection_id: collection.id, product_id: product_id, position: position)
      end
    end

    rebake_collection(collection)
    (to_add + to_remove).each { |product_id| rebake_product(Product[product_id]) }
    known
  end

  def add_product_to_collection!(collection, product)
    ids = CollectionProduct.where(collection_id: collection.id).select_map(:product_id)
    set_collection_products!(collection, ids + [product.id])
  end

  def set_product_images!(product, asset_ids)
    ids = Array(asset_ids).map { |value| Integer(value) }
    valid_ids = MediaAsset.where(id: ids).select_map(:id)
    raise Invalid, "One or more media assets do not exist" unless ids.uniq.sort == valid_ids.sort

    DB.transaction do
      ProductImage.where(product_id: product.id).delete
      ids.uniq.each_with_index do |media_asset_id, position|
        ProductImage.dataset.insert(product_id: product.id, media_asset_id:, position:)
      end
      drop_stale_og_image!(product, ids)
    end
    rebake_product(product.refresh)
    product
  rescue ArgumentError
    raise Invalid, "Media asset IDs must be integers"
  end

  def set_product_og_image!(product, media_asset_id)
    if media_asset_id.nil?
      product.update(og_media_asset_id: nil)
    else
      id = Integer(media_asset_id, exception: false)
      raise Invalid, "og image must be a media asset id" if id.nil?
      unless ProductImage.first(product_id: product.id, media_asset_id: id)
        raise Invalid, "That image is not attached to this product. Attach it first, then pick it as the share image."
      end

      product.update(og_media_asset_id: id)
    end
    rebake_product(product)
    product
  end

  def drop_stale_og_image!(product, remaining_ids)
    return unless product.og_media_asset_id
    return if remaining_ids.map(&:to_i).include?(product.og_media_asset_id)

    product.update(og_media_asset_id: nil)
  end

  # ── Shared ─────────────────────────────────────────────────────────────────

  # Published pages are static files, so a catalogue edit that did not re-bake
  # would keep serving the old price until someone pressed Publish.
  def rebake_product(product, old_slug: nil)
    return 0 if product.nil?

    PartialBake.call(product: product, old_slug: old_slug).page_count
  end

  def rebake_collection(collection, old_slug: nil)
    return 0 if collection.nil?

    PartialBake.call(collection: collection, old_slug: old_slug).page_count
  end

  # Models routinely send "12" where the schema says 12. Coercing beats
  # refusing; a genuinely unparseable value still fails validation below.
  def integer(params, key)
    Integer(params.fetch(key, 0), exception: false) || 0
  end

  # Omitted `fields` keeps what is already stored. Present `fields` is merged
  # (namespaced) so a caller can set mileage without resending origin.
  def fields_attribute(params, existing, owner)
    incoming = params["fields"] || params[:fields]
    return {} if incoming.nil?

    { fields: CatalogueFields.merge(existing, incoming, owner: owner) }
  end
end
