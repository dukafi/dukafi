require "cgi"

class Dukafi
  module Publisher
    # Open Graph + Twitter tags for a public HTML head.
    #
    # Social crawlers (WhatsApp, Slack, Facebook, X) fetch the published
    # storefront, not the editor. Relative image paths are resolved against
    # the same origin JSON-LD uses so a missing DUKAFI_PUBLIC_ORIGIN still
    # emits a usable path, and a configured origin emits the absolute URL
    # those crawlers require.
    module OpenGraph
      module_function

      def tags(title:, description: nil, url: nil, type: "website", site_name: nil,
               image: nil, image_width: nil, image_height: nil, image_alt: nil,
               price_cents: nil, currency: nil)
        origin = ListingJsonLd.public_origin
        parts = []
        parts << meta("og:type", type.to_s.empty? ? "website" : type)
        parts << meta("og:title", title) unless title.to_s.empty?
        parts << meta("og:description", description) if present?(description)
        parts << meta("og:url", ListingJsonLd.absolute(url, origin) || url) if present?(url)
        parts << meta("og:site_name", site_name) if present?(site_name)

        image_href = absolute_asset(image, origin)
        if image_href
          parts << meta("og:image", image_href)
          parts << meta("og:image:secure_url", image_href) if image_href.start_with?("https://")
          parts << meta("og:image:width", image_width) if image_width.to_i.positive?
          parts << meta("og:image:height", image_height) if image_height.to_i.positive?
          parts << meta("og:image:alt", image_alt) if present?(image_alt)
        end

        card = image_href ? "summary_large_image" : "summary"
        parts << meta("twitter:card", card, name: true)
        parts << meta("twitter:title", title, name: true) unless title.to_s.empty?
        parts << meta("twitter:description", description, name: true) if present?(description)
        parts << meta("twitter:image", image_href, name: true) if image_href

        if type.to_s == "product"
          amount = money(price_cents)
          if amount && present?(currency)
            parts << meta("product:price:amount", amount)
            parts << meta("product:price:currency", currency.to_s.upcase)
          end
        end

        parts.join
      end

      def for_page(document, site, path:, title:, description:)
        document = document.is_a?(Hash) ? document : {}
        site = site.is_a?(Hash) ? site : {}
        tags(
          title:, description:,
          url: ListingJsonLd.path_url(path),
          type: "website",
          site_name: site["name"],
          image: present(document["ogImage"]) || present(site.dig("settings", "ogImageUrl")),
        )
      end

      def for_product(product, site, title:, description:)
        product = product.is_a?(Hash) ? product : {}
        site = site.is_a?(Hash) ? site : {}
        image = og_image(product)
        tags(
          title:, description:,
          url: product["href"].to_s.empty? ? "/products/#{product['slug']}" : product["href"],
          type: "product",
          site_name: site["name"],
          image: image && image["url"],
          image_width: image && image["width"],
          image_height: image && image["height"],
          image_alt: image && image["alt"],
          price_cents: product["priceCents"],
          currency: product["currency"],
        )
      end

      def for_collection(collection, site, title:, description:)
        collection = collection.is_a?(Hash) ? collection : {}
        site = site.is_a?(Hash) ? site : {}
        tags(
          title:, description:,
          url: "/collections/#{collection['slug']}",
          type: "website",
          site_name: site["name"],
          image: present(collection["imageUrl"]) || present(site.dig("settings", "ogImageUrl")),
        )
      end

      def og_image(product)
        url = present(product["ogImageUrl"]) || present(product["imageUrl"])
        return nil unless url

        match = Array(product["images"]).find { |item| item.is_a?(Hash) && item["url"].to_s == url }
        { "url" => url, "width" => match && match["width"], "height" => match && match["height"],
          "alt" => match && match["alt"] }
      end

      def present?(value)
        !value.to_s.strip.empty?
      end

      def present(value)
        text = value.to_s.strip
        text.empty? ? nil : text
      end

      def absolute_asset(path, origin)
        value = path.to_s.strip
        return nil if value.empty?
        return value if value.match?(/\Ahttps?:\/\//i)

        ListingJsonLd.absolute(value.start_with?("/") ? value : "/#{value}", origin) || value
      end

      def money(cents)
        amount = Integer(cents, exception: false)
        return nil unless amount && amount >= 0

        format("%.2f", amount / 100.0)
      end

      def meta(property, content, name: false)
        key = name ? "name" : "property"
        %(<meta #{key}="#{CGI.escapeHTML(property.to_s)}" content="#{CGI.escapeHTML(content.to_s)}">)
      end
    end
  end
end
