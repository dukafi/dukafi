require_relative "database"
require "roda"

class Dukafy < Roda
end

Dir[File.expand_path("../models/*.rb", __dir__)].sort.each { |f| require f }
publisher_root = File.expand_path("../publisher", __dir__)
publisher_files = Dir[File.join(publisher_root, "*.rb")].sort
(publisher_files + (Dir[File.join(publisher_root, "**/*.rb")].sort - publisher_files)).each { |f| require f }
Dir[File.expand_path("../services/*.rb", __dir__)].sort.each { |f| require f }
