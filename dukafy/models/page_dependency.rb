class PageDependency < Sequel::Model
  set_primary_key [:page_path, :product_id]
  many_to_one :product
end
