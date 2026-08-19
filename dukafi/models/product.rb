require "json"

class Product < Sequel::Model
  extend Sluggable
  def self.slug_fallback = "product"

  one_to_many :variants, order: :position
  many_to_many :collections, join_table: :collection_products, order: Sequel[:collection_products][:position]
  one_to_many :product_images, order: :position
  many_to_many :media_assets, join_table: :product_images, order: Sequel[:product_images][:position]
  many_to_one :og_media_asset, class: :MediaAsset, key: :og_media_asset_id

  def fields=(value)
    super(value.is_a?(String) ? value : JSON.generate(value || {}))
  end

  def fields_data
    CatalogueFields.parse(fields)
  end

  def validate
    super
    validates_presence %i[title slug status]
    validates_format(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/, :slug, message: "must use lowercase words separated by hyphens")
    errors.add(:status, "must be draft or active") unless %w[draft active].include?(status)
  end
end
