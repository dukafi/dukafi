require "json"

# One submission of a merchant-defined form.
#
# The payload is schemaless on purpose: the merchant invents the fields, so
# Dukafi stores what arrived rather than a shape it chose in advance. This is
# the foundation the CRM sits on — a submission can stand alone, belong to a
# customer, or be attached to an order.
class FormSubmission < Sequel::Model
  many_to_one :order
  many_to_one :customer

  def payload=(value)
    super(value.is_a?(String) ? value : JSON.generate(value))
  end

  def payload_data
    @payload_data ||= JSON.parse(payload.to_s)
  rescue JSON::ParserError
    {}
  end

  def after_refresh
    @payload_data = nil
    super
  end

  def validate
    super
    validates_presence %i[form_id]
  end
end
