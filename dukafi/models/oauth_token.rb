require "digest"
require "securerandom"

# An issued access token, and the refresh token that renews it.
#
# Hashed at rest exactly like a personal access token: a database dump must not
# hand over API access. `resource` is the audience — the MCP endpoint these
# tokens were minted for — and it is checked on every request, because a token
# obtained for one Dukafi must not work against another.
class OauthToken < Sequel::Model
  ACCESS_LIFETIME = 3600
  # Long enough that a merchant is not re-approving every week, short enough
  # that an abandoned connection stops working. Rotation on every refresh
  # means a stolen refresh token is detectable and quickly useless.
  REFRESH_LIFETIME = 90 * 24 * 3600

  def self.digest(value) = Digest::SHA256.hexdigest(value.to_s)

  # Returns [record, access_token, refresh_token].
  def self.issue!(client_id:, admin_id:, scope:, resource:)
    access = "dkfa_#{SecureRandom.urlsafe_base64(32)}"
    refresh = "dkfr_#{SecureRandom.urlsafe_base64(32)}"
    record = create(
      access_token_hash: digest(access), refresh_token_hash: digest(refresh),
      client_id:, admin_id:, scope:, resource:,
      expires_at: Time.now + ACCESS_LIFETIME,
    )
    [record, access, refresh]
  end

  # The presented access token -> the record, or nil. Expiry and revocation are
  # both checked here so no caller can forget one.
  def self.authenticate(access_token)
    return nil if access_token.to_s.empty?

    token = first(access_token_hash: digest(access_token))
    return nil if token.nil? || token.revoked? || token.expired?

    token.touch_used!
    token
  end

  # Rotation: the old refresh token is spent and a new pair issued. If a
  # refresh token is presented twice, both the replay and the legitimate
  # holder are revoked — the pair has leaked and neither should keep working.
  def self.refresh(refresh_token:, client_id:)
    token = first(refresh_token_hash: digest(refresh_token))
    return [nil, "invalid_grant"] if token.nil?
    return [nil, "invalid_grant"] if token.client_id != client_id

    if token.revoked?
      where(client_id: token.client_id, admin_id: token.admin_id).each(&:revoke!)
      return [nil, "invalid_grant"]
    end
    return [nil, "invalid_grant"] if token.created_at + REFRESH_LIFETIME < Time.now

    token.revoke!
    issued = issue!(client_id: token.client_id, admin_id: token.admin_id,
                    scope: token.scope, resource: token.resource)
    [issued, nil]
  end

  def revoked? = !revoked_at.nil?
  def expired? = expires_at < Time.now
  def revoke! = update(revoked_at: Time.now)

  def scopes = scope.to_s.split(/\s+/).reject(&:empty?)
  def allows?(required) = scopes.include?(required.to_s)

  def touch_used!
    self.class.where(id: id).update(last_used_at: Time.now)
  end
end
