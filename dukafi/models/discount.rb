class Discount < Sequel::Model
  KINDS = %w[percentage fixed].freeze

  # What the code applies to. NO rows on either side means the whole
  # catalogue — see migration 031 for why the scope is the rows themselves
  # rather than a kind column that could disagree with them.
  many_to_many :products, join_table: :discount_products
  many_to_many :collections, join_table: :discount_collections

  def code=(value)
    super(value.to_s.upcase)
  end

  def validate
    super
    validates_presence %i[code kind value starts_at]
    errors.add(:kind, "must be percentage or fixed") unless KINDS.include?(kind)
    validates_integer :value
    validates_min_value 1, :value
    # A percentage over 100 is not a bigger discount — `DiscountLookup` caps
    # the payout at the subtotal, so 500% would behave exactly like 100% and
    # the mistake would never surface. Enforced on the model so a console or a
    # seed script cannot create one either.
    if kind == "percentage" && value.to_i > 100
      errors.add(:value, "cannot exceed 100 for a percentage discount")
    end
  end

  def whole_catalogue?
    products_dataset.empty? && collections_dataset.empty?
  end

  # Every product this code can discount: the ones named directly, plus
  # everything in the collections named. A product in both counts once.
  #
  # Resolved at evaluation time rather than stored, so adding a product to a
  # scoped collection extends the discount immediately — which is the only
  # behaviour that matches what "20% off everything in Clearance" means.
  def eligible_product_ids
    direct = products_dataset.select_map(:id)
    return direct if collections_dataset.empty?

    via_collections = CollectionProduct
                      .where(collection_id: collections_dataset.select_map(:id))
                      .select_map(:product_id)
    (direct + via_collections).uniq
  end

  # A product with no id (a cart line whose variant lost its product) is never
  # eligible for a scoped code — silently discounting it would be worse than
  # not discounting it.
  def applies_to?(product_id)
    return true if whole_catalogue?
    return false if product_id.nil?

    eligible_product_ids.include?(product_id)
  end

  # The portion of a cart this code may discount. `lines` are
  # `{ "productId" =>, "lineCents" => }` pairs, which is all eligibility needs
  # to know about a cart.
  def eligible_cents(lines)
    return lines.sum { |line| line["lineCents"].to_i } if whole_catalogue?

    allowed = eligible_product_ids
    lines.sum { |line| allowed.include?(line["productId"]) ? line["lineCents"].to_i : 0 }
  end
end
