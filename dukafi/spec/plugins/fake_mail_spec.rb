require_relative "../spec_helper"

class FakeMailSpec < Minitest::Test
  def setup
    PluginSetting.dataset.delete
    PluginStorage.new("fake_mail").collection("outbox").put("messages", [])
  end

  def test_delivery_persists_the_outbox
    message = Mailer::Message.new(to: "buyer@example.com", subject: "Order", text: "thanks",
                                   html: "<p>thanks</p>", reply_to: nil)
    result = FakeMail::Provider.deliver(message: message, config: {})
    assert result.ok
    rows = Dukafi::Plugins.find("fake_mail").storage.collection("outbox").get("messages")
    assert_equal "buyer@example.com", rows.first.fetch("to")
  end

  def test_dashboard_page_rows_include_the_outbox
    FakeMail::Provider.deliver(
      message: Mailer::Message.new(to: "a@example.com", subject: "One", text: "t", html: "<p>t</p>", reply_to: nil),
      config: {}
    )
    plugin = Dukafi::Plugins.find("fake_mail")
    page = plugin.pages.find { |entry| entry.id == "outbox" }
    payload = page.table_handlers.fetch("messages").call({})
    assert_equal 1, payload.fetch("total")
    assert_equal "a@example.com", payload.fetch("rows").first.fetch("to")
  end
end
