# Counts successful HTML page loads that pass through the storefront.
#
# Tracking must never take the shop down: a database blip is a missed view,
# not a 500 for the customer.
class StorefrontLoadTracker
  def initialize(app)
    @app = app
  end

  def call(env)
    status, headers, body = @app.call(env)
    record(env, status, headers)
    [status, headers, body]
  end

  private

  def record(env, status, headers)
    StorefrontLoad.record_from_rack!(env, status, headers)
  rescue StandardError => e
    warn "[storefront-load] #{e.class}: #{e.message}"
  end
end
