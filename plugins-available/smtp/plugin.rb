require "net/smtp"

module DukafiSmtp
  module Provider
    module_function
    def deliver(message:, config:)
      from = config.fetch(:from).to_s
      body = ["From: #{from}", "To: #{message.to}", "Subject: #{message.subject}",
              "MIME-Version: 1.0", "Content-Type: text/html; charset=UTF-8", "", message.html].join("\r\n")
      smtp = Net::SMTP.new(config.fetch(:host), Integer(config.fetch(:port, 587)))
      smtp.open_timeout = 15
      smtp.read_timeout = 15
      smtp.enable_starttls_auto
      smtp.start(Socket.gethostname, config[:username], config[:password], :login) do |session|
        session.send_message(body, from[/<([^>]+)>/, 1] || from, message.to)
      end
      Mailer::DeliveryResult.new(ok: true, provider_id: "smtp", error: nil)
    rescue StandardError => error
      Mailer::DeliveryResult.new(ok: false, provider_id: "smtp", error: error.message)
    end
  end
end

Dukafi::Plugins.register("smtp") do |p|
  p.name "SMTP email"
  p.version "1.0.0"
  p.setting :host, label: "SMTP host"
  p.integer :port, label: "Port"
  p.setting :username, label: "Username"
  p.secret :password, label: "Password"
  p.setting :from, label: "From address"
  p.mail_provider "smtp", DukafiSmtp::Provider, label: "SMTP"
end
