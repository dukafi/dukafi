require "json"
require "securerandom"

# Resolve what a payment attempt will charge BEFORE a rail is called.
#
# The payment plugin never prices. This is the host: cart total, a form
# field, a preset, or a quote re-run on the server. A claimed amount from
# the browser that does not match the quote is refused.
class Charge
  class Error < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  SUBJECTS = %w[order form preset quote].freeze

  Result = Data.define(:amount_cents, :currency, :label, :subject)

  def self.resolve(subject:, order: nil, fields: {}, preset_cents: nil,
                   quote_plugin: nil, quote_name: nil, inputs: {},
                   claimed_cents: nil, currency: nil)
    kind = subject.to_s
    raise Error.new("bad_subject", "Amount subject must be order, form, preset or quote.") unless SUBJECTS.include?(kind)

    currency = (currency || order&.currency || CommerceSettings.current.currency).to_s
    fields = stringify(fields)
    inputs = stringify(inputs)

    case kind
    when "order"
      raise Error.new("no_order", "No order to price.") unless order

      amount = order.total_cents
      label = "Order"
    when "form"
      amount = integer(fields["amount_cents"], "form amount")
      label = fields["label"].to_s.empty? ? "Form charge" : fields["label"].to_s
    when "preset"
      amount = integer(preset_cents, "preset amount")
      label = "Preset"
    when "quote"
      quoted = Dukafi::Plugins.run_quote(quote_plugin, quote_name, inputs)
      amount = integer(quoted["amount_cents"], "quote")
      currency = quoted["currency"].to_s unless quoted["currency"].to_s.empty?
      label = quoted["label"].to_s.empty? ? quote_name.to_s : quoted["label"].to_s
      claimed = claimed_cents.nil? || claimed_cents.to_s.empty? ? nil : integer(claimed_cents, "claimed amount")
      if claimed && claimed != amount
        raise Error.new("quote_mismatch",
                        "The quoted amount changed. Refresh and try again.")
      end
    end

    raise Error.new("bad_amount", "Amount must be zero or more.") if amount.negative?

    Result.new(amount_cents: amount, currency: currency, label: label, subject: kind)
  end

  # A charge that is not a cart of SKUs still becomes an order, so receipts
  # and "already paid" stay one path.
  def self.open_order(result, email:, phone: nil, name: nil, title: nil)
    customer = Customer.upsert_by_identity(email: email, phone: phone, name: name)
    now = Time.now
    order = Order.create(
      customer_id: customer.id,
      email: email.to_s.strip.empty? ? customer.email : email.to_s.strip,
      phone: Customer.normalize_phone(phone) || customer.phone,
      status: "pending", currency: result.currency,
      subtotal_cents: result.amount_cents, discount_cents: 0, shipping_cents: 0,
      total_cents: result.amount_cents,
      public_token: SecureRandom.urlsafe_base64(24),
      created_at: now, updated_at: now
    )
    OrderItem.create(
      order_id: order.id,
      product_title: (title || result.label).to_s,
      variant_title: result.subject,
      sku: "charge-#{result.subject}",
      unit_price_cents: result.amount_cents,
      quantity: 1,
      created_at: now
    )
    Dukafi::Plugins.emit(:"order.created", order)
    order
  end

  def self.stringify(hash)
    return {} unless hash.is_a?(Hash)

    hash.to_h { |key, value| [key.to_s, value] }
  end
  private_class_method :stringify

  def self.integer(value, label)
    parsed = Integer(value.to_s, exception: false)
    raise Error.new("bad_amount", "#{label} is not a number.") if parsed.nil?

    parsed
  end
  private_class_method :integer
end
