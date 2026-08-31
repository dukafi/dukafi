class Dukafi
  module Publisher
    # CSS for the site's authored style rules.
    #
    # A style rule is `{ selector, styles, contextStyles, order }`. Until this
    # existed the Ruby publisher read only the rule's NAME — it handed the name
    # to Tailwind and threw the declarations away — so every property a
    # merchant set in the Styles panel rendered in the canvas (which applies
    # the map client-side) and vanished on publish.
    #
    # That silently broke more than it looked like: the framework colour
    # utilities (`text-primary` → `color: var(--primary)`) are authored rules
    # too, and Tailwind cannot generate them because `--primary` is not one of
    # its theme colours. Nothing named `*-primary` had ever reached a published
    # page.
    #
    # Emitted AFTER Tailwind in the bundle, so where a merchant has attached a
    # declaration to a utility class name the authored value wins on equal
    # specificity — which is what the canvas shows them.
    #
    # Mirrors `generateClassCSS` in `dukafi-editor/src/core/publisher/classCss.ts`.
    # Two of that emitter's features are deliberately NOT ported yet, because
    # nothing can currently author them (see `spec/publisher/style_rules_css_spec.rb`):
    # custom `@`-condition contexts, and `rawCss` rules (imported @keyframes).
    # Both are skipped rather than mis-rendered.
    class StyleRulesCss
      # A selector goes into the stylesheet verbatim, so it must not be able to
      # close its own block or the surrounding <style> element. Deliberately
      # narrow: the editor only produces class selectors today, optionally with
      # a pseudo-class/element or a descendant part.
      # Comma-separated lists are allowed (`.scheme-1, [data-scheme="scheme-1"]`).
      # Braces and `</` still fail the match, so a selector cannot close the
      # rule or the surrounding `<style>` element.
      SAFE_SELECTOR = /\A[.#\[]?[a-zA-Z_\[][\w\- .#:>\[\]="'~+(),]*\z/

      def self.call(site)
        return "" unless site.is_a?(Hash)

        rules = site["styleRules"]
        return "" unless rules.is_a?(Hash)

        blocks = ordered(rules).flat_map { |rule| rule_blocks(rule, breakpoints(site)) }
        blocks.join("\n\n")
      end

      # Smaller `order` first, so a later, more specific override appears later
      # in source and wins on equal specificity — the cascade the editor shows.
      def self.ordered(rules)
        rules.values.select { |rule| rule.is_a?(Hash) }.each_with_index.sort_by do |rule, index|
          [rule["order"].is_a?(Numeric) ? rule["order"] : 0, index]
        end.map(&:first)
      end
      private_class_method :ordered

      def self.breakpoints(site)
        list = site["breakpoints"]
        return [] unless list.is_a?(Array)

        list.filter_map do |breakpoint|
          next unless breakpoint.is_a?(Hash)

          id = breakpoint["id"].to_s
          query = breakpoint["mediaQuery"].to_s
          next if id.empty? || query.empty? || unsafe_prelude?(query)

          [id, query]
        end
      end
      private_class_method :breakpoints

      def self.rule_blocks(rule, breakpoints)
        selector = rule["selector"].to_s
        return [] unless selector.match?(SAFE_SELECTOR)

        blocks = []
        base = declarations(rule["styles"])
        blocks << "#{selector} {\n#{base}\n}" unless base.empty?

        # Responsive overrides. Keyed by breakpoint id, emitted in the site's
        # own breakpoint order so a narrower query cannot be defeated by a
        # wider one that happens to be listed later.
        contexts = rule["contextStyles"]
        return blocks unless contexts.is_a?(Hash)

        breakpoints.each do |id, query|
          decls = declarations(contexts[id])
          next if decls.empty?

          blocks << "@media #{query} {\n  #{selector} {\n#{decls}\n  }\n}"
        end
        blocks
      end
      private_class_method :rule_blocks

      def self.declarations(bag)
        return "" unless bag.is_a?(Hash)

        bag.filter_map do |property, value|
          name = css_property(property.to_s)
          next unless name

          text = css_value(value)
          next unless text

          "  #{name}: #{text};"
        end.join("\n")
      end
      private_class_method :declarations

      # Properties that execute script rather than style anything. Legacy IE
      # vectors, but a published stylesheet is served to whatever browser
      # shows up, and neither has any legitimate use in an authored rule.
      FORBIDDEN_PROPERTIES = %w[behavior -moz-binding].freeze

      # `backgroundColor` -> `background-color`. Custom properties pass through
      # unchanged; anything else must look like an identifier so a crafted key
      # cannot inject a declaration of its own.
      def self.css_property(property)
        return property if property.start_with?("--") && property.match?(/\A--[a-zA-Z0-9_-]+\z/)

        kebab = property.gsub(/([A-Z])/) { "-#{Regexp.last_match(1).downcase}" }
        return nil unless kebab.match?(/\A-?[a-zA-Z][a-zA-Z0-9-]*\z/)
        return nil if FORBIDDEN_PROPERTIES.include?(kebab.downcase)

        kebab
      end
      private_class_method :css_property

      # A value is merchant-controlled and lands inside a <style> block. `;` and
      # braces would let it start a new declaration or rule; `</` would close
      # the element (CWE-79). Rejecting outright, rather than stripping, keeps a
      # mangled value from rendering as something the author never wrote.
      def self.css_value(value)
        return nil if value.nil?
        return nil if value.is_a?(Hash) || value.is_a?(Array)

        text = value.to_s.strip
        return nil if text.empty?
        return nil if text.match?(/[;{}]/) || text.match?(%r{</}i)
        return nil if text.match?(/expression\s*\(|javascript\s*:|behavior\s*:|@import/i)

        text
      end
      private_class_method :css_value

      def self.unsafe_prelude?(query)
        query.match?(/[{}]/) || query.match?(%r{</}i)
      end
      private_class_method :unsafe_prelude?
    end
  end
end
