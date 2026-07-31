require_relative "../spec_helper"

class PublisherPuritySpec < Minitest::Test
  FORBIDDEN = /\bDB\b|Sequel|File\.|Net::/

  def test_publisher_ruby_files_do_not_reference_impure_boundaries
    root = File.expand_path("../../publisher", __dir__)
    violations = Dir[File.join(root, "**/*.rb")].filter_map do |path|
      path if File.read(path).match?(FORBIDDEN)
    end

    assert_empty violations, "Impure publisher files: #{violations.join(', ')}"
  end
end
