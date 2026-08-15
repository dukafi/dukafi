require_relative "../spec_helper"

# Plugins are installed, not shipped.
#
# The 0.0.1 image contained PayHero because the app tree did, which meant every
# store built from it had a Kenyan M-Pesa gateway in its admin whether or not
# its owner had heard of one — and "install a plugin" meant "rebuild the
# image". The app now contains the plugin SYSTEM and no plugins.
class PluginLoadingSpec < Minitest::Test
  # The one that would silently come back: someone adds `plugins/stripe/` to
  # the repo because that is where the code used to live, and it ships to
  # every store on the next release.
  def test_the_app_tree_holds_no_plugins
    bundled = Dir[File.expand_path("../../plugins/*/plugin.rb", __dir__)]

    assert_empty bundled,
                 "plugins/ is the plugin SYSTEM. A plugin here ships in the image to every " \
                 "store — put it in plugins-available/ and let an operator install it."
  end

  def test_the_plugin_system_itself_is_still_core
    assert File.file?(File.expand_path("../../plugins/registry.rb", __dir__))
    assert File.file?(File.expand_path("../../plugins/settings.rb", __dir__))
  end

  # Where an operator puts them, and where a container mounts them.
  def test_the_installed_root_is_configurable_and_defaults_outside_the_app
    assert_equal "/somewhere/else", with_env("DUKAFI_PLUGINS_ROOT" => "/somewhere/else") { Paths.plugins_root }

    default = with_env("DUKAFI_PLUGINS_ROOT" => nil, "DUKAFI_STORAGE_ROOT" => "/data") { Paths.plugins_root }
    assert_equal "/data/plugins-installed", default
    # Never the core directory: someone else's code does not belong beside the
    # registry it registers with.
    refute_equal File.expand_path("../../plugins", __dir__), default
  end

  # The suite installs the first-party plugins from the same directory an
  # operator copies from, which is why they are loaded here at all.
  def test_the_first_party_plugins_are_distributed_not_bundled
    available = Dir[File.expand_path("../../../plugins-available/*/plugin.rb", __dir__)]
                .map { |path| File.basename(File.dirname(path)) }

    assert_includes available, "payhero"
    assert_includes available, "fake_payments"
  end

  # A broken plugin must not stop a merchant reaching their own admin.
  def test_a_plugin_that_raises_on_load_is_skipped
    Dir.mktmpdir do |root|
      FileUtils.mkdir_p(File.join(root, "broken"))
      File.write(File.join(root, "broken", "plugin.rb"), "raise 'boom'")

      skipped = capture_warnings do
        Dir[File.join(root, "*", "plugin.rb")].sort.each do |file|
          require file
        rescue StandardError, LoadError => e
          warn "[plugins] skipped #{file}: #{e.class}: #{e.message}"
        end
      end

      assert_includes skipped, "skipped"
      assert_includes skipped, "boom"
    end
  end

  def with_env(values)
    previous = values.keys.to_h { |key| [key, ENV[key]] }
    values.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
    yield
  ensure
    previous.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end

  def capture_warnings
    original = $stderr
    $stderr = StringIO.new
    yield
    $stderr.string
  ensure
    $stderr = original
  end
end
