require "bcrypt"
require_relative "../config/environment"

email = ENV.fetch("ADMIN_EMAIL", ARGV[0] || "admin@example.com").strip.downcase
password = ENV.fetch("ADMIN_PASSWORD", ARGV[1] || "change-me-now")
abort "Password must be at least 12 characters" if password.length < 12

admin = Admin.first(email: email) || Admin.new(email: email)
admin.password_digest = BCrypt::Password.create(password)
admin.save
StarterSite.create!(name: ENV.fetch("SITE_NAME", "Dukafy Store")) unless SiteState.first
puts "Admin ready: #{email}"
