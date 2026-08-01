require "csv"

class ProductCsvImporter
  REQUIRED_HEADERS = %w[product_title product_slug status sku variant_title price_cents currency stock position].freeze
  Result = Data.define(:products, :variants)
  class Error < StandardError; end

  def self.call(csv)
    rows = CSV.parse(csv.to_s, headers: true)
    missing = REQUIRED_HEADERS - (rows.headers || [])
    raise Error, "Missing columns: #{missing.join(', ')}" unless missing.empty?

    product_ids = []
    variant_count = 0
    DB.transaction do
      rows.each_with_index do |row, index|
        line = index + 2
        begin
          product = import_product(row)
          product_ids << product.id
          variant_count += 1 if import_variant(product, row, index)
        rescue Sequel::ValidationFailed, ArgumentError => error
          raise Error, "Row #{line}: #{error.message}"
        end
      end
    end
    Result.new(products: product_ids.uniq.length, variants: variant_count)
  rescue CSV::MalformedCSVError => error
    raise Error, "Invalid CSV: #{error.message}"
  end

  def self.import_product(row)
    slug = row["product_slug"].to_s.strip.downcase
    product = Product.first(slug:) || Product.new(slug:)
    product.set(
      title: row["product_title"].to_s.strip,
      vendor: row["vendor"].to_s.strip,
      status: row["status"].to_s.strip.downcase,
      description_document: RichTextSanitizer.call(row["description_html"]),
    )
    product.save
    product
  end

  def self.import_variant(product, row, index)
    sku = row["sku"].to_s.strip
    return false if sku.empty?

    variant = product.variants_dataset.first(sku:) || product.add_variant(
      sku:,
      title: row["variant_title"].to_s.strip,
      price_cents: integer(row, "price_cents"),
      # v1 is single-currency — the store's configured currency always wins
      # over whatever the CSV column says, so an import can't put variants
      # out of sync with the rest of the catalog (see commerce_variant_attributes
      # in admin_api.rb for the same rule on the manual-entry path).
      currency: CommerceSettings.current.currency,
      stock: integer(row, "stock"),
      position: optional_integer(row, "position", index),
    )
    if variant.id
      variant.update(
        title: row["variant_title"].to_s.strip,
        price_cents: integer(row, "price_cents"),
        # v1 is single-currency — the store's configured currency always wins
      # over whatever the CSV column says, so an import can't put variants
      # out of sync with the rest of the catalog (see commerce_variant_attributes
      # in admin_api.rb for the same rule on the manual-entry path).
      currency: CommerceSettings.current.currency,
        stock: integer(row, "stock"),
        position: optional_integer(row, "position", index),
      )
    end
    true
  end

  def self.integer(row, field)
    Integer(row[field].to_s, 10)
  rescue ArgumentError
    raise ArgumentError, "#{field} must be an integer"
  end

  def self.optional_integer(row, field, fallback)
    value = row[field].to_s.strip
    value.empty? ? fallback : integer(row, field)
  end

  private_class_method :import_product, :import_variant, :integer, :optional_integer
end
