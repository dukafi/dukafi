require "json"

# Discount codes, for an external agent.
#
# Unlike a review, a discount has no pending state: a code is live the moment
# it exists and anyone who knows it can type it into the cart. That is what
# `startsAt` is for — scheduling a code is the safe way to prepare one — and
# it is why the create tool says so in its own description rather than leaving
# a model to assume there is an approval step to come.
#
# Codes are addressed BY CODE, not by id. The code is the identity a merchant
# uses, it is unique, and it is what an agent will have been told ("turn off
# WEEKEND20"). Ids appear in the payload for reference only.
module McpDiscountTools
  MAX_LIMIT = 100
  DEFAULT_LIMIT = 25

  STATUSES = %w[any active scheduled expired exhausted].freeze

  module_function

  def all
    [list_discounts, create_discount, update_discount, delete_discount]
  end

  READ_TOOLS = %w[list_discounts].freeze

  # What a code is doing RIGHT NOW, in the same terms `DiscountLookup` decides
  # by — so a status here can never disagree with what a customer experiences
  # at the cart.
  def status_of(discount, now = Time.now)
    return "scheduled" if discount.starts_at && discount.starts_at > now
    return "expired" if discount.ends_at && discount.ends_at <= now
    if discount.usage_limit && discount.usage_count.to_i >= discount.usage_limit
      return "exhausted"
    end

    "active"
  end

  def payload(discount)
    base = {
      "id" => discount.id,
      "code" => discount.code,
      "kind" => discount.kind,
      "value" => discount.value,
      "status" => status_of(discount),
      "startsAt" => discount.starts_at&.utc&.iso8601,
      "endsAt" => discount.ends_at&.utc&.iso8601,
      "usageLimit" => discount.usage_limit,
      # What it covers. `kind` is derived from the rows, so it always matches
      # what a customer's cart will actually get discounted.
      "scope" => DiscountWrites.scope_of(discount),
    }
    # A fixed discount is an amount of money and means nothing without the
    # currency; a percentage is a percentage anywhere.
    base["currency"] = CommerceSettings.current.currency if discount.kind == "fixed"
    base.merge(DiscountWrites.performance(discount))
  end

  def find!(code)
    value = code.to_s.strip
    raise McpTools::ArgumentError, "code is required" if value.empty?

    Discount.first(code: value.upcase) ||
      raise(McpTools::ArgumentError,
            "No discount with the code #{value.upcase}. Call list_discounts to see what exists.")
  end

  def writing
    yield
  rescue DiscountWrites::Invalid => e
    raise McpTools::ArgumentError, e.message
  end

  def list_discounts
    {
      name: "list_discounts",
      title: "List discount codes",
      description: "Discount codes and what each one has done. `status` is " \
                   "how the code behaves right now: active (a customer can " \
                   "use it), scheduled (starts later), expired, or exhausted " \
                   "(hit its usage limit). `value` is a percentage when kind " \
                   "is percentage, and an amount in the smallest currency " \
                   "unit — cents — when kind is fixed. `scope` says what the " \
                   "code covers: the whole catalogue, or only the products " \
                   "and collections listed.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "status" => { "type" => "string", "enum" => STATUSES,
                        "description" => "Defaults to any." },
          "code" => { "type" => "string", "description" => "Look up one code." },
          "limit" => { "type" => "integer", "minimum" => 1, "maximum" => MAX_LIMIT },
        },
        "additionalProperties" => false,
      },
      run: lambda do |args|
        status = args.fetch("status", "any").to_s
        unless STATUSES.include?(status)
          raise McpTools::ArgumentError, "status must be one of: #{STATUSES.join(', ')}"
        end

        rows =
          if (code = args["code"].to_s) && !code.empty?
            [find!(code)]
          else
            Discount.order(Sequel.desc(:created_at)).all
          end

        # Filtered in Ruby rather than SQL: the statuses are a function of the
        # clock and the usage count together, and `status_of` is the one place
        # that decision is allowed to live.
        rows = rows.select { |row| status_of(row) == status } unless status == "any"
        limit = (Integer(args["limit"], exception: false) || DEFAULT_LIMIT).clamp(1, MAX_LIMIT)

        {
          "discounts" => rows.first(limit).map { |row| payload(row) },
          "total" => rows.length,
          "currency" => CommerceSettings.current.currency,
        }
      end,
    }
  end

  def create_discount
    {
      name: "create_discount",
      title: "Create a discount code",
      description: "Create a discount code. It is LIVE IMMEDIATELY unless you " \
                   "pass startsAt — there is no draft or approval step, and " \
                   "any customer who learns the code can use it. Pass " \
                   "usageLimit to cap how many orders can redeem it, and " \
                   "endsAt to make it stop on its own. kind=percentage takes " \
                   "value 1–100; kind=fixed takes an amount in cents of the " \
                   "store currency. By default it covers the WHOLE catalogue; " \
                   "pass productSlugs and/or collectionSlugs to limit it, and " \
                   "then only the matching lines of a cart are discounted.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "code" => { "type" => "string",
                      "description" => "Letters, numbers, hyphens and underscores. Stored uppercased." },
          "kind" => { "type" => "string", "enum" => Discount::KINDS },
          "value" => { "type" => "integer", "minimum" => 1,
                       "description" => "1–100 for percentage; cents for fixed." },
          "startsAt" => { "type" => "string",
                          "description" => "ISO 8601. Defaults to now, which means the code works immediately." },
          "endsAt" => { "type" => "string", "description" => "ISO 8601. Omit for no end." },
          "usageLimit" => { "type" => "integer", "minimum" => 1,
                            "description" => "Total redemptions allowed. Omit for unlimited." },
          "productSlugs" => { "type" => "array", "items" => { "type" => "string" },
                              "description" => "Limit the code to these products. Omit for the whole catalogue." },
          "collectionSlugs" => { "type" => "array", "items" => { "type" => "string" },
                                 "description" => "Limit the code to everything in these collections. " \
                                                  "Membership is resolved when the code is used, so " \
                                                  "products added later are covered too." },
        },
        "required" => %w[code kind value], "additionalProperties" => false,
      },
      run: lambda do |args|
        discount = writing { DiscountWrites.create!(args) }
        note =
          if status_of(discount) == "scheduled"
            "Scheduled. It starts working at #{discount.starts_at&.utc&.iso8601}."
          else
            "Live now — any customer with this code can use it."
          end
        payload(discount).merge("note" => note)
      end,
    }
  end

  def update_discount
    {
      name: "update_discount",
      title: "Change a discount code",
      description: "Change a discount, addressed by its current code. Only " \
                   "the fields you pass change. Passing endsAt in the past is " \
                   "how you stop a code immediately while keeping it on " \
                   "record; pass usageLimit as null to make it unlimited " \
                   "again. Redemptions already made are never undone.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "code" => { "type" => "string", "description" => "The code to change." },
          "newCode" => { "type" => "string", "description" => "Rename it. Past orders keep the old code." },
          "kind" => { "type" => "string", "enum" => Discount::KINDS },
          "value" => { "type" => "integer", "minimum" => 1 },
          "startsAt" => { "type" => "string" },
          "endsAt" => { "type" => %w[string null] },
          "usageLimit" => { "type" => %w[integer null] },
          "productSlugs" => { "type" => "array", "items" => { "type" => "string" },
                              "description" => "Replaces the product scope. Pass [] to widen the code " \
                                               "back to the whole catalogue." },
          "collectionSlugs" => { "type" => "array", "items" => { "type" => "string" },
                                 "description" => "Replaces the collection scope. Pass [] to clear it." },
        },
        "required" => ["code"], "additionalProperties" => false,
      },
      run: lambda do |args|
        discount = find!(args["code"])
        # `newCode` rather than overloading `code`, which already names the
        # row being changed — one key cannot mean both "which" and "what to".
        params = args.dup
        params["code"] = params.delete("newCode") if params.key?("newCode")

        payload(writing { DiscountWrites.update!(discount, params) })
      end,
    }
  end

  def delete_discount
    {
      name: "delete_discount",
      title: "Delete a discount code",
      description: "Remove a discount code. A code that has NEVER been " \
                   "redeemed is deleted outright. One that has been redeemed " \
                   "is ended instead of deleted — it stops working " \
                   "immediately, but past orders record the code they were " \
                   "charged under and must keep pointing at something real. " \
                   "The result says which happened.",
      input_schema: {
        "type" => "object",
        "properties" => { "code" => { "type" => "string" } },
        "required" => ["code"], "additionalProperties" => false,
      },
      run: lambda do |args|
        discount = find!(args["code"])
        outcome = writing { DiscountWrites.destroy!(discount) }

        if outcome == :deleted
          { "deleted" => discount.code }
        else
          payload(discount).merge(
            "deleted" => false,
            "note" => "Kept and ended, because #{discount.usage_count} order(s) " \
                      "were placed with it. It no longer works.",
          )
        end
      end,
    }
  end
end
