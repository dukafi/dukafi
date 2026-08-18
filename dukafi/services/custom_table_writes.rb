require "json"
require "securerandom"

# Custom tables — merchant-defined rows that bake into static pages.
#
# A Team roster is not a product. It still has to reach the storefront the
# same way the catalogue does: written here, prefetched at bake, looped as
# `data/<slug>`. Both the Dashboard and MCP come through this module so a
# column rename cannot apply in one client and silently not in the other.
#
# Raises `Invalid` with a message a human or a model can act on.
module CustomTableWrites
  class Invalid < StandardError; end

  COLUMN_TYPES = %w[text longText number boolean url media].freeze
  RESERVED_COLUMN_IDS = %w[
    id slug createdAt updatedAt tableSlug tableName position href
  ].freeze
  COLUMN_ID = /\A[a-z][a-z0-9_]*\z/

  module_function

  def create_table!(params)
    table = CustomTable.new(
      name: required_name(params),
      slug: table_slug(params),
      created_at: Time.now, updated_at: Time.now,
    )
    table.column_list = normalize_columns(params["columns"] || params[:columns])
    table.save
    table
  rescue Sequel::ValidationFailed, Sequel::UniqueConstraintViolation => e
    raise Invalid, e.message
  end

  def update_table!(table, params)
    old_slug = table.slug
    next_slug = params.key?("slug") || params.key?(:slug) ? table_slug(params, current: table.slug, exclude_id: table.id) : table.slug
    next_name = params.key?("name") || params.key?(:name) ? required_name(params) : table.name
    incoming_columns = params["columns"] || params[:columns]
    DB.transaction do
      table.name = next_name
      table.slug = next_slug
      table.column_list = normalize_columns(incoming_columns) unless incoming_columns.nil?
      table.updated_at = Time.now
      table.save
      prune_cells!(table) unless incoming_columns.nil?
    end
    rebake!(old_slug)
    rebake!(table.slug) if table.slug != old_slug
    table
  rescue Sequel::ValidationFailed, Sequel::UniqueConstraintViolation => e
    raise Invalid, e.message
  end

  def delete_table!(table)
    slug = table.slug
    DB.transaction { table.destroy }
    rebake!(slug)
  end

  def create_row!(table, params)
    row = CustomRow.new(
      custom_table_id: table.id,
      slug: row_slug(table, params),
      position: integer(params, "position", default: next_position(table)),
      created_at: Time.now, updated_at: Time.now,
    )
    row.cells_data = normalize_cells(table, params["cells"] || params[:cells] || {})
    row.save
    rebake!(table.slug)
    row
  rescue Sequel::ValidationFailed, Sequel::UniqueConstraintViolation => e
    raise Invalid, e.message
  end

  def update_row!(row, params)
    table = row.custom_table
    DB.transaction do
      row.slug = row_slug(table, params, current: row.slug, exclude_id: row.id) if params.key?("slug") || params.key?(:slug)
      row.position = integer(params, "position", default: row.position) if params.key?("position") || params.key?(:position)
      incoming = params["cells"] || params[:cells]
      row.cells_data = normalize_cells(table, incoming) unless incoming.nil?
      row.updated_at = Time.now
      row.save
    end
    rebake!(table.slug)
    row
  rescue Sequel::ValidationFailed, Sequel::UniqueConstraintViolation => e
    raise Invalid, e.message
  end

  def delete_row!(row)
    slug = row.custom_table.slug
    DB.transaction { row.destroy }
    rebake!(slug)
  end

  def table_payload(table)
    {
      "id" => table.id, "name" => table.name, "slug" => table.slug,
      "columns" => table.column_list,
      "rowCount" => table.custom_rows_dataset.count,
      "createdAt" => table.created_at&.utc&.iso8601,
      "updatedAt" => table.updated_at&.utc&.iso8601,
    }
  end

  def row_payload(row)
    {
      "id" => row.id, "slug" => row.slug, "position" => row.position,
      "cells" => row.cells_data,
      "createdAt" => row.created_at&.utc&.iso8601,
      "updatedAt" => row.updated_at&.utc&.iso8601,
    }
  end

  def media_index_for(table)
    ids = []
    table.column_list.each do |column|
      next unless column["type"] == "media"

      table.custom_rows.each do |row|
        id = Integer(row.cells_data[column["id"]], exception: false)
        ids << id if id
      end
    end
    MediaAsset.where(id: ids.uniq).all.to_h { |asset| [asset.id, asset] }
  end

  def admin_rows(table)
    media_by_id = media_index_for(table)
    table.custom_rows.map do |row|
      row_payload(row).merge("entry" => baked_row(table, row, media_by_id))
    end
  end

  # Shape the publisher loops over. Media columns resolve to a public URL on
  # the same key the merchant named, so `{currentEntry.image}` is a src, not
  # an asset id.
  def baked_row(table, row, media_by_id)
    cells = row.cells_data
    entry = {
      "id" => row.id, "slug" => row.slug, "position" => row.position,
      "createdAt" => row.created_at.to_i,
      "tableSlug" => table.slug, "tableName" => table.name,
    }
    table.column_list.each do |column|
      id = column.fetch("id")
      raw = cells[id]
      if column["type"] == "media"
        asset = media_for(raw, media_by_id)
        entry[id] = asset ? "/#{asset.path}" : ""
        entry["#{id}Alt"] = asset&.alt_text.to_s
      else
        entry[id] = raw
      end
    end
    entry
  end

  def normalize_columns(raw)
    list = case raw
           when String
             parsed = JSON.parse(raw)
             parsed.is_a?(Array) ? parsed : []
           when Array then raw
           else []
           end
    raise Invalid, "Add at least one column" if list.empty?

    seen = []
    list.each_with_index.map do |item, index|
      column = item.is_a?(Hash) ? item.transform_keys(&:to_s) : {}
      id = column["id"].to_s.strip
      id = CustomTable.slugify(column["label"].to_s).tr("-", "_") if id.empty?
      id = "column_#{index + 1}" if id.empty?
      raise Invalid, "column id #{id.inspect} is reserved" if RESERVED_COLUMN_IDS.include?(id)
      raise Invalid, "column id #{id.inspect} is used twice" if seen.include?(id)
      unless id.match?(COLUMN_ID)
        raise Invalid, "column id #{id.inspect} must start with a letter and use only lowercase letters, numbers, and underscores"
      end
      seen << id
      type = column["type"].to_s
      type = "text" unless COLUMN_TYPES.include?(type)
      label = column["label"].to_s.strip
      { "id" => id, "label" => label.empty? ? id : label, "type" => type }
    end
  rescue JSON::ParserError
    raise Invalid, "columns must be a list"
  end

  def normalize_cells(table, incoming)
    raw = incoming.is_a?(Hash) ? incoming : {}
    by_id = table.column_list.to_h { |column| [column.fetch("id"), column] }
    cells = {}
    raw.each do |key, value|
      column = by_id[key.to_s]
      next unless column

      cells[column["id"]] = coerce_cell(column, value)
    end
    cells
  end

  def coerce_cell(column, value)
    case column["type"]
    when "number"
      return nil if value.nil? || value.to_s.strip.empty?

      number = Float(value, exception: false)
      raise Invalid, "#{column['label']} must be a number" unless number

      number.to_i == number ? number.to_i : number
    when "boolean"
      value == true || value.to_s == "true" || value.to_s == "1"
    when "media"
      return nil if value.nil? || value.to_s.strip.empty?

      asset = resolve_media(value)
      raise Invalid, "#{column['label']} is not a media asset in this store" unless asset

      asset.id
    else
      value.nil? ? "" : value.to_s
    end
  end

  def resolve_media(value)
    if value.is_a?(Integer) || value.to_s.match?(/\A\d+\z/)
      MediaAsset[Integer(value)]
    else
      path = value.to_s.sub(%r{\A/}, "")
      MediaAsset.first(path: path)
    end
  end

  def media_for(raw, media_by_id)
    id = Integer(raw, exception: false)
    id ? media_by_id[id] : nil
  end

  def prune_cells!(table)
    allowed = table.column_list.map { |column| column.fetch("id") }
    table.custom_rows.each do |row|
      cells = row.cells_data.slice(*allowed)
      next if cells == row.cells_data

      row.cells_data = cells
      row.updated_at = Time.now
      row.save
    end
  end

  def required_name(params)
    name = params.fetch("name", params[:name]).to_s.strip
    raise Invalid, "name is required" if name.empty?

    name
  end

  def table_slug(params, current: nil, exclude_id: nil)
    submitted = params.fetch("slug", params[:slug]).to_s.strip.downcase
    title = params.fetch("name", params[:name]).to_s
    if !submitted.empty?
      normalized = CustomTable.slugify(submitted)
      raise Invalid, "slug is required" if normalized.empty?
      if CustomTable.slug_taken?(normalized, exclude_id) && normalized != current
        raise Invalid, "A table with slug #{normalized.inspect} already exists"
      end
      normalized
    elsif current
      current
    else
      CustomTable.unique_slug(title, exclude_id: exclude_id)
    end
  end

  def row_slug(table, params, current: nil, exclude_id: nil)
    submitted = params.fetch("slug", params[:slug]).to_s.strip.downcase
    if !submitted.empty?
      normalized = CustomTable.slugify(submitted)
      raise Invalid, "slug is required" if normalized.empty?

      taken = table.custom_rows_dataset.where(slug: normalized)
      taken = taken.exclude(id: exclude_id) if exclude_id
      raise Invalid, "A row with slug #{normalized.inspect} already exists in this table" unless taken.empty?

      normalized
    elsif current
      current
    else
      fallback = first_text_value(table, params) || "row"
      unique_row_slug(table, fallback, exclude_id)
    end
  end

  def first_text_value(table, params)
    cells = params["cells"] || params[:cells] || {}
    text_id = table.column_list.find { |column| %w[text longText].include?(column["type"]) }&.fetch("id")
    return nil unless text_id

    CustomTable.slugify(cells[text_id] || cells[text_id.to_sym].to_s)
  end

  def unique_row_slug(table, title, exclude_id)
    base = CustomTable.slugify(title)
    base = "row" if base.empty?
    return base unless row_slug_taken?(table, base, exclude_id)

    100.times do
      candidate = "#{base}-#{SecureRandom.hex(2)}"
      return candidate unless row_slug_taken?(table, candidate, exclude_id)
    end
    "#{base}-#{SecureRandom.hex(6)}"
  end

  def row_slug_taken?(table, slug, exclude_id)
    scope = table.custom_rows_dataset.where(slug: slug)
    scope = scope.exclude(id: exclude_id) if exclude_id
    !scope.empty?
  end

  def next_position(table)
    (table.custom_rows_dataset.max(:position) || -1) + 1
  end

  def integer(params, key, default:)
    value = params[key] || params[key.to_sym]
    return default if value.nil?

    Integer(value, exception: false) || default
  end

  def dependent_paths(slug)
    RebuildIndex.targets_for_data(slug)
  end

  def rebake!(slug)
    paths = dependent_paths(slug)
    return 0 if paths.empty?

    PartialBake.call(paths: paths).page_count
  rescue StandardError => e
    warn "[custom-tables] rebake failed: #{e.class}: #{e.message}"
    0
  end
end
