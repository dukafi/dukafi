require "cgi"

class AdminStore < Roda
  plugin :all_verbs
  plugin :sessions, secret: ENV.fetch("SESSION_SECRET") { "dev-secret-change-me-" + "x" * 64 }

  def e(value)
    CGI.escapeHTML(value.to_s)
  end

  def require_admin!
    r = request
    r.redirect("/admin/") unless session["admin_id"] && Admin[session["admin_id"]]
  end

  def layout(title, content)
    <<~HTML
      <!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>#{e(title)} · Dukafy</title><script src="/js/htmx.min.js" defer></script>
      <style>body{font-family:system-ui,sans-serif;max-width:70rem;margin:0 auto;padding:2rem;color:#18181b}nav{display:flex;gap:1rem;align-items:center;margin-bottom:2rem}a{color:#4f46e5}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.75rem;border-bottom:1px solid #e4e4e7}form{display:grid;gap:1rem;max-width:36rem}label{display:grid;gap:.35rem}input,select,textarea{font:inherit;padding:.65rem;border:1px solid #a1a1aa;border-radius:.4rem}textarea{min-height:7rem}button,.button{font:inherit;padding:.65rem 1rem;border:0;border-radius:.4rem;background:#4f46e5;color:white;cursor:pointer;text-decoration:none;display:inline-block;width:max-content}.danger{background:#dc2626}.secondary{background:#52525b}.actions{display:flex;gap:.75rem;align-items:center}.error{color:#b91c1c}.variants{margin-top:3rem}.variant-row{display:grid;grid-template-columns:1.2fr 1.4fr 1fr .7fr .7fr auto;gap:.6rem;align-items:end;max-width:none;padding:.75rem 0;border-bottom:1px solid #e4e4e7}.variant-row label{font-size:.8rem}.variant-row .actions{padding-bottom:.05rem}.variant-row button{white-space:nowrap}.new-variant{padding:1rem;background:#f4f4f5;border-radius:.5rem}.membership{display:flex;align-items:center;gap:1rem;padding:.8rem;border:1px solid #e4e4e7;background:white}.membership[draggable=true]{cursor:grab}.membership.dragging{opacity:.4}.membership strong{flex:1}.member-list{display:grid;gap:.5rem;max-width:42rem;margin:1rem 0 2rem}</style></head>
      <body><nav><strong>Dukafy Store</strong><a href="/admin/store">Products</a><a href="/admin/store/collections">Collections</a><a href="/admin/site">Visual editor</a></nav>#{content}</body></html>
    HTML
  end

  def product_form(product, error: nil)
    action = product.id ? "/admin/store/products/#{product.id}/update" : "/admin/store/products"
    <<~HTML
      <h1>#{product.id ? "Edit product" : "New product"}</h1>
      #{error ? %(<p class="error">#{e(error)}</p>) : ""}
      <form method="post" action="#{action}" hx-post="#{action}" hx-target="body" hx-push-url="#{product.id ? "/admin/store/products/#{product.id}" : "/admin/store"}">
        <label>Title<input name="title" required value="#{e(product.title)}"></label>
        <label>Slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value="#{e(product.slug)}"></label>
        <label>Vendor<input name="vendor" value="#{e(product.vendor)}"></label>
        <label>Status<select name="status"><option value="draft"#{product.status == "draft" ? " selected" : ""}>Draft</option><option value="active"#{product.status == "active" ? " selected" : ""}>Active</option></select></label>
        <div class="actions"><button type="submit">Save product</button><a href="/admin/store">Cancel</a></div>
      </form>
    HTML
  end

  def product_attributes
    {
      title: request.params.fetch("title", "").strip,
      slug: request.params.fetch("slug", "").strip.downcase,
      vendor: request.params.fetch("vendor", "").strip,
      status: request.params.fetch("status", "draft"),
    }
  end

  def integer_param(name)
    Integer(request.params.fetch(name, ""), 10)
  rescue ArgumentError, TypeError
    nil
  end

  def variant_attributes
    {
      sku: request.params.fetch("sku", "").strip,
      title: request.params.fetch("title", "").strip,
      price_cents: integer_param("price_cents"),
      currency: request.params.fetch("currency", "USD").strip.upcase,
      stock: integer_param("stock"),
      position: integer_param("position"),
    }
  end

  def variant_fields(variant)
    <<~HTML
      <label>SKU<input name="sku" required value="#{e(variant.sku)}"></label>
      <label>Title<input name="title" required value="#{e(variant.title)}"></label>
      <label>Price (cents)<input name="price_cents" type="number" min="0" required value="#{e(variant.price_cents)}"></label>
      <label>Stock<input name="stock" type="number" min="0" required value="#{e(variant.stock || 0)}"></label>
      <label>Position<input name="position" type="number" min="0" required value="#{e(variant.position || 0)}"></label>
      <input name="currency" type="hidden" value="#{e(variant.currency || "USD")}">
    HTML
  end

  def variants_panel(product, error: nil, draft: nil)
    rows = product.variants.map do |variant|
      update_path = "/admin/store/products/#{product.id}/variants/#{variant.id}/update"
      delete_path = "/admin/store/products/#{product.id}/variants/#{variant.id}/delete"
      <<~HTML
        <form class="variant-row" method="post" action="#{update_path}" hx-post="#{update_path}" hx-target="body">
          #{variant_fields(variant)}
          <span class="actions"><button type="submit">Save</button><button class="danger" type="submit" formaction="#{delete_path}" hx-post="#{delete_path}" hx-confirm="Delete variant #{e(variant.sku)}?">Delete</button></span>
        </form>
      HTML
    end.join
    new_variant = draft || Variant.new(currency: "USD", stock: 0, position: product.variants.length)
    create_path = "/admin/store/products/#{product.id}/variants"
    <<~HTML
      <section class="variants" id="variants-panel"><h2>Variants</h2>
        #{error ? %(<p class="error">#{e(error)}</p>) : ""}
        #{rows.empty? ? "<p>No variants yet. Add the first purchasable option below.</p>" : rows}
        <h3>Add variant</h3>
        <form class="variant-row new-variant" method="post" action="#{create_path}" hx-post="#{create_path}" hx-target="body">
          #{variant_fields(new_variant)}<span class="actions"><button type="submit">Add variant</button></span>
        </form>
      </section>
    HTML
  end

  def product_page(product, variant_error: nil, draft_variant: nil)
    product_form(product) + variants_panel(product, error: variant_error, draft: draft_variant) +
      %(<form method="post" action="/admin/store/products/#{product.id}/delete" hx-post="/admin/store/products/#{product.id}/delete" hx-confirm="Delete #{e(product.title)}?"><button class="danger" type="submit">Delete product</button></form>)
  end

  def collection_attributes
    {
      title: request.params.fetch("title", "").strip,
      slug: request.params.fetch("slug", "").strip.downcase,
      description: request.params.fetch("description", "").strip,
      sort_order: integer_param("sort_order"),
    }
  end

  def collection_form(collection, error: nil)
    action = collection.id ? "/admin/store/collections/#{collection.id}/update" : "/admin/store/collections"
    <<~HTML
      <h1>#{collection.id ? "Edit collection" : "New collection"}</h1>
      #{error ? %(<p class="error">#{e(error)}</p>) : ""}
      <form method="post" action="#{action}" hx-post="#{action}" hx-target="body">
        <label>Title<input name="title" required value="#{e(collection.title)}"></label>
        <label>Slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value="#{e(collection.slug)}"></label>
        <label>Description<textarea name="description">#{e(collection.description)}</textarea></label>
        <label>Sort order<input name="sort_order" type="number" min="0" required value="#{e(collection.sort_order || 0)}"></label>
        <div class="actions"><button type="submit">Save collection</button><a href="/admin/store/collections">Cancel</a></div>
      </form>
    HTML
  end

  def collection_members(collection)
    memberships = CollectionProduct.where(collection_id: collection.id).order(:position).all
    rows = memberships.map do |membership|
      product = Product[membership.product_id]
      <<~HTML
        <div class="membership" draggable="true" data-product-id="#{product.id}"><span aria-hidden="true">↕</span><strong>#{e(product.title)}</strong><span>#{e(product.slug)}</span>
          <form method="post" action="/admin/store/collections/#{collection.id}/products/#{product.id}/delete" hx-post="/admin/store/collections/#{collection.id}/products/#{product.id}/delete" hx-target="body"><button class="danger" type="submit">Remove</button></form>
        </div>
      HTML
    end.join
    available = Product.exclude(id: memberships.map(&:product_id)).order(:title).all
    options = available.map { |product| %(<option value="#{product.id}">#{e(product.title)}</option>) }.join
    add_form = if available.empty?
      "<p>All products are in this collection.</p>"
    else
      %(<form method="post" action="/admin/store/collections/#{collection.id}/products" hx-post="/admin/store/collections/#{collection.id}/products" hx-target="body"><label>Add product<select name="product_id">#{options}</select></label><button type="submit">Add product</button></form>)
    end
    <<~HTML
      <section><h2>Products</h2><p>Drag products to set their storefront order.</p>
        <div class="member-list" data-reorder-url="/admin/store/collections/#{collection.id}/reorder">#{rows.empty? ? "<p>No products in this collection.</p>" : rows}</div>
        #{add_form}
      </section>
      <script>(()=>{const list=document.querySelector('.member-list');if(!list)return;let dragged;list.addEventListener('dragstart',e=>{dragged=e.target.closest('.membership');dragged?.classList.add('dragging')});list.addEventListener('dragover',e=>{e.preventDefault();const row=e.target.closest('.membership');if(row&&dragged&&row!==dragged){const box=row.getBoundingClientRect();list.insertBefore(dragged,e.clientY<box.top+box.height/2?row:row.nextSibling)}});list.addEventListener('dragend',async()=>{dragged?.classList.remove('dragging');dragged=null;const ids=[...list.querySelectorAll('.membership')].map(row=>row.dataset.productId).join(',');await fetch(list.dataset.reorderUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({product_ids:ids})})})})()</script>
    HTML
  end

  def collection_page(collection)
    collection_form(collection) + collection_members(collection) +
      %(<form method="post" action="/admin/store/collections/#{collection.id}/delete" hx-post="/admin/store/collections/#{collection.id}/delete" hx-confirm="Delete #{e(collection.title)}?"><button class="danger" type="submit">Delete collection</button></form>)
  end

  route do |r|
    require_admin!

    r.is do
      rows = Product.order(Sequel.desc(:updated_at)).map do |product|
        <<~ROW
          <tr id="product-#{product.id}"><td><a href="/admin/store/products/#{product.id}">#{e(product.title)}</a></td><td>#{e(product.slug)}</td><td>#{e(product.vendor)}</td><td>#{e(product.status)}</td></tr>
        ROW
      end.join
      layout("Products", %(<div class="actions"><h1 style="flex:1">Products</h1><a class="button" href="/admin/store/products/new">Add product</a></div><table><thead><tr><th>Title</th><th>Slug</th><th>Vendor</th><th>Status</th></tr></thead><tbody>#{rows}</tbody></table>))
    end

    r.on("products") do
      r.get("new") { layout("New product", product_form(Product.new(status: "draft"))) }
      r.is do
        r.post do
          product = Product.new(product_attributes)
          if product.valid?
            product.save
            r.redirect("/admin/store/products/#{product.id}")
          else
            response.status = 422
            layout("New product", product_form(product, error: product.errors.full_messages.join(", ")))
          end
        rescue Sequel::UniqueConstraintViolation
          response.status = 422
          layout("New product", product_form(product, error: "Slug has already been taken"))
        end
      end

      r.on(String) do |id|
        product = Product[id.to_i] || request.halt([404, { "content-type" => "text/plain" }, ["Product not found"]])
        r.get do
          layout(product.title, product_page(product))
        end
        r.post("update") do
          if product.update(product_attributes)
            r.redirect("/admin/store/products/#{id}")
          end
        rescue Sequel::ValidationFailed, Sequel::UniqueConstraintViolation => error
          response.status = 422
          layout(product.title, product_form(product, error: error.message))
        end
        r.post("delete") do
          product.destroy
          r.redirect("/admin/store")
        end
        r.post("variants") do
          variant = product.add_variant(variant_attributes)
          r.redirect("/admin/store/products/#{id}")
        rescue Sequel::ValidationFailed => error
          response.status = 422
          layout(product.title, product_page(product, variant_error: error.message, draft_variant: variant))
        end
        r.on("variants", String) do |variant_id|
          variant = product.variants_dataset.where(id: variant_id.to_i).first ||
            request.halt([404, { "content-type" => "text/plain" }, ["Variant not found"]])
          r.post("update") do
            variant.update(variant_attributes)
            r.redirect("/admin/store/products/#{id}")
          rescue Sequel::ValidationFailed => error
            response.status = 422
            layout(product.title, product_page(product, variant_error: error.message))
          end
          r.post("delete") do
            variant.destroy
            r.redirect("/admin/store/products/#{id}")
          end
        end
      end
    end


    r.on("collections") do
      r.get("new") { layout("New collection", collection_form(Collection.new(sort_order: 0))) }
      r.is do
        r.get do
          rows = Collection.order(:sort_order, :title).map do |collection|
            %(<tr><td><a href="/admin/store/collections/#{collection.id}">#{e(collection.title)}</a></td><td>#{e(collection.slug)}</td><td>#{collection.products_dataset.count}</td><td>#{collection.sort_order}</td></tr>)
          end.join
          layout("Collections", %(<div class="actions"><h1 style="flex:1">Collections</h1><a class="button" href="/admin/store/collections/new">Add collection</a></div><table><thead><tr><th>Title</th><th>Slug</th><th>Products</th><th>Order</th></tr></thead><tbody>#{rows}</tbody></table>))
        end
        r.post do
          collection = Collection.new(collection_attributes)
          collection.save
          r.redirect("/admin/store/collections/#{collection.id}")
        rescue Sequel::ValidationFailed, Sequel::UniqueConstraintViolation => error
          response.status = 422
          layout("New collection", collection_form(collection, error: error.message))
        end
      end
      r.on(String) do |id|
        collection = Collection[id.to_i] || request.halt([404, { "content-type" => "text/plain" }, ["Collection not found"]])
        r.get { layout(collection.title, collection_page(collection)) }
        r.post("update") do
          collection.update(collection_attributes)
          r.redirect("/admin/store/collections/#{id}")
        rescue Sequel::ValidationFailed, Sequel::UniqueConstraintViolation => error
          response.status = 422
          layout(collection.title, collection_form(collection, error: error.message) + collection_members(collection))
        end
        r.post("delete") do
          collection.destroy
          r.redirect("/admin/store/collections")
        end
        r.post("products") do
          product = Product[integer_param("product_id")] || request.halt([422, { "content-type" => "text/plain" }, ["Product not found"]])
          next_position = (CollectionProduct.where(collection_id: collection.id).max(:position) || -1) + 1
          CollectionProduct.dataset.insert(collection_id: collection.id, product_id: product.id, position: next_position)
          r.redirect("/admin/store/collections/#{id}")
        rescue Sequel::UniqueConstraintViolation
          r.redirect("/admin/store/collections/#{id}")
        end
        r.post("products", String, "delete") do |product_id|
          CollectionProduct.where(collection_id: collection.id, product_id: product_id.to_i).delete
          r.redirect("/admin/store/collections/#{id}")
        end
        r.post("reorder") do
          ids = request.params.fetch("product_ids", "").split(",").filter_map { |value| Integer(value, 10) rescue nil }
          current_ids = CollectionProduct.where(collection_id: collection.id).select_map(:product_id)
          request.halt([422, { "content-type" => "text/plain" }, ["Product order does not match collection"]]) unless ids.uniq.sort == current_ids.sort
          DB.transaction { ids.each_with_index { |product_id, position| CollectionProduct.where(collection_id: collection.id, product_id:).update(position:) } }
          response.status = 204
          ""
        end
      end
    end

    request.halt([404, { "content-type" => "text/plain" }, ["Not found"]])
  end
end
