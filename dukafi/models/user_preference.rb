require "json"

class UserPreference < Sequel::Model
  many_to_one :admin

  def value
    JSON.parse(value_json)
  end

  def value=(new_value)
    self.value_json = JSON.generate(new_value)
  end
end
