require_relative "../spec_helper"
require "rack/test"
require "fileutils"
require "tmpdir"
require_relative "../../app"

# Pages only signed-in customers may see, and the order page checkout ends on.
#
# A gate is either total or it is decoration, so the cases below are mostly
# about the ways round it: asking for the private file directly, asking with a
# query string, following the redirect, and reaching for another customer's
# order. Each one has to fail closed.
class PageAccessSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Dukafi.app

  def setup
    PluginSetting.dataset.delete
    PaymentAttempt.dataset.delete
    OrderItem.dataset.delete
    Order.dataset.delete
    Customer.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    clear_cookies
    @output_root = Dir.mktmpdir("dukafi-access")
    # The storefront serves from `Paths.published_root`, so without pointing
    # that at the tmpdir these tests read the developer's real baked site —
    # which is how this suite first "passed" against the wrong checkout page.
    @previous_published_root = ENV["DUKAFY_PUBLISHED_ROOT"]
    ENV["DUKAFY_PUBLISHED_ROOT"] = @output_root
    # `site` is a hash the model serialises — handing it a JSON string makes
    # `state.site` a String and every renderer that digs into it blows up.
    @state = SiteState.create(site: {
      "name" => "Test", "settings" => { "language" => "en", "framework" => { "colors" => { "tokens" => [] } } },
    }, publish_version: 0)
  end

  def teardown
    if @previous_published_root
      ENV["DUKAFY_PUBLISHED_ROOT"] = @previous_published_root
    else
      ENV.delete("DUKAFY_PUBLISHED_ROOT")
    end
    FileUtils.remove_entry(@output_root) if @output_root && File.exist?(@output_root)
  end

  def node(id, module_id, children = [], props = {})
    { "id" => id, "moduleId" => module_id, "children" => children,
      "props" => props, "breakpointOverrides" => {}, "classIds" => [] }
  end

  def document(slug, text)
    {
      "id" => slug, "slug" => slug, "title" => slug,
      "rootNodeId" => "body",
      "nodes" => {
        "body" => node("body", "base.body", %w[copy]),
        "copy" => node("copy", "base.text", [], { "tag" => "p", "text" => text }),
      },
    }
  end

  def page!(slug, text, access: "public", auth_redirect: false, status: "published")
    json = JSON.generate(document(slug, text))
    page = Page.create(slug: slug, title: slug.capitalize, kind: "page", status: status,
                       access: access, document: json,
                       published_document: status == "published" ? json : nil)
    Page.mark_auth_redirect!(page) if auth_redirect
    page.refresh
  end

  def a_customer(email: "buyer@example.com")
    customer = Customer.create(email: email, name: "Buyer", created_at: Time.now, updated_at: Time.now)
    customer.update(password_digest: BCrypt::Password.create("correct-horse"))
    customer
  end

  def sign_in!(customer)
    post "/fragments/account/login", { email: customer.email, password: "correct-horse" }
    assert_equal 204, last_response.status, last_response.body
  end

  # ── The model's own rule ─────────────────────────────────────────────────

  # A gated sign-in page is a locked door with the key inside: you cannot sign
  # in without reaching it and cannot reach it without signing in.
  def test_the_sign_in_page_cannot_itself_require_sign_in
    page = page!("login", "Sign in")

    error = assert_raises(Sequel::ValidationFailed) do
      page.update(access: "customer", auth_redirect: true)
    end

    assert_includes error.message, "cannot be set on a page that itself requires sign-in"
  end

  # One destination, or a redirect would have to pick.
  def test_marking_a_sign_in_page_clears_the_previous_one
    first = page!("login", "Sign in", auth_redirect: true)
    second = page!("account", "Account")

    Page.mark_auth_redirect!(second)

    refute first.refresh.auth_redirect
    assert_equal "account", Page.sign_in_page.slug
  end

  # ── Baking ───────────────────────────────────────────────────────────────

  # The mechanism the whole feature rests on: the gated page's file is not
  # where a public request can name it.
  def test_a_gated_page_bakes_outside_the_public_tree
    page!("index", "Home")
    page!("checkout", "Card details here", access: "customer")

    Bake.call(state: @state, pages: Page.where(status: "published").all, output_root: @output_root)
    slot = File.join(@output_root, "current")

    assert File.file?(File.join(slot, "index.html"))
    refute File.file?(File.join(slot, "checkout.html")),
           "a gated page must not be written where a public URL can reach it"
    assert File.file?(File.join(slot, "private", "checkout.html"))
  end

  # ── The gate ─────────────────────────────────────────────────────────────

  def test_a_signed_out_visitor_is_redirected_to_the_sign_in_page
    page!("login", "Sign in", auth_redirect: true)
    page!("checkout", "Card details here", access: "customer")

    get "/checkout"

    assert_equal 302, last_response.status
    assert_equal "/login?next=%2Fcheckout", last_response.headers["location"]
    refute_includes last_response.body.to_s, "Card details here"
  end

  # Redirecting to a page that cannot sign anyone in would loop; serving the
  # gated page instead would defeat the point. So: neither.
  def test_a_gated_page_with_no_sign_in_page_configured_is_a_404
    page!("checkout", "Card details here", access: "customer")

    get "/checkout"

    assert_equal 404, last_response.status
    refute_includes last_response.body, "Card details here"
  end

  def test_a_signed_in_customer_sees_the_gated_page
    page!("login", "Sign in", auth_redirect: true)
    page!("checkout", "Card details here", access: "customer")
    sign_in!(a_customer)

    get "/checkout"

    assert_equal 200, last_response.status
    assert_includes last_response.body, "Card details here"
  end

  # The obvious way round: name the private file directly.
  def test_the_private_path_is_not_reachable_by_url
    page!("login", "Sign in", auth_redirect: true)
    page!("checkout", "Card details here", access: "customer")
    Bake.call(state: @state, pages: Page.where(status: "published").all, output_root: @output_root)

    get "/private/checkout"

    assert_equal 404, last_response.status
    refute_includes last_response.body, "Card details here"
  end

  # The disk shortcut runs before the page lookup for public pages, so a gated
  # page has to be recognised before it — including on a request with a query
  # string, which takes a different branch.
  def test_a_query_string_does_not_slip_past_the_gate
    page!("login", "Sign in", auth_redirect: true)
    page!("checkout", "Card details here", access: "customer")

    get "/checkout?utm_source=email"

    assert_equal 302, last_response.status
  end

  def test_a_gated_page_is_never_stored_in_a_shared_cache
    page!("login", "Sign in", auth_redirect: true)
    page!("checkout", "Card details here", access: "customer")
    sign_in!(a_customer)

    get "/checkout"

    assert_includes last_response.headers["Cache-Control"].to_s, "no-store"
    assert_includes last_response.headers["Cache-Control"].to_s, "private"
  end

  # ── The admin endpoints the settings dialog uses ─────────────────────────

  def admin!
    post "/admin/api/cms/setup",
         JSON.generate({ siteName: "Store", email: "owner@example.com", password: "correct-horse-battery" }),
         "CONTENT_TYPE" => "application/json"
    post "/admin/api/cms/login",
         JSON.generate({ email: "owner@example.com", password: "correct-horse-battery" }),
         "CONTENT_TYPE" => "application/json"
    assert_equal 200, last_response.status, last_response.body
  end

  def patch_access(page, payload)
    patch "/admin/api/cms/pages/#{page.id}/access", JSON.generate(payload),
          "CONTENT_TYPE" => "application/json"
  end

  def test_page_access_is_readable_and_writable_by_an_admin
    page = page!("checkout", "Card details here")
    admin!

    get "/admin/api/cms/pages/#{page.id}/access"
    assert_equal 200, last_response.status
    assert_equal "public", JSON.parse(last_response.body).fetch("access")

    patch_access(page, { access: "customer" })
    assert_equal 200, last_response.status
    assert_equal "customer", JSON.parse(last_response.body).fetch("access")
    assert page.refresh.gated?
  end

  # Who may see a page is not something an anonymous request gets to change.
  def test_changing_access_requires_an_admin
    page = page!("checkout", "Card details here", access: "customer")

    patch_access(page, { access: "public" })

    assert_equal 401, last_response.status
    assert page.refresh.gated?
  end

  # The same rule the model enforces, surfaced as a 422 rather than a 500.
  def test_the_endpoint_refuses_to_lock_everyone_out
    page = page!("login", "Sign in", access: "customer")
    admin!

    patch_access(page, { authRedirect: true })

    assert_equal 422, last_response.status
    assert_includes JSON.parse(last_response.body).dig("error", "message").to_s,
                    "cannot be set on a page that itself requires sign-in"
  end

  def test_an_unknown_access_level_is_refused
    page = page!("checkout", "Card details here")
    admin!

    patch_access(page, { access: "everyone-i-like" })

    assert_equal 422, last_response.status
    assert_equal "public", page.refresh.access
  end

  # ── Order pages ──────────────────────────────────────────────────────────

  # A provider has to be CONFIGURED to be offered — the template loops what
  # the store has rather than naming one, so with nothing set up there is
  # correctly no button.
  def configure_a_provider!
    settings = Dukafi::Plugins::Settings.for("payhero")
    settings[:api_token] = "token"
    settings[:channel_id] = "1"
    settings[:callback_base_url] = "https://example.test"
  end

  def publish_order_template!
    template = OrderTemplate.ensure!
    template.update(status: "published", published_document: template.document)
    template
  end

  def an_order(customer, title: "Blue Shirt", status: "pending")
    now = Time.now
    order = Order.create(customer_id: customer.id, email: customer.email, status: status,
                         currency: "KES", subtotal_cents: 100_000, discount_cents: 0,
                         shipping_cents: 0, total_cents: 100_000,
                         public_token: SecureRandom.urlsafe_base64(16),
                         created_at: now, updated_at: now)
    OrderItem.create(order_id: order.id, product_title: title, variant_title: "Default",
                     sku: "SKU-1", unit_price_cents: 100_000, quantity: 1, created_at: now)
    order
  end

  def test_a_customer_sees_their_own_order_page
    page!("login", "Sign in", auth_redirect: true)
    publish_order_template!
    customer = a_customer
    order = an_order(customer)
    sign_in!(customer)

    get "/orders/#{order.public_token}"

    assert_equal 200, last_response.status
    assert_includes last_response.body, "Order ##{order.id}"
    assert_includes last_response.body, "Blue Shirt"
    assert_includes last_response.body, "KES 1000.00"
  end

  # The token is not the whole permission — the session is.
  def test_another_customers_order_is_a_404_even_with_the_right_token
    page!("login", "Sign in", auth_redirect: true)
    publish_order_template!
    mine = a_customer(email: "mine@example.com")
    theirs = a_customer(email: "theirs@example.com")
    order = an_order(theirs, title: "Their Purchase")
    sign_in!(mine)

    get "/orders/#{order.public_token}"

    assert_equal 404, last_response.status
    refute_includes last_response.body, "Their Purchase"
  end

  def test_a_signed_out_visitor_is_sent_to_sign_in_rather_than_a_404
    page!("login", "Sign in", auth_redirect: true)
    publish_order_template!
    order = an_order(a_customer)

    get "/orders/#{order.public_token}"

    assert_equal 302, last_response.status
    assert_includes last_response.headers["location"], "/login?next="
  end

  # An unpaid order shows a pay button; a paid one must not — a payment prompt
  # for an order already settled is worse than no button at all.
  #
  # The label comes from the PLUGIN, so this asserts on what the configured
  # provider called itself rather than on a name baked into the template.
  def test_the_payment_form_appears_only_while_the_order_is_unpaid
    page!("login", "Sign in", auth_redirect: true)
    configure_a_provider!
    publish_order_template!
    customer = a_customer
    unpaid = an_order(customer)
    paid = an_order(customer, status: "paid")
    sign_in!(customer)

    get "/orders/#{unpaid.public_token}"
    assert_includes last_response.body, "Pay with M-Pesa"
    # And the button carries the provider from the entry, not from markup.
    assert_includes last_response.body, "payhero"

    get "/orders/#{paid.public_token}"
    refute_includes last_response.body, "Pay with M-Pesa"
  end

  # With no payment plugin set up, the page offers nothing rather than a
  # button that would be refused.
  def test_no_configured_provider_means_no_pay_button
    page!("login", "Sign in", auth_redirect: true)
    publish_order_template!
    customer = a_customer
    order = an_order(customer)
    sign_in!(customer)

    get "/orders/#{order.public_token}"

    assert_includes last_response.body, "Order ##{order.id}"
    refute_includes last_response.body, "Pay with"
  end

  # Visiting the order page is what tells the payment endpoint which order a
  # `payment.initiate` button is for — and it can only ever be set to an order
  # the session was just proven to own.
  def test_viewing_an_order_page_arms_the_payment_button_for_that_order
    page!("login", "Sign in", auth_redirect: true)
    publish_order_template!
    customer = a_customer
    order = an_order(customer)
    sign_in!(customer)

    get "/orders/#{order.public_token}"
    # No provider configured in this suite, so the attempt is refused — but by
    # the PROVIDER, which proves the order was found from the session alone.
    post "/fragments/payment/initiate", { provider: "payhero", node: "order-payment" }

    refute_includes last_response.body.to_s, "No order to pay for."
  end
  # ── Seeing that a payment went through ───────────────────────────────────

  # The failure this fixes: a real M-Pesa payment settled, the order was marked
  # paid, and the page said nothing — the customer had no way to know it had
  # worked. The receipt comes from the ORDER, not the payment region, so it
  # survives a reload: the region only knows about an attempt made in this page
  # view, and someone coming back tomorrow would otherwise see nothing.
  def test_a_paid_order_shows_its_receipt
    page!("login", "Sign in", auth_redirect: true)
    publish_order_template!
    customer = a_customer
    order = an_order(customer, status: "paid")
    PaymentAttempt.create(order_id: order.id, provider: "payhero", status: "succeeded",
                          amount_cents: 100_000, currency: "KES", reference: SecureRandom.hex(8),
                          provider_reference: "ws_CO_1", receipt: "UHG6S2VE07",
                          created_at: Time.now, updated_at: Time.now)
    sign_in!(customer)

    get "/orders/#{order.public_token}"

    assert_includes last_response.body, "Payment received"
    assert_includes last_response.body, "UHG6S2VE07"
    # And the pay form is gone — an M-Pesa prompt for a settled order is worse
    # than no button.
    refute_includes last_response.body, "Pay with M-Pesa"
  end

  # An unpaid order must not claim a receipt it does not have.
  def test_an_unpaid_order_shows_no_receipt
    page!("login", "Sign in", auth_redirect: true)
    configure_a_provider!
    publish_order_template!
    customer = a_customer
    order = an_order(customer)
    sign_in!(customer)

    get "/orders/#{order.public_token}"

    refute_includes last_response.body, "Payment received"
    # The payment area is there and payable; which methods it offers is up to
    # whatever plugins are configured.
    assert_includes last_response.body, 'data-dukafy-payment="order-payment"'
  end

  # A failed attempt leaves the order payable and carries the provider's own
  # words, which is what a merchant needs when a customer says they paid.
  def test_a_failed_attempt_is_recorded_without_marking_the_order_paid
    publish_order_template!
    customer = a_customer
    order = an_order(customer)
    PaymentAttempt.create(order_id: order.id, provider: "payhero", status: "failed",
                          amount_cents: 100_000, currency: "KES", reference: SecureRandom.hex(8),
                          error: "Invalid channel", created_at: Time.now, updated_at: Time.now)

    entry = OrderPayload.entry(order.refresh)

    assert_equal "", entry.fetch("paymentReceipt")
    assert_equal 1, entry.fetch("payments").length
    assert_equal "Invalid channel", entry.fetch("payments").first.fetch("error")
    assert entry.fetch("isAwaitingPayment")
  end

  # A retry after a success must not shadow the receipt that settled it.
  def test_the_settled_attempt_wins_over_a_later_failure
    customer = a_customer
    order = an_order(customer, status: "paid")
    PaymentAttempt.create(order_id: order.id, provider: "payhero", status: "succeeded",
                          amount_cents: 100_000, currency: "KES", reference: SecureRandom.hex(8),
                          receipt: "GOOD1", created_at: Time.now - 60, updated_at: Time.now - 60)
    PaymentAttempt.create(order_id: order.id, provider: "payhero", status: "failed",
                          amount_cents: 100_000, currency: "KES", reference: SecureRandom.hex(8),
                          created_at: Time.now, updated_at: Time.now)

    assert_equal "GOOD1", OrderPayload.entry(order.refresh).fetch("paymentReceipt")
  end

end
