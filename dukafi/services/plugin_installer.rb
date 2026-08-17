require "digest"
require "fileutils"
require "rubygems/package"
require "stringio"
require "zlib"

# Install a plugin from the registry catalogue.
#
# The store never takes a download URL from the browser. It looks the plugin
# up on the registry, fetches the archive that listing names (the registry's
# own copy, for a public plugin), and refuses it unless the SHA-256 matches.
# That is the whole trust story: the registry said what the bytes should hash
# to, and these are those bytes.
class PluginInstaller
  class Error < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  GZIP_MAGIC = "\x1f\x8b".b

  def self.call(id, listing: nil, archive: nil)
    new(id, listing: listing, archive: archive).call
  end

  def initialize(id, listing:, archive:)
    @id = id.to_s.strip
    @listing = listing
    @archive = archive
  end

  def call
    raise Error.new("id_required", "Which plugin?") if @id.empty?
    if (existing = Dukafi::Plugins.find(@id))&.hidden?
      raise Error.new("hidden_plugin", "That id is reserved.")
    end

    listing = @listing || PluginCatalogue.listing(@id)
    distribution = listing["distribution"].is_a?(Hash) ? listing["distribution"] : {}
    if listing["licensed"] == true || distribution["type"].to_s == "licensed"
      raise Error.new("licensed_plugin",
                      "This plugin needs a licence key from its vendor — it cannot be downloaded from the catalogue.")
    end

    url = distribution["downloadUrl"].to_s
    expected = distribution["sha256"].to_s.downcase
    raise Error.new("no_download", "That listing has no public download.") if url.empty?
    unless expected.match?(/\A[a-f0-9]{64}\z/)
      raise Error.new("no_checksum", "That listing has no SHA-256 — refusing to install an unverified archive.")
    end

    bytes = (@archive || PluginCatalogue.fetch_bytes(url)).b
    actual = Digest::SHA256.hexdigest(bytes)
    unless actual == expected
      raise Error.new("checksum_mismatch",
                      "The download did not match the registry checksum. The file was not installed.")
    end
    unless bytes.byteslice(0, 2) == GZIP_MAGIC
      raise Error.new("not_an_archive", "The download is not a gzipped tarball.")
    end

    dest = Dukafi::Plugins.directory_for(Dukafi::Plugins::Plugin.new(@id))
    raise Error.new("bad_id", "That plugin id is not installable.") unless dest

    extract!(bytes, dest)
    plugin_rb = File.join(dest, "plugin.rb")
    unless File.file?(plugin_rb)
      FileUtils.rm_rf(dest)
      raise Error.new("missing_plugin_rb", "The archive has no plugin.rb.")
    end

    begin
      load plugin_rb
    rescue StandardError, LoadError => e
      FileUtils.rm_rf(dest)
      Dukafi::Plugins.unregister(@id)
      raise Error.new("load_failed", "The plugin could not be loaded: #{e.class}: #{e.message}")
    end

    plugin = Dukafi::Plugins.find_visible(@id)
    raise Error.new("load_failed", "The plugin loaded but did not register.") unless plugin

    Dukafi::Plugins.ensure_installed!(plugin)
    plugin.run_activate

    plugin.to_admin_payload.merge("note" => "#{plugin.name} is installed. Configure it if it needs settings.")
  end

  private

  def extract!(bytes, dest)
    staging = "#{dest}.installing"
    FileUtils.rm_rf(staging)
    FileUtils.mkdir_p(staging)

    Zlib::GzipReader.wrap(StringIO.new(bytes)) do |gz|
      Gem::Package::TarReader.new(gz) do |tar|
        tar.each do |entry|
          next unless entry.file?

          relative = safe_relative(entry.full_name)
          next unless relative

          path = File.join(staging, relative)
          FileUtils.mkdir_p(File.dirname(path))
          File.binwrite(path, entry.read.to_s)
        end
      end
    end

    FileUtils.rm_rf(dest)
    FileUtils.mv(staging, dest)
  rescue Zlib::GzipFile::Error, Gem::Package::TarInvalidError
    FileUtils.rm_rf(staging)
    raise Error.new("not_an_archive", "The download is not a readable gzipped tarball.")
  rescue Error
    FileUtils.rm_rf(staging)
    raise
  end

  # Accept `{id}/plugin.rb` (what export writes) or a bare `plugin.rb`.
  # Anything that climbs out, or that belongs to a different plugin id, is
  # dropped rather than written.
  def safe_relative(name)
    parts = name.to_s.tr("\\", "/").split("/").reject(&:empty?)
    return nil if parts.empty? || parts.any? { |part| part == ".." || part.start_with?(".") }

    parts = parts.drop(1) if parts.first == @id
    return nil if parts.empty? || parts.first == ".."

    File.join(parts)
  end
end
