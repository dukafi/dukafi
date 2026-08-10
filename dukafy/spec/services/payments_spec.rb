require_relative "../spec_helper"

# The payment core, exercised through the fake provider. Everything here is
# provider-agnostic: what must hold whether the money moves through M-Pesa,
# Stripe or a bank transfer.
class PaymentsSpec < Minitest::Test
  def setup
    PaymentAttempt.dataset.delete
    OrderItem.dataset.delete
    Order.dataset.delete
    PluginSetting.dataset.delete
    Dukafy::Plugins.find("fake_payments").settings[:endpoint] = "https://example.test"
  end

  def order(status: "pending", total: 27_900)
    Order.create(
      email: "buyer@example.com", status: status, currency: "USD",
      subtotal_cents: total, discount_cents: 0, shipping_cents: 0, total_cents: total,
      public_token: SecureRandom.hex(8), created_at: Time.now, updated_at: Time.now
    )
  end

  def start(target = nil, params = {})
    Payments.start(order: target || order, provider_slug: "fake", params: params)
  end

  def callback(attempt, status: "ok", amount: nil, receipt: "RCPT1")
    body = { "reference" => attempt.reference, "status" => status,
             "provider_reference" => "fake-ref", "receipt" => receipt }
    body["amount_cents"] = amount if amount
    _plugin, provider = Dukafy::Plugins.payment_provider("fake")
    Payments.settle(attempt, provider.parse_callback(body: body, config: {}))
  end

  def test_starting_a_payment_records_an_attempt_against_the_order
    target = order
    outcome = start(target)

    assert outcome.ok?, outcome.reason
    attempt = outcome.attempt
    assert_equal target.id, attempt.order_id
    assert_equal "processing", attempt.status
    assert_equal 27_900, attempt.amount_cents
    assert_equal :poll, outcome.result.mode
    # The order is NOT paid just because a payment started.
    assert_equal "pending", Order[target.id].status
  end

  def test_an_order_can_hold_several_attempts
    target = order
    start(target)
    start(target)

    # A customer who ignores the first STK push and retries is two attempts
    # and one order — collapsing them would lose the trail in a dispute.
    assert_equal 2, PaymentAttempt.where(order_id: target.id).count
  end

  def test_a_successful_callback_marks_the_order_paid
    attempt = start.attempt

    settled = callback(attempt)

    assert_equal "succeeded", settled.status
    assert_equal "RCPT1", settled.receipt
    assert_equal "paid", Order[settled.order_id].status
  end

  def test_a_repeated_callback_cannot_double_apply
    attempt = start.attempt
    callback(attempt)

    # Providers retry callbacks as a matter of course.
    again = callback(attempt, status: "fail")

    assert_equal "succeeded", again.status, "a settled attempt must not be re-settled"
    assert_equal "paid", Order[again.order_id].status
  end

  def test_an_amount_mismatch_fails_the_attempt_instead_of_accepting_it
    attempt = start.attempt

    settled = callback(attempt, amount: 100)

    assert_equal "failed", settled.status
    assert_includes settled.error, "amount mismatch"
    # Crucially: the order is NOT paid for a hundred cents.
    assert_equal "pending", Order[settled.order_id].status
  end

  def test_a_failed_callback_leaves_the_order_unpaid
    attempt = start.attempt
    settled = callback(attempt, status: "fail")

    assert_equal "failed", settled.status
    assert_equal "pending", Order[settled.order_id].status
  end

  def test_polling_resolves_an_attempt_when_a_callback_never_arrives
    attempt = start(nil, { "outcome" => "poll_succeeds" }).attempt
    assert_equal "processing", attempt.status

    refreshed = Payments.refresh(attempt)

    assert_equal "succeeded", refreshed.status
    assert_equal "paid", Order[refreshed.order_id].status
  end

  def test_polling_leaves_an_undecided_attempt_in_flight
    attempt = start(nil, { "outcome" => "still_thinking" }).attempt

    assert_equal "processing", Payments.refresh(attempt).status
    assert_equal "pending", Order[attempt.order_id].status
  end

  def test_a_provider_rejection_is_a_failed_attempt_not_a_crash
    outcome = start(nil, { "outcome" => "reject" })

    refute outcome.ok?
    assert_equal "provider_error", outcome.reason
    assert_equal "failed", outcome.attempt.status
  end

  def test_a_provider_raising_is_contained
    outcome = start(nil, { "outcome" => "boom" })

    refute outcome.ok?
    assert_equal "failed", outcome.attempt.status
    assert_includes outcome.attempt.error, "provider exploded"
  end

  def test_an_unknown_provider_is_refused_without_creating_an_attempt
    outcome = Payments.start(order: order, provider_slug: "nope")

    refute outcome.ok?
    assert_equal "unknown_provider", outcome.reason
    assert_equal 0, PaymentAttempt.count
  end

  def test_an_unconfigured_provider_refuses_to_start
    PluginSetting.dataset.delete

    outcome = start

    refute outcome.ok?
    assert_equal "provider_not_configured", outcome.reason
    assert_equal 0, PaymentAttempt.count
  end

  def test_an_already_paid_order_cannot_be_charged_again
    outcome = start(order(status: "paid"))

    refute outcome.ok?
    assert_equal "order_not_payable", outcome.reason
    assert_equal 0, PaymentAttempt.count
  end

  def test_sensitive_fields_are_never_persisted
    attempt = start(nil, { "phone" => "0712345678", "pin" => "1234", "card_cvv" => "999" }).attempt

    stored = JSON.parse(attempt.request_payload)
    assert_equal "0712345678", stored["phone"]
    refute stored.key?("pin")
    refute stored.key?("card_cvv")
  end

  def test_plugin_events_fire_without_letting_a_broken_handler_break_checkout
    plugin = Dukafy::Plugins.find("fake_payments")
    seen = []
    plugin.event_handlers[:payment_succeeded] << ->(_a) { raise "handler is broken" }
    plugin.event_handlers[:payment_succeeded] << ->(a) { seen << a.reference }

    attempt = start.attempt
    settled = callback(attempt)

    # A broken analytics plugin must not fail a customer's payment.
    assert_equal "succeeded", settled.status
    assert_equal [attempt.reference], seen
  ensure
    plugin.event_handlers[:payment_succeeded].clear
  end
end
