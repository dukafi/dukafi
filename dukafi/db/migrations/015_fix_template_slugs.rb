require "json"

Sequel.migration do
  up do
    {
      "_product-template" => "product-template",
      "_collection-template" => "collection-template",
    }.each do |old_slug, new_slug|
      from(:pages).where(slug: old_slug).each do |page|
        document = JSON.parse(page[:document])
        document["slug"] = new_slug
        from(:pages).where(id: page[:id]).update(
          slug: new_slug,
          document: JSON.generate(document),
        )
      end
    end
  end

  down do
    {
      "product-template" => "_product-template",
      "collection-template" => "_collection-template",
    }.each do |old_slug, new_slug|
      from(:pages).where(slug: old_slug).each do |page|
        document = JSON.parse(page[:document])
        document["slug"] = new_slug
        from(:pages).where(id: page[:id]).update(
          slug: new_slug,
          document: JSON.generate(document),
        )
      end
    end
  end
end
