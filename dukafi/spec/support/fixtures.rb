require_relative "http_stub"

module SpecFixtures
  module_function

  def png
    HttpStub.png
  end

  def ai_connection(attrs = {})
    AiConnection.create({
      name: "OpenRouter", provider: "openrouter", api_key: "sk-test",
      chat_model: "openai/gpt-4o-mini", image_model: "black-forest-labs/flux",
      priority: 10, disabled: false,
    }.merge(attrs))
  end

  def generated_media(attrs = {})
    MediaIngest.call(
      bytes: png, filename: "ai.png", mime: "image/png",
      origin: "ai", origin_meta: { prompt: "a bag", model: "flux", provider: "openrouter" },
      alt_text: "a bag"
    ).tap { |asset| asset.update(attrs) unless attrs.empty? }
  end

  def mail_log(attrs = {})
    MailLog.create({
      recipient: "buyer@example.com", template: "order_confirmation",
      ok: true, error: nil, created_at: Time.now,
    }.merge(attrs))
  end

  def claim_lock(id: 1, holder: "spec", now: Time.now)
    SchedulerLock.claim(id: id, holder: holder, now: now)
  end

  def theme_payload(id: "spec-theme", name: "Spec Theme", version: "1.0.0")
    {
      "theme" => { "id" => id, "name" => name, "version" => version, "contents" => {} },
      "media" => [], "shell" => { "name" => name, "settings" => {}, "styleRules" => {} },
      "pages" => [], "templates" => [], "partials" => [], "tables" => [],
      "catalogue" => { "products" => [], "collections" => [] }, "reviews" => [],
    }
  end

  def published_version(version, files)
    PublishedStore.write_version(version, files)
    PublishedStore.activate(version)
  end
end
