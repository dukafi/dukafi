require "json"

class Dukafi
  module Publisher
    # CollectionPage + ItemList for a page whose main content is a product
    # listing (a collection URL, a CMS page with a products loop, or a search
    # result page). Search results nest Product + Offer on each ListItem so
    # the SERP can show price; other listings stay name/url only — Google
    # wants standalone Product schema on the PDP.
    #
    # The list matches what the loop renders on this URL: same source, sort,
    # offset, and page of results. Empty lists emit nothing so a miss does
    # not publish a hollow ItemList.
    module ListingJsonLd
      LISTING_MODULES = %w[store.relationship-loop store.collection-loop].freeze

      module_function

      def call(document:, prefetched:, path:, title:, description: nil,
               current_entry: nil, query_params: {}, origin: nil, site: nil)
        source, items = listing_result(document, prefetched, current_entry, query_params)
        return nil if items.empty?

        host = origin || public_origin
        url = absolute(path_url(path), host)
        embed_products = source == "current-query"
        payload = {
          "@context" => "https://schema.org",
          "@type" => "CollectionPage",
          "name" => title.to_s,
          **(description.to_s.strip.empty? ? {} : { "description" => description.to_s }),
          **(url ? { "url" => url } : {}),
          "mainEntity" => {
            "@type" => "ItemList",
            "numberOfItems" => items.length,
            "itemListElement" => items.each_with_index.map do |item, index|
              list_element(item, index, host, embed_products:)
            end,
          },
        }
        publisher = organization(site, host) unless embed_products
        payload["publisher"] = publisher if publisher
        payload
      end

      def current_page(document, query_params, prefetched: {}, current_entry: nil)
        listing_result(document, prefetched, current_entry, query_params)[2]
      end

      def script_tag(payload)
        return "" unless payload.is_a?(Hash)

        json = JSON.generate(payload).gsub("</", "<\\/")
        %(<script type="application/ld+json">#{json}</script>)
      end

      def public_origin
        value = ENV["DUKAFI_PUBLIC_ORIGIN"].to_s.strip.sub(%r{/\z}, "")
        value.empty? ? nil : value
      end

      def listing_items(document, prefetched, current_entry, query_params)
        listing_result(document, prefetched, current_entry, query_params)[1]
      end

      def listing_result(document, prefetched, current_entry, query_params)
        nodes = document.is_a?(Hash) ? document["nodes"] : nil
        return [nil, [], 1] unless nodes.is_a?(Hash)

        nodes.each_value do |node|
          next unless node.is_a?(Hash) && LISTING_MODULES.include?(node["moduleId"].to_s)

          props = loop_props(node, current_entry)
          source = LoopSource.call(props, module_id: node["moduleId"])
          next unless listing_source?(source)

          items = source_items(source, prefetched, current_entry, query_params)
          next if items.empty?

          items = order_items(items, props)
          skip = [Integer(props["offset"] || 0, exception: false) || 0, 0].max
          items = items.drop(skip)
          per_page = [[Integer(props["perPage"] || 12, exception: false) || 12, 1].max, 100].min
          parameter = "loop_#{node.fetch('id').to_s.gsub(/[^a-zA-Z0-9_-]/, '_')}_page"
          requested = Integer(query_params.is_a?(Hash) ? query_params.fetch(parameter, "1") : "1", exception: false) || 1
          page = [requested, 1].max
          page_count = [(items.length.to_f / per_page).ceil, 1].max
          page = page_count if page > page_count
          return [source, items.slice((page - 1) * per_page, per_page) || [], page]
        end
        [nil, [], 1]
      end

      def list_element(item, index, origin, embed_products:)
        href = item["href"].to_s
        href = "/products/#{item['slug']}" if href.empty? && item["slug"]
        absolute_href = absolute(href, origin)
        list_item = {
          "@type" => "ListItem",
          "position" => index + 1,
          "name" => item["title"].to_s,
        }
        list_item["url"] = absolute_href if absolute_href
        list_item["item"] = product_node(item, origin, url: absolute_href) if embed_products
        list_item
      end

      def product_node(item, origin, url:)
        node = { "@type" => "Product", "name" => item["title"].to_s }
        node["url"] = url if url
        image = item["imageUrl"].to_s
        node["image"] = absolute(image, origin) if !image.empty?
        sku = Array(item["variants"]).filter_map { |variant| variant["sku"].to_s if variant.is_a?(Hash) }.find { |value| !value.empty? }
        node["sku"] = sku if sku
        offer = offer_node(item)
        node["offers"] = offer if offer
        node
      end

      def offer_node(item)
        cents = Integer(item["priceCents"], exception: false)
        currency = item["currency"].to_s
        return nil unless cents && cents >= 0 && !currency.empty?

        {
          "@type" => "Offer",
          "price" => format("%.2f", cents / 100.0),
          "priceCurrency" => currency,
        }
      end

      def organization(site, origin)
        site = site.is_a?(Hash) ? site : {}
        name = site["name"].to_s.strip
        node = { "@type" => "Organization" }
        node["name"] = name unless name.empty?
        node["url"] = origin if origin && !origin.to_s.empty?
        area = site.dig("settings", "areaServed").to_s.strip
        node["areaServed"] = area unless area.empty?
        blurb = site.dig("settings", "shippingBlurb").to_s.strip
        node["description"] = blurb unless blurb.empty?
        node.keys == ["@type"] ? nil : node
      end

      def listing_source?(source)
        source == "products" || source == "current-query" ||
          (source.end_with?(".products") && !source.start_with?("cart."))
      end

      RELATIONSHIP_SORT_KEYS = {
        "price" => ->(item) { item["priceCents"] || 0 },
        "title" => ->(item) { item["title"].to_s.downcase },
        "newest" => ->(item) { item["createdAt"] || 0 },
      }.freeze

      def order_items(items, props)
        key = RELATIONSHIP_SORT_KEYS[props["orderBy"].to_s]
        return items unless key

        sorted = items.each_with_index.sort_by { |item, index| [key.call(item), index] }.map(&:first)
        props["direction"].to_s == "desc" ? sorted.reverse : sorted
      end

      def loop_props(node, current_entry)
        props = node["props"].is_a?(Hash) ? node["props"].dup : {}
        binding = node.dig("dynamicBindings", "sourceSlug")
        if binding.is_a?(Hash) && binding["source"].to_s == "currentEntry" && current_entry.is_a?(Hash)
          field = binding["field"].to_s
          field = "slug" if field.empty?
          value = current_entry[field]
          props["sourceSlug"] = value.to_s unless value.nil?
        end
        props
      end

      def source_items(source, prefetched, current_entry, query_params = {})
        prefetched = prefetched.is_a?(Hash) ? prefetched : {}
        return SearchQuery.filter(prefetched.fetch("products", {}).values, SearchQuery.keyword(query_params)) if source == "current-query"

        segments = source.split(".")
        root = segments.first.to_s
        return prefetched.fetch(root, {}).values if segments.length == 1 && %w[products collections].include?(root)

        value = source_root(root, prefetched, current_entry)
        segments.drop(1).each { |field| value = value.is_a?(Hash) ? value[field] : nil }
        value.is_a?(Array) ? value : []
      end

      def source_root(root, prefetched, current_entry)
        kind, slug = root.split("/", 2)
        case kind
        when "products"
          slug ? (prefetched.dig("products", slug) || {}) : { "products" => prefetched.fetch("products", {}).values }
        when "collections"
          slug ? (prefetched.dig("collections", slug) || {}) : { "collections" => prefetched.fetch("collections", {}).values }
        when "currentEntry" then current_entry
        end
      end

      def path_url(path)
        value = path.to_s.sub(%r{\A/+}, "").sub(%r{/+\z}, "")
        return "/" if value.empty? || value == "index"

        "/#{value}"
      end

      def absolute(path, origin)
        return nil if path.to_s.empty?

        host = origin.to_s.sub(%r{/\z}, "")
        host.empty? ? path : "#{host}#{path.start_with?('/') ? path : "/#{path}"}"
      end
    end
  end
end
