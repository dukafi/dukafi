require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

class StoreProfileSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Dukafi.app

  def setup
    StoreProfile.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    Admin.dataset.delete
    clear_cookies
    post_json "/admin/api/cms/setup", siteName: "Demo Store", email: "owner@example.com", password: "correct-horse-battery"
    post_json "/admin/api/cms/login", email: "owner@example.com", password: "correct-horse-battery"
  end

  def json = JSON.parse(last_response.body)

  def post_json(path, payload)
    post path, JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  def test_profile_starts_thin_and_is_optional
    get "/admin/api/cms/store-profile"
    assert_equal 200, last_response.status
    assert_equal true, json.dig("profile", "thin")
    assert_equal "", json.dig("profile", "startedOn")
  end

  def test_profile_can_be_saved_and_cleared
    put "/admin/api/cms/store-profile",
        JSON.generate(startedOn: "2019", audience: "Nairobi offices", difference: "Same-day sewing"),
        "CONTENT_TYPE" => "application/json"
    assert_equal 200, last_response.status
    assert_equal false, json.dig("profile", "thin")
    assert_equal "2019", json.dig("profile", "startedOn")

    put "/admin/api/cms/store-profile",
        JSON.generate(startedOn: "", audience: "", difference: ""),
        "CONTENT_TYPE" => "application/json"
    assert_equal true, json.dig("profile", "thin")
  end

  def test_an_unconfigured_assistant_still_reports_409
    post_json "/admin/api/cms/ai/chat", messages: [{ role: "user", content: "add a hero" }]
    assert_equal 409, last_response.status
    assert_equal "ai_not_configured", json.dig("error", "code")
  end

  def test_requires_an_admin
    clear_cookies
    get "/admin/api/cms/store-profile"
    assert_equal 401, last_response.status
  end

  def test_store_context_is_a_read_and_does_not_require_a_profile
    get "/admin/api/cms/store-context"
    assert_equal 200, last_response.status
    assert_equal true, json.dig("profile", "thin")
    assert json.dig("pages").key?("sample")
    assert json.dig("products").key?("total")
    assert json.dig("media").key?("sample")
  end

  def test_store_media_searches_the_library
    ProductImage.dataset.delete
    MediaAsset.dataset.delete
    MediaAsset.create(path: "uploads/shop-front.jpg", mime: "image/jpeg", alt_text: "Storefront", created_at: Time.now)
    MediaAsset.create(path: "uploads/bag.jpg", mime: "image/jpeg", alt_text: "Bag", created_at: Time.now)

    get "/admin/api/cms/store-media?q=storefront"
    assert_equal 200, last_response.status
    paths = json.fetch("media").map { |row| row.fetch("path") }
    assert_includes paths, "/uploads/shop-front.jpg"
    refute_includes paths, "/uploads/bag.jpg"
  end
end
