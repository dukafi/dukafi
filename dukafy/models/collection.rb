class Collection < Sequel::Model
  many_to_many :products, join_table: :collection_products, order: Sequel[:collection_products][:position]

  def validate
    super
    validates_presence %i[title slug]
    validates_format(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/, :slug, message: "must use lowercase words separated by hyphens")
    validates_integer :sort_order
    validates_min_value 0, :sort_order
  end
end
