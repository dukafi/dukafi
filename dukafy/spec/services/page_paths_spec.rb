require_relative "../spec_helper"

# The editor links to another page by REFERENCE (`cms:page:<id>`) rather than
# by path, so renaming a slug cannot break the links pointing at it. The
# publisher owns the other half of that bargain. Before this, it had no idea
# what `cms:` meant: `safe_url` rejected the unknown scheme and every link to
# a page published as `href="#"`.
class PagePathsSpec < Minitest::Test
  def setup
    Page.dataset.delete
  end

  def page!(slug, doc_id)
    document = JSON.generate({
      "id" => doc_id, "slug" => slug, "title" => slug, "rootNodeId" => "b",
      "nodes" => { "b" => { "id" => "b", "moduleId" => "base.body", "children" => [],
                            "props" => {}, "breakpointOverrides" => {}, "classIds" => [] } },
    })
    Page.create(slug: slug, title: slug, kind: "page", status: "published",
                document: document, published_document: document)
  end

  def test_maps_document_ids_to_public_paths
    page!("checkout", "co-doc")
    page!("index", "home-doc")

    map = PagePaths.call

    assert_equal "/checkout", map.fetch("co-doc")
    # The home page is the site root, matching `pagePublicPath` in the editor.
    assert_equal "/", map.fetch("home-doc")
  end

  def test_keys_on_the_document_id_not_the_row_id
    page = page!("checkout", "co-doc")

    map = PagePaths.call

    assert_includes map.keys, "co-doc"
    refute_includes map.keys, page.id.to_s
  end

  def render_link(href, paths)
    document = {
      "rootNodeId" => "b",
      "nodes" => {
        "b" => { "id" => "b", "moduleId" => "base.body", "children" => ["l"],
                 "props" => {}, "breakpointOverrides" => {}, "classIds" => [] },
        "l" => { "id" => "l", "moduleId" => "base.link", "children" => [],
                 "props" => { "href" => href, "text" => "Go" },
                 "breakpointOverrides" => {}, "classIds" => [] },
      },
    }
    Dukafy::Publisher::RenderPage.call(
      document: document, registry: Dukafy::Publisher::REGISTRY, prefetched: {}, page_paths: paths
    ).html
  end

  def test_a_page_ref_renders_as_the_pages_path
    assert_includes render_link("cms:page:co-doc", { "co-doc" => "/checkout" }), 'href="/checkout"'
  end

  def test_a_page_ref_keeps_its_fragment
    assert_includes render_link("cms:page:co-doc#top", { "co-doc" => "/checkout" }), 'href="/checkout#top"'
  end

  def test_a_ref_to_a_missing_page_stays_put_rather_than_404ing
    assert_includes render_link("cms:page:gone", {}), 'href="#"'
  end

  def test_ordinary_urls_are_untouched
    assert_includes render_link("/about", {}), 'href="/about"'
    assert_includes render_link("https://example.com", {}), 'href="https://example.com"'
    # An unsafe scheme is still refused.
    assert_includes render_link("javascript:alert(1)", {}), 'href="#"'
  end
end
