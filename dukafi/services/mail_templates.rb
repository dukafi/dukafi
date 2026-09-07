require "cgi"

class MailTemplates
  Rendered = Data.define(:subject, :text, :html)

  def self.order_confirmation(order)
    store = SiteState.first&.site || {}
    name = store["name"].to_s.empty? ? "Dukafi Store" : store["name"]
    lines = order.order_items.map do |item|
      "#{item.product_title} — #{item.quantity} × #{money(item.unit_price_cents, order.currency)}"
    end
    text = ["Thanks for your order ##{order.id} from #{name}.", "", *lines, "",
            "Total: #{money(order.total_cents, order.currency)}",
            ("Payment reference: #{order.settled_payment&.receipt}" if order.settled_payment)].compact.join("\n")
    html = "<h1>Order ##{order.id}</h1><p>Thanks for shopping with #{CGI.escapeHTML(name)}.</p>" \
           "<ul>#{order.order_items.map { |i| "<li>#{CGI.escapeHTML(i.product_title)} — #{i.quantity} × #{money(i.unit_price_cents, order.currency)}</li>" }.join}</ul>" \
           "<p><strong>Total: #{money(order.total_cents, order.currency)}</strong></p>"
    Rendered.new(subject: "Your #{name} order ##{order.id}", text: text, html: html)
  end

  def self.money(cents, currency) = "#{currency} #{format('%.2f', cents.to_i / 100.0)}"
end
