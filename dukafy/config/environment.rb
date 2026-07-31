require_relative "database"
require "roda"

class Dukafy < Roda
end

Dir[File.expand_path("../models/*.rb", __dir__)].sort.each { |f| require f }
Dir[File.expand_path("../publisher/**/*.rb", __dir__)].sort.each { |f| require f }
Dir[File.expand_path("../services/*.rb", __dir__)].sort.each { |f| require f }
