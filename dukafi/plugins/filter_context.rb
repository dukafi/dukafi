# The context a `form.submitting` (or other) filter receives.
#
# `halt` stops the host action before it commits. A raising or timed-out
# filter is turned into a halt by the host — see Dukafi::Plugins.apply_filters.
class PluginFilterContext
  attr_reader :form_id, :fields, :customer, :halt_message

  def initialize(form_id:, fields:, customer: nil)
    @form_id = form_id.to_s
    @fields = fields.is_a?(Hash) ? fields.transform_keys(&:to_s) : {}
    @customer = customer
    @halted = false
    @halt_message = nil
  end

  def halt(message)
    @halted = true
    @halt_message = message.to_s
    self
  end

  def halted?
    @halted
  end
end
