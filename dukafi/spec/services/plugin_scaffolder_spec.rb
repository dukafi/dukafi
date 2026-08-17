require_relative "../spec_helper"

class PluginScaffolderSpec < Minitest::Test
  def setup
    @id = "scaffold-#{Process.pid}"
    @previous_root = ENV["DUKAFI_PLUGINS_ROOT"]
    @root = Dir.mktmpdir("dukafi-scaffold-")
    ENV["DUKAFI_PLUGINS_ROOT"] = @root
  end

  def teardown
    Dukafi::Plugins.unregister(@id)
    ENV["DUKAFI_PLUGINS_ROOT"] = @previous_root
    FileUtils.rm_rf(@root)
  end

  def test_writes_and_registers_a_plugin
    payload = PluginScaffolder.call(id: @id, name: "Scaffolded", version: "1.2.0", settings: [
      { "key" => "api_token", "kind" => "secret", "label" => "API token" },
      { "key" => "channel_id", "kind" => "integer", "label" => "Channel" },
    ])

    assert_equal @id, payload.fetch("id")
    assert_equal "Scaffolded", payload.fetch("name")
    assert_equal "1.2.0", payload.fetch("version")
    keys = payload.fetch("settings").map { |setting| setting.fetch("key") }
    assert_equal %w[api_token channel_id], keys
    assert_equal true, payload.fetch("settings").find { |setting| setting.fetch("key") == "api_token" }.fetch("secret")

    source = File.read(File.join(@root, @id, "plugin.rb"))
    assert_includes source, "p.secret :api_token, label: \"API token\""
    assert Dukafi::Plugins.find(@id)
  end

  def test_refuses_an_id_that_is_already_installed
    PluginScaffolder.call(id: @id, name: "Once")
    error = assert_raises(PluginScaffolder::Error) { PluginScaffolder.call(id: @id, name: "Twice") }
    assert_equal "already_installed", error.code
  end

  def test_refuses_a_reserved_id
    error = assert_raises(PluginScaffolder::Error) { PluginScaffolder.call(id: "ai", name: "Nope") }
    assert_equal "hidden_plugin", error.code
  end

  def test_a_name_in_the_source_cannot_break_out_of_the_string
    name = 'Evil"); raise "injected'
    payload = PluginScaffolder.call(id: @id, name: name)

    assert_equal name, payload.fetch("name")
    assert_equal name, Dukafi::Plugins.find(@id).name
  end
end
