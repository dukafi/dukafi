require_relative "session_secret"
require_relative "database"
require_relative "json_path"
require "roda"

class Dukafi < Roda
end

Dir[File.expand_path("../models/concerns/*.rb", __dir__)].sort.each { |f| require f }
Dir[File.expand_path("../models/*.rb", __dir__)].sort.each { |f| require f }
publisher_root = File.expand_path("../publisher", __dir__)
publisher_files = Dir[File.join(publisher_root, "*.rb")].sort
(publisher_files + (Dir[File.join(publisher_root, "**/*.rb")].sort - publisher_files)).each { |f| require f }
Dir[File.expand_path("../services/*.rb", __dir__)].sort.each { |f| require f }

# Plugin system: the registry first, then each plugin's own definition.
# Plugins may use models, publisher modules and services, so they load last.
require_relative "../plugins/registry"
require_relative "../plugins/settings"
Dir[File.expand_path("../plugins/*/plugin.rb", __dir__)].sort.each { |f| require f }
