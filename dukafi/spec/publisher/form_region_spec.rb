require_relative "../spec_helper"

# Form regions and the account verbs.
#
# The merchant designs a sign-in box out of ordinary nodes; Dukafi contributes
# the verb on the button, the live area around it, and a `form` frame the
# conditions read. Nothing here emits markup of Dukafi's own.
class FormRegionSpec < Minitest::Test
  def registry
    Dukafi::Publisher::Registry.new.tap do |registry|
      registry.register("base.body") { |_p, children, _c| { html: children.join } }
      registry.register("base.box") { |_p, children, _c| { html: "<div>#{children.join}</div>" } }
      registry.register("base.form") { |_p, children, _c| { html: %(<form action="/forms/f">#{children.join}</form>) } }
      registry.register("base.submit", defaults: { "label" => "Go" }) do |props, _children, _c|
        { html: %(<button type="submit">#{props.fetch('label')}</button>) }
      end
      registry.register("base.button", defaults: { "label" => "Go" }) do |props, _children, _c|
        { html: %(<button type="button">#{props.fetch('label')}</button>) }
      end
      registry.register("base.text", defaults: { "text" => "" }) do |props, _children, _c|
        { html: "<p>#{props.fetch('text')}</p>" }
      end
    end
  end

  def node(id, module_id, children: [], props: {})
    {
      "id" => id, "moduleId" => module_id, "children" => children,
      "props" => props, "breakpointOverrides" => {}, "classIds" => [],
    }
  end

  # A login box as a merchant would actually build it: a region wrapping a
  # form, a submit button carrying the verb, and a banner conditioned on the
  # error coming back.
  def login_document
    {
      "rootNodeId" => "root",
      "nodes" => {
        "root" => node("root", "base.body", children: %w[region]),
        "region" => node("region", "base.box", children: %w[banner form])
                    .merge("actions" => { "region" => "form" }),
        "banner" => node("banner", "base.text", props: { "text" => "{form.error}" })
                    .merge("visibleWhen" => { "source" => "form", "field" => "hasError", "operator" => "isTrue" }),
        "form" => node("form", "base.form", children: %w[submit]),
        "submit" => node("submit", "base.submit", props: { "label" => "Sign in" })
                    .merge("actions" => { "click" => { "type" => "account.login" } }),
      },
    }
  end

  def render(document, form: nil)
    Dukafi::Publisher::RenderPage.call(
      document: document, registry: registry, form: form, page_paths: {}
    )
  end

  # ── The region ──────────────────────────────────────────────────────────

  # The whole reason this differs from a cart region. A cart has nothing
  # honest to show before it knows the visitor; a login form is the same for
  # everybody, so blanking it would make it flash in on every page load.
  def test_the_form_renders_at_bake_time_rather_than_as_an_empty_shell
    html = render(login_document).html

    assert_includes html, "<form action=\"/forms/f\">"
    assert_includes html, ">Sign in</button>"
    assert_includes html, 'data-dukafy-form-region="region"'
  end

  def test_a_baked_region_reveals_itself_so_an_already_signed_in_visitor_is_corrected
    html = render(login_document).html

    assert_includes html, "hx-trigger=\"revealed,"
    assert_includes html, "dukafi:account-error from:body"
  end

  # The trap the cart region already fell into: `revealed` on the RESPONSE
  # re-fires forever, because an outerHTML swap resets htmx's own guard
  # attribute and the fresh element is already in view.
  def test_the_re_rendered_region_drops_revealed_so_it_cannot_loop
    html = render(login_document, form: { "hasError" => false }).html

    refute_includes html, "revealed"
    assert_includes html, "dukafi:account-updated from:body"
  end

  # ── The frame ───────────────────────────────────────────────────────────

  def test_the_error_banner_is_absent_until_an_error_actually_comes_back
    html = render(login_document).html

    refute_includes html, "<p>"
  end

  def test_the_error_banner_renders_the_backend_message
    html = render(login_document, form: {
      "hasError" => true, "error" => "Email or password is incorrect.",
    }).html

    assert_includes html, "<p>Email or password is incorrect.</p>"
  end

  def test_a_successful_submit_leaves_the_error_banner_hidden
    html = render(login_document, form: {
      "hasError" => false, "error" => "", "message" => "Welcome back.", "signedIn" => true,
    }).html

    refute_includes html, "<p>"
  end

  # `form.*` outside a form region has no frame to read, and must fall back
  # like any unresolved binding rather than rendering the token literally.
  def test_form_tokens_resolve_to_empty_without_a_frame
    document = {
      "rootNodeId" => "root",
      "nodes" => {
        "root" => node("root", "base.body", children: %w[hello]),
        "hello" => node("hello", "base.text", props: { "text" => "Hi {form.name|there}" }),
      },
    }

    assert_includes render(document).html, "<p>Hi there</p>"
  end

  # ── The verb ────────────────────────────────────────────────────────────

  def test_the_submit_button_posts_to_the_login_endpoint_with_the_form_fields
    html = render(login_document).html

    assert_includes html, 'hx-post="/fragments/account/login"'
    assert_includes html, 'hx-include="closest form"'
    assert_includes html, 'hx-disabled-elt="this"'
  end

  # The button is the merchant's own design. Swapping a response into it would
  # replace their label with Dukafi's markup — the exact thing the 204 on the
  # add-to-cart endpoint exists to avoid.
  def test_the_button_swaps_nothing
    assert_includes render(login_document).html, 'hx-swap="none"'
  end

  # Without this the region cannot be addressed, and an error has nowhere to
  # render.
  def test_the_button_names_the_region_its_result_belongs_to
    html = render(login_document).html

    assert_includes html, "&quot;node&quot;:&quot;region&quot;"
  end

  def test_a_button_outside_a_region_still_posts_but_names_no_region
    document = {
      "rootNodeId" => "root",
      "nodes" => {
        "root" => node("root", "base.body", children: %w[submit]),
        "submit" => node("submit", "base.submit")
                    .merge("actions" => { "click" => { "type" => "account.logout" } }),
      },
    }
    html = render(document).html

    assert_includes html, 'hx-post="/fragments/account/logout"'
    refute_includes html, "node"
  end

  # ── Enter-to-submit ─────────────────────────────────────────────────────

  # Every `form: true` verb claims to submit the form around it, but the
  # wiring only ever listened for a CLICK. Pressing Enter in a password field
  # fires `submit` on the <form>, which htmx never saw — so the browser posted
  # natively to the form's own action and navigated away from the page.
  def test_enter_in_a_field_routes_through_htmx_instead_of_navigating_away
    assert_includes render(login_document).html, 'hx-trigger="click, submit from:closest form"'
  end

  # A form fires ONE submit event and every listening node acts on it. A
  # sign-in and a create-account button sharing a form would therefore both
  # post on Enter, racing each other into the session. Only the real submit
  # button owns that event; a secondary verb stays click-only.
  def test_a_second_verb_on_a_plain_button_does_not_also_fire_on_enter
    document = login_document
    document["nodes"]["form"]["children"] = %w[submit register]
    document["nodes"]["register"] = node("register", "base.button")
                                   .merge("actions" => { "click" => { "type" => "account.register" } })

    html = render(document).html

    assert_equal 1, html.scan("submit from:closest form").length
    assert_includes html, 'hx-post="/fragments/account/register"'
  end

  # htmx resolves `from:` eagerly and calls addEventListener on the result, so
  # a `closest form` that matches nothing throws and kills every trigger on the
  # element. The trigger is therefore emitted only where a form really is.
  def test_no_submit_trigger_is_emitted_outside_a_form
    document = {
      "rootNodeId" => "root",
      "nodes" => {
        "root" => node("root", "base.body", children: %w[submit]),
        "submit" => node("submit", "base.submit")
                    .merge("actions" => { "click" => { "type" => "account.login" } }),
      },
    }

    refute_includes render(document).html, "submit from:closest form"
  end
end
