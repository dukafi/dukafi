require "json"

# One attempt to pay for an order through one provider.
class PaymentAttempt < Sequel::Model
  many_to_one :order

  STATUSES = %w[pending processing succeeded failed cancelled].freeze
  TERMINAL = %w[succeeded failed cancelled].freeze

  def terminal? = TERMINAL.include?(status)
  def succeeded? = status == "succeeded"

  def response_data
    JSON.parse(response_payload.to_s)
  rescue JSON::ParserError
    {}
  end

  def validate
    super
    validates_presence %i[order_id provider status amount_cents currency reference]
    errors.add(:status, "must be one of #{STATUSES.join(', ')}") unless STATUSES.include?(status)
    validates_integer :amount_cents
    validates_min_value 0, :amount_cents
  end
end
