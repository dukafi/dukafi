require "digest"
require "json"
require "uri"

# Themes on the public registry (registry.dukafi.dev), sibling to plugins.
#
# A listing is JSON + media URLs, not image bytes. `default` is the one a
# brand-new store is offered after setup — the merchant still has to accept.
module ThemeCatalogue
  class Error < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  module_function

  def default
    row = PluginCatalogue.fetch_json("/v1/themes/default")
    return nil unless row.is_a?(Hash)

    theme = row["theme"].is_a?(Hash) ? row["theme"] : row
    summarise(theme)
  rescue PluginCatalogue::Error => error
    return nil if %w[plugin_not_found unreachable].include?(error.code)

    raise Error.new(error.code, error.message)
  end

  def listing(id)
    row = PluginCatalogue.fetch_json("/v1/themes/#{URI.encode_www_form_component(id.to_s)}")
    raise Error.new("theme_not_found", "No such theme in the registry.") unless row.is_a?(Hash)

    row["theme"].is_a?(Hash) ? row["theme"] : row
  rescue PluginCatalogue::Error => error
    raise Error.new(error.code == "plugin_not_found" ? "theme_not_found" : error.code, error.message)
  end

  def download(id)
    row = listing(id)
    distribution = row["distribution"].is_a?(Hash) ? row["distribution"] : {}
    url = distribution["downloadUrl"].to_s
    expected = distribution["sha256"].to_s.downcase
    raise Error.new("no_download", "That listing has no public download.") if url.empty?
    raise Error.new("no_checksum", "That listing has no checksum.") if expected.empty?

    bytes = PluginCatalogue.fetch_bytes(url)
    actual = Digest::SHA256.hexdigest(bytes)
    unless actual == expected
      raise Error.new("checksum_mismatch", "The download did not match the registry checksum.")
    end

    bytes
  rescue PluginCatalogue::Error => error
    raise Error.new(error.code, error.message)
  end

  def summarise(row)
    return nil unless row.is_a?(Hash)

    id = row["id"].to_s
    return nil if id.empty?

    contents = row["contents"].is_a?(Hash) ? row["contents"] : {}
    {
      "id" => id,
      "name" => row["name"].to_s,
      "description" => row["description"].to_s,
      "version" => row["version"].to_s,
      "sourceOrigin" => row["sourceOrigin"].to_s,
      "contents" => {
        "pages" => contents["pages"].to_i,
        "templates" => contents["templates"].to_i,
        "partials" => contents["partials"].to_i,
        "tables" => contents["tables"].to_i,
        "forms" => contents["forms"].to_i,
        "products" => contents["products"].to_i,
        "collections" => contents["collections"].to_i,
        "reviews" => contents["reviews"].to_i,
        "media" => contents["media"].to_i,
      },
    }
  end
end
