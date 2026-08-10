require_relative "../spec_helper"

# The editor shipped eleven form modules with no Ruby counterpart, so any page
# containing one raised KeyError in RenderPage and could never be published.
# These renderers mirror the EDITOR's schema — it is the reference, since
# existing documents were authored against it.
class FormModulesSpec < Minitest::Test
  EDITOR_FORM_MODULES = %w[
    base.form base.label base.input base.textarea base.select base.option
    base.option-group base.checkbox base.radio base.submit base.form-message
  ].freeze

  def render(module_id, props, children = [])
    Dukafy::Publisher::REGISTRY.fetch(module_id).render(props, children, prefetched: {}).fetch(:html)
  end

  def node(id, module_id, children: [], props: {})
    { "id" => id, "moduleId" => module_id, "children" => children, "props" => props,
      "classIds" => [], "breakpointOverrides" => {} }
  end

  def test_every_editor_form_module_can_be_published
    # The regression that matters: before this, each of these crashed the
    # whole page render, not just its own node.
    EDITOR_FORM_MODULES.each do |module_id|
      document = { "rootNodeId" => module_id, "nodes" => { module_id => node(module_id, module_id) } }
      Dukafy::Publisher::RenderPage.call(
        document: document, registry: Dukafy::Publisher::REGISTRY, prefetched: {}
      )
    end
  end

  def test_input_uses_the_editors_prop_names
    html = render("base.input", {
      "inputType" => "email", "fieldId" => "contact_email", "name" => "", "id" => "e1",
      "placeholder" => "you@example.com", "value" => "", "required" => true,
      "disabled" => false, "readOnly" => false, "autocomplete" => "email",
      "minLength" => 0, "maxLength" => 120, "pattern" => "", "htmlAttributes" => {},
    })

    # `inputType`, not `type` — using the wrong name silently made every
    # input a text box.
    assert_includes html, 'type="email"'
    # `name` falls back to `fieldId`, as the editor does.
    assert_includes html, 'name="contact_email"'
    assert_includes html, 'id="e1"'
    assert_includes html, 'maxlength="120"'
    # Zero-valued length limits are dropped, not emitted as minlength="0".
    refute_includes html, "minlength"
    assert_includes html, " required"
    refute_includes html, "disabled"
  end

  def test_an_explicit_name_beats_the_field_id
    html = render("base.input", { "fieldId" => "fallback", "name" => "chosen", "inputType" => "text" })
    assert_includes html, 'name="chosen"'
    refute_includes html, 'name="fallback"'
  end

  def test_select_renders_its_child_option_nodes
    # Options are CHILD NODES in the editor, not a text prop — a prop-based
    # implementation would have dropped every option silently.
    document = {
      "rootNodeId" => "sel",
      "nodes" => {
        "sel" => node("sel", "base.select", children: %w[a b],
                      props: { "fieldId" => "county", "name" => "" }),
        "a" => node("a", "base.option", props: { "value" => "nairobi", "label" => "Nairobi" }),
        "b" => node("b", "base.option", props: { "value" => "mombasa", "label" => "Mombasa", "selected" => true }),
      },
    }

    html = Dukafy::Publisher::RenderPage.call(
      document: document, registry: Dukafy::Publisher::REGISTRY, prefetched: {}
    ).html

    assert_includes html, 'name="county"'
    assert_includes html, '<option value="nairobi">Nairobi</option>'
    assert_includes html, '<option value="mombasa" selected>Mombasa</option>'
  end

  def test_an_empty_option_value_is_still_emitted
    # Without value="", an option submits its own text, turning a neutral
    # "Any" choice into a filter value named after its label.
    assert_includes render("base.option", { "value" => "", "label" => "Any" }), 'value=""'
  end

  def test_cms_mode_forms_render_with_a_honeypot_and_custom_mode_does_not
    cms = render("base.form", { "mode" => "cms", "formId" => "contact", "honeypotName" => "company" })
    assert_includes cms, 'data-dukafy-form-mode="cms"'
    assert_includes cms, 'name="company"'
    assert_includes cms, "data-dukafy-honeypot"

    custom = render("base.form", { "mode" => "custom", "formId" => "c", "action" => "/x", "method" => "post" })
    assert_includes custom, 'action="/x"'
    refute_includes custom, "honeypot"
  end

  def test_form_method_falls_back_to_post_for_unknown_values
    assert_includes render("base.form", { "method" => "sideways" }), 'method="post"'
    assert_includes render("base.form", { "method" => "get" }), 'method="get"'
  end

  def test_user_supplied_values_are_escaped
    evil = %(" onfocus="alert(1))
    html = render("base.input", { "inputType" => "text", "fieldId" => "f", "value" => evil })
    refute_includes html, 'onfocus="alert'

    area = render("base.textarea", { "fieldId" => "f", "value" => "<script>alert(1)</script>" })
    refute_includes area, "<script>"

    option = render("base.option", { "value" => "x", "label" => "<img onerror=1>" })
    refute_includes option, "<img"
  end

  def test_submit_and_form_message_render_their_wiring
    assert_includes render("base.submit", { "label" => "Send", "formId" => "contact" }),
                    '<button type="submit" form="contact">Send</button>'

    error = render("base.form-message", { "formId" => "contact", "kind" => "error", "text" => "Nope" })
    assert_includes error, 'role="alert"'
    assert_includes render("base.form-message", { "kind" => "success", "text" => "Yes" }), 'role="status"'
  end
end
