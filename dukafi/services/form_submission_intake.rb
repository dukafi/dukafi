require "json"
require "openssl"
require "base64"

# Accept a submission for a merchant-defined form.
#
# Form CONFIG lives in the page document, not the database — the merchant set
# honeypot/timing/success behaviour on the `base.form` node, so this reads it
# back from published content rather than duplicating it in a table.
#
# Anti-spam is deliberately server-side and JS-free: a honeypot field and a
# signed render timestamp, both injected by the publisher. A form that needs
# JavaScript to resist bots excludes visitors who have it disabled.
class FormSubmissionIntake
  Result = Data.define(:submission, :behavior, :message, :redirect_url, :reason) do
    def ok? = reason.nil?
  end

  # A submission is a form, not a document store. These caps stop a single
  # POST from filling the disk.
  MAX_FIELDS = 60
  MAX_VALUE_BYTES = 10_000
  # Fields the publisher injects; they are machinery, never merchant data.
  RESERVED = %w[_ts order_token].freeze

  # `session_order_token` is the token stashed at checkout. A submission is
  # only filed against an order when the FORM says so — see `attachTo`.
  def self.call(form_id:, params:, customer: nil, session_order_token: nil)
    new(form_id, params, customer, session_order_token).call
  end

  def initialize(form_id, params, customer, session_order_token)
    @form_id = form_id.to_s
    @params = params || {}
    @customer = customer
    @session_order_token = session_order_token
  end

  def call
    node = FormLocator.find(@form_id)
    return failure("not_found") unless node

    props = node.fetch("props", {})
    return failure("not_found") if props["mode"].to_s == "custom"

    # A filled honeypot means a bot. Report success anyway: telling it what
    # tripped the trap is how it learns to avoid the trap.
    return discarded(props, "honeypot") if honeypot_tripped?(props)
    return discarded(props, "too_fast") unless timing_ok?(props)

    fields = clean_payload(props)
    ctx = PluginFilterContext.new(form_id: @form_id, fields: fields, customer: @customer)
    Dukafi::Plugins.apply_filters(:"form.submitting", ctx)
    if ctx.halted?
      return Result.new(submission: nil, behavior: "message", message: ctx.halt_message,
                        redirect_url: "", reason: "halted")
    end

    order = resolve_order(props)
    submission = FormSubmission.create(
      form_id: @form_id, payload: JSON.generate(fields),
      order_id: order&.id,
      customer_id: order&.customer_id || @customer&.id,
      created_at: Time.now
    )
    Dukafi::Plugins.emit(:"form.submitted", submission)
    success(props, submission)
  end

  # Signed so the browser cannot backdate it. Value only; the publisher wraps
  # it in a hidden field.
  def self.timestamp_token(now = Time.now)
    stamp = now.to_i.to_s
    "#{stamp}.#{sign(stamp)}"
  end

  def self.sign(value)
    Base64.urlsafe_encode64(
      OpenSSL::HMAC.digest("SHA256", SessionSecret.fetch, "form-ts:#{value}"), padding: false
    )
  end

  private

  # Only forms the merchant marked `attachTo: order` file against one.
  #
  # The order is identified by its `public_token` — an unguessable value, so
  # holding it IS the authorisation. An explicit `order_token` param wins so a
  # form can serve any order (an "upload payment proof" page), falling back to
  # the token stashed in the session at checkout.
  def resolve_order(props)
    return nil unless props["attachTo"].to_s == "order"

    token = @params["order_token"].to_s
    token = @session_order_token.to_s if token.empty?
    return nil if token.empty?

    Order.first(public_token: token)
  end

  def honeypot_tripped?(props)
    trap = props["honeypotName"].to_s
    return false if trap.empty?

    !@params[trap].to_s.strip.empty?
  end

  def timing_ok?(props)
    minimum = Integer(props["minSubmitSeconds"].to_s, exception: false).to_i
    return true if minimum <= 0

    stamp, signature = @params["_ts"].to_s.split(".", 2)
    return false if stamp.to_s.empty? || signature.to_s.empty?
    # Reject a forged or edited timestamp outright rather than trusting it.
    return false unless OpenSSL.secure_compare(self.class.sign(stamp), signature)

    Time.now.to_i - stamp.to_i >= minimum
  end

  def clean_payload(props)
    trap = props["honeypotName"].to_s
    @params
      .reject { |key, _| RESERVED.include?(key.to_s) || key.to_s == trap }
      .first(MAX_FIELDS)
      .to_h { |key, value| [key.to_s, value.to_s[0, MAX_VALUE_BYTES]] }
  end

  def success(props, submission)
    Result.new(
      submission: submission, behavior: behavior(props),
      message: props["successMessage"].to_s,
      redirect_url: props["redirectUrl"].to_s, reason: nil
    )
  end

  # Spam gets the same reply a real submission does — it just isn't stored.
  def discarded(props, why)
    Dukafi::Plugins.emit(:"form.discarded", { "formId" => @form_id, "reason" => why })
    Result.new(
      submission: nil, behavior: behavior(props), message: props["successMessage"].to_s,
      redirect_url: props["redirectUrl"].to_s, reason: nil
    )
  end

  def behavior(props)
    props["successBehavior"].to_s == "redirect" ? "redirect" : "message"
  end

  def failure(reason)
    Result.new(submission: nil, behavior: "message", message: "", redirect_url: "", reason: reason)
  end
end
