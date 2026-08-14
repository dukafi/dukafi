class Admin < Sequel::Model
  one_to_many :user_preferences
end
