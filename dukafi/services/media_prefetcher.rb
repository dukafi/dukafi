class MediaPrefetcher
  def self.call
    MediaAsset.all.to_h do |asset|
      ["/#{asset.path}", {
        "width" => asset.width, "height" => asset.height, "variants" => asset.variants,
      }]
    end
  end
end
