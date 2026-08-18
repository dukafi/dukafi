require "json"

# Approving and un-approving reviews, and rebuilding what shows them.
#
# Shared by the admin and MCP so the moderation rule cannot apply in one and
# not the other: only approved reviews ever reach `CommercePrefetcher`, and a
# review that changes state must rebuild every page that lists reviews —
# otherwise a merchant approves something and the static storefront keeps
# serving the version without it.
module ReviewModeration
  class Invalid < StandardError; end

  # Loops naming this source are what make a page depend on reviews.
  SOURCE = "reviews".freeze

  module_function

  def create!(params)
    review = Review.new(
      author_name: params["authorName"].to_s.strip,
      body: params["body"].to_s.strip,
      rating: Integer(params.fetch("rating", 5), exception: false) || 5,
      created_at: Time.now, updated_at: Time.now,
    )

    # A review is only "verified" because it is attached to a real order —
    # the badge is a fact about the data, never a flag a caller may set.
    if (order_id = params["orderId"])
      order = Order[order_id.to_i] || raise(Invalid, "No order #{order_id}")
      review.order_id = order.id
      review.customer_id = order.respond_to?(:customer_id) ? order.customer_id : nil
    end

    if (slug = params["productSlug"].to_s) && !slug.empty?
      product = Product.first(slug: slug) || raise(Invalid, "No product with slug #{slug.inspect}")
      review.product_id = product.id
    end

    review.save
    review
  rescue Sequel::ValidationFailed => e
    raise Invalid, e.message
  end

  def approve!(review)
    review.approve!
    rebake!
    review
  end

  def unapprove!(review)
    review.unapprove!
    # Rebuilt for the same reason as approving: the page is a static file and
    # would otherwise keep showing text that is no longer approved.
    rebake!
    review
  end

  def destroy!(review)
    was_approved = review.approved?
    review.destroy
    rebake! if was_approved
    review
  end

  # Every published page whose loop source is `reviews`. Indexed at bake
  # (`page_sources`); backfilled from documents if this store has not
  # published since the index existed.
  def dependent_paths
    RebuildIndex.targets_for_reviews
  end

  def rebake!
    paths = dependent_paths
    return 0 if paths.empty?

    PartialBake.call(paths: paths).page_count
  rescue StandardError => e
    # A failed rebake must not lose the moderation decision — the row is
    # already saved, and the merchant can publish to catch up.
    warn "[reviews] rebake failed: #{e.class}: #{e.message}"
    0
  end
end
