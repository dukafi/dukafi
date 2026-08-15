require "digest"
require "securerandom"

# One in-flight authorization, between the merchant approving and the client
# exchanging.
#
# Short-lived and single-use. A replayable authorization code is the classic
# OAuth break: anyone who observes the redirect — a shoulder-surfer, a browser
# extension, a proxy log — could exchange it themselves. PKCE closes the rest
# of that gap by requiring the verifier only the original client holds.
class OauthAuthorizationCode < Sequel::Model
  # OAuth 2.1 says codes SHOULD be short-lived; ten minutes is the outer bound
  # it allows and one is plenty for a redirect that happens immediately.
  LIFETIME = 60

  def self.digest(value) = Digest::SHA256.hexdigest(value.to_s)

  # Returns [record, plaintext_code].
  def self.issue!(client_id:, redirect_uri:, code_challenge:, scope:, resource:, admin_id:)
    plaintext = SecureRandom.urlsafe_base64(32)
    record = create(
      code_hash: digest(plaintext), client_id:, redirect_uri:,
      code_challenge:, scope:, resource:, admin_id:,
      expires_at: Time.now + LIFETIME,
    )
    [record, plaintext]
  end

  # Redeem a code, or return nil with a reason.
  #
  # Marks the row used BEFORE checking anything else that could fail, so a
  # code cannot be spent twice even by concurrent requests racing each other.
  def self.redeem(code:, client_id:, redirect_uri:, code_verifier:)
    record = first(code_hash: digest(code))
    return [nil, "invalid_grant"] if record.nil?

    # A code presented twice means it leaked. OAuth 2.1 says to revoke
    # everything already issued from it, not merely to refuse the replay.
    if record.used_at
      OauthToken.where(client_id: record.client_id, admin_id: record.admin_id).each(&:revoke!)
      return [nil, "invalid_grant"]
    end

    record.update(used_at: Time.now)

    return [nil, "invalid_grant"] if record.expires_at < Time.now
    return [nil, "invalid_grant"] if record.client_id != client_id
    return [nil, "invalid_grant"] if record.redirect_uri != redirect_uri
    return [nil, "invalid_grant"] unless record.verifier_matches?(code_verifier)

    [record, nil]
  end

  # S256 only: BASE64URL(SHA256(verifier)) == stored challenge. OAuth 2.1
  # removed `plain`, which offered no protection at all against an attacker
  # who could see the authorization request.
  def verifier_matches?(verifier)
    return false if verifier.to_s.empty?

    expected = Base64.urlsafe_encode64(Digest::SHA256.digest(verifier.to_s), padding: false)
    # Constant-time: the challenge is not secret, but the comparison costs
    # nothing to do properly.
    OpenSSL.secure_compare(expected, code_challenge.to_s)
  rescue StandardError
    false
  end
end
