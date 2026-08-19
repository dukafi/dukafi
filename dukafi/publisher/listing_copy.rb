class Dukafi
  module Publisher
    # Shared title/description copy for a product listing URL — search
    # results and collection pages. Search is noindexed; collections are the
    # indexable version of the same formula.
    module ListingCopy
      NAME_LIMIT = 35
      BRAND_LIMIT = 3
      BRAND_STOP = %w[
        a an the and or of for with from into onto over
        eau de du la le les
      ].freeze
      BRAND_SECOND = %w[klein lauren kors gabbana].freeze
      SIZE_TOKEN = /\A\d|[0-9].*(ml|l|kg|g|cm|mm|oz)\z/i

      module_function

      def meta(site, name:, count:, items: [], page: 1, query: false)
        site = site.is_a?(Hash) ? site : {}
        n = [Integer(count, exception: false) || 0, 0].max
        page_n = [Integer(page, exception: false) || 1, 1].max
        raw = name.to_s.strip
        heading = truncate_words(query ? titlecase(raw) : raw, NAME_LIMIT)
        label = truncate_words(query ? raw.downcase : heading, NAME_LIMIT)
        {
          title: title_for(site, heading, n, page_n),
          description: description_for(site, label, n, Array(items)),
        }
      end

      def titlecase(text)
        text.to_s.split(/(\s+)/).map do |part|
          next part if part.match?(/\A\s+\z/)

          part.sub(/\A([[:alpha:]])(.*)\z/) { "#{Regexp.last_match(1).upcase}#{Regexp.last_match(2).downcase}" }
        end.join
      end

      def truncate_words(text, limit)
        value = text.to_s.strip
        return value if value.length <= limit

        trimmed = value[0, limit]
        cut = trimmed.rindex(/\s/)
        (cut && cut >= (limit / 2.0).ceil ? trimmed[0, cut] : trimmed).rstrip
      end

      def title_for(site, name, count, page)
        parts = []
        parts << name unless name.empty?
        parts << " — #{product_count(count)}" if count.positive? && !name.empty?
        parts << " — Page #{page}" if page > 1 && count.positive?
        store = present(site["name"])
        parts << " | #{store}" if store
        parts.join
      end

      def product_count(count)
        count == 1 ? "1 Product" : "#{count} Products"
      end

      def description_for(site, label, count, items)
        return zero_description(site, label) if count <= 0

        store = present(site["name"]) || "this store"
        noun = count == 1 ? "product" : "products"
        sentences = ["Shop #{count} #{label} #{noun} at #{store}."]
        brands = top_brands(items)
        sentences << "Featuring #{join_names(brands)}." unless brands.empty?
        floor = min_price(items)
        sentences << "Prices from #{floor}." if floor
        blurb = present(site.dig("settings", "shippingBlurb"))
        sentences << blurb if blurb
        sentences.join(" ")
      end

      def zero_description(_site, label)
        return nil if label.empty?

        "No products matching #{label}."
      end

      def top_brands(items)
        seen = {}
        Array(items).each do |item|
          brand = brand_for(item)
          next unless brand
          next if seen[brand.downcase]

          seen[brand.downcase] = brand
          break if seen.length >= BRAND_LIMIT
        end
        seen.values
      end

      def brand_for(item)
        return nil unless item.is_a?(Hash)

        present(item["brand"]) || field_value(item["fields"], "brand") || brand_from_title(item["title"])
      end

      def field_value(fields, key)
        Array(fields).each do |field|
          next unless field.is_a?(Hash) && field["key"].to_s == key

          return present(field["value"])
        end
        nil
      end

      def brand_from_title(title)
        words = title.to_s.strip.split(/\s+/)
        return nil if words.length < 2

        first = words[0].gsub(/[.,;:]+$/, "")
        bare = first.gsub(/[^A-Za-z]/, "")
        return nil if bare.empty? || BRAND_STOP.include?(bare.downcase)
        return nil unless first.match?(/\A[[:upper:]]/)

        rest = words.drop(1)
        return nil if rest.all? { |word| size_token?(word) || BRAND_STOP.include?(word.downcase) }

        second = words[1].to_s.gsub(/[.,;:]+$/, "")
        second_bare = second.gsub(/[^A-Za-z]/, "")
        brand = if BRAND_SECOND.include?(second_bare.downcase)
          "#{first} #{second}"
        else
          first
        end
        return nil if brand.downcase == title.to_s.strip.downcase

        present(brand)
      end

      def size_token?(word)
        token = word.to_s.gsub(/[.,;:]+$/, "")
        token.match?(/\A\d/) || token.match?(SIZE_TOKEN)
      end

      def join_names(names)
        case names.length
        when 0 then ""
        when 1 then names[0]
        when 2 then "#{names[0]} and #{names[1]}"
        else "#{names[0]}, #{names[1]} and #{names[2]}"
        end
      end

      def min_price(items)
        priced = Array(items).filter_map do |item|
          next unless item.is_a?(Hash)

          cents = Integer(item["priceCents"], exception: false)
          currency = item["currency"].to_s
          next unless cents && cents >= 0 && !currency.empty?

          [cents, currency]
        end
        return nil if priced.empty?

        cents, currency = priced.min_by(&:first)
        format_price(cents, currency)
      end

      def format_price(cents, currency)
        amount = format("%.2f", cents / 100.0)
        currency.to_s == "USD" ? "$#{amount}" : "#{currency} #{amount}"
      end

      def present(value)
        text = value.to_s.strip
        text.empty? ? nil : text
      end
    end
  end
end
