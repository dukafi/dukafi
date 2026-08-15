require "net/http"
require "json"
require "uri"

# PayHero (Kenya) — M-Pesa STK push.
#
# Contract per https://docs.payhero.co.ke:
#   POST {base}/api/v2/payments   Authorization: Basic <token>
#     amount (Integer, WHOLE SHILLINGS), phone_number, channel_id (Integer),
#     provider: "m-pesa", external_reference, customer_name, callback_url
#   -> 201 { success, status: "QUEUED", reference, CheckoutRequestID }
#
#   Callback POSTs { status, response: { Amount, CheckoutRequestID,
#     ExternalReference, MpesaReceiptNumber, Phone, ResultCode, ResultDesc,
#     Status } }
#
# Two things their docs do NOT provide, and both shape this file:
#   1. No callback signature/token. The unguessable callback URL is therefore
#      the shared secret, and `Payments.settle` re-checks the amount before
#      any order is marked paid.
#   2. No documented transaction-status endpoint, so `poll` is not
#      implemented. The flow depends on the callback arriving; if PayHero
#      publishes a status endpoint, adding `poll` here makes a lost callback
#      self-healing with no other change.
module PayHero
  module Provider
    DEFAULT_BASE = "https://backend.payhero.co.ke".freeze

    module_function

    # M-Pesa moves whole shillings, so a KES 279.50 cart cannot be pushed
    # exactly. Rounded UP by explicit decision: the customer is never charged
    # less than they owe, and the difference (at most 99 cents) is recorded on
    # the attempt, so order.total_cents and the amount paid can legitimately
    # differ.
    def normalize_amount(amount_cents:, currency:, config:)
      ((amount_cents + 99) / 100) * 100
    end

    def initiate(attempt:, params:, config:)
      phone = local_phone(params["phone"] || params["phone_number"])
      if phone.empty?
        return Payments::InitiateResult.new(
          mode: :poll, redirect_url: nil, provider_reference: nil,
          client_payload: {}, error: "A valid M-Pesa phone number is required"
        )
      end

      body = {
        amount: attempt.amount_cents / 100, # whole shillings, already rounded
        phone_number: phone,
        channel_id: config[:channel_id],
        provider: "m-pesa",
        external_reference: attempt.reference,
        callback_url: callback_url(attempt, config),
      }
      body[:customer_name] = params["name"].to_s if params["name"].to_s != ""

      response = post_json("#{base_url(config)}/api/v2/payments", body, config)
      unless response.is_a?(Hash) && response["success"]
        return Payments::InitiateResult.new(
          mode: :poll, redirect_url: nil, provider_reference: nil, client_payload: {},
          error: response.is_a?(Hash) ? response.fetch("error_message", "PayHero rejected the request") : "PayHero unreachable"
        )
      end

      Payments::InitiateResult.new(
        mode: :poll, redirect_url: nil,
        provider_reference: response["CheckoutRequestID"] || response["reference"],
        client_payload: {}, error: nil
      )
    end

    def parse_callback(body:, config:)
      payload = body["response"]
      return nil unless payload.is_a?(Hash)

      reference = payload["ExternalReference"].to_s
      return nil if reference.empty?

      # Both fields carry the verdict; require agreement rather than trusting
      # whichever is friendlier.
      succeeded = payload["ResultCode"].to_i.zero? && payload["Status"].to_s.casecmp("success").zero?
      amount = payload["Amount"]

      Payments::CallbackResult.new(
        reference: reference,
        status: succeeded ? :succeeded : :failed,
        provider_reference: payload["CheckoutRequestID"].to_s,
        receipt: payload["MpesaReceiptNumber"].to_s,
        # Their Amount is in shillings; compare in cents like everything else.
        amount_cents: amount.nil? ? nil : (Float(amount) * 100).round
      )
    end

    # "+254 712 345 678" / "254712345678" / "0712345678" are one number.
    # PayHero's examples use the local `07…` form.
    def local_phone(value)
      digits = value.to_s.gsub(/\D/, "")
      return "0#{digits[3..]}" if digits.start_with?("254") && digits.length == 12
      return digits if digits.start_with?("0") && digits.length == 10

      ""
    end

    def callback_url(attempt, config)
      base = config[:callback_base_url].to_s.chomp("/")
      "#{base}/payments/payhero/callback/#{attempt.reference}"
    end

    def base_url(config)
      value = config[:base_url].to_s
      value.empty? ? DEFAULT_BASE : value.chomp("/")
    end

    def post_json(url, body, config)
      uri = URI(url)
      request = Net::HTTP::Post.new(uri)
      request["Authorization"] = "Basic #{config[:api_token]}"
      request["Content-Type"] = "application/json"
      request.body = JSON.generate(body)

      response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https",
                                 open_timeout: 10, read_timeout: 20) do |http|
        http.request(request)
      end
      JSON.parse(response.body.to_s)
    rescue StandardError => e
      warn "[payhero] request failed: #{e.class}: #{e.message}"
      nil
    end
  end
end

Dukafi::Plugins.register("payhero") do |p|
  p.name "PayHero (M-Pesa)"
  p.version "1.0.0"
  p.secret :api_token, label: "Basic auth token"
  p.integer :channel_id, label: "Payment channel ID"
  p.setting :callback_base_url, label: "Public site URL (for callbacks)"
  p.payment_provider "payhero", PayHero::Provider
end
