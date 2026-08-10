# Find a published `base.form` node by its author-set formId.
#
# Config lives in the page document, so accepting a submission means reading
# the form the merchant actually published. Scanning PUBLISHED documents only
# is the security boundary: a draft form is not a public endpoint.
class FormLocator
  SAFE_FORM_ID = /\A[a-zA-Z][a-zA-Z0-9_-]{0,63}\z/

  def self.find(form_id)
    return unless form_id.to_s.match?(SAFE_FORM_ID)

    Page.where(status: "published").order(:id).each do |page|
      document = page.published_document_data || page.document_data
      nodes = document.is_a?(Hash) ? document["nodes"] : nil
      next unless nodes.is_a?(Hash)

      match = nodes.values.find do |node|
        node.is_a?(Hash) && node["moduleId"] == "base.form" &&
          node.dig("props", "formId").to_s == form_id.to_s
      end
      return match if match
    end
    nil
  end
end
