require "tempfile"
require "securerandom"
require "fileutils"
require "json"

class MediaIngest
  MAX_BYTES = 20 * 1024 * 1024

  def self.call(bytes:, filename:, mime:, origin: "upload", origin_meta: nil, alt_text: "")
    raise ArgumentError, "Media file is empty." if bytes.nil? || bytes.empty?
    raise ArgumentError, "Media file exceeds 20 MB." if bytes.bytesize > MAX_BYTES
    safe_name = File.basename(filename.to_s).gsub(/[^a-zA-Z0-9._-]/, "-")
    safe_name = "asset" if safe_name.empty?
    relative_path = File.join("uploads", "#{SecureRandom.hex(8)}-#{safe_name}")
    destination = Paths.storage_file(relative_path)
    FileUtils.mkdir_p(File.dirname(destination))
    File.binwrite(destination, bytes)
    processed = MediaVariants.call(source: destination, relative_path: relative_path, mime: mime)
    MediaAsset.create(path: relative_path, mime: mime, width: processed[:width], height: processed[:height],
                      variants_json: JSON.generate(processed[:variants]), origin: origin,
                      origin_meta: origin_meta && JSON.generate(origin_meta), alt_text: alt_text.to_s[0, 125])
  rescue StandardError
    File.delete(destination) if defined?(destination) && File.file?(destination)
    raise
  end
end
