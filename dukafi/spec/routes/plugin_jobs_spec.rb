require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

class PluginJobsRouteSpec < Minitest::Test
  include Rack::Test::Methods
  def app = Dukafi.app
  def body = JSON.parse(last_response.body)
  def json(method, path, value = {}) = send(method, path, JSON.generate(value), "CONTENT_TYPE" => "application/json")

  def setup
    Admin.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    json(:post, "/admin/api/cms/setup", siteName: "Store", email: "owner@example.com", password: "correct-horse-battery")
    json(:post, "/admin/api/cms/login", email: "owner@example.com", password: "correct-horse-battery")
  end

  def test_jobs_status_lists_registered_jobs
    get "/admin/api/cms/plugins/jobs"
    assert_equal 200, last_response.status
    jobs = body.fetch("jobs")
    heartbeat = jobs.find { |job| job["pluginId"] == "probe" && job["name"] == "heartbeat" }
    refute_nil heartbeat
    assert heartbeat.key?("due")
    assert heartbeat.key?("lastRunAt")
  end
end
