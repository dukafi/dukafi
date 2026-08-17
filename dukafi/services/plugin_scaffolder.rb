require "fileutils"

# Write a new plugin onto this store from a description, not from an archive.
#
# The register block is generated from the fields the caller named — id, name,
# version, settings — so a model cannot smuggle Ruby in through a label. That
# is the whole point of a scaffold: an agent can add a plugin the merchant
# then fills in, without this tool becoming a remote code loader. Behaviour
# (payment providers, event handlers) is added by editing plugin.rb on disk.
class PluginScaffolder
  class Error < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  ID = /\A[a-z0-9][a-z0-9_-]{1,63}\z/
  KEY = /\A[a-z][a-z0-9_]{0,39}\z/
  NAME_MAX = 120
  MAX_SETTINGS = 20
  KINDS = %w[string integer secret].freeze

  def self.call(id:, name:, version: "1.0.0", settings: [])
    new(id: id, name: name, version: version, settings: settings).call
  end

  def initialize(id:, name:, version:, settings:)
    @id = id.to_s.strip
    @name = name.to_s.strip
    @version = version.to_s.strip
    @version = "1.0.0" if @version.empty?
    @settings = Array(settings)
  end

  def call
    validate!
    dest = Dukafi::Plugins.directory_for(Dukafi::Plugins::Plugin.new(@id))
    raise Error.new("bad_id", "That plugin id is not installable.") unless dest
    raise Error.new("already_installed", "#{@id.inspect} is already on this store. Delete it first.") if File.exist?(dest)

    FileUtils.mkdir_p(dest)
    plugin_rb = File.join(dest, "plugin.rb")
    File.write(plugin_rb, source)

    begin
      load plugin_rb
    rescue StandardError, LoadError => e
      FileUtils.rm_rf(dest)
      Dukafi::Plugins.unregister(@id)
      raise Error.new("load_failed", "The plugin could not be loaded: #{e.class}: #{e.message}")
    end

    plugin = Dukafi::Plugins.find_visible(@id)
    unless plugin
      FileUtils.rm_rf(dest)
      raise Error.new("load_failed", "The plugin loaded but did not register.")
    end

    Dukafi::Plugins.ensure_installed!(plugin)
    plugin.run_activate

    plugin.to_admin_payload.merge(
      "note" => "#{plugin.name} is installed. Configure it if it needs settings. " \
                "Edit #{plugin_rb} to add payment providers or other behaviour."
    )
  end

  private

  def validate!
    raise Error.new("id_required", "Which plugin id?") if @id.empty?
    unless @id.match?(ID)
      raise Error.new("bad_id",
                      "#{@id.inspect} cannot be a plugin id. Use lowercase letters, numbers, " \
                      "hyphen or underscore, 2–64 characters, starting with a letter or number.")
    end
    if (existing = Dukafi::Plugins.find(@id))
      raise Error.new("hidden_plugin", "That id is reserved.") if existing.hidden?
      raise Error.new("already_installed",
                      "#{@id.inspect} is already installed. Call list_plugins, or delete_plugin first.")
    end
    raise Error.new("name_required", "Give the plugin a name.") if @name.empty?
    raise Error.new("name_too_long", "Name must be at most #{NAME_MAX} characters.") if @name.length > NAME_MAX
    unless @version.match?(PluginPackager::VERSION)
      raise Error.new("invalid_version", "Version must look like 1.2.3 or 1.2.3-beta1.")
    end
    unless @settings.is_a?(Array)
      raise Error.new("invalid_settings", "settings must be an array of {key, kind, label} objects.")
    end
    if @settings.length > MAX_SETTINGS
      raise Error.new("too_many_settings", "At most #{MAX_SETTINGS} settings on a new plugin.")
    end

    seen = {}
    @settings.each do |setting|
      unless setting.is_a?(Hash)
        raise Error.new("invalid_settings", "Each setting must be an object with a key.")
      end

      key = setting["key"].to_s.strip
      raise Error.new("invalid_settings", "A setting is missing its key.") if key.empty?
      unless key.match?(KEY)
        raise Error.new("invalid_settings",
                        "#{key.inspect} is not a setting key. Use lowercase letters, numbers and underscore.")
      end
      raise Error.new("invalid_settings", "Setting #{key.inspect} is declared twice.") if seen[key]

      kind = setting.fetch("kind", "string").to_s
      unless KINDS.include?(kind)
        raise Error.new("invalid_settings",
                        "#{kind.inspect} is not a setting kind. Use string, integer or secret.")
      end
      seen[key] = true
    end
  end

  def source
    lines = [
      "# Scaffolded by create_plugin. Edit this file to add behaviour",
      "# (payment providers, event handlers). Settings are declared below.",
      "",
      "Dukafi::Plugins.register(#{@id.dump}) do |p|",
      "  p.name #{@name.dump}",
      "  p.version #{@version.dump}",
    ]
    @settings.each { |setting| lines << setting_line(setting) }
    lines << "end"
    lines << ""
    lines.join("\n")
  end

  def setting_line(setting)
    key = setting["key"].to_s.strip
    kind = setting.fetch("kind", "string").to_s
    label = setting["label"].to_s.strip
    extra = label.empty? ? "" : ", label: #{label.dump}"
    method = case kind
             when "secret" then "secret"
             when "integer" then "integer"
             else "setting"
             end
    "  p.#{method} #{key.to_sym.inspect}#{extra}"
  end
end
