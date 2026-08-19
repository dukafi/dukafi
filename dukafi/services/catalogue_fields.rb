require "json"

# Extra attributes on products and variants.
#
# Core columns stay the coffee-shop shape: title, price, stock. A car lot
# adds origin and mileage by *registering* fields, not by altering the
# schema. Values live in a JSON column, namespaced `plugin.key`, so two
# plugins cannot clobber each other. Pages bind the loop `currentEntry.fields`
# (key / label / value) and may also interpolate a registered short key
# (`{currentEntry.mileage}`) when it does not collide with a core field.
module CatalogueFields
  class Invalid < StandardError; end

  Field = Data.define(:plugin_id, :owner, :key, :label, :type)

  TYPES = %w[string integer boolean].freeze
  KEY = /\A[a-z][a-z0-9_]*\z/
  CUSTOM = "custom"

  # Names that already mean something on a product, variant, or cart line.
  # A plugin cannot register these, and a write cannot flatten over them.
  RESERVED = %w[
    id title slug href descriptionHtml imageUrl images variants fields
    priceDisplay priceCents currency createdAt sku stock position
    inCart cartQuantity url alt width height productSlug variantTitle
    quantity unitPriceCents unitPriceDisplay linePriceCents linePriceDisplay
    related
  ].freeze

  def self.declared(owner)
    Dukafi::Plugins.visible.flat_map do |plugin|
      Array(plugin.catalogue_fields[owner.to_sym]).map do |entry|
        Field.new(
          plugin_id: plugin.id, owner: owner.to_sym, key: entry[:key],
          label: entry[:label], type: entry[:type]
        )
      end
    end
  end

  def self.parse(value)
    data = value.is_a?(String) ? JSON.parse(value.to_s) : value
    return {} unless data.is_a?(Hash)

    data.to_h { |key, item| [key.to_s, item] }
  rescue JSON::ParserError
    {}
  end

  def self.merge(existing, incoming, owner:)
    stored = parse(existing)
    stringify(incoming).each do |key, value|
      short, plugin_id = split_key(key)
      raise Invalid, "#{short.inspect} is a core field — pick another name." if RESERVED.include?(short)
      raise Invalid, "#{short.inspect} is not a field name." unless short.match?(KEY)

      spec = resolve_spec(owner, short, plugin_id)
      namespaced = "#{spec ? spec.plugin_id : CUSTOM}.#{short}"
      if value.nil? || value.to_s.strip.empty?
        stored.delete(namespaced)
      else
        stored[namespaced] = coerce(value, spec&.type || "string")
      end
    end
    stored
  end

  def self.hash_for(stored, owner:)
    parse(stored).each_with_object({}) do |(namespaced, value), acc|
      short = namespaced.split(".", 2).last
      acc[short] = value unless acc.key?(short)
    end
  end

  def self.list_for(stored, owner:)
    specs = declared(owner).to_h { |field| ["#{field.plugin_id}.#{field.key}", field] }
    parse(stored).map do |namespaced, value|
      plugin_id, short = split_stored(namespaced)
      spec = specs[namespaced]
      {
        "key" => short,
        "label" => spec ? spec.label : short,
        "value" => value.to_s,
        "pluginId" => plugin_id,
      }
    end
  end

  def self.flatten(entry, stored, owner:)
    hash_for(stored, owner: owner).each do |key, value|
      next if RESERVED.include?(key) || entry.key?(key)

      entry[key] = value.to_s
    end
    entry
  end

  def self.schema_payload
    {
      "productFields" => declared(:product).map { |field| spec_payload(field) },
      "variantFields" => declared(:variant).map { |field| spec_payload(field) },
    }
  end

  def self.spec_payload(field)
    { "key" => field.key, "label" => field.label, "type" => field.type, "pluginId" => field.plugin_id }
  end

  def self.coerce(value, type)
    case type.to_s
    when "integer"
      parsed = Integer(value.to_s, exception: false)
      raise Invalid, "#{value.inspect} is not a whole number." if parsed.nil?

      parsed
    when "boolean"
      %w[1 true yes on].include?(value.to_s.strip.downcase)
    else
      value.to_s
    end
  end

  def self.stringify(hash)
    return {} unless hash.is_a?(Hash)

    hash.to_h { |key, value| [key.to_s, value] }
  end
  private_class_method :stringify

  def self.split_key(key)
    parts = key.to_s.split(".", 2)
    parts.length == 2 ? [parts[1], parts[0]] : [key.to_s, nil]
  end
  private_class_method :split_key

  def self.split_stored(namespaced)
    plugin_id, short = namespaced.split(".", 2)
    short ? [plugin_id, short] : [CUSTOM, namespaced]
  end
  private_class_method :split_stored

  def self.resolve_spec(owner, short, plugin_id)
    specs = declared(owner).select { |field| field.key == short }
    return specs.find { |field| field.plugin_id == plugin_id } if plugin_id
    return specs.first if specs.length == 1

    specs.first
  end
  private_class_method :resolve_spec
end
