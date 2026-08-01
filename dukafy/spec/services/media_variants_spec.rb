require_relative "../spec_helper"

class MediaVariantsSpec < Minitest::Test
  class FakeProcessor
    def dimensions(_source) = [1_000, 750]

    def call(destination:, width:, **)
      FileUtils.mkdir_p(File.dirname(destination))
      File.write(destination, "webp-#{width}")
      { width:, height: (width * 0.75).round }
    end
  end

  def test_builds_only_variants_smaller_than_the_original
    root = Dir.mktmpdir("dukafy-media-variants-")
    source = File.join(root, "uploads", "photo.jpg")
    FileUtils.mkdir_p(File.dirname(source))
    File.write(source, "source")
    result = MediaVariants.call(source:, relative_path: "uploads/photo.jpg", mime: "image/jpeg", storage_root: root, processor: FakeProcessor.new)

    assert_equal [1_000, 750], result.values_at(:width, :height)
    assert_equal [320, 640, 960], result[:variants].map { |variant| variant.fetch("width") }
    result[:variants].each do |variant|
      variant_path = File.join(root, variant.fetch("path"))
      assert File.file?(variant_path)
      assert_equal "webp", variant.fetch("format")
      assert_equal File.size(variant_path), variant.fetch("sizeBytes")
    end
  ensure
    FileUtils.remove_entry(root) if root && File.exist?(root)
  end

  def test_skips_non_raster_files
    result = MediaVariants.call(source: "ignored", relative_path: "uploads/file.txt", mime: "text/plain", storage_root: "/unused", processor: FakeProcessor.new)
    assert_equal({ width: nil, height: nil, variants: [] }, result)
  end
end
