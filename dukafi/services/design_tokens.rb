require "securerandom"

# Site-wide design tokens — colors, fonts, type scale, spacing.
#
# Changing `--primary` or `--font-primary` here re-skins every class bound to
# that variable. The agent should patch tokens instead of restyling each page.
module DesignTokens
  SAFE_SLUG = /\A[a-z][a-z0-9-]{0,40}\z/
  SAFE_COLOR = /\A[^;{}<>\n\r]{1,80}\z/
  SAFE_STEPS = /\A[a-z0-9]+(?:,[a-z0-9]+){0,12}\z/
  UTILITIES = %w[text background border fill].freeze
  TYPE_TAGS = %w[h1 h2 h3 h4 h5 h6 h7 p].freeze
  STEPS = %w[1 2 3 4 5 6 7].freeze
  CONTROL_DEFAULTS = {
    "layout" => { "containerWidth" => "wide", "cardPadding" => "regular", "vertical" => "l", "horizontal" => "m", "radius" => "md" },
    "icons" => { "color" => "accent", "style" => "outlined", "weight" => "4", "fill" => "outline", "treatment" => "fill", "fillIntensity" => "subtle", "padding" => "4", "radius" => "2", "radiusLinked" => true },
    "buttons" => { "primaryColor" => "accent", "secondaryColor" => "secondary", "linkColor" => "accent", "padding" => "4", "radius" => "4", "radiusLinked" => true, "fontVariable" => "inherit", "fontSize" => "4", "fontWeight" => "5", "casing" => "normal", "letterSpacing" => "4" },
    "inputs" => { "backgroundColor" => "background", "textColor" => "body", "borderColor" => "border", "focusColor" => "accent", "padding" => "4", "radius" => "4", "radiusLinked" => true, "borderWidth" => "2", "fontVariable" => "inherit", "fontSize" => "4", "fontWeight" => "2" },
  }.freeze

  module_function

  def snapshot
    site = current_site
    framework = site.dig("settings", "framework")
    framework = {} unless framework.is_a?(Hash)
    fonts = site.dig("settings", "fonts")
    fonts = {} unless fonts.is_a?(Hash)

    {
      "colors" => color_rows(framework.dig("colors", "tokens")),
      "colorSchemes" => scheme_rows(framework),
      "fonts" => font_digest(fonts),
      "typography" => scale_rows(framework["typography"], "fontSize"),
      "spacing" => scale_rows(framework["spacing"], "size"),
      "typeStyles" => Array(framework.dig("typography", "styles")),
      "layout" => Dukafi::Publisher::FrameworkCss.spacing_preset_variables(site)
        .merge(Dukafi::Publisher::FrameworkCss.icon_preset_variables(site)),
      "layoutPresets" => CONTROL_DEFAULTS["layout"].merge(framework.dig("spacing", "presets") || {}),
      "icons" => CONTROL_DEFAULTS["icons"].merge(framework["icons"] || {}),
      "buttons" => CONTROL_DEFAULTS["buttons"].merge(framework["buttons"] || {}),
      "inputs" => CONTROL_DEFAULTS["inputs"].merge(framework["inputs"] || {}),
      "preferences" => preference_row(framework["preferences"]),
      "note" => "Patch a token to re-skin every bound class. Color schemes map Background / Heading / Body / Accent onto those tokens — put scheme-2 on a section, then use bg-scheme-background and text-scheme-heading. On accent or secondary fills use text-scheme-on-accent / text-scheme-on-secondary (contrast-picked ink). Layout vars: max-w-[var(--container-width)] (also --container-narrow/wide), p-[var(--card-padding)], py-[var(--space-vertical)], px-[var(--space-horizontal)]. Site radius (--radius, also --radius-button/image/card) already paints buttons, inputs, images, cards, and divs — omit rounded-* unless you want a one-off (rounded-full for pills). Inline SVGs pick up --icon-color / --icon-box-padding / --icon-box-radius. Call update_design_tokens, then publish.",
    }
  end

  def summary
    snap = snapshot
    {
      "colors" => snap["colors"].first(8).map { |row| row.slice("slug", "value", "classes") },
      "fonts" => (snap.dig("fonts", "tokens") || []).first(4).map { |row| row.slice("variable", "class", "family") },
    }
  end

  def apply!(args)
    args = {} unless args.is_a?(Hash)
    state = SiteState.first
    raise ArgumentError, "This store has no site yet." if state.nil?

    changed = []
    site = deep_dup(state.site)
    site = ensure_shell(site)

    changed.concat(apply_colors(site, args["colors"]))
    changed.concat(apply_schemes(site, args["colorSchemes"]))
    changed.concat(apply_fonts(site, args["fonts"]))
    changed.concat(apply_scale(site, "typography", args["typography"], "fontSize"))
    changed.concat(apply_scale(site, "spacing", args["spacing"], "size"))
    changed.concat(apply_type_styles(site, args["typeStyles"]))
    changed.concat(apply_control(site, "layout", args["layout"]))
    changed.concat(apply_control(site, "icons", args["icons"]))
    changed.concat(apply_control(site, "buttons", args["buttons"]))
    changed.concat(apply_control(site, "inputs", args["inputs"]))
    changed.concat(apply_preferences(site, args["preferences"]))

    raise ArgumentError, "Nothing to change. Pass colors, schemes, fonts, scales, typeStyles, layout, icons, buttons, inputs, or preferences." if changed.empty?

    persist!(state, site)
    {
      "changed" => changed,
      "tokens" => snapshot,
      "note" => "Saved to the draft. Call publish so visitors see the new tokens.",
    }
  end

  def color_rows(tokens)
    Array(tokens).filter_map do |token|
      next unless token.is_a?(Hash)

      slug = token["slug"].to_s
      next if slug.empty?

      utils = token["generateUtilities"]
      utils = {} unless utils.is_a?(Hash)
      classes = if utils.empty?
        ["text-#{slug}", "bg-#{slug}"]
      else
        UTILITIES.filter_map { |kind| "#{css_prefix(kind)}-#{slug}" if truthy?(utils[kind]) }
      end
      {
        "slug" => slug,
        "category" => token["category"].to_s,
        "value" => token["lightValue"].to_s,
        "darkValue" => token["darkValue"].to_s,
        "cssVar" => "--#{slug}",
        "ref" => "var(--#{slug})",
        "classes" => classes,
      }
    end
  end

  SCHEME_ROLES = %w[background secondary heading body accent border].freeze

  def scheme_rows(framework)
    framework = {} unless framework.is_a?(Hash)
    schemes = framework.dig("colorSchemes", "schemes")
    tokens = Array(framework.dig("colors", "tokens"))
    schemes = default_schemes(tokens) if !schemes.is_a?(Array) || schemes.empty?
    Array(schemes).first(8).filter_map do |scheme|
      next unless scheme.is_a?(Hash)

      slug = slugify(scheme["slug"] || scheme["name"] || "scheme")
      next if slug.empty?

      roles = scheme["roles"].is_a?(Hash) ? scheme["roles"] : {}
      {
        "slug" => slug.start_with?("scheme-") ? slug : "scheme-#{slug}",
        "name" => scheme["name"].to_s.empty? ? slug : scheme["name"].to_s,
        "roles" => SCHEME_ROLES.to_h { |role| [role, roles[role].to_s] },
        "class" => slug.start_with?("scheme-") ? slug : "scheme-#{slug}",
        "utilities" => %w[bg-scheme-background bg-scheme-secondary text-scheme-heading text-scheme-body text-scheme-accent bg-scheme-accent text-scheme-on-accent text-scheme-on-secondary border-scheme-border],
      }
    end
  end

  def default_schemes(tokens)
    slugs = Array(tokens).filter_map { |token| token["slug"].to_s if token.is_a?(Hash) && !token["slug"].to_s.empty? }
    pick = ->(*candidates) { candidates.find { |slug| slugs.include?(slug) } || slugs.first || "primary" }
    canvas = {
      "background" => pick.call("bg-body", "bg-surface", "light"),
      "secondary" => pick.call("bg-surface", "bg-body", "light"),
      "heading" => pick.call("text-title", "text-body", "dark"),
      "body" => pick.call("text-body", "text-title", "dark"),
      "accent" => pick.call("primary", "secondary"),
      "border" => pick.call("border-primary", "dark", "primary"),
    }
    [
      { "slug" => "scheme-1", "name" => "Scheme 1", "roles" => canvas },
      { "slug" => "scheme-2", "name" => "Scheme 2", "roles" => canvas.merge("background" => pick.call("bg-surface", "light", canvas["background"])) },
      { "slug" => "scheme-3", "name" => "Scheme 3", "roles" => canvas.merge("background" => pick.call("dark", canvas["heading"]), "heading" => pick.call("light", canvas["heading"]), "body" => pick.call("light", canvas["body"])) },
      { "slug" => "scheme-4", "name" => "Scheme 4", "roles" => canvas.merge("background" => canvas["accent"], "heading" => pick.call("light", canvas["heading"]), "body" => pick.call("light", canvas["body"])) },
    ]
  end

  def apply_schemes(site, rows)
    return [] unless rows.is_a?(Array) && !rows.empty?

    framework = site.dig("settings", "framework")
    framework = {} unless framework.is_a?(Hash)
    bag = framework["colorSchemes"].is_a?(Hash) ? framework["colorSchemes"].dup : {}
    schemes = Array(bag["schemes"])
    changed = []
    rows.first(8).each do |row|
      next unless row.is_a?(Hash)

      slug = slugify(row["slug"] || row["name"])
      raise ArgumentError, "Scheme slug #{(row['slug'] || row['name']).inspect} is not a valid name." unless slug.match?(SAFE_SLUG)

      slug = "scheme-#{slug}" unless slug.start_with?("scheme-")
      scheme = schemes.find { |item| item.is_a?(Hash) && item["slug"].to_s == slug }
      roles = row["roles"].is_a?(Hash) ? row["roles"] : {}
      mapped = SCHEME_ROLES.to_h { |role| [role, slugify(roles[role].to_s)] }
      mapped = default_schemes(framework.dig("colors", "tokens")).first.fetch("roles") if mapped.values.all?(&:empty?)
      if scheme.nil?
        schemes << {
          "id" => slug,
          "slug" => slug,
          "name" => row["name"].to_s.empty? ? slug : row["name"].to_s,
          "order" => schemes.length,
          "roles" => mapped,
        }
        changed << "added scheme #{slug}"
      else
        scheme["name"] = row["name"].to_s unless row["name"].to_s.empty?
        scheme["roles"] = scheme["roles"].is_a?(Hash) ? scheme["roles"].merge(mapped.reject { |_k, value| value.empty? }) : mapped
        changed << "updated scheme #{slug}"
      end
    end
    bag["schemes"] = schemes
    framework["colorSchemes"] = bag
    site["settings"] ||= {}
    site["settings"]["framework"] = framework
    changed
  end

  def font_digest(fonts)
    items = Array(fonts["items"]).select { |row| row.is_a?(Hash) }
    tokens = Array(fonts["tokens"]).select { |row| row.is_a?(Hash) }
    {
      "families" => items.map { |row| { "id" => row["id"].to_s, "family" => row["family"].to_s, "source" => row["source"].to_s } }
                    .reject { |row| row["family"].empty? }.first(20),
      "tokens" => tokens.filter_map { |token| font_token_row(token, items) }.first(12),
    }
  end

  def font_token_row(token, items)
    variable = normalize_font_variable(token["variable"].to_s)
    return nil if variable.empty?

    family_id = token["familyId"].to_s
    entry = items.find { |item| item["id"].to_s == family_id }
    {
      "name" => token["name"].to_s,
      "variable" => variable,
      "cssVar" => "--#{variable}",
      "class" => variable,
      "familyId" => family_id,
      "family" => (entry && entry["family"]).to_s,
      "fallback" => token["fallback"].to_s,
    }
  end

  def scale_rows(settings, size_key)
    settings = {} unless settings.is_a?(Hash)
    groups = Array(settings["groups"]).select { |row| row.is_a?(Hash) }
    classes = Array(settings["classes"]).select { |row| row.is_a?(Hash) }
    groups.first(8).map do |group|
      convention = group["namingConvention"].to_s
      convention = size_key == "fontSize" ? "text" : "space" if convention.empty?
      steps = group["steps"].to_s.split(",").map(&:strip).reject(&:empty?)
      min = group["min"].is_a?(Hash) ? group["min"] : {}
      max = group["max"].is_a?(Hash) ? group["max"] : {}
      {
        "id" => group["id"].to_s,
        "name" => group["name"].to_s,
        "namingConvention" => convention,
        "steps" => steps,
        "min" => min[size_key],
        "max" => max[size_key],
        "scaleRatio" => min["scaleRatio"] || max["scaleRatio"],
        "classes" => steps.map { |step| "#{convention}-#{step}" },
        "generators" => classes.select { |row| row["tabId"].to_s == group["id"].to_s }.map { |row| row["name"].to_s },
      }
    end
  end

  def preference_row(raw)
    raw = {} unless raw.is_a?(Hash)
    {
      "rootFontSize" => raw["rootFontSize"],
      "minScreenWidth" => raw["minScreenWidth"],
      "maxScreenWidth" => raw["maxScreenWidth"],
      "isRem" => raw["isRem"],
    }
  end

  def apply_colors(site, rows)
    return [] unless rows.is_a?(Array) && !rows.empty?

    colors = site.dig("settings", "framework", "colors")
    tokens = Array(colors["tokens"])
    changed = []
    rows.first(12).each do |row|
      next unless row.is_a?(Hash)

      slug = slugify(row["slug"] || row["name"])
      raise ArgumentError, "Color slug #{(row['slug'] || row['name']).inspect} is not a valid token name." unless slug.match?(SAFE_SLUG)

      value = (row["value"] || row["lightValue"]).to_s.strip
      token = tokens.find { |item| item.is_a?(Hash) && item["slug"].to_s == slug }
      if token.nil?
        raise ArgumentError, "A new color needs a value (hex or hsla)." if value.empty?

        token = new_color_token(slug, row, tokens)
        tokens << token
        changed << "added color #{slug}"
      else
        patch_color_token(token, row)
        changed << "updated color #{slug}"
      end
      ensure_color_classes!(site, token)
    end
    colors["tokens"] = tokens
    changed
  end

  def new_color_token(slug, row, existing)
    now = (Time.now.to_f * 1000).to_i
    value = (row["value"] || row["lightValue"]).to_s.strip
    assert_color!(value)
    {
      "id" => "color-#{SecureRandom.hex(6)}",
      "category" => row["category"].to_s.strip.empty? ? "Brand" : row["category"].to_s.strip,
      "slug" => slug,
      "lightValue" => value,
      "darkValue" => row["darkValue"].to_s.strip.empty? ? value : row["darkValue"].to_s.strip,
      "darkModeEnabled" => false,
      "generateUtilities" => utility_flags(row["utilities"]),
      "generateTransparent" => false,
      "generateShades" => { "enabled" => false, "count" => 0 },
      "generateTints" => { "enabled" => false, "count" => 0 },
      "order" => existing.length,
      "createdAt" => now,
      "updatedAt" => now,
    }
  end

  def patch_color_token(token, row)
    value = (row["value"] || row["lightValue"]).to_s.strip
    unless value.empty?
      assert_color!(value)
      token["lightValue"] = value
    end
    if row.key?("darkValue")
      dark = row["darkValue"].to_s.strip
      assert_color!(dark) unless dark.empty?
      token["darkValue"] = dark
    end
    token["category"] = row["category"].to_s if row["category"].to_s.strip != ""
    token["generateUtilities"] = utility_flags(row["utilities"]) if row["utilities"].is_a?(Array)
    token["updatedAt"] = (Time.now.to_f * 1000).to_i
  end

  def ensure_color_classes!(site, token)
    slug = token["slug"].to_s
    id = token["id"].to_s
    flags = token["generateUtilities"]
    flags = utility_flags(nil) unless flags.is_a?(Hash)
    rules = site["styleRules"]
    rules = {} unless rules.is_a?(Hash)
    UTILITIES.each do |kind|
      next unless truthy?(flags[kind])

      rule_id = "framework:color:#{id}:base:#{kind}"
      name = "#{css_prefix(kind)}-#{slug}"
      rules[rule_id] ||= {
        "id" => rule_id,
        "name" => name,
        "kind" => "class",
        "selector" => ".#{name}",
        "order" => 0,
        "styles" => utility_styles(kind, "var(--#{slug})"),
        "contextStyles" => {},
        "generated" => {
          "origin" => "framework", "family" => "color", "sourceId" => id,
          "utility" => kind, "tokenName" => slug, "locked" => true,
        },
        "tags" => %w[framework utility color],
      }
    end
    site["styleRules"] = rules
  end

  def apply_fonts(site, rows)
    return [] unless rows.is_a?(Array) && !rows.empty?

    fonts = site.dig("settings", "fonts")
    items = Array(fonts["items"])
    tokens = Array(fonts["tokens"])
    changed = []
    rows.first(8).each do |row|
      next unless row.is_a?(Hash)

      token = find_font_token(tokens, row)
      if token.nil?
        variable = normalize_font_variable((row["variable"] || row["name"]).to_s)
        raise ArgumentError, "A new font token needs a variable or name." if variable.empty?
        now = (Time.now.to_f * 1000).to_i
        token = { "id" => "font-token-#{SecureRandom.hex(6)}", "name" => row["name"].to_s.empty? ? variable.sub(/\Afont-/, "").capitalize : row["name"].to_s, "variable" => variable, "familyId" => "", "fallback" => row["fallback"].to_s, "order" => tokens.length, "createdAt" => now, "updatedAt" => now }
        tokens << token
      end

      if row["family"].to_s.strip != ""
        entry = find_family(items, row["family"])
        unless entry
          names = items.filter_map { |item| item["family"] if item.is_a?(Hash) }
          listed = names.empty? ? "none" : names.join(", ")
          raise ArgumentError, "Font #{row['family'].inspect} is not installed. Installed: #{listed}. Install it in the Type tab, then retry."
        end
        token["familyId"] = entry["id"]
      end
      token["fallback"] = row["fallback"].to_s if row.key?("fallback")
      token["updatedAt"] = (Time.now.to_f * 1000).to_i
      changed << "upserted font #{token['variable']}"
    end
    fonts["tokens"] = tokens
    changed
  end

  def apply_scale(site, kind, rows, size_key)
    return [] unless rows.is_a?(Array) && !rows.empty?

    settings = site.dig("settings", "framework", kind)
    settings = { "groups" => [], "classes" => [] } unless settings.is_a?(Hash)
    groups = Array(settings["groups"])
    changed = []
    rows.first(4).each do |row|
      next unless row.is_a?(Hash)

      group = find_scale_group(groups, row)
      if group.nil?
        now = (Time.now.to_f * 1000).to_i
        convention = slugify(row["namingConvention"] || (kind == "typography" ? "text" : "space"))
        min_size = kind == "typography" ? 14 : 8
        max_size = kind == "typography" ? 18 : 24
        group = { "id" => "#{kind}-#{SecureRandom.hex(6)}", "name" => row["name"].to_s.empty? ? kind.capitalize : row["name"].to_s, "mode" => "fluid", "namingConvention" => convention, "min" => { size_key => min_size, "scaleRatio" => kind == "typography" ? 1.125 : 1.25 }, "max" => { size_key => max_size, "scaleRatio" => kind == "typography" ? 1.333 : 1.414 }, "steps" => kind == "typography" ? "xs,s,m,l,xl,2xl,3xl,4xl" : "4xs,3xs,2xs,xs,s,m,l,xl,2xl,3xl,4xl", "baseScaleIndex" => kind == "typography" ? 2 : 5, "order" => groups.length, "createdAt" => now, "updatedAt" => now }
        groups << group
      end

      min = group["min"].is_a?(Hash) ? group["min"].dup : {}
      max = group["max"].is_a?(Hash) ? group["max"].dup : {}
      min_key = size_key == "fontSize" ? "minFontSize" : "minSize"
      max_key = size_key == "fontSize" ? "maxFontSize" : "maxSize"
      min[size_key] = numeric!(row[min_key] || row["min"], min[size_key]) if row.key?(min_key) || row.key?("min")
      max[size_key] = numeric!(row[max_key] || row["max"], max[size_key]) if row.key?(max_key) || row.key?("max")
      if row.key?("scaleRatio")
        ratio = numeric!(row["scaleRatio"], min["scaleRatio"])
        min["scaleRatio"] = ratio
        max["scaleRatio"] = ratio
      end
      group["min"] = min
      group["max"] = max
      if row["steps"].to_s.strip != ""
        steps = row["steps"].to_s.downcase.gsub(/\s+/, "")
        raise ArgumentError, "steps must be a comma list like xs,s,m,l,xl." unless steps.match?(SAFE_STEPS)

        group["steps"] = steps
      end
      group["updatedAt"] = (Time.now.to_f * 1000).to_i
      changed << "updated #{kind} #{group['name']}"
    end
    settings["groups"] = groups
    site["settings"]["framework"][kind] = settings
    changed
  end

  def apply_type_styles(site, rows)
    return [] unless rows.is_a?(Array) && !rows.empty?

    typography = site.dig("settings", "framework", "typography")
    styles = Array(typography["styles"])
    rows.first(8).each do |row|
      next unless row.is_a?(Hash)
      tag = row["tag"].to_s.downcase
      raise ArgumentError, "typeStyles tag must be one of: #{TYPE_TAGS.join(', ')}." unless TYPE_TAGS.include?(tag)
      style = styles.find { |item| item.is_a?(Hash) && item["tag"] == tag } || { "tag" => tag }
      %w[fontFamily fontSize fontWeight letterSpacing lineHeight textTransform maxWidth].each do |key|
        style[key] = safe_css_value!(row[key], key) if row.key?(key)
      end
      styles << style unless styles.include?(style)
    end
    typography["styles"] = styles
    ["updated type styles"]
  end

  CONTROL_KEYS = {
    "layout" => %w[containerWidth cardPadding vertical horizontal radius],
    "icons" => %w[color style weight fill treatment fillIntensity padding radius radiusLinked],
    "buttons" => %w[primaryColor secondaryColor linkColor padding radius radiusLinked fontVariable fontSize fontWeight casing letterSpacing],
    "inputs" => %w[backgroundColor textColor borderColor focusColor padding radius radiusLinked borderWidth fontVariable fontSize fontWeight],
  }.freeze
  CONTROL_ENUMS = {
    "layout" => { "containerWidth" => %w[narrow regular wide], "cardPadding" => %w[tight regular roomy], "vertical" => %w[xs s m l xl], "horizontal" => %w[xs s m l xl], "radius" => %w[none sm md lg full] },
    "icons" => { "color" => %w[accent heading body border], "style" => %w[outlined filled], "fill" => %w[outline fill], "treatment" => %w[none fill outline], "fillIntensity" => %w[subtle strong] },
    "buttons" => { "primaryColor" => %w[accent secondary heading body border], "secondaryColor" => %w[accent secondary heading body border], "linkColor" => %w[accent secondary heading body border], "casing" => %w[normal capitalize uppercase] },
    "inputs" => { "backgroundColor" => %w[background accent secondary heading body border], "textColor" => %w[background accent secondary heading body border], "borderColor" => %w[background accent secondary heading body border], "focusColor" => %w[background accent secondary heading body border] },
  }.freeze

  def apply_control(site, kind, row)
    return [] unless row.is_a?(Hash) && !row.empty?

    unknown = row.keys.map(&:to_s) - CONTROL_KEYS.fetch(kind)
    raise ArgumentError, "Unknown #{kind} properties: #{unknown.join(', ')}." unless unknown.empty?
    patch = row.transform_keys(&:to_s)
    patch.each do |key, value|
      raise ArgumentError, "#{kind}.#{key} must be a boolean." if key == "radiusLinked" && value != true && value != false
      step_key = %w[weight padding borderWidth fontSize fontWeight letterSpacing].include?(key) || (key == "radius" && kind != "layout")
      raise ArgumentError, "#{kind}.#{key} must be step 1–7." if step_key && !STEPS.include?(value.to_s)
      allowed = CONTROL_ENUMS.dig(kind, key)
      raise ArgumentError, "#{kind}.#{key} must be one of: #{allowed.join(', ')}." if allowed && !allowed.include?(value.to_s)
      if key == "fontVariable" && value.to_s != "inherit" && !value.to_s.match?(SAFE_SLUG)
        raise ArgumentError, "#{kind}.fontVariable must be inherit or a safe token name."
      end
    end
    framework = site.dig("settings", "framework")
    if kind == "layout"
      spacing = framework["spacing"]
      spacing["presets"] = CONTROL_DEFAULTS[kind].merge(spacing["presets"] || {}).merge(patch)
    else
      framework[kind] = CONTROL_DEFAULTS[kind].merge(framework[kind] || {}).merge(patch)
    end
    ["updated #{kind}"]
  end

  def safe_css_value!(raw, key)
    value = raw.to_s.strip
    raise ArgumentError, "#{key} contains unsafe CSS." if value.length > 120 || value.match?(/[;{}<>\n\r]/)
    value
  end

  def apply_preferences(site, row)
    return [] unless row.is_a?(Hash) && !row.empty?

    prefs = site.dig("settings", "framework", "preferences")
    prefs = {} unless prefs.is_a?(Hash)
    %w[rootFontSize minScreenWidth maxScreenWidth].each do |key|
      next unless row.key?(key)

      prefs[key] = numeric!(row[key], prefs[key])
    end
    prefs["isRem"] = !!row["isRem"] if row.key?("isRem")
    site["settings"]["framework"]["preferences"] = prefs
    ["updated preferences"]
  end

  def persist!(state, site)
    DB.transaction do
      state.site = site
      seq = state.bump_seq!
      Page.dataset.update(seq: seq)
    end
  end

  def current_site
    site = SiteState.first&.site
    site.is_a?(Hash) ? site : {}
  end

  def ensure_shell(site)
    settings = site["settings"].is_a?(Hash) ? site["settings"].dup : {}
    framework = settings["framework"].is_a?(Hash) ? settings["framework"].dup : {}
    colors = framework["colors"].is_a?(Hash) ? framework["colors"].dup : {}
    colors["tokens"] = Array(colors["tokens"])
    framework["colors"] = colors
    framework["typography"] = framework["typography"].is_a?(Hash) ? framework["typography"].dup : { "groups" => [], "classes" => [] }
    framework["spacing"] = framework["spacing"].is_a?(Hash) ? framework["spacing"].dup : { "groups" => [], "classes" => [] }
    framework["preferences"] = framework["preferences"].is_a?(Hash) ? framework["preferences"].dup : {}
    fonts = settings["fonts"].is_a?(Hash) ? settings["fonts"].dup : { "items" => [], "tokens" => [] }
    fonts["items"] = Array(fonts["items"])
    fonts["tokens"] = Array(fonts["tokens"])
    settings["framework"] = framework
    settings["fonts"] = fonts
    site.merge("settings" => settings, "styleRules" => site["styleRules"].is_a?(Hash) ? site["styleRules"].dup : {})
  end

  def find_font_token(tokens, row)
    key = normalize_font_variable((row["variable"] || row["name"]).to_s)
    tokens.find do |token|
      next unless token.is_a?(Hash)

      normalize_font_variable(token["variable"].to_s) == key ||
        (row["name"].to_s != "" && token["name"].to_s.downcase == row["name"].to_s.downcase)
    end
  end

  def find_family(items, name)
    needle = name.to_s.strip.downcase
    items.find { |item| item.is_a?(Hash) && item["family"].to_s.downcase == needle }
  end

  def find_scale_group(groups, row)
    id = row["id"].to_s
    name = row["name"].to_s.downcase
    convention = row["namingConvention"].to_s.downcase
    groups.find do |group|
      next unless group.is_a?(Hash)

      (id != "" && group["id"].to_s == id) ||
        (name != "" && group["name"].to_s.downcase == name) ||
        (convention != "" && group["namingConvention"].to_s.downcase == convention)
    end || (groups.length == 1 ? groups.first : nil)
  end

  def utility_flags(list)
    wanted = Array(list).map(&:to_s)
    wanted = %w[text background] if wanted.empty?
    UTILITIES.to_h { |kind| [kind, wanted.include?(kind)] }
  end

  def utility_styles(kind, value)
    case kind
    when "text" then { "color" => value }
    when "background" then { "backgroundColor" => value }
    when "border" then { "borderColor" => value }
    when "fill" then { "fill" => value }
    else {}
    end
  end

  def css_prefix(kind)
    kind == "background" ? "bg" : kind
  end

  def normalize_font_variable(raw)
    normalized = raw.strip.sub(/\A-+/, "").downcase.gsub(/[^a-z0-9]+/, "-").gsub(/\A-+|-+\z/, "")
    return "" if normalized.empty?

    normalized.start_with?("font-") ? normalized : "font-#{normalized}"
  end

  def slugify(raw)
    raw.to_s.strip.downcase.gsub(/[^a-z0-9]+/, "-").gsub(/\A-+|-+\z/, "")
  end

  def assert_color!(value)
    raise ArgumentError, "Color #{value.inspect} is not a safe CSS color." unless value.match?(SAFE_COLOR)
  end

  def numeric!(raw, fallback)
    return fallback if raw.nil? || raw == ""

    value = Float(raw, exception: false)
    raise ArgumentError, "Expected a number, got #{raw.inspect}." if value.nil? || !value.finite?

    value.to_i == value ? value.to_i : value
  end

  def truthy?(value)
    value == true || value == "true"
  end

  def deep_dup(value)
    Marshal.load(Marshal.dump(value))
  end
end
