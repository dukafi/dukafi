require_relative "../spec_helper"

class PluginInstallerSpec < Minitest::Test
  def setup
    @id = "sample-#{Process.pid}"
    @previous_root = ENV["DUKAFI_PLUGINS_ROOT"]
    @root = Dir.mktmpdir("dukafi-install-")
    ENV["DUKAFI_PLUGINS_ROOT"] = @root
  end

  def teardown
    PluginCatalogue.http = nil
    Dukafi::Plugins.unregister(@id)
    ENV["DUKAFI_PLUGINS_ROOT"] = @previous_root
    FileUtils.rm_rf(@root)
  end

  def write_sample!
    dir = File.join(@root, @id)
    FileUtils.mkdir_p(dir)
    File.write(File.join(dir, "plugin.rb"), <<~RUBY)
      Dukafi::Plugins.register(#{@id.dump}) do |p|
        p.name "Sample"
        p.version "1.0.0"
      end
    RUBY
    Dukafi::Plugins.register(@id) { |p| p.name "Sample"; p.version "1.0.0" }
  end

  def listing_for(archive, licensed: false)
    {
      "id" => @id,
      "licensed" => licensed,
      "distribution" => {
        "type" => licensed ? "licensed" : "public",
        "downloadUrl" => "https://cdn.example/#{@id}.tar.gz",
        "sha256" => archive.sha256,
      },
    }
  end

  def test_installs_a_verified_archive
    write_sample!
    archive = PluginPackager.call(Dukafi::Plugins.find(@id), name: "Sample", version: "1.0.0")
    Dukafi::Plugins.unregister(@id)
    FileUtils.rm_rf(File.join(@root, @id))

    payload = PluginInstaller.call(@id, listing: listing_for(archive), archive: archive.bytes)

    assert_equal @id, payload.fetch("id")
    assert_equal "Sample", payload.fetch("name")
    assert File.file?(File.join(@root, @id, "plugin.rb"))
    assert Dukafi::Plugins.find(@id)
  end

  def test_refuses_a_checksum_mismatch
    write_sample!
    archive = PluginPackager.call(Dukafi::Plugins.find(@id), name: "Sample", version: "1.0.0")
    listing = listing_for(archive)
    listing["distribution"]["sha256"] = "a" * 64

    error = assert_raises(PluginInstaller::Error) do
      PluginInstaller.call(@id, listing: listing, archive: archive.bytes)
    end
    assert_equal "checksum_mismatch", error.code
  end

  def test_refuses_a_licensed_plugin
    write_sample!
    archive = PluginPackager.call(Dukafi::Plugins.find(@id), name: "Sample", version: "1.0.0")

    error = assert_raises(PluginInstaller::Error) do
      PluginInstaller.call(@id, listing: listing_for(archive, licensed: true), archive: archive.bytes)
    end
    assert_equal "licensed_plugin", error.code
  end
end
