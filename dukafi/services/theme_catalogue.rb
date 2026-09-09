require "digest"
require "json"
require "uri"

# Themes on the public registry (registry.dukafi.dev), sibling to plugins.
#
# A listing is JSON + media URLs, not image bytes. `default` is the one a
# brand-new store is offered after setup — the merchant still has to accept.
# When the registry is unreachable, bundled archives in `themes/` stand in.
module ThemeCatalogue
  class Error < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  DEFAULT_BUNDLED_ID = "september-2026"

  module_function

  def bundled_root = File.expand_path("../themes", __dir__)

  def bundled_entries
    Dir[File.join(bundled_root, "*.json")].filter_map do |path|
      meta = JSON.parse(File.read(path))
      next unless meta.is_a?(Hash) && !meta["id"].to_s.empty?

      archive = bundled_archive_for(path, meta["id"])
      next unless archive

      meta.merge("_archive" => archive)
    end.sort_by { |row| row["id"].to_s == DEFAULT_BUNDLED_ID ? ["", row["id"]] : [row["id"].to_s, row["id"]] }
  end

  def bundled_default
    bundled_entries.find { |row| row["id"].to_s == DEFAULT_BUNDLED_ID } || bundled_entries.first
  end

  def bundled_path
    bundled_default&.fetch("_archive", nil)
  end

  def bundled_metadata
    row = bundled_default
    return {} unless row

    listing_fields(row)
  end

  def default
    row = PluginCatalogue.fetch_json("/v1/themes/default")
    return nil unless row.is_a?(Hash)

    theme = row["theme"].is_a?(Hash) ? row["theme"] : row
    summarise(theme)
  rescue PluginCatalogue::Error => error
    fallback = bundled_default
    return summarise(fallback) if fallback && %w[plugin_not_found unreachable].include?(error.code)

    raise Error.new(error.code, error.message)
  end

  def list(q: nil, category: nil)
    query = URI.encode_www_form({ q: q, category: category }.reject { |_k, v| v.to_s.empty? })
    row = PluginCatalogue.fetch_json("/v1/themes#{query.empty? ? '' : "?#{query}"}")
    themes = Array(row["themes"]).map { |entry| summarise(entry).merge(entry.slice("summary", "categories", "previewUrls", "demoUrl", "author")) }
    { "themes" => themes, "total" => row["total"].to_i }
  rescue PluginCatalogue::Error
    themes = bundled_entries.map { |entry| summarise(entry).merge(entry.slice("summary", "categories", "previewUrls", "demoUrl", "author")) }
    { "themes" => themes, "total" => themes.length, "degraded" => true }
  end

  def listing(id)
    row = PluginCatalogue.fetch_json("/v1/themes/#{URI.encode_www_form_component(id.to_s)}")
    raise Error.new("theme_not_found", "No such theme in the registry.") unless row.is_a?(Hash)

    row["theme"].is_a?(Hash) ? row["theme"] : row
  rescue PluginCatalogue::Error => error
    bundled = bundled_entries.find { |entry| entry["id"].to_s == id.to_s }
    return listing_fields(bundled) if bundled && %w[plugin_not_found unreachable].include?(error.code)

    raise Error.new(error.code == "plugin_not_found" ? "theme_not_found" : error.code, error.message)
  end

  def download(id)
    bundled = bundled_entries.find { |entry| entry["id"].to_s == id.to_s }
    return File.binread(bundled["_archive"]) if bundled

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

  def bundled_archive_for(json_path, id)
    by_id = File.join(bundled_root, "#{id}.theme.tar.gz")
    return by_id if File.file?(by_id)

    by_stem = File.join(bundled_root, "#{File.basename(json_path, ".json")}.theme.tar.gz")
    File.file?(by_stem) ? by_stem : nil
  end

  def listing_fields(row)
    row.reject { |key, _| key.to_s.start_with?("_") }
  end
end
