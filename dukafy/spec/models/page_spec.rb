require_relative "../spec_helper"

class PageSpec < Minitest::Test
  def valid_document
    {
      "id" => "home",
      "slug" => "home",
      "title" => "Home",
      "nodes" => {
        "body" => {
          "id" => "body",
          "moduleId" => "base.body",
          "props" => {},
          "breakpointOverrides" => {},
          "children" => [],
          "classIds" => [],
        },
      },
      "rootNodeId" => "body",
    }
  end

  def test_accepts_a_document_matching_the_exported_page_schema
    page = Page.new(slug: "home", title: "Home", document: valid_document)
    assert_equal "body", page.document_data.fetch("rootNodeId")
  end

  def test_rejects_a_malformed_tree
    malformed = valid_document.merge("nodes" => [])

    error = assert_raises(Sequel::ValidationFailed) do
      Page.new(slug: "broken", title: "Broken", document: malformed)
    end

    assert_match(/page schema/, error.message)
  end
end
