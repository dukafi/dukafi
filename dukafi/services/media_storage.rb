require "fileutils"

class MediaStorage
  StoredFile = Data.define(:url, :path)

  module LocalDisk
    module_function
    def store(io:, path:, content_type: nil)
      destination = Paths.storage_file(path)
      FileUtils.mkdir_p(File.dirname(destination))
      File.open(destination, "wb") { |file| IO.copy_stream(io, file) }
      StoredFile.new(url: "/#{path.to_s.delete_prefix('/')}", path: path.to_s.delete_prefix("/"))
    end
    def read_url(path) = "/#{path.to_s.delete_prefix('/')}"
    def delete(path)
      resolved = Paths.storage_file(path)
      File.delete(resolved) if File.file?(resolved)
    end
    def verify! = FileUtils.mkdir_p(Paths.uploads_root)
  end

  def self.resolve(id = "local")
    return LocalDisk if id.to_s.empty? || id.to_s == "local"
    entry = Dukafi::Plugins.configured_media_storages.find { |row| row["slug"] == id.to_s }
    entry && entry["provider"] || raise(ArgumentError, "Media storage #{id.inspect} is not configured.")
  end
end
