require_relative "../spec_helper"

# PayHero's contract, without touching the network. What matters here is the
# translation between Dukafy's money/phone model and theirs.
class PayHeroSpec < Minitest::Test
  Provider = PayHero::Provider

  def test_amounts_round_up_to_whole_shillings
    # M-Pesa moves whole shillings. Rounding UP by decision: the customer is
    # never charged less than they owe.
    assert_equal 28_000, Provider.normalize_amount(amount_cents: 27_950, currency: "KES", config: {})
    assert_equal 28_000, Provider.normalize_amount(amount_cents: 27_901, currency: "KES", config: {})
    # An exact shilling amount is left alone — never bumped to the next one.
    assert_equal 27_900, Provider.normalize_amount(amount_cents: 27_900, currency: "KES", config: {})
    assert_equal 0, Provider.normalize_amount(amount_cents: 0, currency: "KES", config: {})
  end

  def test_phone_numbers_are_normalised_to_the_local_form_payhero_expects
    ["+254712345678", "254712345678", "+254 712 345 678", "+254-712-345-678"].each do |input|
      assert_equal "0712345678", Provider.local_phone(input), "failed for #{input}"
    end
    assert_equal "0712345678", Provider.local_phone("0712345678")
  end

  def test_unusable_phone_numbers_are_rejected_rather_than_guessed
    # Guessing a country code would push a payment prompt at the wrong person.
    ["", "12345", "712345678", "+1 415 555 0100", "not a phone"].each do |input|
      assert_equal "", Provider.local_phone(input), "should not have accepted #{input.inspect}"
    end
  end

  def test_a_successful_callback_is_recognised
    result = Provider.parse_callback(body: callback_body, config: {})

    assert_equal :succeeded, result.status
    assert_equal "INV-009", result.reference
    assert_equal "SAE3YULR0Y", result.receipt
    assert_equal "ws_CO_14012024103543427709099876", result.provider_reference
    # Their Amount is shillings; ours is cents.
    assert_equal 1_000, result.amount_cents
  end

  def test_both_verdict_fields_must_agree_before_a_payment_counts
    mixed = callback_body("ResultCode" => 1032, "Status" => "Success")
    assert_equal :failed, Provider.parse_callback(body: mixed, config: {}).status

    other = callback_body("ResultCode" => 0, "Status" => "Failed")
    assert_equal :failed, Provider.parse_callback(body: other, config: {}).status
  end

  def test_a_cancelled_push_is_a_failure_not_a_crash
    body = callback_body("ResultCode" => 1032, "Status" => "Failed",
                         "ResultDesc" => "Request cancelled by user",
                         "MpesaReceiptNumber" => nil)
    result = Provider.parse_callback(body: body, config: {})

    assert_equal :failed, result.status
    assert_equal "INV-009", result.reference
  end

  def test_a_callback_without_a_usable_body_is_ignored
    assert_nil Provider.parse_callback(body: {}, config: {})
    assert_nil Provider.parse_callback(body: { "response" => "nonsense" }, config: {})
    # No ExternalReference means nothing to attribute it to.
    assert_nil Provider.parse_callback(body: { "response" => { "ResultCode" => 0 } }, config: {})
  end

  def test_the_callback_url_carries_the_attempts_own_reference_as_its_secret
    attempt = Struct.new(:reference).new("abc123")
    url = Provider.callback_url(attempt, { callback_base_url: "https://shop.example/" })

    assert_equal "https://shop.example/payments/payhero/callback/abc123", url
  end

  private

  def callback_body(overrides = {})
    {
      "forward_url" => "", "status" => true,
      "response" => {
        "Amount" => 10, "CheckoutRequestID" => "ws_CO_14012024103543427709099876",
        "ExternalReference" => "INV-009", "MerchantRequestID" => "3202-70921557-1",
        "MpesaReceiptNumber" => "SAE3YULR0Y", "Phone" => "+254709099876",
        "ResultCode" => 0, "ResultDesc" => "The service request is processed successfully.",
        "Status" => "Success",
      }.merge(overrides),
    }
  end
end
