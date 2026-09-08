require_relative "../spec_helper"

# PayHero poll + reconcile without opening sockets.
class PayHeroReconcileSpec < Minitest::Test
  Provider = PayHero::Provider

  def setup
    PaymentAttempt.dataset.delete
    OrderItem.dataset.delete
    Order.dataset.delete
  end

  def order(total: 1_000)
    Order.create(
      email: "buyer@example.com", status: "pending", currency: "KES",
      subtotal_cents: total, discount_cents: 0, shipping_cents: 0, total_cents: total,
      public_token: SecureRandom.hex(8), created_at: Time.now, updated_at: Time.now
    )
  end

  def attempt(status: "pending", created_at: Time.now - 600, amount_cents: 1_000, reference: "INV-poll")
    PaymentAttempt.create(
      order_id: order(total: amount_cents).id, provider: "payhero", status: status,
      amount_cents: amount_cents, currency: "KES", reference: reference,
      provider_reference: "ws_ref", created_at: created_at, updated_at: created_at
    )
  end

  def test_poll_maps_success_failed_queued_and_network_nil
    row = attempt
    Provider.stub :get_json, ->(*) { { "status" => "SUCCESS" } } do
      assert_equal :succeeded, Provider.poll(attempt: row, config: {})
    end
    Provider.stub :get_json, ->(*) { { "status" => "FAILED" } } do
      assert_equal :failed, Provider.poll(attempt: row, config: {})
    end
    Provider.stub :get_json, ->(*) { { "status" => "QUEUED" } } do
      assert_equal :pending, Provider.poll(attempt: row, config: {})
    end
    Provider.stub :get_json, ->(*) { nil } do
      assert_equal :pending, Provider.poll(attempt: row, config: {})
    end
  end

  def test_reconcile_only_refreshes_stale_attempts
    attempt(reference: "stale-one", created_at: Time.now - 600)
    attempt(reference: "fresh-one", created_at: Time.now - 60)
    seen = []
    Payments.stub :refresh, ->(row) { seen << row.reference; row } do
      Provider.reconcile(now: Time.now)
    end
    assert_equal ["stale-one"], seen
  end

  def test_amount_mismatch_via_settle_still_fails
    row = attempt(amount_cents: 1_000, reference: "INV-009")
    result = Provider.parse_callback(body: {
      "response" => {
        "Amount" => 5, "CheckoutRequestID" => "ws", "ExternalReference" => "INV-009",
        "MpesaReceiptNumber" => "RCPT", "ResultCode" => 0, "Status" => "Success",
      },
    }, config: {})
    settled = Payments.settle(row, result)
    assert_equal "failed", settled.status
    assert_match(/amount mismatch/, settled.error.to_s)
    assert_equal "pending", Order[settled.order_id].status
  end
end
