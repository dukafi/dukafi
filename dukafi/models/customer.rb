# A person who has ordered. NOT an account: there is no password and no
# login. This is the durable record an order hangs off — the anchor for order
# history, attachable forms, and the CRM. If logins ever arrive, they become a
# magic-link/OTP lookup against this row, not a new table.
#
# Identity is phone OR email, at least one. Normalisation matters more than
# usual here: the whole point is that a returning customer matches their
# existing record rather than spawning a duplicate.
class Customer < Sequel::Model
  one_to_many :orders

  def email=(value)
    normalized = value.to_s.strip.downcase
    super(normalized.empty? ? nil : normalized)
  end

  # Keep digits and a leading `+` only, so "+254 712 345 678",
  # "+254-712-345-678" and "+254712345678" are one customer, not three.
  # Deliberately NOT rewriting local formats (0712… → +254712…): that needs a
  # country to be correct, and guessing wrong merges two real people.
  #
  # A module method as well as a setter, because an ORDER records a phone too
  # and must store it in the same shape — otherwise the same number reads two
  # ways depending on which row it landed on.
  def self.normalize_phone(value)
    raw = value.to_s.strip
    normalized = raw.start_with?("+") ? "+#{raw[1..].gsub(/\D/, '')}" : raw.gsub(/\D/, "")
    normalized.empty? ? nil : normalized
  end

  def phone=(value)
    super(Customer.normalize_phone(value))
  end

  def validate
    super
    if email.to_s.empty? && phone.to_s.empty?
      errors.add(:base, "needs an email address or a phone number")
    end
    validates_format(/\A[^@\s]+@[^@\s]+\.[^@\s]+\z/, :email, message: "is not a valid email address") if email
    validates_unique(:email) if email
    validates_unique(:phone) if phone
  end

  # Find the existing person or create them. Matching prefers email, then
  # phone; a match fills in whichever identifier was previously missing so a
  # customer who first ordered by phone and later gives an email becomes one
  # record rather than two.
  def self.upsert_by_identity(email: nil, phone: nil, name: nil)
    scratch = new
    scratch.email = email
    scratch.phone = phone
    clean_email = scratch.email
    clean_phone = scratch.phone

    customer = (clean_email && first(email: clean_email)) || (clean_phone && first(phone: clean_phone))
    unless customer
      created = create(email: clean_email, phone: clean_phone, name: name.to_s.strip.empty? ? nil : name.to_s.strip)
      Dukafi::Plugins.emit(:"customer.created", created)
      return created
    end

    updates = {}
    updates[:email] = clean_email if clean_email && customer.email.nil?
    updates[:phone] = clean_phone if clean_phone && customer.phone.nil?
    updates[:name] = name.to_s.strip if customer.name.to_s.empty? && !name.to_s.strip.empty?
    customer.update(updates) unless updates.empty?
    customer
  end
end
