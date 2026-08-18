require "digest"

class Dukafi
  module Publisher
    class CssCollector
      Bundle = Data.define(:filename, :hash, :content)

      # Shown while an htmx request is in flight. htmx stamps `.htmx-request`
      # on the element that issued it (the form for add-to-cart / CMS submit,
      # the button for attachable verbs). Collected only on pages that already
      # pull htmx — a text page stays CSS-free of this too.
      HTMX_BUSY_CSS = <<~CSS.chomp
        @keyframes dukafy-spin{to{transform:rotate(360deg)}}form.htmx-request :is(button[type=submit],input[type=submit])::after,button.htmx-request::after{content:"";box-sizing:border-box;display:inline-block;width:1em;height:1em;margin-inline-start:.5em;border:.125em solid currentColor;border-right-color:transparent;border-radius:999px;vertical-align:-.125em;animation:dukafy-spin .6s linear infinite}form.htmx-request :is(button[type=submit],input[type=submit]),button.htmx-request{cursor:wait}form.htmx-request :is(button[type=submit],input[type=submit]):disabled,button.htmx-request:disabled{opacity:.85}.dukafy-form-result:empty{display:none}@media (prefers-reduced-motion:reduce){form.htmx-request :is(button[type=submit],input[type=submit])::after,button.htmx-request::after{animation:none;border-right-color:currentColor;opacity:.5}}
      CSS

      def initialize
        @rules = {}
      end

      def add(module_id, css)
        return if css.nil? || css.empty? || @rules.key?(module_id)

        @rules[module_id] = css.gsub(%r{</style}i, '<\\/style')
      end

      def to_s
        @rules.values.join("\n")
      end

      # Cascade layers, weakest first:
      #
      #   dukafy-reset    — the platform reset
      #   dukafy-modules  — a module's built-in look (a loop's grid, a buy
      #                     button's padding). DEFAULTS, so an authored class
      #                     must beat them.
      #   (unlayered)     — Tailwind utilities, framework variables, and page
      #                     CSS. Unlayered declarations beat every layered one
      #                     regardless of specificity, so whatever the merchant
      #                     put on the element wins.
      #
      # Without this, module CSS simply came LAST at equal specificity and won:
      # `.dukafy-collection-loop{grid-template-columns:repeat(auto-fit,...)}`
      # silently overrode an authored `lg:grid-cols-4`, and the published grid
      # disagreed with the editor canvas.
      LAYER_ORDER = "@layer dukafy-reset, dukafy-modules;".freeze

      def bundle(framework_css: "", tailwind_css: "", page_css: "", fonts_css: "", style_rules_css: "")
        modules_css = to_s
        content = [
          LAYER_ORDER,
          layered("dukafy-reset", RESET_CSS),
          # Deliberately UNLAYERED. `@font-face` is not a style rule and takes
          # no part in the cascade, and the `--font-*` token variables have to
          # resolve for every layer that references them.
          sanitize(fonts_css),
          framework_css,
          sanitize(tailwind_css),
          # AFTER Tailwind: where a merchant has attached a declaration to a
          # utility class name, the value they authored is the one the canvas
          # shows them, so it must win on equal specificity here too.
          sanitize(style_rules_css),
          layered("dukafy-modules", modules_css),
          sanitize(page_css),
        ].reject(&:empty?).join("\n")
        hash = Digest::SHA256.hexdigest(content).slice(0, 12)
        Bundle.new(filename: "site-#{hash}.css", hash: hash, content: content)
      end

      private

      def layered(name, css)
        text = css.to_s
        text.empty? ? "" : "@layer #{name} {\n#{text}\n}"
      end

      def sanitize(css)
        css.to_s.gsub(%r{</style}i, '<\\/style')
      end
    end
  end
end
