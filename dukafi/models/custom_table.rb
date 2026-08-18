require "json"

class CustomTable < Sequel::Model
  extend Sluggable
  def self.slug_fallback = "table"

  one_to_many :custom_rows, key: :custom_table_id, order: :position

  # Not named `columns` — Sequel already uses that for the table schema.
  def column_list
    list = JSON.parse(columns_json.to_s)
    list.is_a?(Array) ? list : []
  rescue JSON::ParserError
    []
  end

  def column_list=(value)
    self.columns_json = value.is_a?(String) ? value : JSON.generate(value || [])
  end

  def validate
    super
    validates_presence %i[name slug]
    validates_format(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/, :slug, message: "must use lowercase words separated by hyphens")
  end
end
