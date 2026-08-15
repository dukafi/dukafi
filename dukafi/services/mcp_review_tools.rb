require "json"

# Customer reviews, for an external agent.
#
# Moderation is the whole point of the shape here. Reviews are text other
# people wrote, destined for a public page, so `create_review` produces a
# PENDING row and nothing else — an agent cannot publish words to the
# storefront in one call, and `approve_review` is a separate, deliberate act.
#
# `verified` is never settable. It is true when a review is attached to a real
# order and false otherwise, because "Verified Buyer" is a claim the store
# makes to its customers.
module McpReviewTools
  MAX_LIMIT = 100
  DEFAULT_LIMIT = 25

  module_function

  def all
    [list_reviews, create_review, approve_review, unapprove_review, delete_review]
  end

  READ_TOOLS = %w[list_reviews].freeze

  def payload(review)
    {
      "id" => review.id,
      "authorName" => review.author_name,
      "rating" => review.rating,
      "body" => review.body,
      "status" => review.approved? ? "approved" : "pending",
      "verified" => review.verified?,
      "productSlug" => review.product&.slug,
      "createdAt" => review.created_at&.utc&.iso8601,
    }
  end

  def find!(id)
    Review[id.to_i] ||
      raise(McpTools::ArgumentError,
            "No review #{id}. Call list_reviews to see what exists.")
  end

  def moderating
    yield
  rescue ReviewModeration::Invalid => e
    raise McpTools::ArgumentError, e.message
  end

  def list_reviews
    {
      name: "list_reviews",
      title: "List reviews",
      description: "Customer reviews. `pending` ones are waiting for approval " \
                   "and appear nowhere public; only approved reviews reach the " \
                   "storefront. `verified` means the review is attached to a " \
                   "real order.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "status" => { "type" => "string", "enum" => %w[any pending approved],
                        "description" => "Defaults to any." },
          "productSlug" => { "type" => "string", "description" => "Only reviews of one product." },
          "limit" => { "type" => "integer", "minimum" => 1, "maximum" => MAX_LIMIT },
        },
        "additionalProperties" => false,
      },
      run: lambda do |args|
        status = args.fetch("status", "any").to_s
        unless %w[any pending approved].include?(status)
          raise McpTools::ArgumentError, "status must be one of: any, pending, approved"
        end

        dataset = Review.newest_first
        dataset = dataset.approved if status == "approved"
        dataset = dataset.pending if status == "pending"
        if (slug = args["productSlug"].to_s) && !slug.empty?
          product = McpCommerceTools.find_product!(slug)
          dataset = dataset.where(product_id: product.id)
        end

        limit = (Integer(args["limit"], exception: false) || DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
        {
          "reviews" => dataset.limit(limit).map { |review| payload(review) },
          "total" => dataset.count,
          "pending" => Review.pending.count,
        }
      end,
    }
  end

  def create_review
    {
      name: "create_review",
      title: "Add a review",
      description: "Record a customer review. It is created PENDING and appears " \
                   "nowhere public until approve_review is called — writing " \
                   "someone else's words onto a live storefront should take two " \
                   "deliberate steps. Pass orderId to attach it to a real " \
                   "purchase, which is the only thing that makes it show as a " \
                   "verified buyer.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "authorName" => { "type" => "string" },
          "body" => { "type" => "string", "description" => "What the customer said." },
          "rating" => { "type" => "integer", "minimum" => 1, "maximum" => 5 },
          "productSlug" => { "type" => "string",
                             "description" => "Omit for a review of the store rather than one product." },
          "orderId" => { "type" => "integer", "description" => "Attaches it to a real purchase." },
        },
        "required" => %w[authorName body], "additionalProperties" => false,
      },
      run: lambda do |args|
        raise McpTools::ArgumentError, "authorName is required" if args["authorName"].to_s.strip.empty?
        raise McpTools::ArgumentError, "body is required" if args["body"].to_s.strip.empty?

        review = moderating { ReviewModeration.create!(args) }
        payload(review).merge("note" => "Pending. Call approve_review to put it on the storefront.")
      end,
    }
  end

  def approve_review
    {
      name: "approve_review",
      title: "Approve a review",
      description: "Publish a review. It appears immediately on every page that " \
                   "lists reviews — those pages are rebuilt as part of this call, " \
                   "with no separate publish step. Read it first.",
      input_schema: {
        "type" => "object",
        "properties" => { "id" => { "type" => "integer" } },
        "required" => ["id"], "additionalProperties" => false,
      },
      run: lambda do |args|
        review = ReviewModeration.approve!(find!(args["id"]))
        payload(review).merge("note" => "Live on every page that lists reviews.")
      end,
    }
  end

  def unapprove_review
    {
      name: "unapprove_review",
      title: "Take a review down",
      description: "Remove a review from the storefront without deleting it. " \
                   "Pages listing reviews are rebuilt immediately.",
      input_schema: {
        "type" => "object",
        "properties" => { "id" => { "type" => "integer" } },
        "required" => ["id"], "additionalProperties" => false,
      },
      run: ->(args) { payload(ReviewModeration.unapprove!(find!(args["id"]))) },
    }
  end

  def delete_review
    {
      name: "delete_review",
      title: "Delete a review",
      description: "Permanently remove a review. To take one off the storefront " \
                   "while keeping it, use unapprove_review instead.",
      input_schema: {
        "type" => "object",
        "properties" => { "id" => { "type" => "integer" } },
        "required" => ["id"], "additionalProperties" => false,
      },
      run: lambda do |args|
        review = find!(args["id"])
        ReviewModeration.destroy!(review)
        { "deleted" => review.id, "authorName" => review.author_name }
      end,
    }
  end
end
