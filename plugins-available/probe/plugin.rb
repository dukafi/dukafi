# Probe — exercises every store plugin seam without calling a third party.
#
# Mail, charges and outbound webhooks are written to `plugin_logs` (the logs
# table). Open /plugins/probe to drive each path and watch the log.
require_relative "woo"

module Probe
  module_function

  def lab_html
    File.read(File.join(__dir__, "lab.html"))
  end

  def json_ok(payload) = [200, { "content-type" => "application/json" }, [JSON.generate(payload)]]
  def json_err(status, message) = [status, { "content-type" => "application/json" }, [JSON.generate({ "error" => message })]]

  def params_of(req)
    parsed = req.json
    parsed = {} unless parsed.is_a?(Hash)
    req.params.merge(parsed).transform_keys(&:to_s)
  end
end

Dukafi::Plugins.register("probe") do |p|
  p.name "Plugin lab"
  p.version "1.0.0"

  p.product_field :make, label: "Make"
  p.product_field :model_year, label: "Model year", type: :integer
  p.variant_field :origin, label: "Origin"
  p.variant_field :mileage, label: "Mileage", type: :integer

  p.on_install do |_ctx|
    p.log("install", "Probe installed. Logs table is ready.")
  end

  p.on_activate do |_ctx|
    p.log("activate", "Probe activated in this process.")
  end

  p.on_uninstall do |_ctx|
    p.log("uninstall", "Probe uninstall hook ran. Logs are kept.")
  end

  p.filter :"form.submitting" do |ctx|
    next ctx unless ctx.form_id == "probe-lab"

    if ctx.fields["halt"].to_s == "1" || ctx.fields["email"].to_s.include?("halt@")
      ctx.halt("Probe filter halted this form (email contains halt@, or halt=1).")
    end
    ctx
  end

  p.quote :car_finance do |inputs, _settings|
    price = inputs["price_cents"].to_i
    deposit = inputs["deposit_cents"].to_i
    months = [inputs["term_months"].to_i, 1].max
    principal = [price - deposit, 0].max
    monthly = (principal / months.to_f).round
    currency = inputs["currency"].to_s
    currency = "KES" if currency.empty?
    {
      "amount_cents" => deposit,
      "currency" => currency,
      "label" => "Car deposit",
      "monthly_cents" => monthly,
      "term_months" => months,
      "principal_cents" => principal,
    }
  end

  p.on :"form.submitted" do |submission|
    next unless submission.form_id.to_s.start_with?("probe")

    p.log("mail", "Would email notify@store about form #{submission.form_id}",
          { "formId" => submission.form_id, "fields" => submission.payload_data })
  end

  p.on :"form.discarded" do |payload|
    p.log("event", "Form discarded", payload)
  end

  p.on :"order.created" do |order|
    p.log("mail", "Would email #{order.email} an order receipt",
          { "orderId" => order.id, "totalCents" => order.total_cents, "token" => order.public_token })
  end

  p.on :"order.paid" do |order|
    p.log("mail", "Would email #{order.email} a payment confirmation",
          { "orderId" => order.id, "status" => order.status })
  end

  p.on :payment_initiated do |attempt|
    p.log("event", "Payment initiated (not sent to a rail)",
          { "reference" => attempt.reference, "amountCents" => attempt.amount_cents })
  end

  p.on :payment_succeeded do |attempt|
    p.log("event", "Payment succeeded",
          { "reference" => attempt.reference, "amountCents" => attempt.amount_cents })
  end

  p.on :"customer.created" do |customer|
    p.log("event", "New customer", { "id" => customer.id, "email" => customer.email })
  end

  p.on :"plugin.installed" do |plugin|
    next unless plugin.respond_to?(:id) && plugin.id == "probe"

    p.log("event", "Host emitted plugin.installed")
  end

  p.job :heartbeat, every: "15m" do |_ctx|
    p.log("job", "Heartbeat job ran (would sync / import here)")
  end

  p.job :woo_import, every: "6h" do |_ctx|
    Probe::WooImport.sync!(p, use_sample: true)
  end

  p.public_get "/" do |_req|
    [200, { "content-type" => "text/html; charset=utf-8" }, [Probe.lab_html]]
  end

  p.public_get "/logs" do |_req|
    rows = PluginLog.where(plugin_id: "probe").order(Sequel.desc(:id)).limit(100).map(&:to_h)
    Probe.json_ok({ "logs" => rows, "total" => rows.length })
  end

  p.public_post "/logs/clear" do |_req|
    PluginLog.where(plugin_id: "probe").delete
    Probe.json_ok({ "ok" => true })
  end

  p.public_post "/forms" do |req|
    params = Probe.params_of(req)
    fields = {
      "email" => params["email"].to_s,
      "message" => params["message"].to_s,
      "halt" => params["halt"].to_s,
      "amount_cents" => params["amount_cents"].to_s,
    }
    ctx = PluginFilterContext.new(form_id: "probe-lab", fields: fields)
    Dukafi::Plugins.apply_filters(:"form.submitting", ctx)
    if ctx.halted?
      next Probe.json_err(422, ctx.halt_message)
    end

    submission = FormSubmission.create(
      form_id: "probe-lab", payload: fields, created_at: Time.now
    )
    Dukafi::Plugins.emit(:"form.submitted", submission)
    Probe.json_ok({ "ok" => true, "id" => submission.id, "note" => "Stored. Mail was logged, not sent." })
  end

  p.public_post "/quote" do |req|
    params = Probe.params_of(req)
    quoted = Dukafi::Plugins.run_quote("probe", "car_finance", params)
    Probe.json_ok({ "quote" => quoted })
  rescue ArgumentError => e
    Probe.json_err(422, e.message)
  end

  p.public_post "/charge" do |req|
    params = Probe.params_of(req)
    subject = params.fetch("subject", "preset")
    begin
      priced = Charge.resolve(
        subject: subject,
        fields: params,
        preset_cents: params["preset_cents"] || params["amount_cents"],
        quote_plugin: "probe",
        quote_name: "car_finance",
        inputs: params,
        claimed_cents: params["claimed_cents"],
        currency: params["currency"],
      )
    rescue Charge::Error => e
      next Probe.json_err(422, e.message)
    end

    order = Charge.open_order(
      priced,
      email: params["email"].to_s.empty? ? "lab@example.test" : params["email"],
      title: priced.label,
    )
    p.log("charge", "Would start a #{priced.currency} #{priced.amount_cents} charge via a payment rail",
          { "subject" => priced.subject, "amountCents" => priced.amount_cents,
            "currency" => priced.currency, "orderId" => order.id, "token" => order.public_token })

    if params["mark_paid"].to_s == "1"
      order.update(status: "paid", updated_at: Time.now)
      Dukafi::Plugins.emit(:"order.paid", order.refresh)
    end

    Probe.json_ok({
      "ok" => true,
      "amountCents" => priced.amount_cents,
      "currency" => priced.currency,
      "label" => priced.label,
      "subject" => priced.subject,
      "orderId" => order.id,
      "token" => order.public_token,
      "note" => params["mark_paid"].to_s == "1" ? "Logged and marked paid. No rail was called." : "Logged. Order is pending — no rail was called.",
    })
  end

  p.public_post "/webhooks/probe" do |req|
    payload = Probe.params_of(req)
    p.log("webhook", "Inbound webhook received", payload)
    Probe.json_ok({ "ok" => true, "note" => "Logged. Nothing was sent outbound." })
  end

  p.public_post "/jobs/heartbeat" do |_req|
    result = PluginJobs.run("probe", "heartbeat")
    Probe.json_ok(result.merge("note" => "Job ran now, off the visitor path."))
  end

  p.public_get "/import/woo/sample" do |_req|
    Probe.json_ok({ "products" => Probe::WooImport::SAMPLE })
  end

  p.public_get "/import/woo" do |_req|
    Probe.json_ok({
      "products" => p.storage.collection("woo_products").all,
      "variants" => p.storage.collection("woo_variants").all,
      "categories" => p.storage.collection("woo_categories").all,
    })
  end

  p.public_post "/import/woo" do |req|
    params = Probe.params_of(req)
    use_sample = params["useSample"].to_s == "1" || params["useSample"] == true
    result = Probe::WooImport.sync!(p, products: params["products"] || params["json"], use_sample: use_sample)
    Probe.json_ok(result)
  rescue CommerceWrites::Invalid, ArgumentError => e
    Probe.json_err(422, e.message)
  end

  p.public_post "/jobs/woo_import" do |_req|
    result = PluginJobs.run("probe", "woo_import")
    Probe.json_ok(result.merge("note" => "Import job ran off the visitor path."))
  end

  p.public_post "/fields" do |req|
    params = Probe.params_of(req)
    slug = params["slug"].to_s
    product = Product.first(slug: slug)
    next Probe.json_err(404, "No product #{slug.inspect}.") unless product

    if params["variantSku"].to_s.empty?
      CommerceWrites.update_product!(product, {
        "title" => product.title, "status" => product.status,
        "descriptionHtml" => product.description_document.to_s,
        "fields" => params["fields"] || {},
      })
      Probe.json_ok({ "ok" => true, "slug" => product.slug,
                      "fields" => CatalogueFields.hash_for(product.refresh.fields, owner: :product) })
    else
      variant = product.variants_dataset.first(sku: params["variantSku"].to_s)
      next Probe.json_err(404, "No variant #{params["variantSku"].inspect}.") unless variant

      CommerceWrites.update_variant!(variant, {
        "sku" => variant.sku, "title" => variant.title,
        "priceCents" => variant.price_cents, "stock" => variant.stock,
        "position" => variant.position, "fields" => params["fields"] || {},
      })
      Probe.json_ok({ "ok" => true, "sku" => variant.sku,
                      "fields" => CatalogueFields.hash_for(variant.refresh.fields, owner: :variant) })
    end
  rescue CommerceWrites::Invalid, ArgumentError => e
    Probe.json_err(422, e.message)
  end
end
