require "cgi"

# Public form submission. Separate from Fragments because a form post is not
# a cart operation and should not inherit its cart-shaped responses.
class Forms < Roda
  plugin :sessions, secret: SessionSecret.fetch
  plugin :halt

  def current_customer
    id = session["customer_id"]
    id && Customer[id]
  end

  route do |r|
    r.post(String) do |form_id|
      result = FormSubmissionIntake.call(
        form_id: form_id, params: r.params, customer: current_customer,
        session_order_token: session["order_token"]
      )

      unless result.ok?
        response.status = 404
        response["Content-Type"] = "text/html; charset=utf-8"
        next %(<div class="dukafy-form-message" role="alert">That form is no longer available.</div>)
      end

      response["Content-Type"] = "text/html; charset=utf-8"
      response["Cache-Control"] = "no-store"
      response["HX-Trigger"] = "dukafy:form-submitted"
      if result.behavior == "redirect" && safe_local_path(result.redirect_url)
        response["HX-Redirect"] = safe_local_path(result.redirect_url)
      end
      %(<div class="dukafy-form-message" role="status">#{CGI.escapeHTML(result.message)}</div>)
    end

    r.get { response.status = 405; "Use POST" }
  end

  def safe_local_path(value)
    path = value.to_s
    return nil unless path.start_with?("/") && !path.start_with?("//")
    return nil unless path.match?(%r{\A/[a-zA-Z0-9_\-/?=&%.]*\z})

    path
  end
end
