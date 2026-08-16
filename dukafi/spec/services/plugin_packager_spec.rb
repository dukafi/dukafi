require_relative "../spec_helper"
require "rubygems/package"
require "stringio"
require "zlib"

class PluginPackagerSpec < Minitest::Test
  def payhero = Dukafi::Plugins.find("payhero")

  def unpack(bytes)
    files = {}
    Zlib::GzipReader.wrap(StringIO.new(bytes)) do |gz|
      Gem::Package::TarReader.new(gz) do |tar|
        tar.each { |entry| files[entry.full_name] = entry.read if entry.file? }
      end
    end
    files
  end

  def test_the_checksum_is_sha256_of_the_archive_bytes
    archive = PluginPackager.call(payhero, name: payhero.name, version: "1.0.0")

    assert_equal 64, archive.sha256.length
    assert_equal archive.sha256, Digest::SHA256.hexdigest(archive.bytes)
    assert_equal "payhero-1.0.0.tar.gz", archive.filename
  end

  def test_the_same_inputs_produce_the_same_digest
    first = PluginPackager.call(payhero, name: payhero.name, version: "1.0.0")
    second = PluginPackager.call(payhero, name: payhero.name, version: "1.0.0")

    assert_equal first.sha256, second.sha256
  end

  def test_name_and_version_are_written_into_the_exported_copy
    archive = PluginPackager.call(payhero, name: "PayHero Export", version: "2.0.0")
    source = unpack(archive.bytes).fetch("payhero/plugin.rb")

    assert_includes source, "p.name \"PayHero Export\""
    assert_includes source, "p.version \"2.0.0\""
    refute_includes File.read(File.join(Paths.plugins_root, "payhero", "plugin.rb")),
                    "PayHero Export"
  end

  def test_a_hidden_plugin_cannot_be_exported
    error = assert_raises(PluginPackager::Error) do
      PluginPackager.call(Dukafi::Plugins.find("ai"), name: "AI", version: "1.0.0")
    end
    assert_equal "hidden_plugin", error.code
  end

  def test_a_bad_version_is_refused
    error = assert_raises(PluginPackager::Error) do
      PluginPackager.call(payhero, name: "PayHero", version: "not-a-version")
    end
    assert_equal "invalid_version", error.code
  end
end
