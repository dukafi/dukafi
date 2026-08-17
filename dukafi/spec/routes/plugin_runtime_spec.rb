require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

class PluginRuntimeSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Dukafi.app

  def setup
    PluginLog.dataset.delete
    OrderItem.dataset.delete
    Order.dataset.delete
    FormSubmission.dataset.delete
    CollectionProduct.dataset.delete
    Variant.dataset.delete
    Collection.dataset.delete
    Product.dataset.delete
    PluginRecord.where(plugin_id: "probe").delete
  end

  def json_post(path, payload)
    post path, JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  def parsed
    JSON.parse(last_response.body)
  end

  def test_the_lab_page_is_at_plugins_probe
    get "/plugins/probe"

    assert_equal 200, last_response.status
    assert_includes last_response.content_type, "text/html"
    assert_includes last_response.body, "Plugin lab"
  end

  def test_a_form_submit_is_stored_and_mail_is_logged_not_sent
    json_post "/plugins/probe/forms", { "email" => "ada@example.test", "message" => "3pm" }

    assert_equal 200, last_response.status, last_response.body
    assert parsed.fetch("ok")
    assert_equal 1, FormSubmission.where(form_id: "probe-lab").count
    mail = PluginLog.where(plugin_id: "probe", kind: "mail").last
    assert mail, "form.submitted should log a would-be email"
    assert_includes mail.message, "Would email"
  end

  def test_a_halted_form_is_not_stored
    json_post "/plugins/probe/forms", { "email" => "halt@example.test", "message" => "no" }

    assert_equal 422, last_response.status
    assert_equal 0, FormSubmission.where(form_id: "probe-lab").count
  end

  def test_quote_returns_the_deposit_not_the_monthly_preview
    json_post "/plugins/probe/quote", {
      "price_cents" => 2_500_000, "deposit_cents" => 500_000, "term_months" => 36, "currency" => "KES",
    }

    assert_equal 200, last_response.status, last_response.body
    quote = parsed.fetch("quote")
    assert_equal 500_000, quote.fetch("amount_cents")
    assert_equal 55_556, quote.fetch("monthly_cents")
  end

  def test_charge_opens_an_order_and_logs_instead_of_starting_a_rail
    json_post "/plugins/probe/charge", {
      "subject" => "preset", "preset_cents" => 2_000, "email" => "buyer@example.test", "currency" => "KES",
    }

    assert_equal 200, last_response.status, last_response.body
    assert parsed.fetch("ok")
    assert_equal 2_000, parsed.fetch("amountCents")
    assert_equal 1, Order.count
    assert_equal 0, PaymentAttempt.count
    charge = PluginLog.where(plugin_id: "probe", kind: "charge").last
    assert charge
    assert_includes charge.message, "Would start"
  end

  def test_mark_paid_logs_instead_of_a_transaction_and_fires_order_paid
    json_post "/plugins/probe/charge", {
      "subject" => "preset", "preset_cents" => 2_000, "email" => "buyer@example.test",
      "currency" => "KES", "mark_paid" => "1",
    }

    assert_equal 200, last_response.status, last_response.body
    order = Order[parsed.fetch("orderId")]
    assert_equal "paid", order.status
    mail = PluginLog.where(plugin_id: "probe", kind: "mail").all.map(&:message).join("\n")
    assert_includes mail, "payment confirmation"
  end

  def test_a_claimed_quote_mismatch_is_refused
    json_post "/plugins/probe/charge", {
      "subject" => "quote", "claimed_cents" => 1,
      "price_cents" => 2_500_000, "deposit_cents" => 500_000, "term_months" => 36,
      "email" => "buyer@example.test", "currency" => "KES",
    }

    assert_equal 422, last_response.status
    assert_equal 0, Order.count
  end

  def test_an_inbound_webhook_is_logged
    json_post "/plugins/probe/webhooks/probe", { "event" => "calendar.slot", "id" => "slot-1" }

    assert_equal 200, last_response.status, last_response.body
    row = PluginLog.where(plugin_id: "probe", kind: "webhook").last
    assert_equal "slot-1", row.payload_data["id"]
  end

  def test_the_heartbeat_job_can_be_run_from_the_lab
    json_post "/plugins/probe/jobs/heartbeat", {}

    assert_equal 200, last_response.status, last_response.body
    assert parsed.fetch("ok")
    assert PluginLog.where(plugin_id: "probe", kind: "job").last
  end

  def test_logs_can_be_listed_and_cleared
    Dukafi::Plugins.find("probe").log("mail", "hello")
    get "/plugins/probe/logs"
    assert_equal 200, last_response.status
    assert parsed.fetch("logs").length >= 1

    json_post "/plugins/probe/logs/clear", {}
    assert parsed.fetch("ok")
    assert_equal 0, PluginLog.where(plugin_id: "probe").count
  end

  def test_an_unknown_plugin_path_is_a_plain_404
    get "/plugins/nope/webhooks/x"

    assert_equal 404, last_response.status
    refute_includes last_response.body, "nope"
  end

  def test_woo_import_writes_products_and_logs_the_fetch
    json_post "/plugins/probe/import/woo", { "useSample" => true }

    assert_equal 200, last_response.status, last_response.body
    assert parsed.fetch("ok")
    assert Product.first(slug: "canvas-tote")
    assert Collection.first(slug: "bags")
    assert PluginLog.where(plugin_id: "probe", kind: "import").all.any? { |row|
      row.message.include?("Would GET")
    }
  end

  def test_the_lab_page_mentions_woocommerce
    get "/plugins/probe"

    assert_includes last_response.body, "WooCommerce"
  end

  def test_extra_variant_fields_can_be_set_from_the_lab
    product = Product.create(title: "Axio", slug: "2018-toyota-axio", status: "active",
                             description_document: "")
    Variant.create(product_id: product.id, sku: "AXIO-001", title: "Default",
                   price_cents: 100, currency: "USD", stock: 1, position: 0)

    json_post "/plugins/probe/fields", {
      "slug" => "2018-toyota-axio", "variantSku" => "AXIO-001",
      "fields" => { "origin" => "Japan", "mileage" => 42_000 },
    }

    assert_equal 200, last_response.status, last_response.body
    assert_equal "Japan", parsed.fetch("fields").fetch("origin")
    stored = Variant.first(sku: "AXIO-001")
    assert_equal "Japan", CatalogueFields.hash_for(stored.fields, owner: :variant).fetch("origin")
  end
end
