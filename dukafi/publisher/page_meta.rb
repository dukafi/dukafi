class Dukafi
  module Publisher
    # Unique <title> and meta description for one baked URL.
    #
    # Site settings are the fallback, not the override: a store-wide metaTitle
    # on every product page is what Google tells merchants not to do. CMS pages
    # may set seoTitle / seoDescription in page settings. Catalogue URLs use
    # the product or collection's own name and copy.
    module PageMeta
      DESCRIPTION_LIMIT = 300

      module_function

      def for_page(document, site, fallback_title: nil)
        document = document.is_a?(Hash) ? document : {}
        call(
          site:,
          seo_title: document["seoTitle"],
          seo_description: document["seoDescription"],
          fallback_title: present(fallback_title) || present(document["title"]),
        )
      end

      def for_entry(site, title:, description: nil)
        call(site:, fallback_title: title, fallback_description: description)
      end

      # Keyword URLs never use page-settings SEO: that copy is for bare
      # `/search`. These titles are for tabs and link previews; the page is
      # noindexed so they are not a ranking surface.
      def for_search(_document, site, keyword:, count:, items: [], page: 1)
        listing(site, name: keyword, count:, items:, page:, query: true)
          .merge(PageHead.search(keyword: keyword))
      end

      def for_collection(site, collection, page: 1)
        collection = collection.is_a?(Hash) ? collection : {}
        items = Array(collection["products"])
        listing(site, name: collection["title"], count: items.length, items:, page:, query: false)
          .merge(PageHead.collection(collection["slug"], page:, count: items.length))
      end

      def listing(site, name:, count:, items:, page:, query:)
        copy = ListingCopy.meta(site, name:, count:, items:, page:, query:)
        {
          title: copy.fetch(:title),
          description: clip(copy[:description]),
        }
      end
      private_class_method :listing

      def call(site:, seo_title: nil, seo_description: nil, fallback_title: nil, fallback_description: nil)
        site = site.is_a?(Hash) ? site : {}
        {
          title: present(seo_title) || present(fallback_title) ||
            present(site.dig("settings", "metaTitle")) || present(site["name"]) || "",
          description: clip(present(seo_description) || present(fallback_description) ||
            present(site.dig("settings", "metaDescription"))),
        }
      end

      def plain_text(html)
        html.to_s.gsub(/<[^>]+>/, " ").gsub(/\s+/, " ").strip
      end

      def present(value)
        text = value.to_s.strip
        text.empty? ? nil : text
      end

      def clip(text)
        return nil unless text
        return text if text.length <= DESCRIPTION_LIMIT

        trimmed = text[0, DESCRIPTION_LIMIT]
        cut = trimmed.rindex(" ")
        "#{cut && cut > 80 ? trimmed[0, cut] : trimmed.rstrip}…"
      end
    end
  end
end
