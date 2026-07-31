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
      <style>body{font-family:system-ui,sans-serif;max-width:70rem;margin:0 auto;padding:2rem;color:#18181b}nav{display:flex;gap:1rem;align-items:center;margin-bottom:2rem}a{color:#4f46e5}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.75rem;border-bottom:1px solid #e4e4e7}form{display:grid;gap:1rem;max-width:36rem}label{display:grid;gap:.35rem}input,select{font:inherit;padding:.65rem;border:1px solid #a1a1aa;border-radius:.4rem}button,.button{font:inherit;padding:.65rem 1rem;border:0;border-radius:.4rem;background:#4f46e5;color:white;cursor:pointer;text-decoration:none;display:inline-block;width:max-content}.danger{background:#dc2626}.actions{display:flex;gap:.75rem}.error{color:#b91c1c}</style></head>
      <body><nav><strong>Dukafy Store</strong><a href="/admin/store">Products</a><a href="/admin/site">Visual editor</a></nav>#{content}</body></html>
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
          content = product_form(product) + %(<form method="post" action="/admin/store/products/#{id}/delete" hx-post="/admin/store/products/#{id}/delete" hx-confirm="Delete #{e(product.title)}?"><button class="danger" type="submit">Delete product</button></form>)
          layout(product.title, content)
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
      end
    end

    request.halt([404, { "content-type" => "text/plain" }, ["Not found"]])
  end
end
