require_relative "../spec_helper"
require "rack/test"
require "rack/lint"
require_relative "../../app"

# Reading back what the site's forms caught.
#
# Submissions have been stored since the public forms route shipped, with no
# way to see them — which makes a contact form a black hole: the customer gets
# a thank-you and the merchant never learns they wrote.
class FormsAdminSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Rack::Lint.new(Dukafi.app)

  def setup
    FormSubmission.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    Admin.dataset.delete
    clear_cookies
  end

  def sign_in!
    post_json "/admin/api/cms/setup",
              siteName: "Store", email: "owner@example.com", password: "correct-horse-battery"
    post_json "/admin/api/cms/login", email: "owner@example.com", password: "correct-horse-battery"
  end

  def post_json(path, payload)
    post path, JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  def body = JSON.parse(last_response.body)

  def submit(form_id, fields, at: Time.now)
    FormSubmission.create(form_id: form_id, payload: JSON.generate(fields), created_at: at)
  end

  def test_listing_forms_requires_an_admin
    get "/admin/api/cms/forms"

    assert_equal 401, last_response.status
  end

  # Derived from submissions rather than from published documents, so a form
  # deleted from a page still shows what it caught while it existed.
  def test_lists_every_form_that_ever_received_something
    sign_in!
    submit("contact", { "name" => "Ada" })
    submit("contact", { "name" => "Grace" })
    submit("newsletter", { "email" => "a@example.com" })

    get "/admin/api/cms/forms"

    forms = body.fetch("forms")
    assert_equal 2, forms.length
    contact = forms.find { |form| form.fetch("id") == "contact" }
    assert_equal 2, contact.fetch("count")
    refute_nil contact.fetch("lastAt")
  end

  def test_the_busiest_recent_form_comes_first
    sign_in!
    submit("old", { "x" => 1 }, at: Time.now - 86_400)
    submit("fresh", { "x" => 1 })

    get "/admin/api/cms/forms"

    assert_equal "fresh", body.fetch("forms").first.fetch("id")
  end

  # The payload is schemaless — the merchant invented the field names — so it
  # comes back verbatim rather than mapped onto columns Dukafi chose.
  def test_returns_submissions_with_the_merchants_own_fields
    sign_in!
    submit("contact", { "name" => "Ada", "message" => "Hello there", "budget" => "500" })

    get "/admin/api/cms/forms/contact"

    submission = body.fetch("submissions").first
    assert_equal({ "name" => "Ada", "message" => "Hello there", "budget" => "500" },
                 submission.fetch("fields"))
    refute_nil submission.fetch("createdAt")
  end

  def test_newest_submission_first
    sign_in!
    submit("contact", { "who" => "first" }, at: Time.now - 60)
    submit("contact", { "who" => "second" })

    get "/admin/api/cms/forms/contact"

    assert_equal "second", body.fetch("submissions").first.fetch("fields").fetch("who")
  end

  def test_an_unknown_form_is_empty_rather_than_missing
    sign_in!

    get "/admin/api/cms/forms/never-existed"

    assert_equal 200, last_response.status
    assert_empty body.fetch("submissions")
  end

  # ── Paging ───────────────────────────────────────────────────────────────
  #
  # A busy contact form quietly loses its oldest messages behind a fixed limit,
  # and those are exactly the ones a merchant goes looking for.

  def test_reports_the_total_and_whether_more_remain
    sign_in!
    5.times { |i| submit("contact", { "n" => i }, at: Time.now - i) }

    get "/admin/api/cms/forms/contact?limit=2"

    assert_equal 5, body.fetch("total")
    assert_equal 2, body.fetch("submissions").length
    assert_equal true, body.fetch("hasMore")
  end

  def test_offset_walks_back_through_the_pages
    sign_in!
    5.times { |i| submit("contact", { "n" => i }, at: Time.now - i) }

    get "/admin/api/cms/forms/contact?limit=2&offset=2"

    # Newest first, so page two is the third and fourth most recent.
    assert_equal [2, 3], body.fetch("submissions").map { |row| row.fetch("fields").fetch("n") }
    assert_equal true, body.fetch("hasMore")
  end

  # A page that happens to be exactly `limit` long is not proof there is more.
  def test_the_last_exact_page_does_not_claim_more
    sign_in!
    4.times { |i| submit("contact", { "n" => i }, at: Time.now - i) }

    get "/admin/api/cms/forms/contact?limit=2&offset=2"

    assert_equal 2, body.fetch("submissions").length
    assert_equal false, body.fetch("hasMore")
  end

  # Two submissions in the same second must not swap places between pages, or
  # paging would show one twice and skip another.
  def test_paging_is_stable_when_timestamps_collide
    sign_in!
    same = Time.now
    4.times { |i| submit("contact", { "n" => i }, at: same) }

    first = (get("/admin/api/cms/forms/contact?limit=2"); body.fetch("submissions"))
    second = (get("/admin/api/cms/forms/contact?limit=2&offset=2"); body.fetch("submissions"))

    ids = (first + second).map { |row| row.fetch("id") }
    assert_equal ids.uniq.length, ids.length
  end

  def test_a_silly_limit_is_clamped_rather_than_obeyed
    sign_in!
    submit("contact", { "n" => 1 })

    get "/admin/api/cms/forms/contact?limit=99999&offset=-5"

    assert_equal 200, last_response.status
    assert_equal 1, body.fetch("submissions").length
  end

  # A spam submission should be removable without touching the database.
  def test_a_submission_can_be_deleted
    sign_in!
    submission = submit("contact", { "name" => "spam" })

    delete "/admin/api/cms/forms/contact/#{submission.id}"

    assert_equal 204, last_response.status
    assert_nil FormSubmission[submission.id]
  end

  def test_deleting_a_submission_that_is_gone_says_so
    sign_in!

    delete "/admin/api/cms/forms/contact/999999"

    assert_equal 404, last_response.status
  end
end
