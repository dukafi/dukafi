require "securerandom"
require "json"

# Provider-agnostic payment orchestration.
#
# Providers are plugins (see `plugins/registry.rb`) implementing three verbs:
#
#   initiate(attempt:, params:, config:) -> InitiateResult
#   poll(attempt:, config:)              -> :pending | :succeeded | :failed
#   parse_callback(body:, config:)       -> CallbackResult | nil
#
# Everything provider-specific lives behind those. Everything below is the
# part that must be right regardless of who processes the money.
class Payments
  # `mode` tells the storefront what to do next:
  #   :redirect — send the customer to `redirect_url` (hosted checkout)
  #   :poll     — stay put and watch the attempt (M-Pesa STK push)
  #   :client   — hand `client_payload` to a browser SDK
  InitiateResult = Data.define(:mode, :redirect_url, :provider_reference, :client_payload, :error) do
    def ok? = error.nil?
  end

  CallbackResult = Data.define(:reference, :status, :provider_reference, :receipt, :amount_cents)

  Outcome = Data.define(:attempt, :result, :reason) do
    def ok? = reason.nil?
  end

  class << self
    def start(order:, provider_slug:, params: {})
      found = Dukafi::Plugins.payment_provider(provider_slug)
      return failure(nil, "unknown_provider") unless found

      plugin, provider = found
      config = plugin.settings
      return failure(nil, "provider_not_configured") unless config.configured?
      return failure(nil, "order_not_payable") unless payable?(order)

      # What will ACTUALLY be charged. Some rails can't take arbitrary
      # precision — M-Pesa moves whole shillings — so the provider gets to
      # normalise, and the attempt records the charged figure rather than the
      # order total. Without this the amount check below would reject every
      # rounded payment as a mismatch.
      charged = if provider.respond_to?(:normalize_amount)
        provider.normalize_amount(amount_cents: order.total_cents, currency: order.currency, config: config.to_h)
      else
        order.total_cents
      end

      attempt = PaymentAttempt.create(
        order_id: order.id, provider: provider_slug.to_s, status: "pending",
        amount_cents: charged, currency: order.currency,
        reference: SecureRandom.urlsafe_base64(24),
        request_payload: JSON.generate(scrubbed(params)),
        created_at: Time.now, updated_at: Time.now
      )

      result = begin
        provider.initiate(attempt: attempt, params: params, config: config.to_h)
      rescue StandardError => e
        # A provider being down is not a crash for the customer.
        attempt.update(status: "failed", error: "#{e.class}: #{e.message}", updated_at: Time.now)
        return failure(attempt, "provider_error")
      end

      unless result.ok?
        attempt.update(status: "failed", error: result.error.to_s, updated_at: Time.now)
        return failure(attempt, "provider_error")
      end

      attempt.update(
        status: "processing", provider_reference: result.provider_reference,
        updated_at: Time.now
      )
      Dukafi::Plugins.emit(:payment_initiated, attempt)
      Outcome.new(attempt: attempt, result: result, reason: nil)
    end

    # Apply a provider's verdict to an attempt.
    #
    # This is the ONLY path that can mark an order paid, and it is deliberately
    # paranoid, because a callback URL is reachable by anyone who learns it:
    #
    #   - the amount must match what we recorded; a mismatch fails the attempt
    #     rather than accepting a cheaper payment for a dearer order
    #   - already-terminal attempts are left alone, so a provider retrying its
    #     callback (they all do) cannot double-apply
    def settle(attempt, result)
      return attempt if attempt.terminal?

      if result.amount_cents && result.amount_cents != attempt.amount_cents
        attempt.update(
          status: "failed", updated_at: Time.now,
          error: "amount mismatch: provider reported #{result.amount_cents}, expected #{attempt.amount_cents}"
        )
        Dukafi::Plugins.emit(:payment_failed, attempt)
        return attempt
      end

      case result.status
      when :succeeded
        DB.transaction do
          attempt.update(
            status: "succeeded", provider_reference: result.provider_reference || attempt.provider_reference,
            receipt: result.receipt, updated_at: Time.now
          )
          # The order follows the attempt; nothing client-side ever writes this.
          attempt.order.update(status: "paid", updated_at: Time.now)
        end
        Dukafi::Plugins.emit(:payment_succeeded, attempt)
      when :failed
        attempt.update(status: "failed", updated_at: Time.now)
        Dukafi::Plugins.emit(:payment_failed, attempt)
      end
      attempt.refresh
    end

    # Ask the provider directly. Used by the status fragment while an attempt
    # is in flight, and the reason a lost callback isn't a stuck order.
    def refresh(attempt)
      return attempt if attempt.terminal?

      found = Dukafi::Plugins.payment_provider(attempt.provider)
      return attempt unless found

      plugin, provider = found
      return attempt unless provider.respond_to?(:poll)

      status = begin
        provider.poll(attempt: attempt, config: plugin.settings.to_h)
      rescue StandardError => e
        warn "[payments] poll failed for #{attempt.reference}: #{e.message}"
        :pending
      end
      return attempt if status == :pending

      settle(attempt, CallbackResult.new(
        reference: attempt.reference, status: status,
        provider_reference: attempt.provider_reference, receipt: attempt.receipt,
        amount_cents: nil
      ))
    end

    def find_by_reference(reference)
      return nil if reference.to_s.empty?

      PaymentAttempt.first(reference: reference.to_s)
    end

    private

    def payable?(order)
      order && !%w[paid refunded].include?(order.status)
    end

    # Never persist what the customer typed wholesale — a payment form may
    # carry more than we want sitting in a request log forever.
    def scrubbed(params)
      params.reject { |key, _| key.to_s.match?(/pin|password|cvv|token/i) }
            .to_h { |key, value| [key.to_s, value.to_s[0, 500]] }
    end

    def failure(attempt, reason)
      Outcome.new(attempt: attempt, result: nil, reason: reason)
    end
  end
end
