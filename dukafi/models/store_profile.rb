class StoreProfile < Sequel::Model
  LIMITS = { started_on: 80, audience: 500, difference: 500 }.freeze

  def self.current
    first || create(started_on: "", audience: "", difference: "", created_at: Time.now, updated_at: Time.now)
  end

  def thin?
    started_on.to_s.strip.empty? && audience.to_s.strip.empty? && difference.to_s.strip.empty?
  end

  def to_payload
    {
      "startedOn" => started_on.to_s,
      "audience" => audience.to_s,
      "difference" => difference.to_s,
      "thin" => thin?,
    }
  end

  def apply!(params)
    raw = params.is_a?(Hash) ? params : {}
    self.started_on = clip(raw["startedOn"] || raw[:startedOn], :started_on)
    self.audience = clip(raw["audience"] || raw[:audience], :audience)
    self.difference = clip(raw["difference"] || raw[:difference], :difference)
    self.updated_at = Time.now
    save
    self
  end

  private

  def clip(value, field)
    value.to_s.strip[0, LIMITS.fetch(field)]
  end
end
