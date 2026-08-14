require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

# Top-level mounts SHADOW published pages.
#
# `Dukafi`'s router tries each `r.on(...)` before falling through to
# `Storefront`, so a mount named after a plausible page slug silently steals
# that slug. A stubbed `r.on("checkout")` did exactly that: a merchant who
# named their checkout page "checkout" — the obvious name, and the one the
# cart's `redirect` prop points at — got a hardcoded 501 instead of their page.
#
# The mounts that remain are all API namespaces a page has no business using.
class NoReservedPagePathsSpec < Minitest::Test
  include Rack::Test::Methods

  def app
    Dukafi.app
  end

  # Everything the top-level router claims before Storefront sees it.
  RESERVED = %w[admin uploads fragments forms payments].freeze

  # `api` is mounted INSIDE the admin block (`/admin/api`), so it reserves
  # nothing at the site root — but it still shows up in a flat scan of app.rb.
  NESTED = %w[api].freeze

  # Slugs a merchant would reasonably choose. If a mount ever swallows one of
  # these, this fails and names it.
  LIKELY_PAGE_SLUGS = %w[
    checkout cart thank-you thanks order orders shop store products
    collections about contact home index
  ].freeze

  def test_no_likely_page_slug_is_reserved_by_a_mount
    clashes = LIKELY_PAGE_SLUGS & RESERVED

    assert_empty clashes,
                 "these page slugs are shadowed by a top-level mount and can never render " \
                 "a merchant's page: #{clashes.inspect}"
  end

  def test_the_router_declares_exactly_the_expected_mounts
    source = File.read(File.expand_path("../../app.rb", __dir__))
    mounted = source.scan(/r\.on\("([a-z-]+)"\)/).flatten.uniq

    # Adding a mount is fine; adding one that eats a page slug is not. This
    # fails on any new mount so the choice is made deliberately.
    assert_equal (RESERVED + NESTED).sort, mounted.sort,
                 "top-level mounts changed — confirm the new one cannot shadow a page slug"
  end

  def test_a_published_page_owns_its_path
    document = JSON.generate({
      "id" => "co-doc", "slug" => "checkout", "title" => "Checkout", "rootNodeId" => "b",
      "nodes" => { "b" => { "id" => "b", "moduleId" => "base.body", "children" => [],
                            "props" => {}, "breakpointOverrides" => {}, "classIds" => [] } },
    })
    Page.where(slug: "checkout").delete
    Page.create(slug: "checkout", title: "Checkout", kind: "page", status: "published",
                document: document, published_document: document)

    get "/checkout"

    refute_equal 501, last_response.status, "a mount is shadowing the merchant's checkout page"
    assert_equal 200, last_response.status
  end
end
