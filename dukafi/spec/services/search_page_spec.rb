require_relative "../spec_helper"

class SearchPageSpec < Minitest::Test
  def setup
    Page.dataset.delete
  end

  def test_ensure_creates_a_search_page_once
    page = SearchPage.ensure!
    again = SearchPage.ensure!

    assert_equal page.id, again.id
    assert_equal SearchPage::SLUG, page.slug
    assert_equal "page", page.kind
    assert_equal "draft", page.status
    assert_equal "current-query", page.document_data.dig("nodes", "search-results", "props", "source")
    form = page.document_data.dig("nodes", "search-form", "props")
    assert_equal "custom", form.fetch("mode")
    assert_equal "/search", form.fetch("action")
    assert_equal "get", form.fetch("method")
    assert_equal "keyword", page.document_data.dig("nodes", "search-input", "props", "name")
  end

  def test_ensure_does_not_overwrite_a_customised_search_page
    page = SearchPage.ensure!
    document = page.document_data
    document["title"] = "Find products"
    page.update(document: document, title: "Find products")

    SearchPage.ensure!
    page.refresh

    assert_equal "Find products", page.title
    assert_equal "Find products", page.document_data["title"]
  end
end
