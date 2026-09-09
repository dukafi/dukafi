require_relative "../spec_helper"
require "rack/test"

class StorefrontLoadTrackerSpec < Minitest::Test
  include Rack::Test::Methods

  def setup
    StorefrontLoad.dataset.delete
    @original = StorefrontLoad.method(:record_from_rack!)
  end

  def teardown
    StorefrontLoad.define_singleton_method(:record_from_rack!, @original)
  end

  def app
    StorefrontLoadTracker.new(lambda do |env|
      path = env["PATH_INFO"]
      case path
      when "/"
        [200, { "content-type" => "text/html; charset=utf-8" }, ["<html>home</html>"]]
      when "/assets/site.css"
        [200, { "content-type" => "text/css" }, ["body{}"]]
      when "/missing"
        [404, { "content-type" => "text/html; charset=utf-8" }, ["<html>no</html>"]]
      else
        [200, { "content-type" => "text/plain" }, ["ok"]]
      end
    end)
  end

  def test_counts_html_page_loads
    get "/"
    get "/"
    assert_equal 200, last_response.status
    assert_equal 2, StorefrontLoad.first(path: "/").views
  end

  def test_does_not_count_css_or_404s
    get "/assets/site.css"
    get "/missing"
    assert_equal 0, StorefrontLoad.count
  end

  def test_still_returns_the_downstream_response_if_recording_fails
    StorefrontLoad.define_singleton_method(:record_from_rack!) { |*| raise "db down" }
    capture_io { get "/" }
    assert_equal 200, last_response.status
    assert_includes last_response.body, "home"
  end
end
