class AiConnection < Sequel::Model
  one_to_many :ai_defaults, class: :AiDefault, key: :connection_id

  def validate
    super
    validates_presence %i[name provider]
    errors.add(:provider, "is unknown") unless Dukafi::Ai::Drivers.registered?(provider)
    if driver&.auth_mode == :base_url && base_url.to_s.strip.empty?
      errors.add(:base_url, "is required")
    end
  end

  def driver = Dukafi::Ai::Drivers.resolve(provider)

  def api_key=(value)
    plain = value.to_s
    return super(nil) if plain.empty?
    encrypted = SecretBox.encrypt(plain)
    self.key_fingerprint = SecretBox.fingerprint
    super(encrypted)
  end

  def api_key_plain
    value = self[:api_key].to_s
    return "" if value.empty?
    # Upgrade migration-044's legacy plaintext lazily.
    unless value.start_with?(SecretBox::PREFIX)
      plain = value
      self.api_key = plain
      save_changes
      return plain
    end
    raise SecretBox::KeyMismatch unless key_fingerprint.to_s == SecretBox.fingerprint
    SecretBox.decrypt(value)
  end

  def to_admin_payload
    {
      id: id, name: name, provider: provider, baseUrl: base_url,
      chatModel: chat_model, imageModel: image_model, priority: priority,
      disabled: !!disabled, isSet: !self[:api_key].to_s.empty?,
      capabilities: driver.capabilities(chat_model).to_h,
      createdAt: created_at&.iso8601, updatedAt: updated_at&.iso8601,
    }
  end
end
