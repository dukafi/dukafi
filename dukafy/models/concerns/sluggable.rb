require "securerandom"

# Slug derivation, shared by every model whose slug is a public URL.
#
# Extend a model with this (`extend Sluggable`) to get `slugify` and
# `unique_slug` operating on that model's own table — Product and Collection
# have separate slug namespaces, so uniqueness must be checked per-model.
module Sluggable
  # "Canvas & Bag" -> "canvas-bag".
  #
  # Accents are FOLDED, not dropped: decomposing to NFD and removing the
  # combining marks turns "Café" into "cafe" rather than "caf", which matters
  # anywhere names aren't plain ASCII. Everything else outside a-z0-9 becomes
  # a separator, so punctuation and emoji collapse instead of producing a slug
  # the model's own format rule would then reject.
  def slugify(value)
    text = value.to_s
    # An uploaded CSV arrives tagged ASCII-8BIT, and `unicode_normalize`
    # refuses binary. Re-tag as UTF-8 (which is what it almost always is) and
    # scrub anything genuinely invalid, so a stray byte can't fail an import.
    text = text.dup.force_encoding(Encoding::UTF_8) unless text.encoding == Encoding::UTF_8
    text.scrub("")
        .unicode_normalize(:nfd)
        .gsub(/\p{Mn}/, "")
        .downcase
        .gsub(/[^a-z0-9]+/, "-")
        .gsub(/\A-+|-+\z/, "")
  end

  # A slug that is free to use on this model.
  #
  # Collisions get a short RANDOM suffix rather than a counter: `-2` leaks how
  # many similar records exist, and two concurrent creates would both compute
  # the same next number, so one would lose on the unique index.
  # What to use when a title has no slug-able characters at all ("!!!").
  # Overridden per model so callers never have to supply it.
  def slug_fallback = "item"

  def unique_slug(title, exclude_id: nil, fallback: slug_fallback)
    base = slugify(title)
    base = fallback if base.empty?
    return base unless slug_taken?(base, exclude_id)

    100.times do
      candidate = "#{base}-#{SecureRandom.hex(2)}"
      return candidate unless slug_taken?(candidate, exclude_id)
    end
    "#{base}-#{SecureRandom.hex(6)}"
  end

  def slug_taken?(slug, exclude_id)
    scope = where(slug: slug)
    scope = scope.exclude(id: exclude_id) if exclude_id
    !scope.empty?
  end
end
