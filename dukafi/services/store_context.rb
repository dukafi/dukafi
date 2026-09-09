# One snapshot for planning: brand, optional profile, page list, catalogue
# summaries, media sample. Caps keep a 5,000-product store from blowing the
# context window. This is a read. It does not require Dukafi AI, a model, or
# a filled-in profile.
module StoreContext
  SAMPLE = 20

  module_function

  def call
    site = SiteState.first&.site
    site = {} unless site.is_a?(Hash)
    settings = CommerceSettings.current
    product_ds = Product.order(:slug)
    collection_ds = Collection.order(:sort_order, :slug)
    page_ds = Page.order(:slug)
    assets = MediaAsset.order(Sequel.desc(:id)).limit(SAMPLE).all
    components = Array(site["visualComponents"])

    {
      "store" => {
        "name" => site["name"].to_s,
        "currency" => settings.currency,
      },
      "settings" => StoreSettings.payload,
      "profile" => StoreProfile.current.to_payload,
      "pages" => {
        "total" => page_ds.count,
        "sample" => page_ds.limit(100).all.map { |page| page_row(page) },
      },
      "products" => {
        "total" => product_ds.count,
        "sample" => product_ds.limit(SAMPLE).all.map { |product| product_row(product) },
      },
      "collections" => {
        "total" => collection_ds.count,
        "sample" => collection_ds.limit(SAMPLE).all.map { |collection| collection_row(collection) },
      },
      "media" => {
        "total" => MediaAsset.count,
        "sample" => assets.map { |asset| media_row(asset) },
      },
      "components" => components.filter_map { |row| component_row(row) },
      "tokens" => DesignTokens.summary,
      "recipes" => Recipes.summary,
    }
  end

  def page_row(page)
    {
      "slug" => page.slug,
      "title" => page.title,
      "kind" => page.kind,
      "status" => page.status,
    }
  end

  def product_row(product)
    {
      "slug" => product.slug,
      "title" => product.title,
      "status" => product.status,
      "hasImage" => !product.media_assets.empty?,
    }
  end

  def collection_row(collection)
    {
      "slug" => collection.slug,
      "title" => collection.title,
      "hasImage" => !collection.media_asset_id.nil?,
      "products" => collection.products.length,
    }
  end

  def media_row(asset)
    {
      "id" => asset.id.to_s,
      "path" => "/#{asset.path}",
      "filename" => File.basename(asset.path),
      "altText" => asset.alt_text.to_s,
    }
  end

  def search_media(query, limit: 5)
    cap = Integer(limit, exception: false) || 5
    cap = cap.clamp(1, 10)
    dataset = MediaAsset.order(Sequel.desc(:id))
    tokens = query.to_s.downcase.split(/\s+/).map { |token| token.gsub(/[%_]/, "") }.reject(&:empty?).first(4)
    tokens.each do |token|
      needle = "%#{token}%"
      dataset = dataset.where(
        Sequel.function(:lower, :path).like(needle) |
          Sequel.function(:lower, Sequel.function(:coalesce, :alt_text, "")).like(needle) |
          Sequel.function(:lower, Sequel.function(:coalesce, :title, "")).like(needle),
      )
    end
    dataset.limit(cap).all.map { |asset| media_row(asset) }
  end

  def component_row(row)
    return nil unless row.is_a?(Hash)

    id = row["id"].to_s
    return nil if id.empty?

    { "id" => id, "name" => row["name"].to_s }
  end
end
