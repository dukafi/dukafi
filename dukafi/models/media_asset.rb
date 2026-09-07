require "json"

class MediaAsset < Sequel::Model
  many_to_many :products, join_table: :product_images

  MAX_TAGS = 20
  # Long enough for a real description, short enough that nobody pastes an
  # article into it. Screen readers announce the whole thing.
  MAX_ALT_LENGTH = 500

  def variants
    variants_json.to_s.empty? ? [] : JSON.parse(variants_json)
  rescue JSON::ParserError
    []
  end

  def tags
    tags_json.to_s.empty? ? [] : Array(JSON.parse(tags_json))
  rescue JSON::ParserError
    []
  end

  def tags=(values)
    self.tags_json = JSON.generate(
      Array(values).map { |tag| tag.to_s.strip.downcase }.reject(&:empty?).uniq.first(MAX_TAGS),
    )
  end

  def image? = mime.to_s.start_with?("image/")

  def origin_metadata
    origin_meta.to_s.empty? ? {} : JSON.parse(origin_meta)
  rescue JSON::ParserError
    {}
  end

  # Only the fields a caller may set. `path`, `mime` and the variants are
  # derived from the uploaded bytes and must never be writable — a client that
  # could change `path` could point an asset at any file on disk.
  def apply_metadata!(params)
    self.alt_text = params["altText"].to_s.strip[0, MAX_ALT_LENGTH] if params.key?("altText")
    self.title = params["title"].to_s.strip[0, 200] if params.key?("title")
    self.caption = params["caption"].to_s.strip[0, 1000] if params.key?("caption")
    self.tags = params["tags"] if params.key?("tags")
    self.updated_at = Time.now
    save
    self
  end

  def to_payload
    {
      id: id.to_s, filename: File.basename(path), path: MediaStorage.resolve(respond_to?(:storage) ? storage : "local").read_url(path),
      mimeType: mime, width: width, height: height,
      altText: alt_text.to_s, title: title.to_s, caption: caption.to_s,
      tags: tags, variants: variants,
      origin: respond_to?(:origin) ? origin : "upload",
      originMeta: respond_to?(:origin_meta) ? origin_metadata : {},
      createdAt: created_at&.utc&.iso8601,
      updatedAt: updated_at&.utc&.iso8601,
    }
  end
end
