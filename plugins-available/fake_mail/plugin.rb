module FakeMail
  module Provider
    module_function
    def deliver(message:, config:)
      plugin = Dukafi::Plugins.find("fake_mail")
      key = "messages"
      storage = plugin.storage.collection("outbox")
      messages = storage.get(key) || []
      messages.unshift({ "to" => message.to, "subject" => message.subject, "text" => message.text,
                         "html" => message.html, "createdAt" => Time.now.utc.iso8601 })
      storage.put(key, messages.first(20))
      Mailer::DeliveryResult.new(ok: true, provider_id: "fake_mail", error: nil)
    end
  end
end

unless %w[production staging].include?(ENV["RACK_ENV"].to_s.downcase)
  Dukafi::Plugins.register("fake_mail") do |p|
    p.name "Fake mail (testing)"
    p.version "1.0.0"
    p.mail_provider "fake_mail", FakeMail::Provider, label: "Fake mail"
    p.page "outbox", title: "Outbox", description: "The last messages delivered in development." do |page|
      page.table "messages", label: "Messages", columns: [
        { key: "to", label: "To" }, { key: "subject", label: "Subject" },
        { key: "created-at", label: "Created" },
      ], empty: "No messages yet."
      page.rows("messages") do |_ctx|
        rows = p.storage.collection("outbox").get("messages") || []
        { "rows" => rows.map { |row| row.merge("created-at" => row["createdAt"]) }, "total" => rows.length }
      end
    end
  end
end
