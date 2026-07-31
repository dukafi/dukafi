class Product < Sequel::Model
  one_to_many :variants, order: :position
  many_to_many :collections, join_table: :collection_products, order: Sequel[:collection_products][:position]

  def validate
    super
    validates_presence %i[title slug status]
    validates_format(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/, :slug, message: "must use lowercase words separated by hyphens")
    errors.add(:status, "must be draft or active") unless %w[draft active].include?(status)
  end
end
