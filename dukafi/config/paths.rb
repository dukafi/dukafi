# Where Dukafi keeps the things it writes.
#
# Three directories outlive any one request — the database, the published
# storefront, and uploaded media — and in a container all three have to move
# off the image onto a mounted volume. Everything that touches them goes
# through here so a deployment sets three environment variables instead of
# hunting through the source for `File.expand_path`.
#
# Naming: the current spelling is DUKAFI_*, but DUKAFY_* is still honoured
# because it is what existing deployments already have in their shell and
# their Railway/Render dashboards. A rename of the product is not a reason to
# break someone's running store.
#
# STORAGE_ROOT is deliberately the directory that CONTAINS `uploads/`, not
# the uploads directory itself: `MediaAsset#path` stores the relative string
# "uploads/<name>" and that same string is the public URL. Resolving it
# against a root keeps the database and the URLs untouched when the bytes
# move to a volume.
module Paths
  APP_ROOT = File.expand_path("..", __dir__).freeze

  module_function

  def database
    lookup("DB") || File.join(APP_ROOT, "db", "dukafy.sqlite3")
  end

  def published_root
    File.expand_path(lookup("PUBLISHED_ROOT") || File.join(APP_ROOT, "published"))
  end

  def storage_root
    File.expand_path(lookup("STORAGE_ROOT") || APP_ROOT)
  end

  def uploads_root
    File.join(storage_root, "uploads")
  end

  # Resolves a stored relative path ("uploads/ab12-hero.png") to a real file.
  #
  # Raises rather than returning nil on a path that climbs out of the storage
  # root: every caller uses the result in a File operation immediately, so a
  # nil would surface as a confusing TypeError somewhere else. Reaching here
  # with `../` means a stored path was tampered with, which is worth stopping
  # loudly rather than papering over.
  def storage_file(relative_path)
    root = storage_root
    resolved = File.expand_path(relative_path.to_s.delete_prefix("/"), root)
    unless resolved.start_with?("#{root}#{File::SEPARATOR}")
      raise ArgumentError, "path escapes the storage root: #{relative_path.inspect}"
    end

    resolved
  end

  def lookup(suffix)
    value = ENV["DUKAFI_#{suffix}"] || ENV["DUKAFY_#{suffix}"]
    return nil if value.nil? || value.empty?

    value
  end
end
