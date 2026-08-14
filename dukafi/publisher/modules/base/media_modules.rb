require "cgi"

class Dukafi
  module Publisher
    # Renderers for the modules the HTML importer can produce but the publisher
    # had no counterpart for.
    #
    # This gap is not theoretical: the assistant wrote an `<svg>`, the importer
    # mapped it to `base.svg` exactly as it does for a pasted logo, and Publish
    # died with `KeyError: key not found: "base.svg"` — after the edit had
    # already been saved. Anything the importer can emit MUST be publishable, or
    # a merchant can reach a document they cannot ship. `spec/architecture/
    # importable_modules_spec.rb` now holds that line.
    module BaseMediaModules
      module_function

      def register(registry)
        register_svg(registry)
        register_video(registry)
        register_outlet(registry)
        register_loop(registry)
        registry
      end

      # Inline SVG.
      #
      # `schema: :svg` keeps `escaped_props` from HTML-escaping the markup —
      # escaping it would emit the source as visible text — so this renderer
      # owns the sanitising instead. The markup reaches us from a paste or a
      # language model, and an `<svg>` is a script-execution vector: it can
      # carry `<script>`, `on*` handlers, and `javascript:` hrefs.
      def register_svg(registry)
        registry.register(
          "base.svg",
          schema: { "svg" => { type: :svg } },
          defaults: { "svg" => "", "title" => "" },
        ) do |props, _children, _context|
          markup = SvgSanitizer.call(props["svg"])
          next { html: "" } if markup.empty?

          label = props["title"].to_s.strip
          if label.empty?
            { html: markup }
          else
            # Announce the graphic to a screen reader, on the root element.
            { html: markup.sub(/\A(\s*<svg\b)/i, %(\\1 role="img" aria-label="#{CGI.escapeHTML(label)}")) }
          end
        end
      end

      YOUTUBE = %r{(?:youtube\.com/(?:watch\?v=|embed/)|youtu\.be/)([A-Za-z0-9_-]{6,20})}

      # Video: a YouTube embed or a self-hosted file.
      #
      # Deliberately simpler than the canvas renderer, which also picks a poster
      # from the media-variant ladder. That is an optimisation; a video that
      # plays is the correctness bar, and the ladder needs resolved media the
      # publisher does not thread here yet.
      def register_video(registry)
        registry.register(
          "base.video",
          schema: { "videoUrl" => { type: :url }, "poster" => { type: :media } },
          defaults: {
            "videoUrl" => "", "poster" => "", "title" => "", "autoplay" => false,
            "controls" => true, "loop" => false, "muted" => false, "preload" => "metadata",
            "htmlAttributes" => {},
          },
        ) do |props, _children, _context|
          raw = props["videoUrl"].to_s
          id = YOUTUBE.match(raw)&.captures&.first
          attrs = BaseHelpers.html_attributes(props["htmlAttributes"])

          if id
            title = CGI.escapeHTML(props["title"].to_s.empty? ? "YouTube video" : props["title"].to_s)
            src = "https://www.youtube.com/embed/#{id}"
            src += "?autoplay=1&mute=1" if props["autoplay"]
            next { html: %(<iframe#{attrs} src="#{src}" title="#{title}" frameborder="0" ) +
                         %(allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" ) +
                         %(allowfullscreen loading="lazy"></iframe>) }
          end

          src = BaseHelpers.safe_url(raw)
          # An empty <video> is the honest output for a missing source: the
          # element is still in the tree and still selectable in the editor.
          next { html: "<video></video>" } if src.nil? || src == "#" || src.empty?

          flags = %w[autoplay controls loop muted].filter_map { |name| " #{name}" if props[name] }.join
          preload = %w[none metadata auto].include?(props["preload"].to_s) ? props["preload"].to_s : "metadata"
          poster = BaseHelpers.safe_url(props["poster"].to_s)
          poster_attr = poster && poster != "#" ? %( poster="#{CGI.escapeHTML(poster)}") : ""
          { html: %(<video#{attrs} src="#{CGI.escapeHTML(src)}"#{poster_attr} preload="#{preload}"#{flags}></video>) }
        end
      end

      # A template content outlet. Dukafi composes templates in `Bake` rather
      # than through an outlet node, so nothing fills this — but the importer
      # can still produce one from a `<cms-outlet>` element, and a document
      # containing one has to remain publishable.
      def register_outlet(registry)
        registry.register("base.outlet", defaults: {}) do |_props, _children, _context|
          { html: "" }
        end
      end

      # The generic CMS loop, from Instatic. Dukafi's commerce loops are
      # `store.relationship-loop` / `store.collection-loop`, which RenderPage
      # handles itself. With no data source behind it this renders its children
      # once — the shape the author sees on the canvas.
      def register_loop(registry)
        registry.register("base.loop", defaults: { "tag" => "div", "customTag" => "", "htmlAttributes" => {} }) do |props, children, _context|
          tag = BaseHelpers.container_tag(props["tag"], props["customTag"])
          { html: %(<#{tag}#{BaseHelpers.html_attributes(props['htmlAttributes'])}>#{children.join}</#{tag}>) }
        end
      end
    end
  end
end
