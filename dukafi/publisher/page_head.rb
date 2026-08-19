require "uri"

class Dukafi
  module Publisher
    # Robots and canonical for a public HTML head. Search URLs are an open
    # input surface — they stay noindex, follow. Collection URLs are the
    # indexable listing; pagination and empty lists are not.
    module PageHead
      module_function

      def search(keyword: nil)
        path = if keyword.to_s.strip.empty?
          "/search"
        else
          "/search?#{URI.encode_www_form([["keyword", keyword.to_s]])}"
        end
        { robots: "noindex, follow", canonical: absolute(path) }
      end

      def collection(slug, page: 1, count: 0)
        indexable = page.to_i <= 1 && count.to_i.positive?
        {
          robots: indexable ? "index, follow" : "noindex, follow",
          canonical: absolute("/collections/#{slug}"),
        }
      end

      def for_bake_path(path, has_listing: true)
        value = path.to_s.sub(%r{\A/+}, "")
        return search if value == "search"
        return collection(value.delete_prefix("collections/"), page: 1, count: has_listing ? 1 : 0) if value.start_with?("collections/")
        return {} if value == Page::PRIVATE_PREFIX || value.start_with?("#{Page::PRIVATE_PREFIX}/")

        { canonical: absolute(value.empty? || value == "index" ? "/" : "/#{value}") }
      end

      def absolute(path)
        ListingJsonLd.absolute(path, ListingJsonLd.public_origin) || path
      end
    end
  end
end
