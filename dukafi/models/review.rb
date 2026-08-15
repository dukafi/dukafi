class Review < Sequel::Model
  MAX_BODY = 2000

  many_to_one :customer
  many_to_one :order
  many_to_one :product

  # Only these ever reach the publisher. Un-approved text must not appear on a
  # public page, and "approved" is a deliberate act rather than a default.
  dataset_module do
    def approved = exclude(approved_at: nil)
    def pending = where(approved_at: nil)
    def newest_first = order(Sequel.desc(:created_at))
  end

  def validate
    super
    validates_presence %i[author_name body]
    validates_integer :rating
    errors.add(:rating, "must be between 1 and 5") unless (1..5).cover?(rating.to_i)
    errors.add(:body, "is too long") if body.to_s.length > MAX_BODY
  end

  def approved? = !approved_at.nil?

  def approve! = update(approved_at: Time.now, updated_at: Time.now)
  def unapprove! = update(approved_at: nil, updated_at: Time.now)

  # The claim the storefront makes. True only when this review is attached to
  # a real order — everything else is someone typing into a form.
  def verified? = !order_id.nil?

  # Always five, filled or not — a rating is out of five whatever the score,
  # so the empty ones are part of it. Looping this is what lets a page draw a
  # rating out of real elements (an SVG, an icon, a styled span) instead of
  # the plain `ratingStars` text: each item is a node the author can style,
  # and `filled` is what a `visibleWhen` switches on to show a gold star or a
  # grey one.
  def star_entries
    (1..5).map do |position|
      filled = position <= rating.to_i
      {
        "position" => position,
        "filled" => filled,
        # The same fact as a string, because `visibleWhen` compares strings
        # and an author reading "state equals filled" understands it faster
        # than a boolean operator.
        "state" => filled ? "filled" : "empty",
        "symbol" => filled ? "★" : "☆",
      }
    end
  end

  # What a page binds to. Field names are the `currentEntry.<field>` an author
  # writes in the editor, so they are part of the public contract: renaming
  # one silently empties every binding pointing at it.
  def to_entry
    {
      "id" => id,
      "body" => body.to_s,
      "authorName" => author_name.to_s,
      "rating" => rating.to_i,
      # Pre-rendered so a page can show stars without any logic in the
      # template — there is no loop-with-index in the binding language. For a
      # rating built from real, styleable elements, loop `stars` instead.
      "ratingStars" => ("★" * rating.to_i) + ("☆" * (5 - rating.to_i)),
      "stars" => star_entries,
      "verified" => verified?,
      # `visibleWhen` compares strings, so the badge text is supplied rather
      # than composed on the page.
      "verifiedLabel" => verified? ? "Verified Buyer" : "Customer",
      "productSlug" => product&.slug.to_s,
      "productTitle" => product&.title.to_s,
      "createdAt" => created_at&.utc&.iso8601,
      "date" => created_at&.strftime("%-d %B %Y").to_s,
    }
  end
end
