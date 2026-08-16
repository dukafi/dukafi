require_relative "../spec_helper"

class PluginUninstallerSpec < Minitest::Test
  def setup
    @id = "tmp-uninst-#{Process.pid}"
    @dir = File.join(Paths.plugins_root, @id)
  end

  def teardown
    Dukafi::Plugins.unregister(@id)
    FileUtils.rm_rf(@dir)
  end

  def install_temp!
    FileUtils.mkdir_p(@dir)
    File.write(File.join(@dir, "plugin.rb"),
               "Dukafi::Plugins.register(#{@id.dump}) { |p| p.name \"Temp\" }\n")
    Dukafi::Plugins.register(@id) { |p| p.name "Temp"; p.version "0.0.1" }
    PluginSetting.create(plugin_id: @id, key: "token", value: "secret", updated_at: Time.now)
    Dukafi::Plugins.find(@id)
  end

  def test_removes_files_settings_and_registration
    plugin = install_temp!
    PluginUninstaller.call(plugin)

    assert_nil Dukafi::Plugins.find(@id)
    refute File.exist?(@dir)
    assert_equal 0, PluginSetting.where(plugin_id: @id).count
  end

  def test_the_ai_assistant_cannot_be_uninstalled
    error = assert_raises(PluginUninstaller::Error) do
      PluginUninstaller.call(Dukafi::Plugins.find("ai"))
    end
    assert_equal "hidden_plugin", error.code
    assert Dukafi::Plugins.find("ai")
  end
end
