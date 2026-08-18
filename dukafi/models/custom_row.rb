require "json"

class CustomRow < Sequel::Model
  many_to_one :custom_table

  def cells_data
    parsed = JSON.parse(cells_json.to_s)
    parsed.is_a?(Hash) ? parsed : {}
  rescue JSON::ParserError
    {}
  end

  def cells_data=(value)
    self.cells_json = value.is_a?(String) ? value : JSON.generate(value || {})
  end

  def validate
    super
    validates_presence %i[custom_table_id slug]
    validates_format(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/, :slug, message: "must use lowercase words separated by hyphens")
    validates_integer :position
    validates_min_value 0, :position
  end
end
