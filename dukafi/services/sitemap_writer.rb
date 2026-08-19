require "cgi"
require "fileutils"
require "time"

# Sitemap index + urlset shards + robots.txt, written into a published slot.
#
# Google's cap is 50,000 URLs / 50 MB per file. We split earlier so a growing
# catalogue gets `sitemap-0.xml`, `sitemap-1.xml`, … and a stable
# `/sitemap.xml` index Search Console can be pointed at once.
#
# Only indexable public URLs belong here: published public CMS pages (not
# search, not 404, not gated), active products when a product template is
# live, and collection page 1 when that collection actually has products.
class SitemapWriter
  Result = Data.define(:index, :files, :robots, :url_count, :origin)
  FileInfo = Data.define(:name, :path, :url, :url_count)
  URLS_PER_FILE = 10_000
  NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
  INDEX_NAME = "sitemap.xml"
  ROBOTS_NAME = "robots.txt"
  CHUNK = /\Asitemap-(\d+)\.xml\z/
  PUBLIC_FILE = /\A(?:robots\.txt|sitemap\.xml|sitemap-\d+\.xml)\z/

  EXCLUDED_SLUGS = [SearchPage::SLUG, "404"].freeze

  def self.call(slot_path:, origin: nil)
    new(slot_path:, origin:).call
  end

  def self.write_published!(origin: nil, output_root: Paths.published_root)
    current = File.join(File.expand_path(output_root), "current")
    raise ArgumentError, "Publish the store first so there is a live site to attach a sitemap to." unless File.exist?(current)

    target = File.symlink?(current) ? File.join(File.expand_path(output_root), File.readlink(current)) : current
    raise ArgumentError, "Publish the store first so there is a live site to attach a sitemap to." unless File.directory?(target)

    call(slot_path: target, origin:)
  end

  def self.payload(origin: nil, output_root: Paths.published_root)
    host = origin.to_s.strip.sub(%r{/\z}, "")
    host = Dukafi::Publisher::ListingJsonLd.public_origin.to_s if host.empty?
    current = File.join(File.expand_path(output_root), "current")
    files = listed_files(current).map { |name| file_info(name, host, count_urls(File.join(current, name))) }
    index = files.find { |file| file.name == INDEX_NAME }
    robots = files.find { |file| file.name == ROBOTS_NAME }
    chunks = files.select { |file| file.name.match?(CHUNK) }
    {
      "origin" => host.empty? ? nil : host,
      "index" => index && info_hash(index),
      "files" => chunks.map { |file| info_hash(file) },
      "robots" => robots && info_hash(robots),
      "urlCount" => chunks.sum(&:url_count),
    }
  end

  def self.read(name, output_root: Paths.published_root)
    filename = name.to_s.strip.delete_prefix("/")
    raise ArgumentError, "Unknown sitemap #{name.inspect}. Call list_sitemaps." unless filename.match?(PUBLIC_FILE)

    path = File.join(File.expand_path(output_root), "current", filename)
    raise ArgumentError, "No #{filename} yet. Call generate_sitemaps or publish." unless File.file?(path)

    { "name" => filename, "path" => "/#{filename}", "xml" => File.read(path) }
  end

  def self.listed_files(current)
    return [] unless File.directory?(current)

    Dir.children(current).select { |name| name.match?(PUBLIC_FILE) }.sort_by do |name|
      match = name.match(CHUNK)
      match ? [1, match[1].to_i] : name == INDEX_NAME ? [0, 0] : [2, 0]
    end
  end
  private_class_method :listed_files

  def self.file_info(name, origin, url_count)
    path = "/#{name}"
    FileInfo.new(name:, path:, url: Dukafi::Publisher::ListingJsonLd.absolute(path, origin) || path, url_count:)
  end
  private_class_method :file_info

  def self.info_hash(file)
    { "name" => file.name, "path" => file.path, "url" => file.url, "urlCount" => file.url_count }
  end
  private_class_method :info_hash

  def self.count_urls(path)
    return 0 unless File.file?(path)

    File.read(path).scan(/<loc>/).length
  end
  private_class_method :count_urls

  def initialize(slot_path:, origin: nil)
    @slot_path = File.expand_path(slot_path)
    host = origin.to_s.strip.sub(%r{/\z}, "")
    host = Dukafi::Publisher::ListingJsonLd.public_origin.to_s if host.empty?
    @origin = host
  end

  def call
    urls = collect_urls
    shards = urls.each_slice(URLS_PER_FILE).to_a
    shards = [[]] if shards.empty?
    now = Time.now.utc.iso8601

    remove_previous
    files = shards.each_with_index.map do |chunk, index|
      name = "sitemap-#{index}.xml"
      write(name, urlset(chunk))
      file_info(name, chunk.length)
    end
    write(INDEX_NAME, index_xml(files, now))
    write(ROBOTS_NAME, robots_txt)
    index = file_info(INDEX_NAME, files.length)
    robots = file_info(ROBOTS_NAME, 0)
    Result.new(index:, files:, robots:, url_count: urls.length, origin: @origin.empty? ? nil : @origin)
  end

  private

  def collect_urls
    page_urls + product_urls + collection_urls
  end

  def page_urls
    Page.where(kind: "page", status: "published", access: "public")
        .exclude(slug: EXCLUDED_SLUGS)
        .order(:slug)
        .all
        .map { |page| entry(PagePaths.public_path(page.slug), page.updated_at) }
  end

  def product_urls
    return [] unless published_template?("products", ProductTemplate::SLUG)

    Product.where(status: "active").order(:slug).all.map do |product|
      entry("/products/#{product.slug}", product.updated_at)
    end
  end

  def collection_urls
    return [] unless published_template?("collections", CollectionTemplate::SLUG)

    Collection.eager(:products).order(:slug).all.filter_map do |collection|
      items = collection.products.select { |product| product.status == "active" }
      next if items.empty?

      lastmod = items.map { |product| product.updated_at }.compact.max
      entry("/collections/#{collection.slug}", lastmod)
    end
  end

  def published_template?(table_slug, fallback_slug)
    Page.where(kind: "template", status: "published").order(:id).all.any? do |page|
      page.slug == fallback_slug ||
        Array(page.document_data.dig("template", "target", "tableSlugs")).include?(table_slug)
    end
  end

  def entry(path, lastmod)
    loc = Dukafi::Publisher::ListingJsonLd.absolute(path, @origin) || path
    { loc:, lastmod: lastmod&.utc&.iso8601 }
  end

  def urlset(urls)
    body = urls.map do |url|
      lastmod = url[:lastmod] ? "<lastmod>#{escape(url[:lastmod])}</lastmod>" : ""
      "<url><loc>#{escape(url[:loc])}</loc>#{lastmod}</url>"
    end.join
    %(<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="#{NS}">#{body}</urlset>\n)
  end

  def index_xml(files, lastmod)
    body = files.map do |file|
      loc = Dukafi::Publisher::ListingJsonLd.absolute(file.path, @origin) || file.path
      "<sitemap><loc>#{escape(loc)}</loc><lastmod>#{escape(lastmod)}</lastmod></sitemap>"
    end.join
    %(<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="#{NS}">#{body}</sitemapindex>\n)
  end

  def robots_txt
    sitemap = Dukafi::Publisher::ListingJsonLd.absolute("/#{INDEX_NAME}", @origin) || "/#{INDEX_NAME}"
    <<~TEXT
      User-agent: *
      Allow: /
      Disallow: /search
      Disallow: /search?
      Sitemap: #{sitemap}
    TEXT
  end

  def write(name, contents)
    File.write(File.join(@slot_path, name), contents)
  end

  def remove_previous
    Dir.children(@slot_path).each do |name|
      next unless name.match?(PUBLIC_FILE)

      File.delete(File.join(@slot_path, name))
    end
  rescue Errno::ENOENT
    FileUtils.mkdir_p(@slot_path)
  end

  def file_info(name, url_count)
    path = "/#{name}"
    FileInfo.new(
      name:, path:,
      url: Dukafi::Publisher::ListingJsonLd.absolute(path, @origin) || path,
      url_count:,
    )
  end

  def escape(value)
    CGI.escapeHTML(value.to_s)
  end
end
