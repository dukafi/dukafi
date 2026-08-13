# Page id -> public path, for resolving `cms:page:<id>` link targets.
#
# The editor stores a link to another page as a REFERENCE to its id, never as
# a path, so renaming a slug cannot break the links pointing at it. That means
# the publisher owns the other half: turning the reference back into a URL.
# Without this map every such link published as `#`, because `safe_url` sees an
# unknown `cms:` scheme and refuses it.
#
# Keyed on the id inside the page DOCUMENT (a nanoid the editor assigns), not
# the database row id — the reference is written by the editor, so it speaks
# the editor's ids.
class PagePaths
  def self.call(pages = nil)
    rows = pages || Page.where(status: "published").all
    rows.each_with_object({}) do |page, map|
      document = page.published_document_data || page.document_data
      next unless document.is_a?(Hash)

      id = document["id"].to_s
      next if id.empty?

      map[id] = public_path(page.slug.to_s)
    end
  end

  # Mirrors `pagePublicPath` in the editor: the home page is the site root,
  # everything else is its slug.
  def self.public_path(slug)
    slug.empty? || slug == "index" ? "/" : "/#{slug}"
  end
end
