require "json"
require "json_schemer"

class Page < Sequel::Model
  PAGE_SCHEMA_PATH = File.expand_path("../publisher/schemas/page.schema.json", __dir__)
  SLUG_PATTERN = /\A[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*\z/

  ACCESS_LEVELS = %w[public customer].freeze

  # Where gated pages are baked. Also the one slug prefix the storefront
  # refuses to serve by path, so this directory is unreachable except through
  # the session check.
  PRIVATE_PREFIX = "private".freeze

  # The columns have NOT NULL defaults, but a default is applied by the
  # DATABASE on insert — in Sequel the attribute is still nil while `validate`
  # runs, so without this every page created without an explicit access level
  # fails validation. Which is exactly what happened: first-boot setup could
  # not seed its own starter pages.
  def before_validation
    self.access = "public" if access.nil?
    self.auth_redirect = false if auth_redirect.nil?
    super
  end

  def validate
    super
    validates_presence [:slug, :title, :document]
    validates_format SLUG_PATTERN, :slug,
      message: "must use lowercase letters, numbers, single hyphens, and optional single slashes"
    validates_unique :slug
    errors.add(:access, "must be one of #{ACCESS_LEVELS.join(', ')}") unless ACCESS_LEVELS.include?(access.to_s)
    # A gated sign-in page locks every customer out of the site permanently:
    # they cannot sign in without reaching it, and cannot reach it without
    # signing in. Refused rather than warned about.
    if auth_redirect && access.to_s == "customer"
      errors.add(:auth_redirect, "cannot be set on a page that itself requires sign-in")
    end
  end

  def gated? = access.to_s == "customer"

  # Where this page's baked file lives, relative to the slot.
  def bake_path = gated? ? "#{PRIVATE_PREFIX}/#{slug}" : slug

  # The published page signed-out visitors are sent to. Nil when the merchant
  # has not marked one, which the storefront treats as "no way in" — a 404
  # rather than a redirect to nowhere.
  def self.sign_in_page
    where(auth_redirect: true, status: "published", kind: "page").order(:id).first
  end

  # At most one page is the sign-in destination, so marking one un-marks the
  # rest in the same transaction.
  def self.mark_auth_redirect!(page)
    DB.transaction do
      where(auth_redirect: true).exclude(id: page.id).update(auth_redirect: false)
      page.update(auth_redirect: true)
    end
    page
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
