require "json"

# Public plugin HTTP. Mounted at `/plugins` so a provider callback URL is
# stable: `/plugins/<id>/webhooks/...`.
#
# Only routes the plugin registered are reachable. An unknown path is a 404
# that does not say whether the plugin exists.
class PluginRuntime < Roda
  plugin :halt
  plugin :json
  plugin :json_parser

  route do |r|
    r.on String do |plugin_id|
      path = remaining_path(r)
      route = Dukafi::Plugins.find_public_route(plugin_id, r.request_method, path)
      unless route
        request.halt([404, { "content-type" => "application/json" },
                      [JSON.generate({ "error" => "not_found" })]])
      end

      status, headers, body = dispatch(route, r, path)
      request.halt([status, headers, body])
    end

    r.get { not_found }
  end

  def remaining_path(r)
    rest = r.remaining_path.to_s
    rest = "/" if rest.empty?
    rest.start_with?("/") ? rest : "/#{rest}"
  end

  def dispatch(route, r, path)
    req = PluginRuntimeRequest.new(
      method: r.request_method,
      path: path,
      params: r.params,
      body: read_body(r),
    )
    result = route[:handler].call(req)
    normalize_result(result)
  rescue StandardError => e
    warn "[plugin-runtime] #{e.class}: #{e.message}"
    [500, { "content-type" => "application/json" }, [JSON.generate({ "error" => "handler_failed" })]]
  end

  def read_body(r)
    raw = r.body.read.to_s
    r.body.rewind if r.body.respond_to?(:rewind)
    raw
  rescue StandardError
    ""
  end

  def normalize_result(result)
    case result
    when Array
      status, headers, body = result
      body = Array(body)
      headers = stringify_headers(headers)
      [status.to_i, headers, body]
    when String
      [200, { "content-type" => "text/html; charset=utf-8" }, [result]]
    when Hash
      [200, { "content-type" => "application/json" }, [JSON.generate(result)]]
    else
      [200, { "content-type" => "text/plain; charset=utf-8" }, [result.to_s]]
    end
  end

  def stringify_headers(headers)
    (headers || {}).to_h { |key, value| [key.to_s, value.to_s] }
  end

  def not_found
    request.halt([404, { "content-type" => "application/json" }, [JSON.generate({ "error" => "not_found" })]])
  end
end

PluginRuntimeRequest = Data.define(:method, :path, :params, :body) do
  # Roda's json_parser may have already consumed the body into `params`.
  def json
    parsed = begin
      JSON.parse(body.to_s)
    rescue JSON::ParserError
      nil
    end
    return parsed if parsed.is_a?(Hash) && !parsed.empty?
    return parsed if parsed.is_a?(Array)

    params.is_a?(Hash) ? params : {}
  end
end
