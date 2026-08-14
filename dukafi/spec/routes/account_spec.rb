require_relative "../spec_helper"
require "rack/test"
require "rack/lint"
require_relative "../../app"

# The storefront account endpoints. Dukafi ships no login form — these are the
# verbs, and the merchant designs the page, exactly as with the cart. Wrapped
# in Rack::Lint because `rackup` runs it in development and Rack::Test does
# not: an invalid response passes every other spec and 500s on the first click.
class AccountSpec < Minitest::Test
  include Rack::Test::Methods

  def app
    Rack::Lint.new(Dukafi.app)
  end

  def setup
    OrderItem.dataset.delete
    Order.dataset.delete
    Customer.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    clear_cookies
    SiteState.create(site: JSON.generate({ "name" => "S", "settings" => {}, "styleRules" => {} }))
  end

  def trigger
    JSON.parse(last_response.headers.fetch("hx-trigger"))
  end

  # A merchant-authored sign-in box: a form region wrapping an error banner
  # and a form whose submit button carries the verb. Nothing in it is a Dukafi
  # component — that is the whole point of the design.
  def publish_login_page!
    document = {
      "id" => "account", "slug" => "account", "title" => "Account", "rootNodeId" => "body",
      "nodes" => {
        "body" => { "id" => "body", "moduleId" => "base.body", "children" => %w[region],
                    "props" => {}, "classIds" => [], "breakpointOverrides" => {} },
        "region" => { "id" => "region", "moduleId" => "base.container", "children" => %w[banner hello],
                      "props" => { "tag" => "div" }, "classIds" => [], "breakpointOverrides" => {},
                      "actions" => { "region" => "form" } },
        "banner" => { "id" => "banner", "moduleId" => "base.text", "children" => [], "classIds" => [],
                      "breakpointOverrides" => {}, "props" => { "text" => "x", "tag" => "p" },
                      "dynamicBindings" => { "text" => { "source" => "form", "field" => "error" } },
                      "visibleWhen" => { "source" => "form", "field" => "hasError", "operator" => "isTrue" } },
        "hello" => { "id" => "hello", "moduleId" => "base.text", "children" => [], "classIds" => [],
                     "breakpointOverrides" => {}, "props" => { "text" => "Hi {form.email}", "tag" => "p" },
                     "visibleWhen" => { "source" => "form", "field" => "signedIn", "operator" => "isTrue" } },
      },
    }
    json = JSON.generate(document)
    Page.create(slug: "account", title: "Account", kind: "page",
                status: "published", document: json, published_document: json)
  end

  def region_html
    get "/fragments/form/region", node: "region"
    last_response.body
  end

  def test_registering_signs_the_customer_in
    post "/fragments/account/register", email: "ada@example.com", password: "correct-horse", name: "Ada"

    assert_equal 204, last_response.status
    assert_includes trigger, "dukafi:account-updated"
    # Signed in: logging out afterwards is accepted for this session.
    post "/fragments/account/logout"
    assert_equal 204, last_response.status
  end

  def test_failures_announce_a_reason_as_an_event
    post "/fragments/account/register", email: "ada@example.com", password: "short"

    assert_equal 422, last_response.status
    assert_equal "Use at least 8 characters.",
                 trigger.fetch("dukafi:account-error").fetch("message")
  end

  def test_login_rejects_a_wrong_password_without_revealing_the_account_exists
    post "/fragments/account/register", email: "ada@example.com", password: "correct-horse"
    post "/fragments/account/logout"

    post "/fragments/account/login", email: "ada@example.com", password: "wrong"
    wrong = trigger.fetch("dukafi:account-error").fetch("message")
    assert_equal 401, last_response.status

    post "/fragments/account/login", email: "ghost@example.com", password: "correct-horse"
    unknown = trigger.fetch("dukafi:account-error").fetch("message")

    assert_equal wrong, unknown
  end

  def test_login_succeeds_with_the_right_password
    post "/fragments/account/register", email: "ada@example.com", password: "correct-horse"
    post "/fragments/account/logout"

    post "/fragments/account/login", email: "ada@example.com", password: "correct-horse"

    assert_equal 204, last_response.status
    assert_includes trigger, "dukafi:account-updated"
  end

  # ── The form region ─────────────────────────────────────────────────────

  # The chain the whole design turns on: a rejected POST cannot deliver the
  # merchant's error markup itself, because htmx throws away 4xx bodies. So it
  # parks the reason, fires the event, and the region renders the banner.
  def test_a_rejected_sign_in_shows_up_in_the_merchants_own_error_banner
    publish_login_page!

    post "/fragments/account/login", email: "ghost@example.com", password: "nope", node: "region"

    assert_equal 401, last_response.status
    assert_includes region_html, "<p>Email or password is incorrect.</p>"
  end

  # A complaint that outlived its render would reappear on the next page load,
  # about something the visitor already fixed.
  def test_the_error_is_shown_once_and_then_gone
    publish_login_page!
    post "/fragments/account/login", email: "ghost@example.com", password: "nope", node: "region"

    assert_includes region_html, "incorrect"
    refute_includes region_html, "incorrect"
  end

  def test_the_region_reports_who_is_signed_in
    publish_login_page!
    post "/fragments/account/register",
         email: "ada@example.com", password: "correct-horse", node: "region"

    assert_includes region_html, "Hi ada@example.com"
  end

  def test_the_region_shows_neither_error_nor_greeting_for_a_fresh_visitor
    publish_login_page!

    html = region_html
    refute_includes html, "<p>"
  end

  # Two forms on one page must not steal each other's outcome — which is why
  # the flash is keyed by region node id rather than being a single slot.
  def test_an_error_belongs_only_to_the_region_that_produced_it
    publish_login_page!
    post "/fragments/account/login", email: "ghost@example.com", password: "nope", node: "other-region"

    refute_includes region_html, "incorrect"
  end

  # The node id arrives from the query string, so the published-document scan
  # for the region marker is the security boundary.
  def test_an_unmarked_node_is_not_a_form_region
    publish_login_page!

    get "/fragments/form/region", node: "banner"

    assert_equal 404, last_response.status
  end

  # The customer session must never be confusable with the admin's.
  def test_signing_in_as_a_customer_grants_no_admin_access
    post "/fragments/account/register", email: "ada@example.com", password: "correct-horse"

    get "/admin/api/cms/me"

    assert_equal 401, last_response.status
  end
end
