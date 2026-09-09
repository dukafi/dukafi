require_relative "../spec_helper"

class StorefrontLoadSpec < Minitest::Test
  def setup
    StorefrontLoad.dataset.delete
    @day = Time.utc(2026, 9, 8, 15, 0, 0)
  end

  def test_record_increments_the_same_day_and_path
    StorefrontLoad.record!(path: "/", at: @day)
    StorefrontLoad.record!(path: "/", at: @day)
    StorefrontLoad.record!(path: "/about", at: @day)

    home = StorefrontLoad.first(path: "/")
    about = StorefrontLoad.first(path: "/about")
    assert_equal 2, home.views
    assert_equal 1, about.views
    assert_equal Date.new(2026, 9, 8), home.day
  end

  def test_normalize_strips_query_and_trailing_slash
    assert_equal "/", StorefrontLoad.normalize_path("")
    assert_equal "/", StorefrontLoad.normalize_path("/")
    assert_equal "/about", StorefrontLoad.normalize_path("/about/")
    assert_equal "/about", StorefrontLoad.normalize_path("/about?utm_source=x")
  end

  def test_skips_assets_admin_and_non_html
    StorefrontLoad.record_from_rack!(
      { "REQUEST_METHOD" => "GET", "PATH_INFO" => "/assets/site-aaaaaaaaaaaa.css" },
      200,
      { "content-type" => "text/css" }
    )
    StorefrontLoad.record_from_rack!(
      { "REQUEST_METHOD" => "GET", "PATH_INFO" => "/admin/editor" },
      200,
      { "content-type" => "text/html" }
    )
    StorefrontLoad.record_from_rack!(
      { "REQUEST_METHOD" => "GET", "PATH_INFO" => "/" },
      404,
      { "content-type" => "text/html" }
    )
    StorefrontLoad.record_from_rack!(
      { "REQUEST_METHOD" => "POST", "PATH_INFO" => "/" },
      200,
      { "content-type" => "text/html" }
    )
    assert_equal 0, StorefrontLoad.count
  end

  def test_counts_successful_html_gets
    StorefrontLoad.record_from_rack!(
      { "REQUEST_METHOD" => "GET", "PATH_INFO" => "/products/bag" },
      200,
      { "Content-Type" => "text/html; charset=utf-8" }
    )
    row = StorefrontLoad.first
    assert_equal "/products/bag", row.path
    assert_equal 1, row.views
  end
end
