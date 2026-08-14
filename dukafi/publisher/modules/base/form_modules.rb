require "cgi"

class Dukafi
  module Publisher
    # Server-side renderers for the editor's form modules.
    #
    # The editor already shipped these eleven modules (Instatic-era) with no
    # Ruby counterpart, which meant ANY page containing a form element raised
    # KeyError in RenderPage and could never be published. These renderers
    # mirror the editor's own `render()` output so canvas and published HTML
    # agree — the editor is the reference here, not the other way round, since
    # its schema is what existing documents were authored against.
    #
    # Prop names therefore follow the editor exactly: `inputType` (not `type`),
    # `name` falling back to `fieldId`, options as CHILD `base.option` nodes
    # rather than a text prop.
    module BaseFormModules
      # `file` and `hidden` are in the editor's list, so documents may already
      # contain them and we must not silently rewrite the author's choice.
      INPUT_TYPES = %w[
        text email password search tel url number date time datetime-local file hidden
      ].freeze

      module_function

      def register(registry)
        register_form(registry)
        register_label(registry)
        register_input(registry)
        register_textarea(registry)
        register_select(registry)
        register_option(registry)
        register_option_group(registry)
        register_choice(registry, "base.checkbox", "checkbox")
        register_choice(registry, "base.radio", "radio")
        register_submit(registry)
        register_form_message(registry)
        registry
      end

      # Attribute list builder mirroring the editor's `attrs()` — empty values
      # are dropped rather than emitted as `attr=""`.
      def attrs(pairs)
        pairs.filter_map do |name, value|
          next if value.nil?

          text = value.to_s
          next if text.empty?

          %( #{name}="#{CGI.escapeHTML(text)}")
        end.join
      end

      def flags(props, names)
        names.filter_map { |name| " #{name}" if props[camel(name)] || props[name] }.join
      end

      def camel(name)
        name == "readonly" ? "readOnly" : name
      end

      def identifier(value, fallback = "")
        candidate = value.to_s.strip
        candidate.match?(/\A[a-zA-Z][a-zA-Z0-9_-]{0,63}\z/) ? candidate : fallback
      end

      def input_type(value)
        candidate = value.to_s.downcase
        INPUT_TYPES.include?(candidate) ? candidate : "text"
      end

      def positive(value)
        number = Integer(value.to_s, exception: false)
        number&.positive? ? number : nil
      end

      def field_name(props)
        name = props["name"].to_s
        name.empty? ? props["fieldId"].to_s : name
      end

      def register_form(registry)
        registry.register(
          "base.form",
          schema: { "action" => { type: :url } },
          defaults: {
            "mode" => "cms", "formId" => "form", "targetTableId" => "", "action" => "",
            "method" => "post", "successBehavior" => "message",
            "successMessage" => "", "redirectUrl" => "", "honeypotName" => "company",
            "minSubmitSeconds" => 2, "htmlAttributes" => {},
          },
        ) do |props, children, _context|
          form_id = identifier(props["formId"], "form")
          custom = props["mode"].to_s == "custom"
          # `dialog` is a real HTML method but meaningless without a <dialog>
          # ancestor; anything unknown falls back to POST so typed values never
          # end up in the URL.
          method = %w[get post dialog].include?(props["method"].to_s) ? props["method"].to_s : "post"
          wiring = attrs([
            ["data-dukafy-form-id", form_id],
            ["data-dukafy-form-mode", custom ? "custom" : "cms"],
            ["data-dukafy-target-table", custom ? nil : props["targetTableId"]],
            # CMS-native forms post to Dukafi; custom forms go wherever the
            # merchant said. Either way this is a real HTML action, so the
            # form works with JavaScript switched off.
            ["action", custom ? BaseHelpers.safe_url(props["action"]) : "/forms/#{form_id}"],
            ["data-dukafy-success-message",
             props["successBehavior"].to_s == "message" ? props["successMessage"] : nil],
            ["data-dukafy-success-redirect",
             props["successBehavior"].to_s == "redirect" ? BaseHelpers.safe_url(props["redirectUrl"]) : nil],
          ])
          # Anti-spam is server-side and JS-free: a honeypot a human never
          # sees, plus a SIGNED render timestamp so the elapsed-time check
          # can't be forged by editing the field.
          hidden_fields = if custom
            ""
          else
            trap = identifier(props["honeypotName"], "company")
            token = FormSubmissionIntake.timestamp_token
            %(<input type="text" name="#{trap}" autocomplete="off" tabindex="-1" data-dukafy-honeypot hidden>) +
              %(<input type="hidden" name="_ts" value="#{CGI.escapeHTML(token)}">)
          end
          html = %(<form#{wiring}#{BaseHelpers.html_attributes(props['htmlAttributes'])} method="#{method}">#{hidden_fields}#{children.join}</form>)
          { html: html }
        end
      end

      def register_label(registry)
        registry.register(
          "base.label",
          defaults: { "text" => "Label", "targetMode" => "auto", "targetId" => "" },
        ) do |props, _children, _context|
          text = CGI.escapeHTML(props["text"].to_s)
          target = identifier(props["targetId"])
          if props["targetMode"].to_s == "explicit" && !target.empty?
            { html: %(<label for="#{target}">#{text}</label>) }
          else
            { html: %(<label data-dukafy-label-target="auto">#{text}</label>) }
          end
        end
      end

      def register_input(registry)
        registry.register(
          "base.input",
          defaults: {
            "inputType" => "text", "fieldId" => "", "name" => "", "id" => "",
            "placeholder" => "", "value" => "", "required" => false, "disabled" => false,
            "readOnly" => false, "autocomplete" => "", "min" => "", "max" => "",
            "minLength" => 0, "maxLength" => 0, "pattern" => "", "htmlAttributes" => {},
          },
        ) do |props, _children, _context|
          body = attrs([
            ["data-dukafy-form-control", "input"],
            ["data-dukafy-field-id", props["fieldId"]],
            ["type", input_type(props["inputType"])],
            ["name", field_name(props)],
            ["id", props["id"]],
            ["placeholder", props["placeholder"]],
            ["value", props["value"]],
            ["autocomplete", props["autocomplete"]],
            ["min", props["min"]],
            ["max", props["max"]],
            ["minlength", positive(props["minLength"])],
            ["maxlength", positive(props["maxLength"])],
            ["pattern", props["pattern"]],
          ])
          { html: %(<input#{BaseHelpers.html_attributes(props['htmlAttributes'])}#{body}#{flags(props, %w[required disabled readonly])}>) }
        end
      end

      def register_textarea(registry)
        registry.register(
          "base.textarea",
          defaults: {
            "fieldId" => "", "name" => "", "id" => "", "placeholder" => "", "value" => "",
            "required" => false, "disabled" => false, "readOnly" => false,
            "rows" => 4, "minLength" => 0, "maxLength" => 0, "htmlAttributes" => {},
          },
        ) do |props, _children, _context|
          body = attrs([
            ["data-dukafy-form-control", "textarea"],
            ["data-dukafy-field-id", props["fieldId"]],
            ["name", field_name(props)],
            ["id", props["id"]],
            ["placeholder", props["placeholder"]],
            ["rows", props["rows"]],
            ["minlength", positive(props["minLength"])],
            ["maxlength", positive(props["maxLength"])],
          ])
          { html: %(<textarea#{BaseHelpers.html_attributes(props['htmlAttributes'])}#{body}#{flags(props, %w[required disabled readonly])}>#{CGI.escapeHTML(props['value'].to_s)}</textarea>) }
        end
      end

      def register_select(registry)
        registry.register(
          "base.select",
          defaults: {
            "fieldId" => "", "name" => "", "id" => "",
            "required" => false, "disabled" => false, "multiple" => false, "htmlAttributes" => {},
          },
        ) do |props, children, _context|
          body = attrs([
            ["data-dukafy-form-control", "select"],
            ["data-dukafy-field-id", props["fieldId"]],
            ["name", field_name(props)],
            ["id", props["id"]],
          ])
          # Options are CHILD nodes (`base.option` / `base.option-group`), not
          # a prop — matching how the editor composes a select.
          { html: %(<select#{BaseHelpers.html_attributes(props['htmlAttributes'])}#{body}#{flags(props, %w[required disabled multiple])}>#{children.join}</select>) }
        end
      end

      def register_option(registry)
        registry.register(
          "base.option",
          defaults: { "value" => "", "label" => "Option", "selected" => false, "disabled" => false },
        ) do |props, _children, _context|
          # `value` is emitted even when empty: an option with no value
          # attribute submits its own text instead, which would turn a neutral
          # "any" choice into a filter value named after its label.
          { html: %(<option value="#{CGI.escapeHTML(props['value'].to_s)}"#{flags(props, %w[selected disabled])}>#{CGI.escapeHTML(props['label'].to_s)}</option>) }
        end
      end

      def register_option_group(registry)
        registry.register(
          "base.option-group",
          defaults: { "label" => "Group", "disabled" => false },
        ) do |props, children, _context|
          { html: %(<optgroup#{attrs([['label', props['label']]])}#{flags(props, %w[disabled])}>#{children.join}</optgroup>) }
        end
      end

      def register_choice(registry, module_id, type)
        registry.register(
          module_id,
          defaults: {
            "fieldId" => "", "name" => "", "id" => "", "value" => "",
            "checked" => false, "required" => false, "disabled" => false, "htmlAttributes" => {},
          },
        ) do |props, _children, _context|
          body = attrs([
            ["data-dukafy-form-control", type],
            ["data-dukafy-field-id", props["fieldId"]],
            ["type", type],
            ["name", field_name(props)],
            ["id", props["id"]],
            ["value", props["value"]],
          ])
          { html: %(<input#{BaseHelpers.html_attributes(props['htmlAttributes'])}#{body}#{flags(props, %w[checked required disabled])}>) }
        end
      end

      def register_submit(registry)
        registry.register(
          "base.submit",
          defaults: { "label" => "Submit", "disabled" => false, "formId" => "" },
        ) do |props, _children, _context|
          { html: %(<button type="submit"#{attrs([['form', identifier(props['formId'])]])}#{flags(props, %w[disabled])}>#{CGI.escapeHTML(props['label'].to_s)}</button>) }
        end
      end

      def register_form_message(registry)
        registry.register(
          "base.form-message",
          defaults: { "formId" => "", "kind" => "status", "text" => "" },
        ) do |props, _children, _context|
          kind = %w[status success error].include?(props["kind"].to_s) ? props["kind"].to_s : "status"
          role = kind == "error" ? "alert" : "status"
          { html: %(<div data-dukafy-form-message="#{kind}" data-dukafy-form-id="#{identifier(props['formId'])}" role="#{role}">#{CGI.escapeHTML(props['text'].to_s)}</div>) }
        end
      end
    end
  end
end
