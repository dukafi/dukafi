require "fileutils"

class PublishedStore
  Entry = Data.define(:content, :content_type)
  MAX_CACHE = 200
  @cache = {}
  @cache_order = []

  class << self
    def backend = ENV.fetch("DUKAFI_PUBLISHED_STORE", "disk")

    def import_directory(version, root)
      return unless backend == "db"
      files = Dir[File.join(root, "**", "*")].select { |path| File.file?(path) }.to_h do |path|
        relative = path.delete_prefix("#{root}/")
        [relative, { content: File.binread(path), content_type: content_type(relative) }]
      end
      DB.transaction do
        DB[:published_files].where(version: version).delete
        files.each { |path, value| DB[:published_files].insert(version: version, path: path, **value) }
        DB[:published_states].where(id: 1).update(current_version: version)
        old = DB[:published_files].select_map(:version).uniq.sort.reverse.drop(2)
        DB[:published_files].where(version: old).delete unless old.empty?
      end
      clear_cache
    end

    def read(path)
      clean = path.to_s.delete_prefix("/")
      raise ArgumentError, "unsafe published path" if clean.split("/").include?("..")
      return disk_read(clean) unless backend == "db"
      version = DB[:published_states].get(:current_version).to_i
      key = [version, clean]
      return @cache[key] if @cache.key?(key)
      row = DB[:published_files].first(version: version, path: clean)
      cache(key, row && Entry.new(content: row[:content], content_type: row[:content_type]))
    end

    def current_version
      backend == "db" ? DB[:published_states].get(:current_version).to_i : SiteState.first&.publish_version.to_i
    end

    def disk_read(path)
      file = File.join(Paths.published_root, "current", path)
      File.file?(file) ? Entry.new(content: File.binread(file), content_type: content_type(path)) : nil
    end

    def content_type(path)
      return "text/css" if path.end_with?(".css")
      return "application/xml" if path.end_with?(".xml")
      "text/html; charset=utf-8"
    end

    def cache(key, value)
      @cache[key] = value
      @cache_order << key
      @cache.delete(@cache_order.shift) while @cache_order.length > MAX_CACHE
      value
    end
    def clear_cache = (@cache = {}; @cache_order = [])
  end
end
