# Sitemap tools — generate, list, and read the storefront sitemap files.
#
# These are not page trees. The files live next to the baked HTML so Google
# and Search Console fetch static XML. `generate_sitemaps` rewrites them
# without a full publish; publish and catalogue rebakes already do the same.
module McpSitemapTools
  module_function

  def all
    [generate_sitemaps, list_sitemaps, read_sitemap]
  end

  READ_TOOLS = %w[list_sitemaps read_sitemap].freeze

  def generate_sitemaps
    {
      name: "generate_sitemaps",
      title: "Generate sitemaps",
      description: "Write sitemap.xml (the index), sitemap-0.xml, sitemap-1.xml, " \
                   "… and robots.txt into the published storefront. Include only " \
                   "indexable public URLs: published public pages (not search), " \
                   "active product pages, and collection pages that have products. " \
                   "Call this after adding many products if you have not published. " \
                   "Catalogue writes and publish already regenerate these files.",
      input_schema: {
        "type" => "object",
        "properties" => {},
        "additionalProperties" => false,
      },
      run: lambda do |_args|
        result = SitemapWriter.write_published!
        SitemapWriter.payload(origin: result.origin).merge(
          "urlCount" => result.url_count,
          "note" => result.origin ? "Sitemap loc URLs are absolute." :
            "Set DUKAFI_PUBLIC_ORIGIN so loc URLs are absolute for Search Console.",
        )
      rescue ArgumentError => error
        raise McpTools::ArgumentError, error.message
      end,
    }
  end

  def list_sitemaps
    {
      name: "list_sitemaps",
      title: "List sitemaps",
      description: "List the sitemap index, urlset shards (sitemap-0.xml, …), " \
                   "and robots.txt, with their public URLs. Use read_sitemap " \
                   "to see the XML. Empty files means the store has not been " \
                   "published yet — call generate_sitemaps after publish.",
      input_schema: {
        "type" => "object",
        "properties" => {},
        "additionalProperties" => false,
      },
      run: ->(_args) { SitemapWriter.payload },
    }
  end

  def read_sitemap
    {
      name: "read_sitemap",
      title: "Read a sitemap",
      description: "Read one sitemap file as XML. name is sitemap.xml (the index), " \
                   "sitemap-0.xml, sitemap-1.xml, or robots.txt. Call list_sitemaps " \
                   "first if you do not know which shards exist.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "name" => {
            "type" => "string",
            "description" => "File name: sitemap.xml, sitemap-0.xml, or robots.txt.",
          },
        },
        "required" => ["name"],
        "additionalProperties" => false,
      },
      run: lambda do |args|
        SitemapWriter.read(args["name"])
      rescue ArgumentError => error
        raise McpTools::ArgumentError, error.message
      end,
    }
  end
end
