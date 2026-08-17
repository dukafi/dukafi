require_relative "../spec_helper"

class ChargeSpec < Minitest::Test
  def setup
    OrderItem.dataset.delete
    PaymentAttempt.dataset.delete
    Order.dataset.delete
    PluginLog.dataset.delete
  end

  def test_order_subject_uses_the_cart_total
    order = Order.create(
      email: "buyer@example.test", status: "pending", currency: "KES",
      subtotal_cents: 10_000, discount_cents: 0, shipping_cents: 0, total_cents: 10_000,
      public_token: SecureRandom.hex(8), created_at: Time.now, updated_at: Time.now
    )

    priced = Charge.resolve(subject: "order", order: order)

    assert_equal 10_000, priced.amount_cents
    assert_equal "KES", priced.currency
    assert_equal "order", priced.subject
  end

  def test_form_subject_reads_amount_cents_from_the_fields
    priced = Charge.resolve(subject: "form", fields: { "amount_cents" => "2500", "label" => "Tip" })

    assert_equal 2_500, priced.amount_cents
    assert_equal "Tip", priced.label
  end

  def test_preset_subject_uses_the_stored_cents
    priced = Charge.resolve(subject: "preset", preset_cents: 2_000, currency: "KES")

    assert_equal 2_000, priced.amount_cents
    assert_equal "KES", priced.currency
  end

  def test_quote_subject_re_runs_the_plugin_and_charges_the_deposit
    priced = Charge.resolve(
      subject: "quote",
      quote_plugin: "probe",
      quote_name: "car_finance",
      inputs: { "price_cents" => 2_500_000, "deposit_cents" => 500_000, "term_months" => 36, "currency" => "KES" },
    )

    assert_equal 500_000, priced.amount_cents
    assert_equal "KES", priced.currency
    assert_equal "Car deposit", priced.label
  end

  def test_a_claimed_amount_that_does_not_match_the_quote_is_refused
    error = assert_raises(Charge::Error) do
      Charge.resolve(
        subject: "quote",
        quote_plugin: "probe",
        quote_name: "car_finance",
        inputs: { "price_cents" => 2_500_000, "deposit_cents" => 500_000, "term_months" => 36, "currency" => "KES" },
        claimed_cents: 1,
      )
    end

    assert_equal "quote_mismatch", error.code
  end

  def test_zero_is_a_valid_amount
    priced = Charge.resolve(subject: "preset", preset_cents: 0, currency: "USD")

    assert_equal 0, priced.amount_cents
  end

  def test_open_order_creates_a_one_line_order_and_emits_order_created
    seen = []
    plugin = Dukafi::Plugins.find("probe")
    handler = ->(order) { seen << order.id }
    plugin.event_handlers[:"order.created"] << handler

    priced = Charge.resolve(subject: "preset", preset_cents: 2_000, currency: "KES")
    order = Charge.open_order(priced, email: "buyer@example.test", title: "Deposit")

    assert_equal "pending", order.status
    assert_equal 2_000, order.total_cents
    assert_equal 1, order.order_items.length
    assert_equal [order.id], seen
  ensure
    plugin.event_handlers[:"order.created"].delete(handler)
  end
end
