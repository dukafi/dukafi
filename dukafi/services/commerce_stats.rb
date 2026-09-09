# Exact commerce figures from tables that already exist.
#
# Revenue, orders, AOV, units, status mix, payments, bestsellers, abandoned
# carts, discount codes, and storefront page views. Page views are HTML
# loads the Ruby storefront actually served — not unique visitors, not
# assets, not admin.
#
# One service, one payload. Screens slice it; they do not each query.
class CommerceStats
  PERIODS = { "7d" => 7, "30d" => 30, "90d" => 90 }.freeze
  REVENUE_STATUSES = %w[paid fulfilled shipped].freeze
  ABANDONED_AFTER_HOURS = 24

  def self.call(period: "30d", now: Time.now)
    new(period: period, now: now).call
  end

  def initialize(period:, now:)
    @days = PERIODS.fetch(period.to_s, 30)
    @period = PERIODS.key(@days)
    @now = now
    @to = @now
    @from = @to - (@days * 86_400)
    @previous_from = @from - (@days * 86_400)
  end

  def call
    current = window(@from...@to)
    previous = window(@previous_from...@from)
    {
      period: @period,
      currency: CommerceSettings.current.currency,
      overview: overview(current, previous),
      ordersByStatus: counts_for(Order::STATUSES, current[:status_counts]),
      paymentsByStatus: counts_for(PaymentAttempt::STATUSES, current[:payment_status_counts]),
      paymentsByProvider: current[:payments_by_provider],
      topProducts: current[:top_products],
      topCollections: current[:top_collections],
      abandonedCarts: abandoned_carts,
      discounts: current[:discounts],
      traffic: traffic,
    }
  end

  private

  def window(range)
    orders = Order.where(created_at: range).all
    revenue_orders = orders.select { |order| REVENUE_STATUSES.include?(order.status) }
    revenue_ids = revenue_orders.map(&:id)
    items = revenue_ids.empty? ? [] : OrderItem.where(order_id: revenue_ids).all

    {
      revenue_cents: revenue_orders.sum(&:total_cents),
      orders: revenue_orders.length,
      units: items.sum(&:quantity),
      status_counts: tally(orders, :status),
      series: daily_series(range, revenue_orders, items),
      top_products: top_products(items),
      top_collections: top_collections(items),
      discounts: discount_digest(orders),
      payment_status_counts: payment_status_counts(range),
      payments_by_provider: payments_by_provider(range),
    }
  end

  def overview(current, previous)
    aov = average_order(current[:revenue_cents], current[:orders])
    prev_aov = average_order(previous[:revenue_cents], previous[:orders])
    {
      revenueCents: current[:revenue_cents],
      orders: current[:orders],
      aovCents: aov,
      units: current[:units],
      previous: {
        revenueCents: previous[:revenue_cents],
        orders: previous[:orders],
        aovCents: prev_aov,
        units: previous[:units],
      },
      deltas: {
        revenuePct: delta_pct(current[:revenue_cents], previous[:revenue_cents]),
        ordersPct: delta_pct(current[:orders], previous[:orders]),
        aovPct: delta_pct(aov, prev_aov),
        unitsPct: delta_pct(current[:units], previous[:units]),
      },
      series: current[:series],
    }
  end

  def daily_series(range, orders, items)
    units_by_order = items.each_with_object(Hash.new(0)) { |item, map| map[item.order_id] += item.quantity }
    revenue = Hash.new(0)
    count = Hash.new(0)
    units = Hash.new(0)
    orders.each do |order|
      day = order.created_at.to_date
      revenue[day] += order.total_cents
      count[day] += 1
      units[day] += units_by_order[order.id]
    end
    {
      revenue: buckets(range, revenue),
      orders: buckets(range, count),
      units: buckets(range, units),
    }
  end

  def buckets(range, values)
    first = range.begin.to_date
    last = (range.end - 1).to_date
    days = []
    day = first
    while day <= last
      days << values[day].to_i
      day += 1
    end
    days
  end

  def top_products(items)
    grouped = items.group_by { |item| [item.product_title, item.sku] }
    ranked = grouped.map do |(title, sku), rows|
      {
        title: title,
        sku: sku,
        revenueCents: rows.sum { |row| row.unit_price_cents * row.quantity },
        units: rows.sum(&:quantity),
      }
    end
    ranked.sort_by { |row| -row[:revenueCents] }.first(10)
  end

  def top_collections(items)
    skus = items.map(&:sku).uniq
    return [] if skus.empty?

    variants = Variant.where(sku: skus).all
    sku_to_product = variants.each_with_object({}) { |variant, map| map[variant.sku] = variant.product_id }
    product_ids = sku_to_product.values.uniq
    return [] if product_ids.empty?

    memberships = CollectionProduct.where(product_id: product_ids).all
    collections = Collection.where(id: memberships.map(&:collection_id).uniq).all.to_h { |row| [row.id, row] }
    by_collection = Hash.new { |hash, key| hash[key] = { revenueCents: 0, units: 0 } }
    items.each do |item|
      product_id = sku_to_product[item.sku]
      next unless product_id

      line = item.unit_price_cents * item.quantity
      memberships.each do |row|
        next unless row.product_id == product_id

        by_collection[row.collection_id][:revenueCents] += line
        by_collection[row.collection_id][:units] += item.quantity
      end
    end
    by_collection.filter_map do |id, totals|
      collection = collections[id]
      next unless collection

      totals.merge(title: collection.title, slug: collection.slug)
    end.sort_by { |row| -row[:revenueCents] }.first(8)
  end

  def discount_digest(orders)
    coded = orders.select { |order| !order.discount_code.to_s.empty? }
    codes = coded.group_by(&:discount_code).map do |code, rows|
      {
        code: code,
        orders: rows.length,
        discountCents: rows.sum(&:discount_cents),
        revenueCents: rows.sum(&:total_cents),
      }
    end.sort_by { |row| -row[:discountCents] }
    {
      ordersWithCode: coded.length,
      discountCents: orders.sum(&:discount_cents),
      revenueCents: coded.sum(&:total_cents),
      codes: codes.first(10),
    }
  end

  def payment_status_counts(range)
    tally(PaymentAttempt.where(created_at: range).select(:status).all, :status)
  end

  def payments_by_provider(range)
    attempts = PaymentAttempt.where(created_at: range).select(:provider, :status, :amount_cents).all
    attempts.group_by(&:provider).map do |provider, rows|
      succeeded = rows.select(&:succeeded?)
      {
        provider: provider,
        attempts: rows.length,
        succeeded: succeeded.length,
        amountCents: succeeded.sum(&:amount_cents),
      }
    end.sort_by { |row| -row[:amountCents] }
  end

  def traffic
    current = loads_in(@from...@to)
    previous = loads_in(@previous_from...@from)
    page_views = current.sum(&:views)
    previous_views = previous.sum(&:views)
    by_day = Hash.new(0)
    current.each { |row| by_day[coerce_day(row.day)] += row.views }
    paths = current.group_by(&:path).map do |path, rows|
      { path: path, views: rows.sum(&:views) }
    end.sort_by { |row| -row[:views] }.first(10)
    {
      available: true,
      pageViews: page_views,
      previous: { pageViews: previous_views },
      deltas: { pageViewsPct: delta_pct(page_views, previous_views) },
      series: { pageViews: buckets(@from...@to, by_day) },
      paths: paths,
    }
  end

  def loads_in(range)
    first = range.begin.to_date
    last = (range.end - 1).to_date
    StorefrontLoad.where(day: first..last).all
  end

  def coerce_day(value)
    value.is_a?(Date) ? value : Date.parse(value.to_s)
  end

  def abandoned_carts
    cutoff = @now - (ABANDONED_AFTER_HOURS * 3600)
    cart_ids = CartItem.select_map(:cart_id).uniq
    counted = Cart.where(status: "active", id: cart_ids).all.count do |cart|
      stamp = cart.updated_at
      stamp && stamp.to_time < cutoff
    end
    { count: counted, olderThanHours: ABANDONED_AFTER_HOURS }
  end

  def average_order(revenue_cents, orders)
    return 0 if orders.zero?

    (revenue_cents.to_f / orders).round
  end

  def delta_pct(current, previous)
    return nil if previous.to_i.zero? && current.to_i.zero?
    return 100.0 if previous.to_i.zero?

    (((current - previous).to_f / previous) * 100).round(1)
  end

  def tally(rows, field)
    rows.each_with_object(Hash.new(0)) { |row, map| map[row.public_send(field).to_s] += 1 }
  end

  def counts_for(keys, tallied)
    keys.to_h { |key| [key, tallied[key].to_i] }
  end
end
