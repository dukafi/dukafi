require_relative "session_secret"
require_relative "database"
require_relative "json_path"
require "roda"

class Dukafi < Roda
  def self.warn_storage_config!(io: $stderr)
    if ENV.fetch("DUKAFI_REPLICAS", "1").to_i > 1 && ENV.fetch("DUKAFI_PUBLISHED_STORE", "disk") == "disk"
      io.puts "[storage] multiple replicas with disk-published state can diverge; set DUKAFI_PUBLISHED_STORE=db"
    end
  end
end

Dir[File.expand_path("../models/concerns/*.rb", __dir__)].sort.each { |f| require f }
Dir[File.expand_path("../models/*.rb", __dir__)].sort.each { |f| require f }
publisher_root = File.expand_path("../publisher", __dir__)
publisher_files = Dir[File.join(publisher_root, "*.rb")].sort
(publisher_files + (Dir[File.join(publisher_root, "**/*.rb")].sort - publisher_files)).each { |f| require f }
Dir[File.expand_path("../services/*.rb", __dir__)].sort.each { |f| require f }

# Plugin system: the registry first, then each plugin's own definition.
# Plugins may use models, publisher modules and services, so they load last.
# The plugin SYSTEM is core; the plugins are not.
require_relative "../plugins/registry"
require_relative "../plugins/settings"
require_relative "../plugins/storage"

# Installed plugins, from wherever this deployment keeps them — a mounted
# volume in a container, a local directory in development. Nothing is bundled:
# a store has the payment providers its owner installed and no others.
#
# A plugin that raises on load is skipped with a warning rather than taking
# the store down: someone else's code should not be able to stop a merchant
# from reaching their own admin.
Dir[File.join(Paths.plugins_root, "*", "plugin.rb")].sort.each do |file|
  require file
rescue StandardError, LoadError => e
  warn "[plugins] skipped #{file}: #{e.class}: #{e.message}"
end

Dukafi::Plugins.boot!
Dukafi::Plugins.on_core(:"order.paid") { |order| Mailer.deliver(:order_confirmation, order: order) }
Dukafi.warn_storage_config!
Scheduler.start!
