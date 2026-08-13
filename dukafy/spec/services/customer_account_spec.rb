require_relative "../spec_helper"

# Customer accounts are a PASSWORD ON THE EXISTING CUSTOMER ROW, not a new
# table — so a shopper who checked out as a guest and later registers keeps one
# record and their order history, which is the whole reason
# `Customer.upsert_by_identity` normalises identity so carefully.
class CustomerAccountSpec < Minitest::Test
  def setup
    OrderItem.dataset.delete
    Order.dataset.delete
    Customer.dataset.delete
  end

  def order_for(customer)
    now = Time.now
    Order.create(customer_id: customer.id, email: customer.email, status: "pending",
                 subtotal_cents: 100, total_cents: 100, discount_cents: 0, shipping_cents: 0,
                 currency: "USD", public_token: SecureRandom.urlsafe_base64(24),
                 created_at: now, updated_at: now)
  end

  def test_registering_creates_an_account_on_a_new_customer
    result = CustomerAccount.register(email: "Ada@Example.com ", password: "correct-horse", name: "Ada")

    assert_predicate result, :ok?
    # Email normalisation is the customer model's job and must still apply.
    assert_equal "ada@example.com", result.customer.email
    assert_equal "Ada", result.customer.name
    refute_nil result.customer.password_digest
  end

  def test_rejects_a_bad_email_or_a_short_password
    assert_equal "invalid_email", CustomerAccount.register(email: "nope", password: "correct-horse").reason
    assert_equal "weak_password", CustomerAccount.register(email: "a@b.co", password: "short").reason
    assert_equal 0, Customer.count
  end

  def test_registering_twice_never_overwrites_the_password
    first = CustomerAccount.register(email: "ada@example.com", password: "correct-horse")
    digest = first.customer.password_digest

    result = CustomerAccount.register(email: "ada@example.com", password: "attacker-chosen")

    assert_equal "already_registered", result.reason
    assert_equal digest, Customer.first(email: "ada@example.com").password_digest
  end

  # The privacy boundary. An account attaches to the existing customer row, so
  # registering with someone else's email would otherwise hand over their order
  # history. Until email verification exists, a token from that customer's own
  # confirmation is the only proof available.
  def test_a_guest_with_orders_cannot_be_claimed_without_proof
    guest = Customer.upsert_by_identity(email: "guest@example.com")
    order_for(guest)

    assert_equal "already_registered",
                 CustomerAccount.register(email: "guest@example.com", password: "correct-horse").reason
    assert_equal "already_registered",
                 CustomerAccount.register(email: "guest@example.com", password: "correct-horse",
                                          order_token: "not-a-real-token").reason
    assert_nil Customer.first(email: "guest@example.com").password_digest
  end

  def test_the_real_buyer_claims_their_history_with_their_order_token
    guest = Customer.upsert_by_identity(email: "guest@example.com")
    order = order_for(guest)

    result = CustomerAccount.register(email: "guest@example.com", password: "correct-horse",
                                      order_token: order.public_token)

    assert_predicate result, :ok?
    # ONE record — the history follows the account rather than being orphaned.
    assert_equal guest.id, result.customer.id
    assert_equal 1, Order.where(customer_id: guest.id).count
    assert_equal 1, Customer.count
  end

  def test_a_guest_with_no_orders_can_simply_register
    Customer.upsert_by_identity(email: "new@example.com")

    result = CustomerAccount.register(email: "new@example.com", password: "correct-horse")

    assert_predicate result, :ok?
    assert_equal 1, Customer.count
  end

  def test_authenticate_accepts_the_right_password_only
    CustomerAccount.register(email: "ada@example.com", password: "correct-horse")

    assert_predicate CustomerAccount.authenticate(email: "ADA@example.com", password: "correct-horse"), :ok?
    assert_equal "invalid_credentials",
                 CustomerAccount.authenticate(email: "ada@example.com", password: "wrong").reason
  end

  # Same reason for both, so the endpoint cannot be used to discover which
  # addresses have shopped here.
  def test_unknown_email_and_wrong_password_are_indistinguishable
    CustomerAccount.register(email: "ada@example.com", password: "correct-horse")

    unknown = CustomerAccount.authenticate(email: "ghost@example.com", password: "correct-horse")
    wrong = CustomerAccount.authenticate(email: "ada@example.com", password: "nope")

    assert_equal wrong.reason, unknown.reason
  end

  def test_a_guest_without_a_password_cannot_be_signed_in_as
    Customer.upsert_by_identity(email: "guest@example.com")

    assert_equal "invalid_credentials",
                 CustomerAccount.authenticate(email: "guest@example.com", password: "").reason
  end
end
