class SlugRedirect < Sequel::Model
  RESOURCE_TYPES = %w[product collection].freeze

  def validate
    super
    validates_presence %i[resource_type old_slug destination_slug]
    errors.add(:resource_type, "is invalid") unless RESOURCE_TYPES.include?(resource_type)
  end

  def self.record(resource_type:, old_slug:, destination_slug:)
    return if old_slug == destination_slug

    DB.transaction do
      where(resource_type:, destination_slug: old_slug).update(destination_slug:)
      where(resource_type:, old_slug: destination_slug).delete
      row = first(resource_type:, old_slug:) || new(resource_type:, old_slug:)
      row.update(destination_slug:)
      where(resource_type:, old_slug: destination_slug).delete
    end
  end
end
