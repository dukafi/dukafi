require "ipaddr"
require "json"
require "net/http"
require "resolv"
require "uri"

# The public plugin catalogue at registry.dukafi.dev (or DUKAFI_REGISTRY_URL).
#
# This service lists, then a store that wants to install reads a listing,
# fetches the archive the listing names (hosted by the registry for public
# plugins), and checks the sha256 the listing advertised.
class PluginCatalogue
  class Error < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  OPEN_TIMEOUT = 5
  READ_TIMEOUT = 20
  MAX_JSON = 512 * 1024
  MAX_ARCHIVE = 5 * 1024 * 1024
  MAX_REDIRECTS = 3

  class << self
    # Tests assign a callable `(url) -> body`. Production leaves this nil
    # and talks to the network.
    attr_accessor :http
  end

  CATEGORIES = %w[
    payments shipping marketing analytics content media integrations other
  ].freeze
  DEFAULT_LIMIT = 25
  MAX_LIMIT = 100

  def self.list(q: nil, category: nil, licensed: nil, limit: DEFAULT_LIMIT, offset: 0)
    payload = get_json("/v1/plugins?#{list_query(q:, category:, licensed:, limit:, offset:)}")
    rows = payload["plugins"]
    raise Error.new("bad_catalogue", "The registry did not return a plugin list.") unless rows.is_a?(Array)

    installed = Dukafi::Plugins.visible.to_h { |plugin| [plugin.id, true] }
    {
      "plugins" => rows.filter_map { |row| summarise(row, installed) if row.is_a?(Hash) },
      "total" => payload["total"].to_i,
      "limit" => (payload["limit"] || limit).to_i,
      "offset" => (payload["offset"] || offset).to_i,
    }
  end

  def self.listing(id)
    row = get_json("/v1/plugins/#{URI.encode_www_form_component(id.to_s)}")
    raise Error.new("plugin_not_found", "No such plugin in the registry.") unless row.is_a?(Hash)

    row
  end

  # The catalogue row an agent or the admin shows: listing fields plus
  # whether THIS store already has it. `listing` is the raw registry JSON
  # the installer needs (download URL, sha256); this is the one to display.
  def self.detail(id)
    installed = Dukafi::Plugins.visible.to_h { |plugin| [plugin.id, true] }
    summarise(listing(id), installed)
  end

  def self.fetch_json(path) = get_json(path)

  def self.fetch_bytes(url, max_bytes: MAX_ARCHIVE)
    url = url.to_s.strip
    url = "#{Paths.registry_url}#{url}" if url.start_with?("/")
    body = request(url, max_bytes: max_bytes)
    raise Error.new("empty_download", "The download was empty.") if body.nil? || body.empty?

    body.b
  end

  def self.summarise(row, installed)
    id = row["id"].to_s
    return nil if id.empty?

    distribution = row["distribution"].is_a?(Hash) ? row["distribution"] : {}
    pricing = row["pricing"].is_a?(Hash) ? row["pricing"] : {}
    {
      "id" => id,
      "name" => row["name"].to_s,
      "description" => row["description"].to_s,
      "version" => row["version"].to_s,
      "author" => row["author"].to_s,
      "category" => row["category"].to_s,
      "licensed" => row["licensed"] == true || distribution["type"].to_s == "licensed",
      "installed" => installed[id] == true,
      "purchaseUrl" => pricing["purchaseUrl"].to_s,
      "homepage" => row["homepage"].to_s,
      "license" => row["license"].to_s,
      "logo" => row["logo"].to_s,
      "images" => Array(row["images"]).grep(String),
    }
  end
  private_class_method :summarise

  def self.list_query(q:, category:, licensed:, limit:, offset:)
    params = {}
    q = q.to_s.strip
    params["q"] = q unless q.empty?

    category = category.to_s.strip.downcase
    params["category"] = category if CATEGORIES.include?(category)

    case licensed.to_s
    when "true"  then params["licensed"] = "true"
    when "false" then params["licensed"] = "false"
    end

    limit = limit.to_i
    limit = DEFAULT_LIMIT if limit <= 0
    limit = MAX_LIMIT if limit > MAX_LIMIT
    params["limit"] = limit
    params["offset"] = [offset.to_i, 0].max
    URI.encode_www_form(params)
  end
  private_class_method :list_query

  def self.get_json(path)
    url = "#{Paths.registry_url}#{path}"
    body = request(url, max_bytes: MAX_JSON)
    JSON.parse(body)
  rescue JSON::ParserError
    raise Error.new("bad_catalogue", "The registry returned something that was not JSON.")
  end
  private_class_method :get_json

  def self.request(url, max_bytes:, redirects: 0)
    return http.call(url) if http

    raise Error.new("too_many_redirects", "Too many redirects.") if redirects > MAX_REDIRECTS

    uri = parse_url!(url)
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https",
                               open_timeout: OPEN_TIMEOUT, read_timeout: READ_TIMEOUT) do |client|
      client.request(Net::HTTP::Get.new(uri))
    end

    case response
    when Net::HTTPSuccess
      declared = response["content-length"].to_i
      raise Error.new("too_large", "That download is larger than the #{max_bytes / 1_048_576} MB limit.") if declared > max_bytes

      body = response.body.to_s
      raise Error.new("too_large", "That download is larger than the #{max_bytes / 1_048_576} MB limit.") if body.bytesize > max_bytes

      body
    when Net::HTTPNotFound
      raise Error.new("plugin_not_found", "No such plugin in the registry.")
    when Net::HTTPRedirection
      request(URI.join(uri, response["location"].to_s).to_s, max_bytes: max_bytes, redirects: redirects + 1)
    else
      raise Error.new("unreachable", "Could not reach the registry (HTTP #{response.code}).")
    end
  rescue Error
    raise
  rescue StandardError => e
    raise Error.new("unreachable", "Could not reach the registry (#{e.class}).")
  end
  private_class_method :request

  def self.parse_url!(url)
    uri = URI.parse(url.to_s.strip)
    unless uri.is_a?(URI::HTTPS) || (uri.is_a?(URI::HTTP) && uri.hostname == "localhost")
      raise Error.new("blocked_url", "Only https:// downloads are fetched.")
    end
    raise Error.new("blocked_url", "The URL has no host.") if uri.host.to_s.empty?

    check_address!(uri.host) unless uri.hostname == "localhost"
    uri
  rescue URI::InvalidURIError
    raise Error.new("blocked_url", "That is not a valid URL.")
  end
  private_class_method :parse_url!

  def self.check_address!(host)
    addresses = Resolv.getaddresses(host)
    raise Error.new("blocked_url", "Could not resolve #{host}.") if addresses.empty?

    addresses.each do |address|
      ip = IPAddr.new(address)
      next unless ip.loopback? || ip.private? || ip.link_local?

      raise Error.new("blocked_url", "#{host} resolves to a private address and will not be fetched.")
    rescue IPAddr::InvalidAddressError
      next
    end
  end
  private_class_method :check_address!
end
