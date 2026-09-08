require "digest"

# Copy local-disk media assets onto another MediaStorage adapter (e.g. S3).
module MigrateMedia
  module_function

  def call(target:, dry_run: false, delete_local: false)
    raise ArgumentError, "target is required" if target.to_s.empty?
    raise ArgumentError, "cannot migrate to local" if target.to_s == "local"

    adapter = MediaStorage.resolve(target)
    adapter.verify! unless dry_run

    MediaAsset.where(storage: "local").order(:id).each do |asset|
      source = Paths.storage_file(asset.path)
      unless File.file?(source)
        warn "skip asset #{asset.id}: #{source} is missing"
        next
      end
      checksum = Digest::SHA256.file(source).hexdigest
      if dry_run
        puts "would migrate asset #{asset.id} sha256=#{checksum}"
        next
      end
      File.open(source, "rb") { |io| adapter.store(io: io, path: asset.path, content_type: asset.mime) }
      asset.update(storage: target, updated_at: Time.now)
      File.delete(source) if delete_local
      puts "migrated asset #{asset.id} sha256=#{checksum}"
    end
  end
end
