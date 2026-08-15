require_relative "../spec_helper"
require "rack/test"
require "rack/lint"
require_relative "../../app"

# Minting the tokens that machine clients authenticate with.
#
# The rule this file exists to hold: the plaintext token is returned by the
# request that CREATES it and by nothing else, ever. A token that can be
# re-read is a token that ends up in a screenshot.
class TokensAdminSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Rack::Lint.new(Dukafi.app)

  def setup
    PersonalAccessToken.dataset.delete
    Admin.dataset.delete
    SiteState.dataset.delete
    clear_cookies
  end

  def post_json(path, payload)
    post path, JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  def sign_in!
    post_json "/admin/api/cms/setup",
              siteName: "Store", email: "owner@example.com", password: "correct-horse-battery"
    post_json "/admin/api/cms/login", email: "owner@example.com", password: "correct-horse-battery"
  end

  def body = JSON.parse(last_response.body)

  def test_minting_a_token_requires_an_admin
    post_json "/admin/api/cms/tokens", name: "Cursor"

    assert_equal 401, last_response.status
  end

  def test_listing_tokens_requires_an_admin
    get "/admin/api/cms/tokens"

    assert_equal 401, last_response.status
  end

  def test_a_new_token_is_returned_once
    sign_in!

    post_json "/admin/api/cms/tokens", name: "Cursor"

    assert_equal 201, last_response.status
    token = body.fetch("token")
    assert token.fetch("token").start_with?("dkf_")
    assert_equal "Cursor", token.fetch("name")
  end

  # The whole point of hashing it.
  def test_the_token_never_appears_again
    sign_in!
    post_json "/admin/api/cms/tokens", name: "Cursor"
    plaintext = body.dig("token", "token")

    get "/admin/api/cms/tokens"

    refute_includes last_response.body, plaintext
    listed = body.fetch("tokens").first
    refute listed.key?("token")
    # The prefix is enough to recognise it in a list without revealing it.
    assert plaintext.start_with?(listed.fetch("tokenPrefix"))
  end

  def test_a_token_needs_a_name_you_will_recognise_later
    sign_in!

    post_json "/admin/api/cms/tokens", name: "   "

    assert_equal 422, last_response.status
  end

  # Revoked, not deleted: `lastUsedAt` on a revoked row answers "was this
  # being used before I killed it?".
  def test_revoking_keeps_the_row
    sign_in!
    post_json "/admin/api/cms/tokens", name: "Cursor"
    id = body.dig("token", "id")

    delete "/admin/api/cms/tokens/#{id}"

    assert_equal 204, last_response.status
    get "/admin/api/cms/tokens"
    assert_equal 1, body.fetch("tokens").length
    refute_nil body.fetch("tokens").first.fetch("revokedAt")
  end

  def test_revoking_something_that_is_gone_says_so
    sign_in!

    delete "/admin/api/cms/tokens/999999"

    assert_equal 404, last_response.status
  end
end
