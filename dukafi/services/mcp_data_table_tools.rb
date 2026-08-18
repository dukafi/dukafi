require "json"

# Custom tables, for an external agent.
#
# These are not products. They are the Team roster, the FAQ, anything a
# merchant invented columns for. Pages loop them as `data/<slug>` and bake
# the rows into static HTML — so a write here re-bakes the pages that list
# the table, the same way a price change re-bakes product cards.
module McpDataTableTools
  MAX_LIMIT = 100
  DEFAULT_LIMIT = 50

  module_function

  def all
    [
      list_data_tables, read_data_table, create_data_table, update_data_table, delete_data_table,
      list_data_rows, upsert_data_row, delete_data_row,
    ]
  end

  READ_TOOLS = %w[list_data_tables read_data_table list_data_rows].freeze

  def table_summary(table)
    {
      "slug" => table.slug, "name" => table.name,
      "columns" => table.column_list,
      "rows" => table.custom_rows_dataset.count,
    }
  end

  def find_table!(slug)
    value = slug.to_s.strip.downcase
    raise McpTools::ArgumentError, "tableSlug is required" if value.empty?

    CustomTable.first(slug: value) ||
      raise(McpTools::ArgumentError,
            "No data table with slug #{value.inspect}. Call list_data_tables to see what exists.")
  end

  def find_row!(table, slug)
    value = slug.to_s.strip.downcase
    raise McpTools::ArgumentError, "slug is required" if value.empty?

    table.custom_rows_dataset.first(slug: value) ||
      raise(McpTools::ArgumentError,
            "No row with slug #{value.inspect} in table #{table.slug.inspect}.")
  end

  def writing
    yield
  rescue CustomTableWrites::Invalid => e
    raise McpTools::ArgumentError, e.message
  end

  def clamp_limit(value)
    (Integer(value, exception: false) || DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
  end

  def list_data_tables
    {
      name: "list_data_tables",
      title: "List data tables",
      description: "Merchant-defined tables (team, FAQ, lookbook — not products). " \
                   "The SLUG is what a page loop uses as source data/<slug>.",
      input_schema: {
        "type" => "object",
        "properties" => {},
        "additionalProperties" => false,
      },
      run: lambda do |_args|
        { "tables" => CustomTable.order(:name).map { |table| table_summary(table) } }
      end,
    }
  end

  def read_data_table
    {
      name: "read_data_table",
      title: "Read a data table",
      description: "One table’s columns and every row’s cells. Media columns " \
                   "store a media asset id; the published loop resolves that to a URL.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "tableSlug" => { "type" => "string", "description" => "The table slug from list_data_tables." },
        },
        "required" => ["tableSlug"],
        "additionalProperties" => false,
      },
      run: lambda do |args|
        table = find_table!(args["tableSlug"])
        table_summary(table).merge(
          "rowList" => table.custom_rows.map { |row| CustomTableWrites.row_payload(row) },
        )
      end,
    }
  end

  def create_data_table
    {
      name: "create_data_table",
      title: "Create a data table",
      description: "Define a table and its columns. Column types: text, longText, " \
                   "number, boolean, url, media. Then add rows with upsert_data_row. " \
                   "A Site loop binds to data/<slug> after you publish the page.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "name" => { "type" => "string" },
          "slug" => { "type" => "string", "description" => "Optional. Generated from the name when omitted." },
          "columns" => {
            "type" => "array",
            "items" => {
              "type" => "object",
              "properties" => {
                "id" => { "type" => "string", "description" => "Machine name used in bindings, e.g. name, image." },
                "label" => { "type" => "string" },
                "type" => { "type" => "string", "enum" => CustomTableWrites::COLUMN_TYPES },
              },
              "required" => ["label"],
              "additionalProperties" => false,
            },
          },
        },
        "required" => ["name", "columns"],
        "additionalProperties" => false,
      },
      run: lambda do |args|
        table = writing { CustomTableWrites.create_table!(args) }
        table_summary(table)
      end,
    }
  end

  def update_data_table
    {
      name: "update_data_table",
      title: "Update a data table",
      description: "Rename a table or replace its columns. Removed column ids are " \
                   "dropped from every row. Pages looping this table re-bake.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "tableSlug" => { "type" => "string" },
          "name" => { "type" => "string" },
          "slug" => { "type" => "string" },
          "columns" => {
            "type" => "array",
            "items" => {
              "type" => "object",
              "properties" => {
                "id" => { "type" => "string" },
                "label" => { "type" => "string" },
                "type" => { "type" => "string", "enum" => CustomTableWrites::COLUMN_TYPES },
              },
              "required" => ["label"],
              "additionalProperties" => false,
            },
          },
        },
        "required" => ["tableSlug"],
        "additionalProperties" => false,
      },
      run: lambda do |args|
        table = find_table!(args["tableSlug"])
        table = writing { CustomTableWrites.update_table!(table, args) }
        table_summary(table)
      end,
    }
  end

  def delete_data_table
    {
      name: "delete_data_table",
      title: "Delete a data table",
      description: "Deletes the table and every row. Pages that looped it re-bake empty.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "tableSlug" => { "type" => "string" },
        },
        "required" => ["tableSlug"],
        "additionalProperties" => false,
      },
      run: lambda do |args|
        table = find_table!(args["tableSlug"])
        writing { CustomTableWrites.delete_table!(table) }
        { "deleted" => true, "slug" => args["tableSlug"].to_s }
      end,
    }
  end

  def list_data_rows
    {
      name: "list_data_rows",
      title: "List data table rows",
      description: "Rows in one table, in drag order. The slug identifies a row to upsert_data_row.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "tableSlug" => { "type" => "string" },
          "limit" => { "type" => "integer", "minimum" => 1, "maximum" => MAX_LIMIT },
        },
        "required" => ["tableSlug"],
        "additionalProperties" => false,
      },
      run: lambda do |args|
        table = find_table!(args["tableSlug"])
        rows = table.custom_rows_dataset.order(:position).limit(clamp_limit(args["limit"]))
        { "tableSlug" => table.slug, "rows" => rows.map { |row| CustomTableWrites.row_payload(row) },
          "total" => table.custom_rows_dataset.count }
      end,
    }
  end

  def upsert_data_row
    {
      name: "upsert_data_row",
      title: "Create or update a data row",
      description: "Set cells keyed by column id. A media column accepts a media asset " \
                   "id or its public path. Omit slug on create to generate one from the " \
                   "first text column. This is live: listing pages re-bake immediately.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "tableSlug" => { "type" => "string" },
          "slug" => { "type" => "string" },
          "position" => { "type" => "integer", "minimum" => 0 },
          "cells" => { "type" => "object" },
        },
        "required" => ["tableSlug", "cells"],
        "additionalProperties" => false,
      },
      run: lambda do |args|
        table = find_table!(args["tableSlug"])
        slug = args["slug"].to_s.strip.downcase
        row = slug.empty? ? nil : table.custom_rows_dataset.first(slug: slug)
        saved = writing do
          if row
            CustomTableWrites.update_row!(row, args)
          else
            CustomTableWrites.create_row!(table, args)
          end
        end
        CustomTableWrites.row_payload(saved)
      end,
    }
  end

  def delete_data_row
    {
      name: "delete_data_row",
      title: "Delete a data row",
      description: "Removes one row. Pages looping the table re-bake without it.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "tableSlug" => { "type" => "string" },
          "slug" => { "type" => "string" },
        },
        "required" => ["tableSlug", "slug"],
        "additionalProperties" => false,
      },
      run: lambda do |args|
        table = find_table!(args["tableSlug"])
        row = find_row!(table, args["slug"])
        writing { CustomTableWrites.delete_row!(row) }
        { "deleted" => true, "slug" => args["slug"].to_s, "tableSlug" => table.slug }
      end,
    }
  end
end
