# Canvas-ready examples showing agents how the Style Framework is consumed.
module StyleFrameworkSnippets
  TOPICS = %w[overview colors typography spacing icons buttons inputs forms].freeze

  module_function

  def snapshot(topic = nil)
    wanted = topic.to_s.strip.downcase
    wanted = nil if wanted.empty?
    raise ArgumentError, "topic must be one of: #{TOPICS.join(', ')}." if wanted && !TOPICS.include?(wanted)

    rows = snippets
    rows = rows.select { |row| row["topic"] == wanted } if wanted
    {
      "topics" => TOPICS,
      "rule" => "Framework defaults are deliberately low-specificity. Use semantic elements and platform classes first; add utility classes or inline styles only for a one-off override. Paste HTML through apply_edits, never invent editor node ids.",
      "snippets" => rows,
    }
  end

  def snippets
    [
      row("framework-section", "overview", "A scheme-aware canvas section", '<section id="page__feature" class="scheme-1 bg-scheme-background px-[var(--space-horizontal)] py-[var(--space-vertical)]"><div class="mx-auto max-w-[var(--container-width)]"><h2>Feature</h2><p>Semantic type inherits the site type styles.</p></div></section>', ["Keep a stable id/data-section-id on top-level sections.", "Switch scheme-1 to another listed scheme; use scheme role utilities inside it."]),
      row("scheme-roles", "colors", "Use roles instead of fixed palette colors", '<div class="scheme-2 bg-scheme-background text-scheme-body border-scheme-border"><h3 class="text-scheme-heading">Heading</h3><a class="text-scheme-accent">Link</a></div>', ["Read get_design_tokens.colorSchemes before choosing a scheme.", "Prefer roles so palette edits re-skin the canvas."]),
      row("semantic-type", "typography", "Default and overridden typography", '<div><h1>Uses the H1 framework style</h1><p>Uses the paragraph framework style.</p><p class="text-l font-semibold">This one intentionally overrides size and weight.</p></div>', ["Bare h1–h7 and p use typeStyles.", "Generated text-* utilities override defaults."]),
      row("framework-spacing", "spacing", "Layout variables", '<section class="px-[var(--space-horizontal)] py-[var(--space-vertical)]"><div class="mx-auto max-w-[var(--container-width)] p-[var(--card-padding)]">Content</div></section>', ["Use --radius, --radius-card, --radius-image, or --radius-button for shared radii."]),
      row("framework-icon", "icons", "Inline SVG inherits icon defaults", '<span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>', ["Inline SVG receives the framework glyph/box treatment.", "A class or style on the SVG is an explicit override."]),
      row("framework-buttons", "buttons", "Primary, secondary, and link defaults", '<div class="flex gap-4"><button class="dukafi-button">Primary</button><button class="dukafi-button button-secondary">Secondary</button><a href="#" class="dukafi-button button-link">Link</a></div>', ["base.button receives dukafi-button automatically in the editor/publisher.", "Use button-secondary or button-link only to select a variant."]),
      row("framework-inputs", "inputs", "Text field defaults", '<label for="email">Email</label><input id="email" name="email" type="email" class="dukafi-input" placeholder="you@example.com"><textarea name="message" class="dukafi-input" placeholder="Message"></textarea>', ["base.input, base.textarea, and base.select receive dukafi-input automatically.", "Checkboxes and radios do not use this hook."]),
      row("framework-form", "forms", "Connected form using framework controls", '<form data-dukafy-form-id="contact"><label for="contact-email">Email</label><input id="contact-email" name="email" type="email" class="dukafi-input" required><label for="contact-message">Message</label><textarea id="contact-message" name="message" class="dukafi-input" required></textarea><button type="submit" class="dukafi-button">Send</button><p data-dukafy-form-message="contact"></p></form>', ["Keep labels associated with field ids.", "Use get_recipes topic=forms for data-table or account-specific form overlays."]),
    ]
  end

  def row(id, topic, title, html, notes)
    { "id" => id, "topic" => topic, "title" => title, "html" => html, "notes" => notes }
  end
end
