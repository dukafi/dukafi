require "json"
require "securerandom"

# A client that registered itself (RFC 7591).
#
# Public clients only: Claude Desktop, Cursor and friends are installed
# applications that cannot keep a secret, so there is no client_secret here and
# PKCE carries the security instead. Registration is unauthenticated because
# that is what the spec requires — a client ID alone grants nothing, since
# every authorization still needs the merchant to approve it in a browser.
class OauthClient < Sequel::Model
  MAX_REDIRECT_URIS = 10

  def self.register!(name:, redirect_uris:, software_id: nil)
    uris = Array(redirect_uris).map(&:to_s).reject(&:empty?).first(MAX_REDIRECT_URIS)
    raise ArgumentError, "at least one redirect_uri is required" if uris.empty?
    raise ArgumentError, "redirect_uri is not usable" unless uris.all? { |uri| valid_redirect_uri?(uri) }

    create(
      client_id: "dkfc_#{SecureRandom.urlsafe_base64(24)}",
      client_name: name.to_s.strip.empty? ? "Unnamed client" : name.to_s.strip[0, 120],
      redirect_uris_json: JSON.generate(uris),
      software_id: software_id&.to_s&.slice(0, 120),
    )
  end

  # https for real clients; http only on loopback, which is how a desktop app
  # receives the callback. Anything else — including a bare custom scheme with
  # no host — is refused rather than trusted.
  def self.valid_redirect_uri?(value)
    uri = URI.parse(value)
    return false if uri.fragment
    return true if uri.is_a?(URI::HTTPS)
    return true if uri.is_a?(URI::HTTP) && %w[localhost 127.0.0.1 ::1].include?(uri.host)

    # Native apps commonly use a private-use scheme (`com.example.app:/cb`).
    # Require a scheme containing a dot, per RFC 8252, so `javascript:` and
    # friends cannot be registered.
    !uri.scheme.nil? && uri.scheme.include?(".") && !uri.opaque.to_s.empty?
  rescue URI::InvalidURIError
    false
  end

  def redirect_uris
    JSON.parse(redirect_uris_json.to_s)
  rescue JSON::ParserError
    []
  end

  # Exact string match, never a prefix. A prefix match lets an attacker append
  # a path they control and receive the authorization code.
  def allows?(redirect_uri) = redirect_uris.include?(redirect_uri.to_s)

  def to_registration_payload
    {
      client_id: client_id,
      client_name: client_name,
      redirect_uris: redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: %w[authorization_code refresh_token],
      response_types: ["code"],
      # 0 means "does not expire" per RFC 7591.
      client_id_issued_at: created_at.to_i,
      client_secret_expires_at: 0,
    }
  end
end
