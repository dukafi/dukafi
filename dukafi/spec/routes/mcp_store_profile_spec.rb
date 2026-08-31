require_relative "../spec_helper"
require_relative "../../app"

class McpStoreProfileSpec < Minitest::Test
  def setup
    StoreProfile.dataset.delete
  end

  def tool(name) = McpTools.all.find { |entry| entry.fetch(:name) == name }.fetch(:run)
  def call(name, args = {}) = tool(name).call(args)

  def test_writes_the_profile
    payload = call("update_store_profile", {
      "startedOn" => "2019",
      "audience" => "Nairobi offices",
      "difference" => "Same-day sewing",
    })

    assert_equal "2019", payload.fetch("startedOn")
    assert_equal false, payload.fetch("thin")
    assert_equal "Nairobi offices", StoreProfile.current.audience
  end

  def test_empty_strings_clear_fields
    StoreProfile.current.apply!("startedOn" => "2019", "audience" => "Offices", "difference" => "Speed")

    payload = call("update_store_profile", {
      "startedOn" => "", "audience" => "", "difference" => "",
    })

    assert_equal true, payload.fetch("thin")
  end

  def test_is_a_write
    assert McpTools.write_tool?("update_store_profile")
  end
end
