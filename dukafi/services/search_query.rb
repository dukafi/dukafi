module SearchQuery
  PARAM = "keyword"
  MAX_LENGTH = 80

  module_function

  def keyword(params)
    return nil unless params.is_a?(Hash)

    value = params[PARAM] || params[PARAM.to_sym]
    clean(Array(value).first)
  end

  def filter(products, keyword)
    needle = present(keyword)
    return [] unless needle

    Array(products).select { |product| match?(product, needle) }
  end

  def match?(product, keyword)
    return false unless product.is_a?(Hash)

    needle = present(keyword)
    return false unless needle

    hay = haystack(product)
    return true if hay.include?(needle.downcase)

    folded = compact(needle)
    folded.length >= 2 && compact(hay).include?(folded)
  end

  def haystack(product)
    parts = [
      product["title"],
      product["slug"],
      Dukafi::Publisher::PageMeta.plain_text(product["descriptionHtml"]),
    ]
    Array(product["variants"]).each do |variant|
      next unless variant.is_a?(Hash)

      parts << variant["sku"] << variant["title"]
    end
    parts.compact.join(" ").downcase
  end
  private_class_method :haystack

  def compact(text)
    text.to_s.downcase.gsub(/[^a-z0-9]+/, "")
  end
  private_class_method :compact

  def clean(value)
    text = value.to_s.gsub(/<[^>]+>/, " ").gsub(/[[:cntrl:]]/, " ").gsub(/\s+/, " ").strip
    return nil if text.empty?

    Dukafi::Publisher::ListingCopy.truncate_words(text, MAX_LENGTH)
  end
  private_class_method :clean

  def present(value)
    text = value.to_s.strip
    text.empty? ? nil : text
  end
  private_class_method :present
end
