class Mailer
  Message = Data.define(:to, :subject, :text, :html, :reply_to)
  DeliveryResult = Data.define(:ok, :provider_id, :error)

  def self.deliver(template, order:)
    recipient = order.email.to_s.strip
    return skipped(recipient, template, "No recipient email") if recipient.empty?
    entry = Dukafi::Plugins.configured_mail_providers.first
    return skipped(recipient, template, "No mail provider configured") unless entry
    rendered = MailTemplates.public_send(template, order)
    message = Message.new(to: recipient, subject: rendered.subject, text: rendered.text,
                          html: rendered.html, reply_to: nil)
    plugin = Dukafi::Plugins.find(entry.fetch("pluginId"))
    result = entry.fetch("provider").deliver(message: message, config: plugin.settings.to_h)
    ok = result.respond_to?(:ok) ? result.ok : !!result
    error = result.respond_to?(:error) ? result.error : nil
    MailLog.create(recipient: recipient, template: template.to_s, ok: ok, error: error, created_at: Time.now)
    Dukafi::Plugins.emit(ok ? :"email.sent" : :"email.failed", { order: order, result: result })
    result
  rescue StandardError => error
    MailLog.create(recipient: recipient.to_s, template: template.to_s, ok: false,
                   error: "#{error.class}: #{error.message}"[0, 1_000], created_at: Time.now)
    warn "[mail] #{template} failed: #{error.class}: #{error.message}"
    DeliveryResult.new(ok: false, provider_id: entry&.dig("slug"), error: error.message)
  end

  def self.skipped(recipient, template, reason)
    MailLog.create(recipient: recipient.empty? ? "(none)" : recipient, template: template.to_s,
                   ok: false, error: reason, created_at: Time.now)
    DeliveryResult.new(ok: false, provider_id: nil, error: reason)
  end
end
