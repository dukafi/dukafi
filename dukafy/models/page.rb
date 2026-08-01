require "json"
require "json_schemer"

class Page < Sequel::Model
  PAGE_SCHEMA_PATH = File.expand_path("../publisher/schemas/page.schema.json", __dir__)
  SLUG_PATTERN = /\A[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*\z/

  def validate
    super
    validates_presence [:slug, :title, :document]
    validates_format SLUG_PATTERN, :slug,
      message: "must use lowercase letters, numbers, single hyphens, and optional single slashes"
    validates_unique :slug
  end

  def document=(value)
    json = value.is_a?(String) ? value : JSON.generate(value)
    parsed = JSON.parse(json)
    schemer = JSONSchemer.schema(JSON.parse(File.read(PAGE_SCHEMA_PATH)))
    errors = schemer.validate(parsed).to_a
    raise Sequel::ValidationFailed, "document does not match page schema: #{errors.first.inspect}" unless errors.empty?

    super(json)
    @document_data = parsed
  rescue JSON::ParserError => e
    raise Sequel::ValidationFailed, "document is not valid JSON: #{e.message}"
  end

  def document_data
    @document_data ||= JSON.parse(document)
  end

  def published_document_data
    return nil unless published_document

    @published_document_data ||= JSON.parse(published_document)
  end

  def after_refresh
    @document_data = nil
    @published_document_data = nil
    super
  end
end
