require_relative "../spec_helper"
require_relative "../../app"

class McpCustomersSpec < Minitest::Test
  def setup
    Order.dataset.delete
    Customer.dataset.delete
  end

  def tool(name) = McpTools.all.find { |entry| entry.fetch(:name) == name }.fetch(:run)
  def call(name, args = {}) = tool(name).call(args)

  def a_customer(email:, name: "Buyer")
    Customer.create(email: email, name: name, created_at: Time.now, updated_at: Time.now)
  end

  def test_lists_customers
    a_customer(email: "one@example.com")
    a_customer(email: "two@example.com")

    payload = call("list_customers")

    assert_equal 2, payload.fetch("total")
  end

  def test_searches_by_email
    a_customer(email: "keep@example.com")
    a_customer(email: "find-me@shop.test")

    payload = call("list_customers", { "q" => "find-me" })

    assert_equal 1, payload.fetch("total")
    assert_equal "find-me@shop.test", payload.fetch("customers").first.fetch("email")
  end

  def test_reads_a_customer_and_their_orders
    customer = a_customer(email: "buyer@example.com", name: "Ada")
    Order.create(
      customer_id: customer.id, email: customer.email, status: "paid", currency: "KES",
      subtotal_cents: 500, discount_cents: 0, shipping_cents: 0, total_cents: 500,
      public_token: SecureRandom.hex(8), created_at: Time.now, updated_at: Time.now
    )

    payload = call("read_customer", { "id" => customer.id })

    assert_equal "Ada", payload.fetch("name")
    assert_equal 1, payload.fetch("orderCount")
    assert_equal 1, payload.fetch("orders").length
  end

  def test_reads_are_not_writes
    refute McpTools.write_tool?("list_customers")
    refute McpTools.write_tool?("read_customer")
  end
end
