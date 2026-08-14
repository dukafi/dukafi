require "uri"
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

      destination = result.behavior == "redirect" ? safe_local_path(result.redirect_url) : nil

      # A CMS form is a real <form> doing a real POST — no htmx involved unless
      # the merchant wired some. `HX-Redirect` is an htmx instruction, so on a
      # native submit the browser simply rendered the message div as a bare
      # page and the merchant's chosen destination was never honoured.
      #
      # For a native submit the answer is the ordinary one: 303 See Other, so
      # the browser GETs the destination and a refresh cannot resubmit the
      # form. htmx callers keep the header, since they are not navigating.
      unless r.env["HTTP_HX_REQUEST"]
        # With no destination chosen, return to the page the form is on rather
        # than stranding the visitor on a bare confirmation. Post/Redirect/Get
        # either way.
        back = destination || same_host_path(r.env["HTTP_REFERER"], r.env["HTTP_HOST"])
        if back
          response["Cache-Control"] = "no-store"
          r.redirect(back, 303)
        end
      end

      response["Content-Type"] = "text/html; charset=utf-8"
      response["Cache-Control"] = "no-store"
      response["HX-Trigger"] = "dukafy:form-submitted"
      response["HX-Redirect"] = destination if destination
      %(<div class="dukafy-form-message" role="status">#{CGI.escapeHTML(result.message)}</div>)
    end

    r.get { response.status = 405; "Use POST" }
  end

  # The path part of a Referer, but only when it points back at THIS site.
  #
  # Stripping the scheme and host off any referer turns
  # `https://evil.example.com/x` into `/x` — a same-origin redirect, so not a
  # hole, but a redirect to a page that has nothing to do with the visitor.
  # Matching the host first means "go back where you came from" only ever means
  # a page of this store.
  def same_host_path(referer, host)
    return nil if referer.to_s.empty? || host.to_s.empty?

    uri = begin
      URI.parse(referer.to_s)
    rescue URI::InvalidURIError
      nil
    end
    return nil unless uri && uri.host && "#{uri.host}#{uri.port && ![80, 443].include?(uri.port) ? ":#{uri.port}" : ''}" == host.to_s

    safe_local_path(uri.request_uri)
  end

  def safe_local_path(value)
    path = value.to_s
    return nil unless path.start_with?("/") && !path.start_with?("//")
    return nil unless path.match?(%r{\A/[a-zA-Z0-9_\-/?=&%.]*\z})

    path
  end
end
