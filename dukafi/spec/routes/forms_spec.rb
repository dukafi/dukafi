require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

# Merchant-defined forms: the merchant invents the fields, Dukafi stores what
# arrived. Form CONFIG lives in the published page document, not a table.
class FormsSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Dukafi.app

  def setup
    FormSubmission.dataset.delete
    OrderItem.dataset.delete
    Order.dataset.delete
    Page.dataset.delete
    clear_cookies
  end

  def form_document(slug: "contact", form_id: "contact", props: {})
    base = {
      "mode" => "cms", "formId" => form_id, "honeypotName" => "company",
      "minSubmitSeconds" => 0, "successBehavior" => "message",
      "successMessage" => "Thanks!", "redirectUrl" => "",
    }.merge(props)
    {
      "id" => "p-#{form_id}", "slug" => slug, "title" => "T", "rootNodeId" => "body",
      "nodes" => {
        "body" => { "id" => "body", "moduleId" => "base.body", "children" => %w[form],
                    "props" => {}, "classIds" => [], "breakpointOverrides" => {} },
        "form" => { "id" => "form", "moduleId" => "base.form", "children" => [],
                    "props" => base, "classIds" => [], "breakpointOverrides" => {} },
      },
    }
  end

  def publish!(document, status: "published")
    json = JSON.generate(document)
    Page.create(slug: document.fetch("slug"), title: "T", kind: "page", status: status,
                document: json, published_document: status == "published" ? json : nil)
  end

  def test_a_merchant_defined_form_stores_whatever_fields_it_declared
    publish!(form_document)

    # Fields Dukafi has never heard of — an emergency contact form.
    post "/forms/contact", contact_name: "Ada", contact_phone: "+254712345678",
                           relationship: "sister"

    assert_equal 200, last_response.status, last_response.body
    assert_equal "dukafi:form-submitted", last_response.headers.fetch("hx-trigger")
    assert_includes last_response.body, "Thanks!"

    submission = FormSubmission.first
    assert_equal "contact", submission.form_id
    assert_equal({ "contact_name" => "Ada", "contact_phone" => "+254712345678",
                   "relationship" => "sister" }, submission.payload_data)
    # Not attached to anything yet — that progression is the CRM.
    assert_nil submission.order_id
    assert_nil submission.customer_id
  end

  def test_a_filled_honeypot_is_silently_discarded
    publish!(form_document)

    post "/forms/contact", name: "Ada", company: "spam-bot-was-here"

    # Reports success: telling a bot what tripped the trap teaches it to avoid
    # the trap.
    assert_equal 200, last_response.status
    assert_includes last_response.body, "Thanks!"
    assert_equal 0, FormSubmission.count
  end

  def test_the_honeypot_field_is_never_stored_even_when_empty
    publish!(form_document)
    post "/forms/contact", name: "Ada", company: ""

    assert_equal({ "name" => "Ada" }, FormSubmission.first.payload_data)
  end

  def test_a_submission_faster_than_the_minimum_is_discarded
    publish!(form_document(props: { "minSubmitSeconds" => 5 }))

    token = FormSubmissionIntake.timestamp_token(Time.now) # submitted instantly
    post "/forms/contact", name: "Ada", _ts: token

    assert_equal 200, last_response.status
    assert_equal 0, FormSubmission.count

    # The same form, filled at human speed, is accepted.
    post "/forms/contact", name: "Ada", _ts: FormSubmissionIntake.timestamp_token(Time.now - 30)
    assert_equal 1, FormSubmission.count
  end

  def test_a_forged_or_backdated_timestamp_is_rejected
    publish!(form_document(props: { "minSubmitSeconds" => 5 }))

    # Backdating the value without a matching signature must not work.
    post "/forms/contact", name: "Ada", _ts: "#{(Time.now - 999).to_i}.not-a-real-signature"
    assert_equal 0, FormSubmission.count

    # Nor omitting it entirely once a minimum is configured.
    post "/forms/contact", name: "Ada"
    assert_equal 0, FormSubmission.count
  end

  def test_the_signed_timestamp_is_rendered_into_cms_forms
    html = Dukafi::Publisher::REGISTRY.fetch("base.form").render(
      { "mode" => "cms", "formId" => "contact", "honeypotName" => "company" }, [], prefetched: {}
    ).fetch(:html)

    assert_includes html, 'name="_ts"'
    assert_includes html, 'action="/forms/contact"'
    # A real action, so the form still submits with JavaScript disabled.
    assert_includes html, 'method="post"'
  end

  def test_a_draft_only_form_is_not_a_public_endpoint
    publish!(form_document(slug: "draft-form", form_id: "secret"), status: "draft")

    post "/forms/secret", name: "Ada"

    assert_equal 404, last_response.status
    assert_equal 0, FormSubmission.count
  end

  def test_unknown_and_custom_mode_forms_are_refused
    post "/forms/nope", name: "Ada"
    assert_equal 404, last_response.status

    # Custom-action forms post to the merchant's own endpoint, not ours.
    publish!(form_document(slug: "ext", form_id: "external", props: { "mode" => "custom" }))
    post "/forms/external", name: "Ada"
    assert_equal 404, last_response.status
    assert_equal 0, FormSubmission.count
  end

  # A CMS form is a real <form> doing a real POST. `HX-Redirect` is an htmx
  # INSTRUCTION — on a native submit the browser ignored it and rendered the
  # message div as a bare page, so the merchant's chosen destination never
  # happened.
  def test_a_native_submit_really_navigates_to_the_chosen_page
    publish!(form_document(props: { "successBehavior" => "redirect", "redirectUrl" => "/thanks" }))

    post "/forms/contact", name: "Ada"

    assert_equal 303, last_response.status
    assert_equal "/thanks", last_response.headers["location"]
  end

  # 303 specifically, so a refresh on the destination cannot resubmit the form.
  def test_a_native_submit_returns_to_the_form_page_when_no_destination_was_chosen
    publish!(form_document)

    post "/forms/contact", { name: "Ada" }, { "HTTP_REFERER" => "http://example.org/contact" }

    assert_equal 303, last_response.status
    assert_equal "/contact", last_response.headers["location"]
  end

  # An htmx caller is not navigating, so it keeps the header form.
  def test_an_htmx_submit_still_gets_the_header
    publish!(form_document(props: { "successBehavior" => "redirect", "redirectUrl" => "/thanks" }))

    post "/forms/contact", { name: "Ada" }, { "HTTP_HX_REQUEST" => "true" }

    assert_equal 200, last_response.status
    assert_equal "/thanks", last_response.headers["hx-redirect"]
  end

  def test_an_offsite_destination_is_refused_on_both_paths
    publish!(form_document(slug: "evil", form_id: "evilform",
                           props: { "successBehavior" => "redirect",
                                    "redirectUrl" => "//evil.example.com" }))

    post "/forms/evilform", name: "Ada"
    refute_equal "//evil.example.com", last_response.headers["location"]

    post "/forms/evilform", { name: "Ada" }, { "HTTP_HX_REQUEST" => "true" }
    assert_nil last_response.headers["hx-redirect"]
  end

  # A Referer from another site must not become a redirect target.
  def test_an_offsite_referer_is_not_followed
    publish!(form_document)

    post "/forms/contact", { name: "Ada" }, { "HTTP_REFERER" => "https://evil.example.com/x" }

    # Falls through to the message body rather than navigating anywhere.
    assert_equal 200, last_response.status
  end

  # ---------------------------------------------------------------------
  # Attaching submissions to orders — the start of the CRM.
  # ---------------------------------------------------------------------

  def order_with_token(token)
    Order.create(
      email: "buyer@example.com", status: "pending", currency: "USD",
      subtotal_cents: 1000, discount_cents: 0, shipping_cents: 0, total_cents: 1000,
      public_token: token, created_at: Time.now, updated_at: Time.now
    )
  end

  def test_a_form_only_attaches_to_an_order_when_the_merchant_said_so
    # Standalone form (the default) — must NOT attach itself just because the
    # visitor bought something earlier in the session.
    publish!(form_document(props: { "attachTo" => "none" }))
    order = order_with_token("tok-standalone")

    post "/forms/contact", note: "hello", order_token: "tok-standalone"

    assert_nil FormSubmission.first.order_id
    refute_equal order.id, FormSubmission.first.order_id
  end

  def test_an_order_form_files_against_the_order_and_its_customer
    Customer.dataset.delete
    customer = Customer.create(email: "buyer@example.com", created_at: Time.now, updated_at: Time.now)
    order = order_with_token("tok-mpesa")
    order.update(customer_id: customer.id)
    publish!(form_document(form_id: "mpesa", slug: "m", props: { "attachTo" => "order" }))

    post "/forms/mpesa", mpesa_code: "QWE123", order_token: "tok-mpesa"

    submission = FormSubmission.first
    assert_equal order.id, submission.order_id
    # Filing against an order files against the person who placed it.
    assert_equal customer.id, submission.customer_id
    # The token is machinery, not merchant data.
    assert_equal({ "mpesa_code" => "QWE123" }, submission.payload_data)
  end

  def test_the_checkout_session_token_is_used_when_no_token_is_posted
    order = order_with_token("tok-session")
    publish!(form_document(form_id: "proof", slug: "p", props: { "attachTo" => "order" }))

    # Simulate having just checked out in this session.
    post "/forms/proof", note: "n", order_token: "tok-session"
    assert_equal order.id, FormSubmission.first.order_id
  end

  def test_an_unknown_order_token_stores_the_submission_unattached
    publish!(form_document(form_id: "proof", slug: "p", props: { "attachTo" => "order" }))

    post "/forms/proof", note: "n", order_token: "not-a-real-token"

    # The submission is kept — losing a customer's message because a token
    # went stale would be worse than an unattached row an admin can triage.
    assert_equal 1, FormSubmission.count
    assert_nil FormSubmission.first.order_id
  end

  def test_oversized_submissions_are_capped_rather_than_stored_whole
    publish!(form_document)

    post "/forms/contact", note: "x" * 50_000

    stored = FormSubmission.first.payload_data.fetch("note")
    assert_equal FormSubmissionIntake::MAX_VALUE_BYTES, stored.length
  end
end
