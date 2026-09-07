#!/usr/bin/env ruby
require_relative "../config/environment"

target = ARGV.each_cons(2).find { |left, _| left == "--to" }&.last
abort "usage: ruby scripts/migrate_media.rb --to ADAPTER [--delete-local]" if target.to_s.empty? || target == "local"
adapter = MediaStorage.resolve(target)
adapter.verify!
delete_local = ARGV.include?("--delete-local")

MediaAsset.where(storage: "local").order(:id).each do |asset|
  source = Paths.storage_file(asset.path)
  unless File.file?(source)
    warn "skip asset #{asset.id}: #{source} is missing"
    next
  end
  File.open(source, "rb") { |io| adapter.store(io: io, path: asset.path, content_type: asset.mime) }
  asset.update(storage: target, updated_at: Time.now)
  File.delete(source) if delete_local
  puts "migrated asset #{asset.id}"
end
