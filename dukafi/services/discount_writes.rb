require "time"

# Every write to a discount code, in one place.
#
# Same reason `CommerceWrites` exists: there is about to be more than one
# caller (MCP today, the admin screen next), and the rules here are ones a
# second implementation would get subtly wrong rather than obviously wrong:
#
#   · a code is uppercased and compared uppercased, so "weekend20" and
#     "WEEKEND20" are the same code and cannot both be created;
#   · a percentage above 100 is not a bigger discount, it is a mistake — the
#     evaluator caps the payout at the subtotal, so 500% would silently behave
#     exactly like 100% and nobody would find out;
#   · `starts_at` defaults to NOW, because a code created without a start date
#     is meant to work now, not never (the column is NOT NULL);
#   · a code that has been REDEEMED is never destroyed. Orders record the code
#     string they were charged under, and deleting the row turns a past order's
#     "WEEKEND20" into a reference to nothing. Ending it now is the honest
#     equivalent: it stops working immediately and the history survives.
#
# Nothing here re-bakes. A discount is applied in the cart fragment, which is
# rendered per request — unlike a price, it never reaches a baked page. When
# campaigns arrive (MILESTONES M9 Track C) they WILL need a bake, and that is
# precisely why they are a different thing rather than a flag on this one.
#
# Raises `Invalid` with a message a human or a model can act on.
module DiscountWrites
  class Invalid < StandardError; end

  MAX_CODE = 64

  module_function

  def attributes(params, existing: nil)
    {
      code: code_for(params, existing),
      kind: kind_for(params, existing),
      value: value_for(params, existing),
      starts_at: time_for(params, "startsAt", existing&.starts_at || Time.now),
      ends_at: time_for(params, "endsAt", existing&.ends_at, allow_nil: true),
      usage_limit: usage_limit_for(params, existing),
    }
  end

  def create!(params)
    now = Time.now
    attrs = attributes(params)
    guard_uniqueness!(attrs[:code])
    guard_window!(attrs)
    # Resolved BEFORE the insert so a bad slug fails without leaving a code
    # behind that silently covers the whole catalogue.
    scope = resolve_scope(params)

    discount = nil
    DB.transaction do
      discount = Discount.create(**attrs, usage_count: 0, created_at: now, updated_at: now)
      apply_scope!(discount, scope)
    end
    discount
  rescue Sequel::ValidationFailed => e
    raise Invalid, e.message
  end

  def update!(discount, params)
    attrs = attributes(params, existing: discount)
    guard_uniqueness!(attrs[:code], excluding: discount.id)
    guard_window!(attrs)
    scope = resolve_scope(params)

    DB.transaction do
      discount.update(**attrs, updated_at: Time.now)
      apply_scope!(discount, scope)
    end
    discount
  rescue Sequel::ValidationFailed => e
    raise Invalid, e.message
  end

  # Returns :deleted or :deactivated, so a caller can say which happened
  # instead of claiming a delete that did not occur.
  def destroy!(discount)
    if discount.usage_count.to_i.positive?
      discount.update(ends_at: Time.now, updated_at: Time.now)
      :deactivated
    else
      discount.destroy
      :deleted
    end
  rescue Sequel::ValidationFailed => e
    raise Invalid, e.message
  end

  # What a code has actually done. `usage_count` is a running total kept by
  # `CreateOrder`; these come from the orders themselves, so they can say what
  # the code was worth rather than only how often it was typed.
  #
  # Orders placed before migration 030 have no `discount_code`, so they count
  # toward `usage_count` and not toward these. That gap closes with time and
  # is better than pretending to a precision the data does not have.
  def performance(discount)
    orders = Order.where(discount_code: discount.code)
    {
      "redemptions" => discount.usage_count.to_i,
      "ordersWithCode" => orders.count,
      "revenueCents" => orders.sum(:total_cents).to_i,
      "discountedCents" => orders.sum(:discount_cents).to_i,
    }
  end

  # ── Scope ──────────────────────────────────────────────────────────────────

  # `productSlugs` / `collectionSlugs`, resolved to ids. Slugs rather than ids
  # because that is what every other caller already speaks — an agent has the
  # slug from `list_products`, and the admin screen has it on the row.
  #
  # Returns nil when NEITHER key is present, which means "leave the scope
  # alone". An empty array is different and means "clear it": widening a code
  # back to the whole catalogue has to be sayable.
  def resolve_scope(params)
    return nil unless params.key?("productSlugs") || params.key?("collectionSlugs")

    {
      product_ids: ids_for(params["productSlugs"], Product, "product"),
      collection_ids: ids_for(params["collectionSlugs"], Collection, "collection"),
    }
  end

  def ids_for(slugs, model, noun)
    return [] if slugs.nil?
    raise Invalid, "#{noun}Slugs must be a list of slugs" unless slugs.is_a?(Array)

    slugs.map do |slug|
      row = model.first(slug: slug.to_s.strip)
      # Named rather than skipped: a typo'd slug would otherwise widen the
      # discount silently, which is the expensive direction to be wrong in.
      raise Invalid, "no #{noun} with the slug #{slug.to_s.strip.inspect}" if row.nil?

      row.id
    end.uniq
  end

  def apply_scope!(discount, scope)
    return if scope.nil?

    DB[:discount_products].where(discount_id: discount.id).delete
    DB[:discount_collections].where(discount_id: discount.id).delete
    scope[:product_ids].each do |id|
      DB[:discount_products].insert(discount_id: discount.id, product_id: id)
    end
    scope[:collection_ids].each do |id|
      DB[:discount_collections].insert(discount_id: discount.id, collection_id: id)
    end
  end

  # How a screen or a tool describes the scope. `kind` is DERIVED from the
  # rows, never stored, so it cannot disagree with what the evaluator does.
  def scope_of(discount)
    product_slugs = discount.products.map(&:slug).sort
    collection_slugs = discount.collections.map(&:slug).sort
    kind =
      if product_slugs.empty? && collection_slugs.empty? then "catalogue"
      elsif collection_slugs.empty? then "products"
      elsif product_slugs.empty? then "collections"
      else "mixed"
      end

    { "kind" => kind, "productSlugs" => product_slugs, "collectionSlugs" => collection_slugs }
  end

  # ── Coercion ───────────────────────────────────────────────────────────────

  def code_for(params, existing)
    submitted = params.fetch("code", "").to_s.strip
    return existing.code if submitted.empty? && existing
    raise Invalid, "code is required" if submitted.empty?
    raise Invalid, "code is too long (max #{MAX_CODE})" if submitted.length > MAX_CODE
    # A code goes in a URL and gets read aloud over a phone. Anything outside
    # this set is a support call waiting to happen.
    unless submitted.match?(/\A[A-Za-z0-9][A-Za-z0-9_-]*\z/)
      raise Invalid, "code may only contain letters, numbers, hyphens and underscores"
    end

    submitted.upcase
  end

  def kind_for(params, existing)
    submitted = params.fetch("kind", "").to_s.strip
    return existing.kind if submitted.empty? && existing
    raise Invalid, "kind must be percentage or fixed" unless Discount::KINDS.include?(submitted)

    submitted
  end

  def value_for(params, existing)
    kind = kind_for(params, existing)
    raw = params["value"]
    return existing.value if raw.nil? && existing

    value = Integer(raw, exception: false)
    raise Invalid, "value must be a whole number" if value.nil?
    raise Invalid, "value must be at least 1" if value < 1
    if kind == "percentage" && value > 100
      raise Invalid, "a percentage discount cannot exceed 100"
    end

    value
  end

  def usage_limit_for(params, existing)
    return existing&.usage_limit unless params.key?("usageLimit")

    raw = params["usageLimit"]
    # Explicit null clears the limit — "unlimited" has to be sayable, or a
    # limit set once could never be removed.
    return nil if raw.nil? || raw.to_s.strip.empty?

    limit = Integer(raw, exception: false)
    raise Invalid, "usageLimit must be a whole number" if limit.nil?
    raise Invalid, "usageLimit must be at least 1" if limit < 1

    limit
  end

  def time_for(params, key, fallback, allow_nil: false)
    return fallback unless params.key?(key)

    raw = params[key]
    return nil if allow_nil && (raw.nil? || raw.to_s.strip.empty?)
    return fallback if raw.nil? || raw.to_s.strip.empty?

    Time.parse(raw.to_s)
  rescue ::ArgumentError
    raise Invalid, "#{key} must be a date and time, e.g. 2026-08-20T09:00:00Z"
  end

  def guard_uniqueness!(code, excluding: nil)
    existing = Discount.first(code: code)
    return if existing.nil? || existing.id == excluding

    raise Invalid, "a discount with the code #{code} already exists"
  end

  # An inverted window is only a mistake for a code that has NOT started yet:
  # there, the evaluator would say "not started" and then "expired", and the
  # code could never be applied by anyone — a typo with no symptom.
  #
  # For a code already running, an end date before its start is not nonsense,
  # it is "stop now" — which is exactly how a merchant turns a live code off
  # while keeping it on record. Refusing that would leave no way to say it.
  def guard_window!(attrs, now = Time.now)
    return if attrs[:ends_at].nil? || attrs[:starts_at].nil?
    return unless attrs[:starts_at] > now
    return if attrs[:ends_at] > attrs[:starts_at]

    raise Invalid, "endsAt must be after startsAt"
  end
end
