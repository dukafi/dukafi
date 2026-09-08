require_relative "../spec_helper"

class MailerSpec < Minitest::Test
  def setup
    MailLog.dataset.delete
    PluginSetting.dataset.delete
    OrderItem.dataset.delete
    Order.dataset.delete
    @order = Order.create(email: "buyer@example.com", status: "paid", currency: "KES",
                           subtotal_cents: 1000, discount_cents: 0, shipping_cents: 0, total_cents: 1000,
                           created_at: Time.now, updated_at: Time.now)
    OrderItem.create(order_id: @order.id, sku: "BAG", product_title: "Bag", variant_title: "Default",
                     quantity: 1, unit_price_cents: 1000, created_at: Time.now)
  end

  def configure_fake_mail!
    # fake_mail has no settings, so configured? is already true when the plugin is loaded.
  end

  def test_configured_delivery_is_logged
    configure_fake_mail!
    result = Mailer.deliver(:order_confirmation, order: @order)
    assert result.ok
    log = MailLog.last
    assert_equal true, log.ok
    assert_equal "order_confirmation", log.template
  end

  def test_unconfigured_delivery_is_skipped_and_logged
    Dukafi::Plugins.stub :configured_mail_providers, [] do
      result = Mailer.deliver(:order_confirmation, order: @order)
      refute result.ok
      assert_includes result.error, "No mail provider"
    end
    assert_equal false, MailLog.last.ok
  end

  def test_provider_failure_does_not_raise
    boom = Class.new do
      def self.deliver(**)
        raise "smtp down"
      end
    end
    Dukafi::Plugins.stub :configured_mail_providers, [{ "slug" => "smtp", "pluginId" => "smtp", "provider" => boom }] do
      result = Mailer.deliver(:order_confirmation, order: @order)
      refute result.ok
    end
    assert_equal false, MailLog.last.ok
  end

  def test_order_paid_failure_is_isolated
    boom = Class.new do
      def self.deliver(**)
        raise "smtp down"
      end
    end
    Dukafi::Plugins.stub :configured_mail_providers, [{ "slug" => "smtp", "pluginId" => "smtp", "provider" => boom }] do
      Dukafi::Plugins.emit(:"order.paid", @order)
    end
    @order.refresh
    assert_equal "paid", @order.status
  end
end
