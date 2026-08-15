require_relative "../spec_helper"
require_relative "../../app"

# Reviews — the source the homepage testimonials read.
#
# This is other people's words on a public page, so the property that matters
# most is the moderation gate: nothing an agent creates may reach the
# storefront without a second, deliberate approval.
#
# `verified` is a claim the store makes to its customers ("Verified Buyer"), so
# it is derived from a real order and is never settable.
class McpReviewsSpec < Minitest::Test
  def setup
    Review.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
  end

  def tool(name) = McpTools.all.find { |entry| entry.fetch(:name) == name }.fetch(:run)
  def call(name, args = {}) = tool(name).call(args)

  def refusal(name, args = {})
    call(name, args)
    flunk "expected a refusal"
  rescue McpTools::ArgumentError => e
    e.message
  end

  def a_review(**overrides)
    call("create_review", { "authorName" => "Sarah Mitchell", "rating" => 5,
                            "body" => "Arrived beautifully packaged." }.merge(overrides))
  end

  # ── The moderation gate ──────────────────────────────────────────────────

  def test_a_new_review_is_pending_and_invisible
    a_review

    assert_equal 0, CommercePrefetcher.call.fetch("reviews").length
  end

  def test_an_agent_cannot_publish_words_in_one_call
    outcome = a_review

    assert_equal "pending", outcome.fetch("status")
    assert_match(/approve_review/, outcome.fetch("note"))
  end

  def test_approving_puts_it_in_front_of_the_publisher
    review = a_review

    call("approve_review", { "id" => review.fetch("id") })

    entries = CommercePrefetcher.call.fetch("reviews")
    assert_equal 1, entries.length
    assert_equal "Arrived beautifully packaged.", entries.first.fetch("body")
  end

  # Taking something down must actually take it down, not merely flag it.
  def test_unapproving_removes_it_again
    review = a_review
    call("approve_review", { "id" => review.fetch("id") })

    call("unapprove_review", { "id" => review.fetch("id") })

    assert_equal 0, CommercePrefetcher.call.fetch("reviews").length
  end

  def test_deleting_removes_it_entirely
    review = a_review

    call("delete_review", { "id" => review.fetch("id") })

    assert_nil Review[review.fetch("id")]
  end

  # ── Verified is a fact, not a flag ───────────────────────────────────────

  # "Verified Buyer" is a claim to customers. A caller must not be able to
  # assert it — it follows from being attached to a real order.
  def test_verified_cannot_be_asserted_by_the_caller
    outcome = a_review

    refute outcome.fetch("verified")
    # The schema has no such property, so a caller cannot even name it.
    schema = McpTools.all.find { |t| t.fetch(:name) == "create_review" }.fetch(:input_schema)
    refute schema.fetch("properties").key?("verified")
  end

  def test_an_unattached_review_is_labelled_plainly
    review = a_review
    call("approve_review", { "id" => review.fetch("id") })

    entry = CommercePrefetcher.call.fetch("reviews").first
    assert_equal "Customer", entry.fetch("verifiedLabel")
    refute entry.fetch("verified")
  end

  def test_an_unknown_order_is_refused
    assert_match(/No order/, refusal("create_review", { "authorName" => "A", "body" => "B", "orderId" => 9999 }))
  end

  # ── Entry shape ──────────────────────────────────────────────────────────

  # The binding language has no loop-with-index, so stars are pre-rendered.
  def test_stars_are_rendered_for_the_page
    review = a_review("rating" => 3)
    call("approve_review", { "id" => review.fetch("id") })

    assert_equal "★★★☆☆", CommercePrefetcher.call.fetch("reviews").first.fetch("ratingStars")
  end

  # These field names are what an author types as `currentEntry.<field>`, so
  # renaming one silently empties every binding pointing at it.
  def test_the_entry_carries_the_fields_a_page_binds_to
    review = a_review
    call("approve_review", { "id" => review.fetch("id") })

    entry = CommercePrefetcher.call.fetch("reviews").first
    %w[body authorName rating ratingStars verified verifiedLabel date].each do |field|
      assert entry.key?(field), "reviews entry is missing #{field}"
    end
  end

  # ── Validation ───────────────────────────────────────────────────────────

  def test_a_review_needs_words_and_a_name
    assert_match(/authorName/, refusal("create_review", { "authorName" => " ", "body" => "x" }))
    assert_match(/body/, refusal("create_review", { "authorName" => "A", "body" => " " }))
  end

  def test_an_impossible_rating_is_refused
    assert_match(/rating/, refusal("create_review", { "authorName" => "A", "body" => "B", "rating" => 9 }))
  end

  def test_reviews_can_be_filtered_by_state
    approved = a_review
    call("approve_review", { "id" => approved.fetch("id") })
    a_review("authorName" => "Pending Person")

    assert_equal 1, call("list_reviews", { "status" => "approved" }).fetch("total")
    assert_equal 1, call("list_reviews", { "status" => "pending" }).fetch("total")
    assert_equal 1, call("list_reviews").fetch("pending")
  end

  # ── Which pages get rebuilt ──────────────────────────────────────────────

  # Reviews have no per-row dependency the way products do: a page either
  # lists reviews or it does not.
  def test_pages_listing_reviews_are_the_ones_rebuilt
    document = {
      "id" => "home", "slug" => "index", "title" => "Home", "rootNodeId" => "b",
      "nodes" => {
        "b" => { "id" => "b", "moduleId" => "base.body", "children" => ["loop"],
                 "props" => {}, "classIds" => [], "breakpointOverrides" => {} },
        "loop" => { "id" => "loop", "moduleId" => "store.relationship-loop", "children" => [],
                    "props" => { "source" => "reviews" }, "classIds" => [], "breakpointOverrides" => {} },
      },
    }
    Page.where(slug: "index").delete
    Page.create(slug: "index", title: "Home", kind: "page", status: "published",
                document: JSON.generate(document), published_document: JSON.generate(document))

    assert_includes ReviewModeration.dependent_paths, "/"
  end

  def test_a_page_without_a_reviews_loop_is_left_alone
    document = {
      "id" => "about", "slug" => "about", "title" => "About", "rootNodeId" => "b",
      "nodes" => { "b" => { "id" => "b", "moduleId" => "base.body", "children" => [],
                            "props" => {}, "classIds" => [], "breakpointOverrides" => {} } },
    }
    Page.where(slug: "about").delete
    Page.create(slug: "about", title: "About", kind: "page", status: "published",
                document: JSON.generate(document), published_document: JSON.generate(document))

    refute_includes ReviewModeration.dependent_paths, "/about"
  end

  # ── Scopes ───────────────────────────────────────────────────────────────

  def test_moderation_needs_the_write_scope
    %w[create_review approve_review unapprove_review delete_review].each do |name|
      assert McpTools.write_tool?(name), "#{name} must count as a write"
    end
    refute McpTools.write_tool?("list_reviews")
  end
end
