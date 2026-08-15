# A payment provider that talks to nothing.
#
# Exists so the payment CORE can be tested against every path a real provider
# produces — success, failure, timeout, duplicate callback, amount mismatch —
# without credentials or a network. It is also the reference implementation:
# a new provider plugin is this file with real HTTP in `initiate`/`poll`.
#
# `params["outcome"]` drives its behaviour, which is why it must never be
# registered outside development and test.
module FakePayments
  module Provider
    module_function

    def initiate(attempt:, params:, config:)
      case params["outcome"].to_s
      when "reject"
        Payments::InitiateResult.new(
          mode: :poll, redirect_url: nil, provider_reference: nil,
          client_payload: {}, error: "provider rejected the request"
        )
      when "boom"
        raise "provider exploded"
      when "redirect"
        Payments::InitiateResult.new(
          mode: :redirect, redirect_url: "/paid", provider_reference: "fake-#{attempt.id}",
          client_payload: {}, error: nil
        )
      else
        Payments::InitiateResult.new(
          mode: :poll, redirect_url: nil, provider_reference: "fake-#{attempt.id}",
          client_payload: {}, error: nil
        )
      end
    end

    # Reads the outcome recorded at initiate time, so a test can drive a
    # pending attempt to a verdict without a network round trip.
    def poll(attempt:, config:)
      case JSON.parse(attempt.request_payload.to_s)["outcome"].to_s
      when "poll_succeeds" then :succeeded
      when "poll_fails" then :failed
      else :pending
      end
    rescue JSON::ParserError
      :pending
    end

    def parse_callback(body:, config:)
      status = body["status"].to_s == "ok" ? :succeeded : :failed
      Payments::CallbackResult.new(
        reference: body["reference"].to_s, status: status,
        provider_reference: body["provider_reference"].to_s,
        receipt: body["receipt"].to_s,
        amount_cents: body["amount_cents"] ? Integer(body["amount_cents"]) : nil
      )
    end
  end
end

# Development and test only: its behaviour is caller-controlled, so it must
# never be reachable on a real store.
unless %w[production staging].include?(ENV["RACK_ENV"].to_s.downcase)
  Dukafi::Plugins.register("fake_payments") do |p|
    p.name "Fake payments (testing)"
    p.version "1.0.0"
    p.setting :endpoint, label: "Pretend endpoint"
    p.payment_provider "fake", FakePayments::Provider
  end
end
