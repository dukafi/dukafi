class Dukafy
  module Publisher
    # Client-side runtimes a page can pull in, and the tags that load them.
    #
    # Modules declare what they need by returning `runtimes: [:htmx]` from
    # their renderer, exactly like they already return `css:`. RenderPage
    # collects the union across every node it renders, so a page ships a
    # runtime if and only if something on it actually uses one — a
    # text-only page ships no JavaScript at all.
    #
    # Adding a runtime here is the whole registration step; nothing else
    # needs to know about it.
    module RuntimeScripts
      DEFINITIONS = {
        htmx: { src: "/js/htmx.min.js", defer: true },
      }.freeze

      KNOWN = DEFINITIONS.keys.freeze

      # Normalize whatever a renderer declared into known runtime symbols.
      # Unknown names are dropped rather than raising: a stray declaration
      # should not take down a published page.
      def self.normalize(declared)
        return [] if declared.nil?

        Array(declared).filter_map do |name|
          symbol = name.to_sym
          symbol if DEFINITIONS.key?(symbol)
        rescue NoMethodError
          nil
        end
      end

      # Script tags for the given runtimes, emitted in DEFINITIONS order so
      # output is deterministic regardless of node/render order (golden
      # fixtures depend on this).
      def self.tags(runtimes)
        wanted = normalize(runtimes)
        KNOWN.filter_map do |name|
          next unless wanted.include?(name)

          definition = DEFINITIONS.fetch(name)
          %(<script src="#{definition.fetch(:src)}"#{definition[:defer] ? ' defer' : ''}></script>)
        end.join
      end
    end
  end
end
