# Orders, for an external agent.
#
# Status is the only write. Refunds, capture, and payment providers stay
# out of MCP — those are checkout concerns, not a page-building harness.
module McpOrderTools
  MAX_LIMIT = 100
  DEFAULT_LIMIT = 25

  module_function

  def all
    [list_orders, read_order, update_order_status]
  end

  READ_TOOLS = %w[list_orders read_order].freeze

  def summary(order)
    {
      "id" => order.id,
      "reference" => order.public_token.to_s,
      "status" => order.status.to_s,
      "email" => order.email.to_s,
      "phone" => order.phone.to_s,
      "currency" => order.currency.to_s,
      "totalCents" => order.total_cents,
      "placedAt" => order.created_at&.utc&.iso8601,
      "customerId" => order.customer_id,
    }
  end

  def detail(order)
    summary(order).merge(
      "subtotalCents" => order.subtotal_cents,
      "discountCents" => order.discount_cents,
      "shippingCents" => order.shipping_cents,
      "discountCode" => order.discount_code.to_s,
      "lines" => order.order_items.map { |item|
        {
          "title" => item.product_title.to_s,
          "variantTitle" => item.variant_title.to_s,
          "sku" => item.sku.to_s,
          "quantity" => item.quantity,
          "unitPriceCents" => item.unit_price_cents,
        }
      },
    )
  end

  def find!(id)
    Order[id.to_i] ||
      raise(McpTools::ArgumentError, "No order #{id}. Call list_orders to see what exists.")
  end

  def clamp_limit(value, default)
    raw = value.to_i
    raw = default if raw <= 0
    [raw, MAX_LIMIT].min
  end

  def list_orders
    {
      name: "list_orders",
      title: "List orders",
      description: "Orders in this store, newest first. Filter by status. " \
                   "There is no store id argument; the token selects this store.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "status" => {
            "type" => "string",
            "enum" => %w[any] + Order::STATUSES,
            "description" => "any (default) or a single status.",
          },
          "limit" => { "type" => "integer", "minimum" => 1, "maximum" => MAX_LIMIT },
        },
        "additionalProperties" => false,
      },
      run: ->(args) {
        status = args["status"].to_s.strip
        status = "any" if status.empty?
        unless (["any"] + Order::STATUSES).include?(status)
          raise McpTools::ArgumentError, "status must be any or #{Order::STATUSES.join(', ')}."
        end
        ds = Order.order(Sequel.desc(:created_at), Sequel.desc(:id))
        ds = ds.where(status: status) unless status == "any"
        limit = clamp_limit(args["limit"], DEFAULT_LIMIT)
        { "orders" => ds.limit(limit).all.map { |order| summary(order) }, "total" => ds.count }
      },
    }
  end

  def read_order
    {
      name: "read_order",
      title: "Read an order",
      description: "One order with line items. Identify it by id from list_orders.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "id" => { "type" => "integer", "description" => "Order id from list_orders." },
        },
        "required" => %w[id],
        "additionalProperties" => false,
      },
      run: ->(args) { detail(find!(args["id"])) },
    }
  end

  def update_order_status
    {
      name: "update_order_status",
      title: "Update order status",
      description: "Set an order's fulfilment status. Does not capture, " \
                   "refund, or talk to a payment provider.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "id" => { "type" => "integer" },
          "status" => { "type" => "string", "enum" => Order::STATUSES },
        },
        "required" => %w[id status],
        "additionalProperties" => false,
      },
      run: ->(args) {
        status = args["status"].to_s.strip
        unless Order::STATUSES.include?(status)
          raise McpTools::ArgumentError, "status must be #{Order::STATUSES.join(', ')}."
        end
        order = find!(args["id"])
        order.update(status: status, updated_at: Time.now)
        detail(order)
      },
    }
  end
end
