class AiDefault < Sequel::Model
  unrestrict_primary_key
  many_to_one :ai_connection, key: :connection_id

  def validate
    super
    validates_includes %w[chat image], :task
    validates_presence :connection_id
    errors.add(:model, "is not present") if self[:model].to_s.empty?
  end
end
