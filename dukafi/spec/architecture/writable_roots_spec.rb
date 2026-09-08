require_relative "../spec_helper"

class WritableRootsSpec < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)
  DOC = File.expand_path("../../../docs/architecture/writable-roots.md", __dir__)
  SCAN = %w[routes services publisher].freeze

  def test_writable_roots_doc_exists_and_names_env_keys
    assert File.file?(DOC), "expected docs/architecture/writable-roots.md"
    doc = File.read(DOC)
    %w[DUKAFI_DB DUKAFY_DB DUKAFI_STORAGE_ROOT DUKAFI_PUBLISHED_ROOT DUKAFI_PLUGINS_ROOT DUKAFI_PUBLISHED_STORE].each do |name|
      assert_includes doc, name
    end
    assert_includes doc, "Dir.mktmpdir"
    assert_includes doc, "Tempfile"
  end

  def test_paths_exposes_the_documented_roots
    %i[database storage_root uploads_root published_root plugins_root storage_file].each do |method|
      assert_respond_to Paths, method
    end
  end

  def test_literal_data_or_uploads_writers_mention_paths
    offenders = SCAN.flat_map { |dir| Dir[File.join(ROOT, dir, "**", "*.rb")] }.filter_map do |path|
      source = File.read(path)
      next unless source.match?(/File\.(binwrite|write)\(/)
      next unless source.match?(/["'](\/data|uploads\/)/)
      next if source.include?("Paths")
      path.sub("#{ROOT}/", "")
    end
    assert_empty offenders, "File.write/binwrite with /data or uploads/ literals should go through Paths:\n#{offenders.join("\n")}"
  end
end
