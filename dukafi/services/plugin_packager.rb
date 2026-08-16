require "digest"
require "rubygems/package"
require "stringio"
require "zlib"

# Packages an installed plugin as a gzipped tarball so it can be uploaded
# to the registry.
#
# The SHA-256 is of the ARCHIVE BYTES, not of any file inside them. Putting
# the digest in the tarball would change the digest. The registry hashes
# the upload itself; a store that later downloads the archive hashes what
# it received and refuses a mismatch.
class PluginPackager
  Archive = Data.define(:bytes, :filename, :sha256, :id, :name, :version)

  VERSION = /\A[0-9]+(\.[0-9]+){0,3}(-[0-9A-Za-z.-]+)?\z/
  NAME_MAX = 120

  class Error < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  def self.call(plugin, name:, version:)
    new(plugin, name: name, version: version).call
  end

  def initialize(plugin, name:, version:)
    @plugin = plugin
    @name = name.to_s.strip
    @version = version.to_s.strip
  end

  def call
    raise Error.new("hidden_plugin", "That is not an installed plugin.") if @plugin.hidden?
    raise Error.new("name_required", "Give the plugin a name.") if @name.empty?
    raise Error.new("name_too_long", "Name must be at most #{NAME_MAX} characters.") if @name.length > NAME_MAX
    unless @version.match?(VERSION)
      raise Error.new("invalid_version", "Version must look like 1.2.3 or 1.2.3-beta1.")
    end

    dir = Dukafi::Plugins.directory_for(@plugin)
    unless dir && File.directory?(dir) && File.file?(File.join(dir, "plugin.rb"))
      raise Error.new("plugin_files_missing", "This plugin has no files on disk to export.")
    end

    bytes = gzip_tar(entries(dir))
    Archive.new(
      bytes: bytes,
      filename: "#{@plugin.id}-#{@version}.tar.gz",
      sha256: Digest::SHA256.hexdigest(bytes),
      id: @plugin.id,
      name: @name,
      version: @version,
    )
  end

  private

  def entries(dir)
    Dir.glob("**/*", base: dir).sort.filter_map do |relative|
      next if relative.split("/").any? { |part| part.start_with?(".") }

      full = File.join(dir, relative)
      next unless File.file?(full)

      contents = File.binread(full)
      contents = rewrite_identity(contents) if File.basename(relative) == "plugin.rb"
      ["#{@plugin.id}/#{relative}", contents]
    end
  end

  # The live install keeps its own name/version. Only the exported copy is
  # rewritten, so bumping a version to publish does not mutate the running
  # plugin.rb.
  def rewrite_identity(source)
    out = source.dup
    out.sub!(/p\.name\s+(["']).+?\1/, "p.name #{@name.dump}")
    out.sub!(/p\.version\s+(["']).+?\1/, "p.version #{@version.dump}")
    out
  end

  def gzip_tar(files)
    tar_io = StringIO.new(+"")
    Gem::Package::TarWriter.new(tar_io) do |tar|
      files.each do |path, contents|
        data = contents.b
        tar.add_file_simple(path, 0o644, data.bytesize) { |io| io.write(data) }
      end
    end
    gzip_io = StringIO.new(+"")
    Zlib::GzipWriter.wrap(gzip_io) { |gz| gz.write(tar_io.string) }
    gzip_io.string.b
  end
end
