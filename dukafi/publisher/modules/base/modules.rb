class Dukafi
  module Publisher
    module BaseModules
      module_function

      def register(registry)
        register_body(registry)
        register_container(registry)
        register_text(registry)
        register_image(registry)
        register_button(registry)
        register_link(registry)
        register_list(registry)
        BaseFormModules.register(registry)
        BaseMediaModules.register(registry)
        registry
      end

      def register_body(registry)
        registry.register("base.body") { |_props, children, _context| { html: children.join } }
      end

      def register_container(registry)
        registry.register("base.container", defaults: { "tag" => "div", "customTag" => "", "htmlAttributes" => {} }) do |props, children, _context|
          tag = BaseHelpers.container_tag(props["tag"], props["customTag"])
          attrs = BaseHelpers.html_attributes(props["htmlAttributes"])
          html = BaseHelpers::VOID_TAGS.include?(tag) ? "<#{tag}#{attrs}>" : "<#{tag}#{attrs}>#{children.join}</#{tag}>"
          { html: html }
        end
      end

      def register_text(registry)
        registry.register("base.text", defaults: { "text" => "Add your text here.", "tag" => "p", "htmlAttributes" => {} }) do |props, _children, _context|
          text = props["text"].to_s
          tag = BaseHelpers.text_tag(props["tag"])
          next({ html: text }) if tag == "none"

          { html: "<#{tag}#{BaseHelpers.html_attributes(props['htmlAttributes'])}>#{text.gsub("\n", '<br>')}</#{tag}>" }
        end
      end

      def register_image(registry)
        registry.register(
          "base.image",
          schema: { "src" => { type: :image } },
          defaults: { "src" => "", "loading" => "lazy", "fetchPriority" => "auto", "decoding" => "async", "htmlAttributes" => {} },
        ) do |props, _children, context|
          src = BaseHelpers.safe_url(props["src"])
          next({ html: "" }) if props["src"].to_s.empty? || src == "#"

          media = context[:prefetched][props["src"]] || {}
          alt = CGI.escapeHTML(media.fetch("altText", "").to_s.strip)
          loading = props["loading"] == "eager" ? "eager" : "lazy"
          decoding = %w[sync auto].include?(props["decoding"]) ? props["decoding"] : "async"
          priority = %w[high low].include?(props["fetchPriority"]) ? %( fetchpriority="#{props['fetchPriority']}") : ""
          dimensions = %w[width height].filter_map { |key| media[key] ? %( #{key}="#{Integer(media[key])}") : nil }.join
          variants = media.fetch("variants", [])
          srcset = variants.filter_map do |variant|
            url = BaseHelpers.safe_url(variant["path"])
            %(#{url} #{Integer(variant["width"])}w) unless url.empty? || url == "#"
          end.join(", ")
          responsive = srcset.empty? ? "" : %( srcset="#{srcset}" sizes="auto, 100vw")
          attrs = BaseHelpers.html_attributes(props["htmlAttributes"])
          { html: %(<img#{attrs} src="#{src}"#{responsive} alt="#{alt}"#{dimensions} loading="#{loading}" decoding="#{decoding}"#{priority}>) }
        end
      end

      def register_button(registry)
        registry.register(
          "base.button",
          schema: { "href" => { type: :url } },
          defaults: { "label" => "Get Started", "href" => "", "target" => "_self", "disabled" => false, "buttonType" => "button", "htmlAttributes" => {} },
        ) do |props, _children, _context|
          attrs = BaseHelpers.html_attributes(props["htmlAttributes"])
          href = BaseHelpers.safe_url(props["href"])
          target = BaseHelpers.target(props["target"])
          if !props["href"].to_s.empty? && href != "#"
            rel = target == "_blank" ? ' rel="noopener noreferrer"' : ""
            { html: %(<a#{attrs} href="#{href}" target="#{target}"#{rel}>#{props['label']}</a>) }
          else
            type = props["buttonType"] == "reset" ? "reset" : "button"
            disabled = props["disabled"] ? ' disabled aria-disabled="true"' : ""
            { html: %(<button#{attrs} type="#{type}"#{disabled}>#{props['label']}</button>) }
          end
        end
      end

      def register_link(registry)
        registry.register(
          "base.link",
          schema: { "href" => { type: :url } },
          defaults: { "href" => "#", "text" => "Click here", "target" => "_self", "htmlAttributes" => {} },
        ) do |props, children, _context|
          target = BaseHelpers.target(props["target"])
          rel = target == "_blank" ? ' rel="noopener noreferrer"' : ""
          content = children.empty? ? props["text"] : children.join
          { html: %(<a#{BaseHelpers.html_attributes(props['htmlAttributes'])} href="#{BaseHelpers.safe_url(props['href'])}" target="#{target}"#{rel}>#{content}</a>) }
        end
      end

      def register_list(registry)
        registry.register("base.list", defaults: { "items" => "", "listType" => "unordered" }) do |props, _children, _context|
          tag = props["listType"] == "ordered" ? "ol" : "ul"
          items = props["items"].to_s.lines(chomp: true).map(&:strip).reject(&:empty?)
          { html: "<#{tag}>#{items.map { |item| "<li>#{item}</li>" }.join}</#{tag}>" }
        end
      end
    end

    BaseModules.register(REGISTRY)
  end
end
