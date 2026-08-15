require "digest"
require "securerandom"

# A bearer token for machine clients — Cursor, Lovable, Claude Code.
#
# Not OAuth. Instatic needed hosted OAuth with PKCE because it was
# multi-tenant; one Dukafi deploy is one store with one owner, so a bearer
# token is the right primitive and a fraction of the code.
#
# The plaintext token exists exactly once, in the response that created it.
# Only its SHA-256 is stored, so a database dump does not hand over API access.
class PersonalAccessToken < Sequel::Model
  PREFIX = "dkf_".freeze
  # 32 random bytes. Far beyond guessing, which is what lets the digest be a
  # plain hash rather than a deliberately slow one.
  ENTROPY_BYTES = 32
  # Enough to tell two tokens apart in a list without narrowing the search
  # space for the rest in any meaningful way.
  PREFIX_LENGTH = 12

  # Returns [record, plaintext]. The plaintext is the caller's only chance to
  # see it.
  def self.issue!(name:)
    plaintext = "#{PREFIX}#{SecureRandom.urlsafe_base64(ENTROPY_BYTES)}"
    record = create(
      name: name.to_s.strip.empty? ? "Untitled token" : name.to_s.strip,
      token_hash: digest(plaintext),
      token_prefix: plaintext[0, PREFIX_LENGTH],
    )
    [record, plaintext]
  end

  def self.digest(plaintext)
    Digest::SHA256.hexdigest(plaintext.to_s)
  end

  # The presented token -> the record, or nil.
  #
  # A hash lookup rather than a comparison loop, so this is an indexed read
  # and leaks no timing information about which tokens exist.
  def self.authenticate(plaintext)
    return nil if plaintext.to_s.empty?

    token = first(token_hash: digest(plaintext))
    return nil if token.nil? || token.revoked?

    token.touch_used!
    token
  end

  # `Authorization: Bearer <token>`, tolerantly parsed. Returns nil rather
  # than raising: a malformed header is an auth failure, not a crash.
  def self.from_header(value)
    match = /\ABearer\s+(.+)\z/i.match(value.to_s.strip)
    match && authenticate(match[1].strip)
  end

  def revoked? = !revoked_at.nil?

  def revoke!
    update(revoked_at: Time.now)
  end

  # Written on every authenticated request, so a merchant can see which
  # tokens are actually in use before revoking one.
  #
  # Deliberately NOT wrapped in the model's validation/hook machinery — this
  # is a hot path and the value is advisory.
  def touch_used!
    self.class.where(id: id).update(last_used_at: Time.now)
  end

  # Never includes the token itself; there is nothing to include.
  def to_payload
    {
      id: id.to_s, name: name, tokenPrefix: token_prefix,
      lastUsedAt: last_used_at&.utc&.iso8601,
      revokedAt: revoked_at&.utc&.iso8601,
      createdAt: created_at.utc.iso8601,
    }
  end
end
