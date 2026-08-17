require "fileutils"

# Removes an installed plugin: its directory, its settings rows, and its
# in-memory registration.
#
# Ruby has already required the file, so constants the plugin defined stay
# loaded until process restart. Unregistering is enough for the admin list
# and for payment-provider lookup: a deleted provider disappears from
# checkout immediately. The next boot will not load it, because the files
# are gone.
class PluginUninstaller
  class Error < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  def self.call(plugin)
    new(plugin).call
  end

  def initialize(plugin)
    @plugin = plugin
  end

  def call
    raise Error.new("hidden_plugin", "That is not an installed plugin.") if @plugin.hidden?

    @plugin.run_uninstall(purge: false)
    Dukafi::Plugins.emit(:"plugin.uninstalled", @plugin.id)

    dir = Dukafi::Plugins.directory_for(@plugin)
    FileUtils.rm_rf(dir) if dir && File.directory?(dir)
    PluginSetting.where(plugin_id: @plugin.id).delete
    PluginRecord.where(plugin_id: @plugin.id).delete
    Dukafi::Plugins.unregister(@plugin.id)
    { ok: true, id: @plugin.id }
  end
end
