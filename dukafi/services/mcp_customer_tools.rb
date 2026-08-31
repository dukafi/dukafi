# Customers, for an external agent.
#
# A customer is the durable person an order hangs off — not an account.
# Reads only. Creating customers happens at checkout.
module McpCustomerTools
  MAX_LIMIT = 100
  DEFAULT_LIMIT = 25

  module_function

  def all
    [list_customers, read_customer]
  end

  READ_TOOLS = %w[list_customers read_customer].freeze

  def summary(customer)
    {
      "id" => customer.id,
      "email" => customer.email.to_s,
      "phone" => customer.phone.to_s,
      "name" => customer.name.to_s,
      "orderCount" => customer.orders.count,
    }
  end

  def detail(customer)
    orders = Order.where(customer_id: customer.id)
                  .order(Sequel.desc(:created_at), Sequel.desc(:id))
                  .limit(20)
                  .all
    summary(customer).merge(
      "orders" => orders.map { |order|
        {
          "id" => order.id,
          "status" => order.status.to_s,
          "totalCents" => order.total_cents,
          "currency" => order.currency.to_s,
          "placedAt" => order.created_at&.utc&.iso8601,
        }
      },
    )
  end

  def find!(id)
    Customer[id.to_i] ||
      raise(McpTools::ArgumentError, "No customer #{id}. Call list_customers to see what exists.")
  end

  def clamp_limit(value, default)
    raw = value.to_i
    raw = default if raw <= 0
    [raw, MAX_LIMIT].min
  end

  def list_customers
    {
      name: "list_customers",
      title: "List customers",
      description: "People who have ordered. Search by email, phone, or name. " \
                   "There is no store id argument; the token selects this store.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "q" => { "type" => "string", "description" => "Match email, phone, or name." },
          "limit" => { "type" => "integer", "minimum" => 1, "maximum" => MAX_LIMIT },
        },
        "additionalProperties" => false,
      },
      run: ->(args) {
        rows = Customer.order(Sequel.desc(:id)).all
        query = args["q"].to_s.strip.downcase
        unless query.empty?
          rows = rows.select { |row|
            [row.email, row.phone, row.name].any? { |value| value.to_s.downcase.include?(query) }
          }
        end
        limit = clamp_limit(args["limit"], DEFAULT_LIMIT)
        { "customers" => rows.first(limit).map { |row| summary(row) }, "total" => rows.length }
      },
    }
  end

  def read_customer
    {
      name: "read_customer",
      title: "Read a customer",
      description: "One customer and their recent orders.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "id" => { "type" => "integer", "description" => "Customer id from list_customers." },
        },
        "required" => %w[id],
        "additionalProperties" => false,
      },
      run: ->(args) { detail(find!(args["id"])) },
    }
  end
end
