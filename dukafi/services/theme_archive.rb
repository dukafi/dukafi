require "json"
require "rubygems/package"
require "stringio"
require "zlib"

# A theme is a gzipped tarball of JSON files — pages, tables, catalogue —
# and never image bytes. Media is a list of URLs the importer's browser
# fetches from the source store.
module ThemeArchive
  FILES = %w[
    theme.json media.json shell.json pages.json templates.json
    partials.json tables.json catalogue.json reviews.json
  ].freeze

  class Error < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  module_function

  def pack(payload)
    files = FILES.filter_map do |name|
      value = payload[name.delete_suffix(".json")]
      next if value.nil?

      [name, JSON.pretty_generate(value)]
    end
    gzip_tar(files)
  end

  def unpack(bytes)
    raise Error.new("empty_archive", "That file is empty.") if bytes.to_s.empty?

    entries = {}
    Zlib::GzipReader.wrap(StringIO.new(bytes.to_s.b)) do |gz|
      Gem::Package::TarReader.new(gz) do |tar|
        tar.each do |entry|
          next unless entry.file?

          name = File.basename(entry.full_name.to_s)
          next unless FILES.include?(name)

          entries[name.delete_suffix(".json")] = JSON.parse(entry.read)
        end
      end
    end
    raise Error.new("not_a_theme", "That archive has no theme.json.") unless entries["theme"].is_a?(Hash)

    entries
  rescue Zlib::GzipFile::Error, Gem::Package::TarInvalidError
    raise Error.new("not_a_theme", "That is not a Dukafi theme archive.")
  rescue JSON::ParserError
    raise Error.new("not_a_theme", "The theme archive is not valid JSON.")
  end

  def gzip_tar(files)
    tar_io = StringIO.new(+"")
    Gem::Package::TarWriter.new(tar_io) do |tar|
      files.each do |path, contents|
        data = contents.to_s.b
        tar.add_file_simple(path, 0o644, data.bytesize) { |io| io.write(data) }
      end
    end
    gzip_io = StringIO.new(+"")
    Zlib::GzipWriter.wrap(gzip_io) { |gz| gz.write(tar_io.string) }
    gzip_io.string.b
  end
end
