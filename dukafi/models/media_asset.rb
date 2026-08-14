require "json"

class MediaAsset < Sequel::Model
  def variants
    variants_json.to_s.empty? ? [] : JSON.parse(variants_json)
  rescue JSON::ParserError
    []
  end
end
