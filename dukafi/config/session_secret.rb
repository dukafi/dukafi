# The one signing key behind every session cookie — admin login, cart
# ownership, and the just-placed-order token all ride on it.
#
# There is a development fallback so `bin/dev` works out of the box, but in
# production that fallback is a full admin takeover: the value is public in
# this repo, so anyone could forge `session["admin_id"]`. Fail loudly instead.
module SessionSecret
  DEVELOPMENT_FALLBACK = "dev-secret-change-me-" + ("x" * 64)

  def self.fetch
    secret = ENV["SESSION_SECRET"].to_s
    return secret unless secret.empty?

    if production?
      raise "SESSION_SECRET must be set in production — without it session cookies " \
            "are signed with a key that is public in the source tree."
    end

    DEVELOPMENT_FALLBACK
  end

  def self.production?
    %w[production staging].include?(ENV["RACK_ENV"].to_s.downcase) ||
      %w[production staging].include?(ENV["APP_ENV"].to_s.downcase)
  end
end
