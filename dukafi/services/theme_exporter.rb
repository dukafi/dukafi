require "json"

# Snapshot a store as a theme: structure and catalogue, media as URLs.
#
# The destination must not fetch localhost (SSRF). The merchant's browser
# can, so export records `http://localhost:9292/uploads/…` and import
# downloads those in the tab, then uploads them to the new store.
class ThemeExporter
  SECTIONS = %w[media design pages templates tables forms products reviews].freeze

  def self.call(origin:, include: {})
    new(origin: origin, include: include).call
  end

  def initialize(origin:, include: {})
    @origin = origin.to_s.sub(%r{/\z}, "")
    @include = SECTIONS.to_h { |name| [name, truthy?(include, name)] }
  end

  def call
    pages = Page.order(:slug).all
    ordinary = pages.select { |page| page.kind.to_s == "page" }
    templates = pages.select { |page| page.kind.to_s == "template" }
    partials = pages.select { |page| page.kind.to_s == "partial" }
    tables = CustomTable.order(:name).all
    products = Product.order(:slug).all
    collections = Collection.order(:sort_order, :slug).all
    reviews = Review.newest_first.all
    assets = MediaAsset.order(:id).all

    payload = {
      "theme" => {
        "id" => theme_id,
        "name" => site_name,
        "version" => "1.0.0",
        "sourceOrigin" => @origin,
        "contents" => {},
      },
    }

    payload["media"] = assets.map { |asset| media_row(asset) } if @include["media"]
    payload["shell"] = site_shell if @include["design"]
    payload["pages"] = ordinary.map { |page| page_row(page) } if @include["pages"]
    payload["templates"] = templates.map { |page| page_row(page) } if @include["templates"]
    payload["partials"] = partials.map { |page| page_row(page) } if @include["pages"]
    payload["tables"] = tables.map { |table| table_row(table) } if @include["tables"]
    if @include["products"]
      payload["catalogue"] = {
        "products" => products.map { |product| product_row(product) },
        "collections" => collections.map { |collection| collection_row(collection) },
      }
    end
    payload["reviews"] = reviews.map { |review| review_row(review) } if @include["reviews"]

    payload["theme"]["contents"] = {
      "pages" => Array(payload["pages"]).length,
      "templates" => Array(payload["templates"]).length,
      "partials" => Array(payload["partials"]).length,
      "tables" => Array(payload["tables"]).length,
      "forms" => packed_form_ids(payload).length,
      "products" => Array(payload.dig("catalogue", "products")).length,
      "collections" => Array(payload.dig("catalogue", "collections")).length,
      "reviews" => Array(payload["reviews"]).length,
      "media" => Array(payload["media"]).length,
    }

    payload
  end

  private

  def truthy?(include, name)
    return true if include.nil? || include.empty?
    return true unless include.key?(name) || include.key?(name.to_sym)

    value = include[name] || include[name.to_sym]
    value == true || value.to_s == "1" || value.to_s.downcase == "true"
  end

  def site_name
    SiteState.first&.site&.dig("name").to_s
  end

  def theme_id
    slug = site_name.downcase.gsub(/[^a-z0-9]+/, "-").gsub(/\A-|-\z/, "")
    slug.empty? ? "theme" : slug
  end

  def site_shell
    site = SiteState.first&.site
    site.is_a?(Hash) ? site : {}
  end

  def media_row(asset)
    path = "/#{asset.path}"
    {
      "id" => asset.id,
      "path" => path,
      "url" => "#{@origin}#{path}",
      "filename" => File.basename(asset.path),
      "mimeType" => asset.mime.to_s,
      "altText" => asset.alt_text.to_s,
      "title" => asset.title.to_s,
      "caption" => asset.caption.to_s,
      "tags" => asset.tags,
    }
  end

  def page_row(page)
    document = JSON.parse(JSON.generate(page.document_data))
    strip_forms!(document) unless @include["forms"]
    {
      "slug" => page.slug,
      "title" => page.title,
      "kind" => page.kind,
      "status" => page.status,
      "access" => page.access,
      "authRedirect" => page.auth_redirect == true,
      "document" => document,
    }
  end

  def table_row(table)
    {
      "slug" => table.slug,
      "name" => table.name,
      "columns" => table.column_list,
      "rows" => table.custom_rows.map { |row| CustomTableWrites.row_payload(row) },
    }
  end

  def product_row(product)
    {
      "slug" => product.slug,
      "title" => product.title,
      "status" => product.status,
      "descriptionHtml" => product.description_document.to_s,
      "fields" => CatalogueFields.parse(product.fields),
      "images" => product.media_assets.map { |asset| { "id" => asset.id, "path" => "/#{asset.path}" } },
      "variants" => product.variants.map do |variant|
        {
          "sku" => variant.sku,
          "title" => variant.title,
          "priceCents" => variant.price_cents,
          "stock" => variant.stock,
          "position" => variant.position,
          "fields" => CatalogueFields.parse(variant.fields),
        }
      end,
    }
  end

  def collection_row(collection)
    {
      "slug" => collection.slug,
      "title" => collection.title,
      "description" => collection.description.to_s,
      "sortOrder" => collection.sort_order,
      "productSlugs" => collection.products.map(&:slug),
    }
  end

  def review_row(review)
    {
      "authorName" => review.author_name,
      "body" => review.body,
      "rating" => review.rating,
      "productSlug" => review.product&.slug,
      "approved" => review.approved?,
    }
  end

  def packed_form_ids(payload)
    docs = Array(payload["pages"]) + Array(payload["templates"]) + Array(payload["partials"])
    docs.flat_map { |row| form_ids_in(row["document"]) }.uniq
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

  def strip_forms!(document)
    nodes = document["nodes"]
    return unless nodes.is_a?(Hash)

    form_ids = nodes.select { |_id, node| node.is_a?(Hash) && node["moduleId"] == "base.form" }.keys
    form_ids.each { |id| delete_subtree(nodes, document["rootNodeId"], id) }
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
end
