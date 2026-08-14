require "bcrypt"

# Turning a customer into an account holder.
#
# Deliberately NOT a new table: an account is a password on the `customers`
# row that already exists (or gets created) for that email. A shopper who
# checked out as a guest last month and registers today ends up as ONE record
# with their order history intact — which is the entire reason the identity
# matching in `Customer.upsert_by_identity` exists.
#
# Email + password only. Magic links were the original intent (see the note on
# `Customer`), but they need mail delivery that does not exist yet, and
# password RECOVERY is deliberately deferred — so today a forgotten password
# means the merchant resets it by hand.
#
# ── Known gap, accepted for now ──────────────────────────────────────────────
# Registration does not prove the person controls the email address. Because an
# account attaches to the existing customer row, someone who registers with a
# stranger's email would see that stranger's past orders. Mitigated here by
# refusing to attach to a row that already has orders unless no password is set
# AND the caller supplies a matching order token — but the real fix is email
# verification, and this must not ship to real customers without it.
class CustomerAccount
  Result = Data.define(:customer, :reason) do
    def ok? = reason.nil?
  end

  MIN_PASSWORD_LENGTH = 8

  # Reasons are machine-readable; wording lives at the HTTP edge so a merchant
  # can present it in their own voice.
  REASONS = %w[invalid_email weak_password already_registered invalid_credentials].freeze

  EMAIL = /\A[^@\s]+@[^@\s]+\.[^@\s]+\z/

  def self.register(email:, password:, name: nil, order_token: nil)
    clean = email.to_s.strip.downcase
    return failure("invalid_email") unless clean.match?(EMAIL)
    return failure("weak_password") if password.to_s.length < MIN_PASSWORD_LENGTH

    existing = Customer.first(email: clean)
    # Already an account — registering again must not silently overwrite the
    # password, which would be a takeover.
    return failure("already_registered") if existing&.password_digest

    # An existing guest record carries order history. Claiming it without
    # proving email ownership is the gap described above; a token from that
    # customer's own confirmation is the one proof available offline.
    if existing && existing.orders_dataset.count.positive?
      return failure("already_registered") unless owns_order?(existing, order_token)
    end

    digest = BCrypt::Password.create(password)
    customer = existing || Customer.new(email: clean)
    customer.name = name.to_s.strip if customer.name.to_s.empty? && !name.to_s.strip.empty?
    customer.password_digest = digest
    customer.save
    Result.new(customer: customer, reason: nil)
  rescue Sequel::ValidationFailed
    failure("invalid_email")
  end

  def self.authenticate(email:, password:)
    customer = Customer.first(email: email.to_s.strip.downcase)
    # Same reason for "no such account" and "wrong password", so the endpoint
    # cannot be used to discover which addresses have shopped here.
    return failure("invalid_credentials") unless customer&.password_digest
    return failure("invalid_credentials") unless BCrypt::Password.new(customer.password_digest) == password.to_s

    Result.new(customer: customer, reason: nil)
  rescue BCrypt::Errors::InvalidHash
    failure("invalid_credentials")
  end

  def self.owns_order?(customer, order_token)
    token = order_token.to_s
    return false if token.empty?

    customer.orders_dataset.first(public_token: token) ? true : false
  end

  def self.failure(reason)
    Result.new(customer: nil, reason: reason)
  end
  private_class_method :failure
end
