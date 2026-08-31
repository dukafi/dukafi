require_relative "../spec_helper"
require_relative "../../app"

class McpOrdersSpec < Minitest::Test
  def setup
    OrderItem.dataset.delete
    Order.dataset.delete
    Customer.dataset.delete
  end

  def tool(name) = McpTools.all.find { |entry| entry.fetch(:name) == name }.fetch(:run)
  def call(name, args = {}) = tool(name).call(args)

  def an_order(status: "paid", email: "buyer@example.com")
    Order.create(
      email: email, status: status, currency: "KES",
      subtotal_cents: 1000, discount_cents: 0, shipping_cents: 0, total_cents: 1000,
      public_token: SecureRandom.hex(8), created_at: Time.now, updated_at: Time.now
    )
  end

  def test_lists_orders_newest_first
    older = an_order(email: "old@example.com")
    older.update(created_at: Time.now - 60)
    newer = an_order(email: "new@example.com")

    payload = call("list_orders")

    assert_equal 2, payload.fetch("total")
    assert_equal [newer.id, older.id], payload.fetch("orders").map { |row| row.fetch("id") }
  end

  def test_filters_by_status
    an_order(status: "pending")
    an_order(status: "paid")

    payload = call("list_orders", { "status" => "pending" })

    assert_equal 1, payload.fetch("total")
    assert_equal "pending", payload.fetch("orders").first.fetch("status")
  end

  def test_reads_one_order
    order = an_order

    payload = call("read_order", { "id" => order.id })

    assert_equal order.id, payload.fetch("id")
    assert_equal "KES", payload.fetch("currency")
    assert payload.key?("lines")
  end

  def test_updates_status_without_touching_payment
    order = an_order(status: "paid")

    payload = call("update_order_status", { "id" => order.id, "status" => "fulfilled" })

    assert_equal "fulfilled", payload.fetch("status")
    assert_equal "fulfilled", Order[order.id].status
  end

  def test_refuses_an_unknown_status
    order = an_order
    error = assert_raises(McpTools::ArgumentError) {
      call("update_order_status", { "id" => order.id, "status" => "teleported" })
    }
    assert_match(/status/, error.message)
  end

  def test_read_split
    refute McpTools.write_tool?("list_orders")
    refute McpTools.write_tool?("read_order")
    assert McpTools.write_tool?("update_order_status")
  end
end
