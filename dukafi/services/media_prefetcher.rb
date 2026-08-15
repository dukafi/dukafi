class MediaPrefetcher
  def self.call
    MediaAsset.all.to_h do |asset|
      ["/#{asset.path}", {
        "width" => asset.width, "height" => asset.height, "variants" => asset.variants,
        # Without this every published image carries alt="" no matter what the
        # merchant typed — `register_image` reads it from here.
        "altText" => asset.alt_text.to_s,
      }]
    end
  end
end
