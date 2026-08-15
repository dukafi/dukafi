require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

# A customer's own order history on the storefront.
#
# Every other loop source is the same for everybody, so it can be written into
# a static file. This one is not, and the properties below are the ones that
# make that safe rather than merely intended:
#
#   · an orders loop must never BAKE any order into the file on disk;
#   · whose orders is decided by the session, so there is no parameter to
#     tamper with and no way to read someone else's;
#   · a signed-out visitor gets an empty list, not an error and not a leak.
class OrdersFragmentSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Dukafi.app

  def setup
    OrderItem.dataset.delete
    Order.dataset.delete
    Customer.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    clear_cookies
  end

  def node(id, module_id, children = [], props = {}, extra = {})
    { "id" => id, "moduleId" => module_id, "children" => children,
      "props" => props, "breakpointOverrides" => {}, "classIds" => [] }.merge(extra)
  end

  # A page whose body is an orders loop with one row template.
  def orders_document
    {
      # `id`/`slug`/`title` are required by the page schema — a document is
      # rejected without them.
      "id" => "account", "slug" => "account", "title" => "Account",
      "rootNodeId" => "body",
      "nodes" => {
        "body" => node("body", "base.body", %w[loop]),
        "loop" => node("loop", "store.relationship-loop", %w[row],
                       { "source" => "orders", "perPage" => 2 }),
        "row" => node("row", "base.container", %w[number total lines]),
        "number" => node("number", "base.text", [], { "tag" => "p", "text" => "{currentEntry.number}" }),
        "total" => node("total", "base.text", [], { "tag" => "p", "text" => "{currentEntry.totalDisplay}" }),
        "lines" => node("lines", "store.relationship-loop", %w[line],
                        { "source" => "currentEntry.lines", "perPage" => 10 }),
        "line" => node("line", "base.text", [], { "tag" => "span", "text" => "[{currentEntry.title} x{currentEntry.quantity}]" }),
      },
    }
  end

  def publish_orders_page!
    json = JSON.generate(orders_document)
    Page.create(slug: "account", title: "Account", kind: "page", status: "published",
                document: json, published_document: json)
  end

  def a_customer(email: "buyer@example.com")
    Customer.create(email: email, name: "Buyer", created_at: Time.now, updated_at: Time.now)
  end

  def an_order(customer, total_cents: 3_600, title: "Sample product", quantity: 2)
    now = Time.now
    order = Order.create(customer_id: customer.id, email: customer.email, status: "paid",
                         currency: "USD", subtotal_cents: total_cents, discount_cents: 0,
                         shipping_cents: 0, total_cents: total_cents,
                         public_token: SecureRandom.urlsafe_base64(16),
                         created_at: now, updated_at: now)
    OrderItem.create(order_id: order.id, product_title: title, variant_title: "Large",
                     sku: "SKU-1", unit_price_cents: total_cents / quantity,
                     quantity: quantity, created_at: now)
    order
  end

  # Through the real verb, so the test exercises the same session key the
  # storefront sets rather than one a helper invented.
  def sign_in!(customer)
    customer.update(password_digest: BCrypt::Password.create("correct-horse"))
    post "/fragments/account/login", { email: customer.email, password: "correct-horse" }
    assert_equal 204, last_response.status, last_response.body
  end

  # ── Baking ───────────────────────────────────────────────────────────────

  # The whole reason orders are a deferred loop. If this ever passes an order
  # into the bake, every visitor to the account page is served the last
  # customer's history from a file on disk.
  def test_an_orders_loop_bakes_as_a_placeholder_carrying_no_orders
    customer = a_customer
    an_order(customer, title: "Secret Purchase")

    html = Dukafi::Publisher::RenderPage.call(
      document: orders_document, registry: Dukafi::Publisher::REGISTRY,
      prefetched: CommercePrefetcher.call
    ).html

    assert_includes html, "dukafy-orders--loading"
    assert_includes html, "/fragments/orders/lines?node=loop"
    refute_includes html, "Secret Purchase"
    refute_includes html, "$36.00"
  end

  # It reloads when the customer signs in or out — not when a cart changes,
  # which has nothing to do with what they have already bought.
  def test_the_placeholder_refreshes_on_account_changes
    html = Dukafi::Publisher::RenderPage.call(
      document: orders_document, registry: Dukafi::Publisher::REGISTRY, prefetched: {}
    ).html

    assert_includes html, "dukafi:account-updated from:body"
    refute_includes html, "dukafi:cart-updated"
  end

  # ── The fragment ─────────────────────────────────────────────────────────

  def test_a_signed_out_visitor_sees_no_orders
    customer = a_customer
    an_order(customer, title: "Secret Purchase")
    publish_orders_page!

    get "/fragments/orders/lines?node=loop"

    assert_equal 200, last_response.status
    refute_includes last_response.body, "Secret Purchase"
  end

  def test_a_signed_in_customer_sees_their_own_orders_and_lines
    customer = a_customer
    an_order(customer, title: "Blue Shirt")
    publish_orders_page!
    sign_in!(customer)

    get "/fragments/orders/lines?node=loop"

    assert_equal 200, last_response.status
    assert_includes last_response.body, "Blue Shirt"
    # The nested lines loop resolved too — that is what the detail sheet is
    # built out of.
    assert_includes last_response.body, "[Blue Shirt x2]"
  end

  # The property that matters most: one session, one history.
  def test_a_customer_never_sees_another_customers_orders
    mine = a_customer(email: "mine@example.com")
    theirs = a_customer(email: "theirs@example.com")
    an_order(mine, title: "My Purchase")
    an_order(theirs, title: "Their Purchase")
    publish_orders_page!
    sign_in!(mine)

    get "/fragments/orders/lines?node=loop"

    assert_includes last_response.body, "My Purchase"
    refute_includes last_response.body, "Their Purchase"
  end

  # There is no customer parameter, so this is really a check that one cannot
  # be smuggled in: the response must be identical either way.
  def test_a_customer_id_in_the_query_string_changes_nothing
    mine = a_customer(email: "mine@example.com")
    theirs = a_customer(email: "theirs@example.com")
    an_order(mine, title: "My Purchase")
    an_order(theirs, title: "Their Purchase")
    publish_orders_page!
    sign_in!(mine)

    get "/fragments/orders/lines?node=loop&customer_id=#{theirs.id}&customer=#{theirs.id}"

    refute_includes last_response.body, "Their Purchase"
  end

  # A shared proxy holding one customer's order list and serving it to the
  # next visitor is exactly what this header exists to prevent.
  def test_the_response_is_never_cached
    publish_orders_page!

    get "/fragments/orders/lines?node=loop"

    assert_includes last_response.headers["Cache-Control"].to_s, "no-store"
    assert_includes last_response.headers["Cache-Control"].to_s, "private"
  end

  # Same boundary as the cart loop: the node id must name an orders loop on a
  # PUBLISHED page, so the endpoint cannot be aimed at arbitrary markup.
  def test_an_unknown_node_renders_nothing
    publish_orders_page!

    get "/fragments/orders/lines?node=not-a-real-node"

    assert_equal 404, last_response.status
  end

  # ── Pagination ───────────────────────────────────────────────────────────

  # Paging happens inside the fragment: an `?page=2` link would reload the
  # static file and the placeholder would fetch page 1 again.
  def test_paging_is_driven_by_the_fragment_not_a_page_reload
    customer = a_customer
    3.times { |index| an_order(customer, title: "Order #{index}") }
    publish_orders_page!
    sign_in!(customer)

    get "/fragments/orders/lines?node=loop"

    assert_includes last_response.body, "Page 1 of 2"
    assert_includes last_response.body, "hx-get=\"/fragments/orders/lines?node=loop&amp;page=2\""
  end

  def test_asking_for_page_two_returns_the_second_page
    customer = a_customer
    3.times { |index| an_order(customer, title: "Order #{index}") }
    publish_orders_page!
    sign_in!(customer)

    get "/fragments/orders/lines?node=loop&page=2"

    assert_includes last_response.body, "Page 2 of 2"
  end
end
