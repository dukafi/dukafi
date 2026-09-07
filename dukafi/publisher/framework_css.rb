class Dukafi
  module Publisher
    class FrameworkCss
      SAFE_SLUG = /\A[a-zA-Z_][a-zA-Z0-9_-]*\z/
      TYPE_TAGS = %w[h1 h2 h3 h4 h5 h6 h7 p].freeze
      SCALE_STEP = {
        "h1" => "4xl",
        "h2" => "3xl",
        "h3" => "2xl",
        "h4" => "xl",
        "h5" => "l",
        "h6" => "m",
        "h7" => "s",
        "p" => "m",
      }.freeze
      TYPE_PROPS = {
        "fontFamily" => "font-family",
        "fontSize" => "font-size",
        "fontWeight" => "font-weight",
        "letterSpacing" => "letter-spacing",
        "lineHeight" => "line-height",
        "textTransform" => "text-transform",
      }.freeze
      CONTAINER_WIDTH = {
        "narrow" => "48rem",
        "regular" => "64rem",
        "wide" => "72rem",
      }.freeze
      CARD_PADDING = {
        "tight" => "1rem",
        "regular" => "1.5rem",
        "roomy" => "2rem",
      }.freeze
      SPACE_VERTICAL = {
        "xs" => "2rem",
        "s" => "3rem",
        "m" => "4rem",
        "l" => "5rem",
        "xl" => "6rem",
      }.freeze
      SPACE_HORIZONTAL = {
        "xs" => "1rem",
        "s" => "1.25rem",
        "m" => "1.5rem",
        "l" => "2rem",
        "xl" => "2.5rem",
      }.freeze
      RADIUS = {
        "none" => "0",
        "sm" => "0.25rem",
        "md" => "0.5rem",
        "lg" => "1rem",
        "full" => "9999px",
      }.freeze
      ICON_WEIGHT = {
        "1" => "0.5",
        "2" => "1",
        "3" => "1.25",
        "4" => "1.5",
        "5" => "2",
        "6" => "2.5",
        "7" => "3",
      }.freeze
      ICON_PADDING = {
        "1" => "0",
        "2" => "0.25rem",
        "3" => "0.375rem",
        "4" => "0.5rem",
        "5" => "0.75rem",
        "6" => "1rem",
        "7" => "1.25rem",
      }.freeze
      ICON_RADIUS = {
        "1" => "0",
        "2" => "0.125rem",
        "3" => "0.25rem",
        "4" => "0.5rem",
        "5" => "0.75rem",
        "6" => "1rem",
        "7" => "9999px",
      }.freeze
      ICON_COLOR = {
        "accent" => "var(--scheme-accent, currentColor)",
        "heading" => "var(--scheme-heading, currentColor)",
        "body" => "var(--scheme-body, currentColor)",
        "border" => "var(--scheme-border, currentColor)",
      }.freeze
      ICON_DEFAULTS = {
        "color" => "accent",
        "style" => "outlined",
        "weight" => "4",
        "fill" => "outline",
        "treatment" => "fill",
        "fillIntensity" => "subtle",
        "padding" => "4",
        "radius" => "2",
        "radiusLinked" => true,
      }.freeze
      BUTTON_PADDING = {
        "1" => ".375rem .625rem", "2" => ".5rem .75rem", "3" => ".625rem .875rem",
        "4" => ".75rem 1rem", "5" => ".875rem 1.25rem", "6" => "1rem 1.5rem", "7" => "1.125rem 1.75rem",
      }.freeze
      BUTTON_RADIUS = {
        "1" => "0", "2" => ".125rem", "3" => ".25rem", "4" => ".5rem",
        "5" => ".75rem", "6" => "1rem", "7" => "9999px",
      }.freeze
      BUTTON_SIZE = {
        "1" => ".75rem", "2" => ".8125rem", "3" => ".875rem", "4" => "1rem",
        "5" => "1.125rem", "6" => "1.25rem", "7" => "1.5rem",
      }.freeze
      BUTTON_WEIGHT = { "1" => "300", "2" => "400", "3" => "450", "4" => "500", "5" => "600", "6" => "700", "7" => "800" }.freeze
      BUTTON_TRACKING = { "1" => "-.04em", "2" => "-.025em", "3" => "-.0125em", "4" => "0", "5" => ".025em", "6" => ".05em", "7" => ".1em" }.freeze
      BUTTON_COLOR = {
        "accent" => "var(--scheme-accent, currentColor)", "secondary" => "var(--scheme-secondary, currentColor)",
        "heading" => "var(--scheme-heading, currentColor)", "body" => "var(--scheme-body, currentColor)",
        "border" => "var(--scheme-border, currentColor)",
      }.freeze
      BUTTON_DEFAULTS = {
        "primaryColor" => "accent", "secondaryColor" => "secondary", "linkColor" => "accent",
        "padding" => "4", "radius" => "4", "radiusLinked" => true, "fontVariable" => "inherit",
        "fontSize" => "4", "fontWeight" => "5", "casing" => "normal", "letterSpacing" => "4",
      }.freeze
      INPUT_PADDING = {
        "1" => ".375rem .5rem", "2" => ".5rem .625rem", "3" => ".625rem .75rem",
        "4" => ".75rem .875rem", "5" => ".875rem 1rem", "6" => "1rem 1.125rem", "7" => "1.125rem 1.25rem",
      }.freeze
      INPUT_BORDER = { "1" => "0", "2" => "1px", "3" => "1.5px", "4" => "2px", "5" => "2.5px", "6" => "3px", "7" => "4px" }.freeze
      INPUT_COLOR = BUTTON_COLOR.merge("background" => "var(--scheme-background, currentColor)").freeze
      INPUT_DEFAULTS = {
        "backgroundColor" => "background", "textColor" => "body", "borderColor" => "border", "focusColor" => "accent",
        "padding" => "4", "radius" => "4", "radiusLinked" => true, "borderWidth" => "2",
        "fontVariable" => "inherit", "fontSize" => "4", "fontWeight" => "2",
      }.freeze
      SPACING_DEFAULTS = {
        "containerWidth" => "wide",
        "cardPadding" => "regular",
        "vertical" => "l",
        "horizontal" => "m",
        "radius" => "md",
      }.freeze
      TYPE_DEFAULTS = {
        "h1" => { "fontFamily" => "var(--font-primary)", "fontSize" => "3rem", "fontWeight" => "700", "letterSpacing" => "-0.02em", "lineHeight" => "1.15" },
        "h2" => { "fontFamily" => "var(--font-primary)", "fontSize" => "2.25rem", "fontWeight" => "700", "letterSpacing" => "-0.02em", "lineHeight" => "1.2" },
        "h3" => { "fontFamily" => "var(--font-primary)", "fontSize" => "1.875rem", "fontWeight" => "600", "letterSpacing" => "-0.015em", "lineHeight" => "1.25" },
        "h4" => { "fontFamily" => "var(--font-primary)", "fontSize" => "1.5rem", "fontWeight" => "600", "letterSpacing" => "-0.01em", "lineHeight" => "1.3" },
        "h5" => { "fontFamily" => "var(--font-primary)", "fontSize" => "1.25rem", "fontWeight" => "600", "letterSpacing" => "0", "lineHeight" => "1.35" },
        "h6" => { "fontFamily" => "var(--font-primary)", "fontSize" => "1.125rem", "fontWeight" => "600", "letterSpacing" => "0", "lineHeight" => "1.4" },
        "h7" => { "fontFamily" => "var(--font-primary)", "fontSize" => "1rem", "fontWeight" => "600", "letterSpacing" => "0.02em", "lineHeight" => "1.4" },
        "p" => { "fontFamily" => "var(--font-primary)", "fontSize" => "1rem", "fontWeight" => "400", "letterSpacing" => "0", "lineHeight" => "1.6" },
      }.freeze

      def self.call(site)
        [
          color_root(site),
          spacing_presets(site),
          type_styles(site),
          radius_elements(site),
          icon_presets(site),
          icon_elements(site),
          button_presets(site),
          button_elements(site),
          input_presets(site),
          input_elements(site),
        ].reject(&:empty?).join("\n\n")
      end

      def self.color_root(site)
        tokens = site.dig("settings", "framework", "colors", "tokens") || []
        declarations = tokens.filter_map do |token|
          slug = token["slug"]
          value = token["lightValue"]
          next unless slug.is_a?(String) && slug.match?(SAFE_SLUG)
          next unless safe_value?(value)

          "  --#{slug}: #{value};"
        end
        return "" if declarations.empty?

        ":root {\n#{declarations.join("\n")}\n}"
      end
      private_class_method :color_root

      def self.spacing_preset_variables(site)
        framework = site.dig("settings", "framework")
        return {} unless framework.is_a?(Hash)

        spacing = framework["spacing"]
        return {} if spacing.is_a?(Hash) && spacing["isDisabled"]
        return {} unless spacing.is_a?(Hash) || framework["typography"].is_a?(Hash)

        stored = spacing.is_a?(Hash) && spacing["presets"].is_a?(Hash) ? spacing["presets"] : {}
        container = pick_step(stored["containerWidth"], CONTAINER_WIDTH, SPACING_DEFAULTS["containerWidth"])
        card = pick_step(stored["cardPadding"], CARD_PADDING, SPACING_DEFAULTS["cardPadding"])
        vertical = pick_step(stored["vertical"], SPACE_VERTICAL, SPACING_DEFAULTS["vertical"])
        horizontal = pick_step(stored["horizontal"], SPACE_HORIZONTAL, SPACING_DEFAULTS["horizontal"])
        radius = pick_step(stored["radius"], RADIUS, SPACING_DEFAULTS["radius"])

        {
          "--container-narrow" => CONTAINER_WIDTH["narrow"],
          "--container-regular" => CONTAINER_WIDTH["regular"],
          "--container-wide" => CONTAINER_WIDTH["wide"],
          "--container-width" => "var(--container-#{container})",
          "--card-padding" => CARD_PADDING[card],
          "--space-vertical" => SPACE_VERTICAL[vertical],
          "--space-horizontal" => SPACE_HORIZONTAL[horizontal],
          "--radius-none" => RADIUS["none"],
          "--radius-sm" => RADIUS["sm"],
          "--radius-md" => RADIUS["md"],
          "--radius-lg" => RADIUS["lg"],
          "--radius-full" => RADIUS["full"],
          "--radius" => "var(--radius-#{radius})",
          "--radius-button" => "var(--radius)",
          "--radius-image" => "var(--radius)",
          "--radius-card" => "var(--radius)",
        }
      end

      def self.spacing_presets(site)
        vars = spacing_preset_variables(site)
        return "" if vars.empty?

        declarations = vars.map { |name, value| "  #{name}: #{value};" }
        ":root {\n#{declarations.join("\n")}\n}"
      end
      private_class_method :spacing_presets

      def self.radius_elements(site)
        return "" if spacing_preset_variables(site).empty?

        <<~CSS.rstrip
          :where(button, a, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="hidden"]), select, textarea) {
            border-radius: var(--radius-button);
          }

          :where(img, video) {
            border-radius: var(--radius-image);
          }

          :where(article, div) {
            border-radius: var(--radius-card);
          }
        CSS
      end
      private_class_method :radius_elements

      def self.icon_preset_variables(site)
        return {} unless icons_enabled?(site)

        stored = site.dig("settings", "framework", "icons")
        stored = {} unless stored.is_a?(Hash)
        color = pick_step(stored["color"], ICON_COLOR, ICON_DEFAULTS["color"])
        style = %w[outlined filled].include?(stored["style"].to_s) ? stored["style"].to_s : ICON_DEFAULTS["style"]
        fill = %w[outline fill].include?(stored["fill"].to_s) ? stored["fill"].to_s : ICON_DEFAULTS["fill"]
        treatment = %w[none fill outline].include?(stored["treatment"].to_s) ? stored["treatment"].to_s : ICON_DEFAULTS["treatment"]
        intensity = %w[subtle strong].include?(stored["fillIntensity"].to_s) ? stored["fillIntensity"].to_s : ICON_DEFAULTS["fillIntensity"]
        weight = pick_step(stored["weight"], ICON_WEIGHT, ICON_DEFAULTS["weight"])
        padding = pick_step(stored["padding"], ICON_PADDING, ICON_DEFAULTS["padding"])
        radius = pick_step(stored["radius"], ICON_RADIUS, ICON_DEFAULTS["radius"])
        linked = stored.key?("radiusLinked") ? !!stored["radiusLinked"] : ICON_DEFAULTS["radiusLinked"]
        outlined = style == "outlined" && fill == "outline"
        box_padding = treatment == "none" ? "0" : ICON_PADDING[padding]
        box_radius = linked ? "var(--radius)" : ICON_RADIUS[radius]
        strong = intensity == "strong"
        box_bg = "transparent"
        box_border = "0 solid transparent"
        glyph = "var(--icon-color)"
        if treatment == "fill"
          box_bg = strong ? "var(--icon-color)" : "color-mix(in srgb, var(--icon-color) 12%, transparent)"
          glyph = "var(--scheme-on-accent, var(--scheme-background, currentColor))" if strong
        elsif treatment == "outline"
          box_border = "1px solid var(--icon-color)"
        end

        {
          "--icon-color" => ICON_COLOR[color],
          "--icon-glyph-color" => glyph,
          "--icon-stroke-width" => ICON_WEIGHT[weight],
          "--icon-fill" => outlined ? "none" : "currentColor",
          "--icon-stroke" => outlined ? "currentColor" : "none",
          "--icon-box-padding" => box_padding,
          "--icon-box-radius" => box_radius,
          "--icon-box-bg" => box_bg,
          "--icon-box-border" => box_border,
        }
      end

      def self.icon_presets(site)
        vars = icon_preset_variables(site)
        return "" if vars.empty?

        declarations = vars.map { |name, value| "  #{name}: #{value};" }
        ":root {\n#{declarations.join("\n")}\n}"
      end
      private_class_method :icon_presets

      def self.icon_elements(site)
        return "" if icon_preset_variables(site).empty?

        <<~CSS.rstrip
          :where(svg) {
            box-sizing: content-box;
            padding: var(--icon-box-padding);
            border: var(--icon-box-border);
            border-radius: var(--icon-box-radius);
            color: var(--icon-glyph-color);
            background: var(--icon-box-bg);
            fill: var(--icon-fill);
            stroke: var(--icon-stroke);
            stroke-width: var(--icon-stroke-width);
            stroke-linecap: round;
            stroke-linejoin: round;
          }
        CSS
      end
      private_class_method :icon_elements

      def self.icons_enabled?(site)
        framework = site.dig("settings", "framework")
        return false unless framework.is_a?(Hash)
        return true if framework["icons"].is_a?(Hash)
        return true if framework["spacing"].is_a?(Hash) && !framework["spacing"]["isDisabled"]
        return true if framework["typography"].is_a?(Hash) && !framework["typography"]["isDisabled"]

        false
      end
      private_class_method :icons_enabled?

      def self.button_preset_variables(site)
        framework = site.dig("settings", "framework")
        return {} unless framework.is_a?(Hash)
        return {} unless framework["buttons"].is_a?(Hash) || icons_enabled?(site)

        stored = framework["buttons"].is_a?(Hash) ? framework["buttons"] : {}
        primary = pick_step(stored["primaryColor"], BUTTON_COLOR, BUTTON_DEFAULTS["primaryColor"])
        secondary = pick_step(stored["secondaryColor"], BUTTON_COLOR, BUTTON_DEFAULTS["secondaryColor"])
        link = pick_step(stored["linkColor"], BUTTON_COLOR, BUTTON_DEFAULTS["linkColor"])
        padding = pick_step(stored["padding"], BUTTON_PADDING, BUTTON_DEFAULTS["padding"])
        radius = pick_step(stored["radius"], BUTTON_RADIUS, BUTTON_DEFAULTS["radius"])
        font_size = pick_step(stored["fontSize"], BUTTON_SIZE, BUTTON_DEFAULTS["fontSize"])
        weight = pick_step(stored["fontWeight"], BUTTON_WEIGHT, BUTTON_DEFAULTS["fontWeight"])
        tracking = pick_step(stored["letterSpacing"], BUTTON_TRACKING, BUTTON_DEFAULTS["letterSpacing"])
        linked = stored.key?("radiusLinked") ? !!stored["radiusLinked"] : true
        casing = %w[capitalize uppercase].include?(stored["casing"].to_s) ? stored["casing"].to_s : "none"
        font_var = stored["fontVariable"].to_s
        font = font_var.match?(SAFE_SLUG) && font_var != "inherit" ? "var(--#{font_var}, inherit)" : "inherit"
        {
          "--button-primary-color" => BUTTON_COLOR[primary], "--button-secondary-color" => BUTTON_COLOR[secondary],
          "--button-link-color" => BUTTON_COLOR[link], "--button-padding" => BUTTON_PADDING[padding],
          "--button-radius" => linked ? "var(--radius-button, .5rem)" : BUTTON_RADIUS[radius],
          "--button-font-family" => font, "--button-font-size" => BUTTON_SIZE[font_size],
          "--button-font-weight" => BUTTON_WEIGHT[weight], "--button-text-transform" => casing,
          "--button-letter-spacing" => BUTTON_TRACKING[tracking],
        }
      end

      def self.button_presets(site)
        vars = button_preset_variables(site)
        return "" if vars.empty?
        ":root {\n#{vars.map { |name, value| "  #{name}: #{value};" }.join("\n")}\n}"
      end
      private_class_method :button_presets

      def self.button_elements(site)
        return "" if button_preset_variables(site).empty?
        <<~CSS.rstrip
          :where(.dukafi-button) {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            padding: var(--button-padding);
            border: 1px solid transparent;
            border-radius: var(--button-radius);
            font-family: var(--button-font-family);
            font-size: var(--button-font-size);
            font-weight: var(--button-font-weight);
            letter-spacing: var(--button-letter-spacing);
            line-height: 1;
            text-transform: var(--button-text-transform);
            text-decoration: none;
            cursor: pointer;
            background: var(--button-primary-color);
            color: var(--scheme-on-accent, var(--scheme-background, white));
          }
          :where(.dukafi-button.button-secondary) { background: var(--button-secondary-color); color: var(--scheme-heading, currentColor); border-color: var(--scheme-border, currentColor); }
          :where(.dukafi-button.button-link) { padding-inline: 0; background: transparent; color: var(--button-link-color); }
        CSS
      end
      private_class_method :button_elements

      def self.input_preset_variables(site)
        framework = site.dig("settings", "framework")
        return {} unless framework.is_a?(Hash)
        return {} unless framework["inputs"].is_a?(Hash) || framework["buttons"].is_a?(Hash) || icons_enabled?(site)

        stored = framework["inputs"].is_a?(Hash) ? framework["inputs"] : {}
        role = ->(key) { pick_step(stored[key], INPUT_COLOR, INPUT_DEFAULTS[key]) }
        step = ->(key, table) { pick_step(stored[key], table, INPUT_DEFAULTS[key]) }
        linked = stored.key?("radiusLinked") ? !!stored["radiusLinked"] : true
        font_var = stored["fontVariable"].to_s
        font = font_var.match?(SAFE_SLUG) && font_var != "inherit" ? "var(--#{font_var}, inherit)" : "inherit"
        {
          "--input-background" => INPUT_COLOR[role.call("backgroundColor")], "--input-color" => INPUT_COLOR[role.call("textColor")],
          "--input-border-color" => INPUT_COLOR[role.call("borderColor")], "--input-focus-color" => INPUT_COLOR[role.call("focusColor")],
          "--input-padding" => INPUT_PADDING[step.call("padding", INPUT_PADDING)],
          "--input-radius" => linked ? "var(--radius-button, .5rem)" : BUTTON_RADIUS[step.call("radius", BUTTON_RADIUS)],
          "--input-border-width" => INPUT_BORDER[step.call("borderWidth", INPUT_BORDER)],
          "--input-font-family" => font, "--input-font-size" => BUTTON_SIZE[step.call("fontSize", BUTTON_SIZE)],
          "--input-font-weight" => BUTTON_WEIGHT[step.call("fontWeight", BUTTON_WEIGHT)],
        }
      end

      def self.input_presets(site)
        vars = input_preset_variables(site)
        return "" if vars.empty?
        ":root {\n#{vars.map { |name, value| "  #{name}: #{value};" }.join("\n")}\n}"
      end
      private_class_method :input_presets

      def self.input_elements(site)
        return "" if input_preset_variables(site).empty?
        <<~CSS.rstrip
          :where(.dukafi-input) {
            box-sizing: border-box;
            width: 100%;
            padding: var(--input-padding);
            border: var(--input-border-width) solid var(--input-border-color);
            border-radius: var(--input-radius);
            background: var(--input-background);
            color: var(--input-color);
            font-family: var(--input-font-family);
            font-size: var(--input-font-size);
            font-weight: var(--input-font-weight);
            line-height: 1.4;
          }
          :where(.dukafi-input)::placeholder { color: var(--scheme-body, currentColor); opacity: .6; }
          :where(.dukafi-input):focus-visible { outline: 2px solid var(--input-focus-color); outline-offset: 2px; }
        CSS
      end
      private_class_method :input_elements

      def self.pick_step(value, table, fallback)
        key = value.to_s
        table.key?(key) ? key : fallback
      end
      private_class_method :pick_step

      def self.type_styles(site)
        typography = site.dig("settings", "framework", "typography")
        return "" unless typography.is_a?(Hash)
        return "" if typography["isDisabled"]

        stored = Array(typography["styles"]).select { |row| row.is_a?(Hash) }
        by_tag = stored.each_with_object({}) { |row, index| index[row["tag"].to_s] = row }
        TYPE_TAGS.filter_map do |tag|
          row = type_defaults(tag, typography).merge(by_tag[tag] || {})
          decls = TYPE_PROPS.filter_map do |key, css|
            value = row[key].to_s.strip
            next if value.empty?
            next unless safe_value?(value)

            "  #{css}: #{value};"
          end
          next if decls.empty?

          ":where(#{tag}) {\n#{decls.join("\n")}\n}"
        end.join("\n\n")
      end
      private_class_method :type_styles

      def self.type_defaults(tag, typography)
        base = TYPE_DEFAULTS.fetch(tag)
        base.merge("fontSize" => scale_font_size(tag, typography, base["fontSize"]))
      end
      private_class_method :type_defaults

      def self.scale_font_size(tag, typography, fallback)
        group = Array(typography["groups"]).find { |row| row.is_a?(Hash) }
        return fallback unless group

        steps = group["steps"].to_s.split(",").map(&:strip)
        step = SCALE_STEP[tag]
        return fallback unless steps.include?(step)

        prefix = group["namingConvention"].to_s.strip
        prefix = "text" if prefix.empty?
        return fallback unless prefix.match?(SAFE_SLUG)

        "var(--#{prefix}-#{step}, #{fallback})"
      end
      private_class_method :scale_font_size

      def self.safe_value?(value)
        value.is_a?(String) && !value.match?(/[;{}]/) && !value.match?(%r{</style}i)
      end
      private_class_method :safe_value?
    end
  end
end
