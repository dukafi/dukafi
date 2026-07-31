require "json"
require "json_schemer"

class Page < Sequel::Model
  PAGE_SCHEMA_PATH = File.expand_path("../publisher/schemas/page.schema.json", __dir__)

  def validate
    super
    validates_presence [:slug, :title, :document]
  end

  def document=(value)
    json = value.is_a?(String) ? value : JSON.generate(value)
    parsed = JSON.parse(json)
    schemer = JSONSchemer.schema(JSON.parse(File.read(PAGE_SCHEMA_PATH)))
    errors = schemer.validate(parsed).to_a
    raise Sequel::ValidationFailed, "document does not match page schema: #{errors.first.inspect}" unless errors.empty?

    super(json)
  rescue JSON::ParserError => e
    raise Sequel::ValidationFailed, "document is not valid JSON: #{e.message}"
  end

  def document_data
    @document_data ||= JSON.parse(document)
  end

  def after_refresh
    @document_data = nil
    super
  end
end
