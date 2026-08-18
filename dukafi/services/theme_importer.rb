require "json"

# Apply a theme after the browser has copied media.
#
# Pages are drafts until the merchant publishes. Catalogue rows are live.
# Colliding product slugs are skipped; colliding page slugs are replaced
# when `overridePages` is on.
class ThemeImporter
  class Error < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  Result = Data.define(:applied, :skipped, :mediaCopied, :mediaFailed)

  def self.call(payload, options:, remap:)
    new(payload, options: options, remap: remap).call
  end

  def initialize(payload, options:, remap:)
    @payload = payload
    @options = {
      "overridePages" => truthy?(options, "overridePages", default: true),
      "tables" => truthy?(options, "tables", default: true),
      "forms" => truthy?(options, "forms", default: true),
      "products" => truthy?(options, "products", default: true),
      "reviews" => truthy?(options, "reviews", default: true),
      "design" => truthy?(options, "design", default: true),
      "pages" => truthy?(options, "pages", default: true),
      "templates" => truthy?(options, "templates", default: true),
    }
    @path_map = path_map_from(remap)
    @id_map = id_map_from(remap)
    @applied = Hash.new(0)
    @skipped = Hash.new(0)
  end

  def call
    DB.transaction do
      apply_shell if @options["design"] && @payload["shell"].is_a?(Hash)
      apply_tables if @options["tables"]
      existing_forms = form_ids_on_site
      apply_pages("pages", kind: "page", override: @options["overridePages"], forms: @options["forms"], existing_forms: existing_forms) if @options["pages"]
      apply_pages("templates", kind: "template", override: @options["overridePages"], forms: @options["forms"], existing_forms: existing_forms) if @options["templates"]
      apply_pages("partials", kind: "partial", override: @options["overridePages"], forms: @options["forms"], existing_forms: existing_forms) if @options["pages"]
      apply_catalogue if @options["products"]
      apply_reviews if @options["reviews"]
      bump_seq!
    end

    Result.new(
      applied: @applied,
      skipped: @skipped,
      mediaCopied: @path_map.length,
      mediaFailed: 0,
    )
  end

  private

  def truthy?(hash, key, default:)
    return default unless hash.is_a?(Hash) && (hash.key?(key) || hash.key?(key.to_sym))

    value = hash[key] || hash[key.to_sym]
    value == true || value.to_s == "1" || value.to_s.downcase == "true"
  end

  def path_map_from(remap)
    raw = remap.is_a?(Hash) ? (remap["byPath"] || remap[:byPath] || {}) : {}
    raw.each_with_object({}) do |(from, to), map|
      next if from.to_s.empty? || to.to_s.empty?

      map[normalize_path(from)] = normalize_path(to)
    end
  end

  def id_map_from(remap)
    raw = remap.is_a?(Hash) ? (remap["byId"] || remap[:byId] || {}) : {}
    raw.each_with_object({}) do |(from, to), map|
      old_id = Integer(from, exception: false)
      new_id = Integer(to, exception: false)
      map[old_id] = new_id if old_id && new_id
    end
  end

  def normalize_path(value)
    path = value.to_s.strip
    path = "/#{path}" unless path.start_with?("/")
    path
  end

  def apply_shell
    state = SiteState.first || raise(Error.new("no_site", "This store has no site yet."))
    incoming = rewrite(@payload["shell"])
    current = state.site
    current = {} unless current.is_a?(Hash)
    merged = current.merge(incoming) do |key, old, incoming_value|
      if key == "styleRules" && old.is_a?(Hash) && incoming_value.is_a?(Hash)
        old.merge(incoming_value)
      else
        incoming_value
      end
    end
    merged["name"] = current["name"] if current["name"].to_s.strip != ""
    state.site = merged
    state.save
    @applied["design"] = 1
  end

  def apply_tables
    Array(@payload["tables"]).each do |row|
      slug = row["slug"].to_s.strip.downcase
      next if slug.empty?

      if CustomTable.first(slug: slug)
        @skipped["tables"] += 1
        next
      end

      table = CustomTableWrites.create_table!("name" => row["name"], "slug" => slug, "columns" => row["columns"])
      Array(row["rows"]).each do |entry|
        cells = rewrite_cells(table, entry["cells"] || {})
        CustomTableWrites.create_row!(table, "slug" => entry["slug"], "position" => entry["position"], "cells" => cells)
      end
      @applied["tables"] += 1
    end
  rescue CustomTableWrites::Invalid => e
    raise Error.new("invalid_table", e.message)
  end

  def apply_pages(key, kind:, override:, forms:, existing_forms:)
    Array(@payload[key]).each do |row|
      slug = row["slug"].to_s.strip.downcase
      next if slug.empty?

      document = rewrite(row["document"])
      unless document.is_a?(Hash)
        @skipped[key] += 1
        next
      end

      existing = Page.first(slug: slug)
      if existing && !override
        @skipped[key] += 1
        next
      end

      document = strip_forms(document) unless forms
      incoming_forms = form_ids_in(document)
      occupied = existing_forms - (existing ? form_ids_in(existing.document_data) : [])
      if forms && (incoming_forms & occupied).any?
        document = strip_forms(document) { |id| occupied.include?(id) }
      end

      saved = upsert_page(existing, row, slug, kind, document)
      existing_forms.concat(form_ids_in(saved.document_data)).uniq!
      @applied[key] += 1
    end
  rescue Sequel::ValidationFailed => e
    raise Error.new("invalid_page", e.message)
  end

  def upsert_page(existing, row, slug, kind, document)
    attrs = {
      title: row.fetch("title", slug).to_s,
      kind: %w[page template partial].include?(row["kind"].to_s) ? row["kind"].to_s : kind,
      status: "draft",
      access: Page::ACCESS_LEVELS.include?(row["access"].to_s) ? row["access"].to_s : "public",
      document: document,
    }

    if existing
      existing.update(attrs)
      Page.mark_auth_redirect!(existing) if row["authRedirect"] == true
      existing
    else
      page = Page.create(attrs.merge(slug: slug))
      Page.mark_auth_redirect!(page) if row["authRedirect"] == true
      page
    end
  end

  def apply_catalogue
    catalogue = @payload["catalogue"]
    return unless catalogue.is_a?(Hash)

    Array(catalogue["products"]).each do |row|
      slug = row["slug"].to_s.strip.downcase
      next if slug.empty?

      if Product.first(slug: slug)
        @skipped["products"] += 1
        next
      end

      product = Product.create(
        title: row.fetch("title", slug).to_s,
        slug: slug,
        status: %w[draft active].include?(row["status"].to_s) ? row["status"].to_s : "draft",
        description_document: RichTextSanitizer.call(row["descriptionHtml"].to_s),
        fields: row["fields"] || {},
      )
      Array(row["variants"]).each do |variant|
        sku = variant["sku"].to_s.strip
        sku = "#{slug}-#{variant["position"] || 0}" if sku.empty?
        product.add_variant(
          sku: sku,
          title: variant.fetch("title", "Default").to_s,
          price_cents: Integer(variant["priceCents"], exception: false) || 0,
          currency: CommerceSettings.current.currency,
          stock: Integer(variant["stock"], exception: false) || 0,
          position: Integer(variant["position"], exception: false) || 0,
          fields: variant["fields"] || {},
        )
      end
      attach_images!(product, Array(row["images"]))
      @applied["products"] += 1
    end

    Array(catalogue["collections"]).each do |row|
      slug = row["slug"].to_s.strip.downcase
      next if slug.empty?

      if Collection.first(slug: slug)
        @skipped["collections"] += 1
        next
      end

      collection = Collection.create(
        title: row.fetch("title", slug).to_s,
        slug: slug,
        description: row["description"].to_s,
        sort_order: Integer(row["sortOrder"], exception: false) || 0,
      )
      ids = Array(row["productSlugs"]).filter_map { |item| Product.first(slug: item.to_s)&.id }
      CommerceWrites.set_collection_products!(collection, ids) unless ids.empty?
      @applied["collections"] += 1
    end
  rescue Sequel::ValidationFailed, CatalogueFields::Invalid, CommerceWrites::Invalid => e
    raise Error.new("invalid_catalogue", e.message)
  end

  def attach_images!(product, images)
    assets = images.filter_map do |image|
      if (id = @id_map[Integer(image["id"], exception: false)])
        MediaAsset[id]
      else
        path = @path_map[normalize_path(image["path"].to_s)]
        path ? MediaAsset.first(path: path.delete_prefix("/")) : nil
      end
    end
    assets.each_with_index do |asset, index|
      ProductImage.dataset.insert(product_id: product.id, media_asset_id: asset.id, position: index)
    end
  end

  def apply_reviews
    Array(@payload["reviews"]).each do |row|
      author = row["authorName"].to_s.strip
      body = row["body"].to_s.strip
      next if author.empty? || body.empty?

      product = Product.first(slug: row["productSlug"].to_s) if row["productSlug"].to_s.strip != ""
      if Review.where(author_name: author, body: body, product_id: product&.id).first
        @skipped["reviews"] += 1
        next
      end

      review = ReviewModeration.create!(
        "authorName" => author,
        "body" => body,
        "rating" => row["rating"],
        "productSlug" => product&.slug,
      )
      ReviewModeration.approve!(review)
      @applied["reviews"] += 1
    end
  rescue ReviewModeration::Invalid => e
    raise Error.new("invalid_review", e.message)
  end

  def rewrite(value, key = nil)
    case value
    when Hash
      value.to_h { |child_key, item| [child_key, rewrite(item, child_key)] }
    when Array
      value.map { |item| rewrite(item, key) }
    when String
      rewrite_string(value, key)
    else
      value
    end
  end

  def rewrite_string(value, key)
    if key.to_s == "mediaAssetId"
      old_id = Integer(value, exception: false)
      mapped = old_id && @id_map[old_id]
      return mapped.to_s if mapped

      return value
    end

    path = normalize_path(value)
    mapped = @path_map[path]
    return mapped if mapped
    return value unless value.start_with?("/") || value.include?("/uploads/")

    @path_map.each do |from, to|
      return value.sub(from, to) if value.include?(from)
    end
    value
  end

  def rewrite_cells(table, cells)
    raw = cells.is_a?(Hash) ? cells : {}
    raw.each_with_object({}) do |(key, value), out|
      column = table.column_list.find { |item| item["id"] == key.to_s }
      if column && column["type"] == "media"
        out[key] = remap_media_cell(value)
      else
        out[key] = value
      end
    end
  end

  def remap_media_cell(value)
    if (id = Integer(value, exception: false))
      return @id_map[id] || value
    end

    path = @path_map[normalize_path(value.to_s)]
    path || value
  end

  def form_ids_on_site
    Page.order(:id).all.flat_map { |page| form_ids_in(page.document_data) }.uniq
  end

  def form_ids_in(document)
    nodes = document.is_a?(Hash) ? document["nodes"] : nil
    return [] unless nodes.is_a?(Hash)

    nodes.each_value.filter_map do |node|
      next unless node.is_a?(Hash) && node["moduleId"] == "base.form"

      id = node.dig("props", "formId").to_s.strip
      id.empty? ? nil : id
    end
  end

  def strip_forms(document, &should_strip)
    nodes = document["nodes"]
    return document unless nodes.is_a?(Hash)

    form_ids = nodes.select do |_id, node|
      next false unless node.is_a?(Hash) && node["moduleId"] == "base.form"

      form_id = node.dig("props", "formId").to_s.strip
      should_strip ? should_strip.call(form_id) : true
    end.keys
    form_ids.each { |id| delete_subtree(nodes, document["rootNodeId"], id) }
    document
  end

  def delete_subtree(nodes, root_id, target_id)
    Array(nodes.dig(root_id, "children")).each do |child|
      delete_subtree(nodes, child, target_id)
    end
    parent = nodes[root_id]
    return unless parent.is_a?(Hash)

    children = Array(parent["children"])
    return unless children.include?(target_id)

    collect_ids(nodes, target_id).each { |id| nodes.delete(id) }
    parent["children"] = children - [target_id]
  end

  def collect_ids(nodes, id)
    node = nodes[id]
    return [] unless node.is_a?(Hash)

    [id] + Array(node["children"]).flat_map { |child| collect_ids(nodes, child) }
  end

  def bump_seq!
    state = SiteState.first
    return unless state

    seq = state.bump_seq!
    Page.dataset.update(seq: seq)
  end
end
