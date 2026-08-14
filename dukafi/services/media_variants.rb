require "json"

class MediaVariants
  WIDTHS = [320, 640, 960, 1280, 1920].freeze
  RASTER_MIMES = %w[image/jpeg image/png image/webp].freeze

  class VipsProcessor
    def call(source:, destination:, width:)
      require "image_processing/vips"
      image = Vips::Image.new_from_file(source, access: :sequential)
      ImageProcessing::Vips.source(source).resize_to_limit(width, nil).convert("webp").saver(quality: 82).call(destination:)
      { width: [width, image.width].min, height: (image.height * [width, image.width].min.to_f / image.width).round }
    rescue LoadError => error
      raise Unavailable, "libvips is required for raster image uploads: #{error.message}"
    end

    def dimensions(source)
      require "vips"
      image = Vips::Image.new_from_file(source, access: :sequential)
      [image.width, image.height]
    rescue LoadError => error
      raise Unavailable, "libvips is required for raster image uploads: #{error.message}"
    end
  end

  class Unavailable < StandardError; end
  class ProcessingError < StandardError; end
  class << self
    attr_writer :processor
  end

  def self.call(source:, relative_path:, mime:, storage_root: Paths.storage_root, processor: (@processor ||= VipsProcessor.new))
    return { width: nil, height: nil, variants: [] } unless RASTER_MIMES.include?(mime)

    width, height = processor.dimensions(source)
    extensionless = relative_path.sub(/\.[^.]+\z/, "")
    variants = WIDTHS.select { |candidate| candidate < width }.map do |candidate|
      variant_relative = "#{extensionless}-w#{candidate}.webp"
      variant_path = File.expand_path(variant_relative, storage_root)
      dimensions = processor.call(source:, destination: variant_path, width: candidate)
      {
        "path" => "/#{variant_relative}", "width" => dimensions.fetch(:width), "height" => dimensions.fetch(:height),
        "format" => "webp", "sizeBytes" => File.file?(variant_path) ? File.size(variant_path) : 0,
      }
    end
    { width:, height:, variants: }
  rescue StandardError => error
    variants&.each do |variant|
      path = File.expand_path(variant.fetch("path").delete_prefix("/"), storage_root)
      File.delete(path) if File.file?(path)
    end
    raise if error.is_a?(Unavailable)

    raise ProcessingError, "Image could not be processed: #{error.message}"
  end
end
