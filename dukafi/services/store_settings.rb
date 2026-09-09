# Site-level Settings (the General tab): store name, fallback title and
# description, language, favicon, default share image.
#
# These live on the site shell, not on a page document. A page that has set
# its own seoTitle / ogImage wins; this is what Google and WhatsApp see when
# it has not. Draft until publish — same rule as apply_edits.
module StoreSettings
  KEYS = %w[name metaTitle metaDescription language favicon ogImage].freeze

  module_function

  def payload
    site = current_site
    settings = site["settings"].is_a?(Hash) ? site["settings"] : {}
    {
      "name" => site["name"].to_s,
      "metaTitle" => present(settings["metaTitle"]),
      "metaDescription" => present(settings["metaDescription"]),
      "language" => present(settings["language"]) || "en",
      "favicon" => present(settings["faviconUrl"]),
      "ogImage" => present(settings["ogImageUrl"]),
    }
  end

  # `patch` contains only keys the caller meant to change. nil on a clearable
  # field (meta, favicon, og image) means delete it. name cannot be empty;
  # language empty becomes "en".
  def apply!(patch)
    raise McpTools::ArgumentError, "Pass #{KEYS.join(', ')}. Empty string clears a field except name." if patch.empty?

    state = SiteState.first
    raise McpTools::ArgumentError, "This store has no site yet." if state.nil?

    site = state.site
    site = {} unless site.is_a?(Hash)
    settings = site["settings"].is_a?(Hash) ? site["settings"].dup : {}

    if patch.key?("name")
      name = patch["name"].to_s.strip
      raise McpTools::ArgumentError, "name cannot be empty" if name.empty?

      site["name"] = name
    end

    assign_text!(settings, "metaTitle", patch["metaTitle"]) if patch.key?("metaTitle")
    assign_text!(settings, "metaDescription", patch["metaDescription"]) if patch.key?("metaDescription")
    settings["language"] = present(patch["language"]) || "en" if patch.key?("language")
    assign_text!(settings, "faviconUrl", patch["favicon"]) if patch.key?("favicon")
    assign_text!(settings, "ogImageUrl", patch["ogImage"]) if patch.key?("ogImage")

    site["settings"] = settings
    persist!(state, site)
    payload.merge("note" => "Saved to the draft. Call publish to put it live.")
  end

  def persist!(state, site)
    DB.transaction do
      state.site = site
      state.bump_seq!
    end
  end

  def current_site
    site = SiteState.first&.site
    site.is_a?(Hash) ? site : {}
  end

  def assign_text!(hash, key, value)
    text = value.to_s.strip
    if text.empty?
      hash.delete(key)
    else
      hash[key] = text
    end
  end

  def present(value)
    text = value.to_s.strip
    text.empty? ? nil : text
  end
end
