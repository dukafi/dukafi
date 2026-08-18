require "timeout"
require "cgi"

# Fills a plugin dashboard page. The plugin declared the layout; this module
# is the only caller of its handlers, so a Woo importer cannot return HTML
# or a Railway plugin dump its API token into a card.
#
# Handlers run on the admin request (the merchant clicked Refresh). They are
# time-boxed: a hung third-party API must not take the Dashboard down. A
# raising handler is logged and turned into a generic error — exception
# messages often contain the credentials that caused them.
module PluginPages
  class Error < StandardError
    attr_reader :code, :http_status

    def initialize(code, message, http_status: 422)
      @code = code
      @http_status = http_status
      super(message)
    end
  end

  Context = Data.define(:plugin, :page, :settings, :params, :limit, :offset, :query)
  DEFAULT_LIMIT = 25
  MAX_LIMIT = 100
  VALUE_MAX = 200
  HINT_MAX = 120
  MESSAGE_MAX = 200
  TONES = %w[default good warn bad].freeze
  LOAD_BUDGET = 8
  TABLE_BUDGET = 8
  ACTION_BUDGET = 20

  module_function

  def load_budget
    @load_budget || LOAD_BUDGET
  end

  def load_budget=(seconds)
    @load_budget = seconds
  end

  def action_budget
    @action_budget || ACTION_BUDGET
  end

  def action_budget=(seconds)
    @action_budget = seconds
  end

  def manifest(plugin)
    Array(plugin.pages).map(&:to_h)
  end

  def page(plugin, page_id)
    find_page!(plugin, page_id).to_h.merge("pluginId" => plugin.id, "pluginName" => plugin.name)
  end

  def data(plugin, page_id)
    found = find_page!(plugin, page_id)
    raw = run_handler(plugin, found, found.load_handler, budget: load_budget, kind: "load") || {}
    {
      "pluginId" => plugin.id,
      "pageId" => found.id,
      "stats" => slice_stats(found, raw),
      "info" => slice_info(found, raw),
    }
  end

  def table(plugin, page_id, table_id, limit: nil, offset: nil, query: nil)
    found = find_page!(plugin, page_id)
    declared = found.table(table_id) ||
      raise(Error.new("table_not_found", "This page has no table #{table_id.to_s.inspect}."))
    handler = found.table_handlers[declared.id]
    per_page = clamp_limit(limit)
    start = [Integer(offset, exception: false) || 0, 0].max
    raw = run_handler(
      plugin, found, handler, budget: TABLE_BUDGET, kind: "table",
      limit: per_page, offset: start, query: query.to_s.strip
    ) || {}
    rows = Array(hashish(raw)["rows"] || hashish(raw)[:rows])
    total = Integer(hashish(raw)["total"] || hashish(raw)[:total] || rows.length, exception: false) || rows.length
    {
      "pluginId" => plugin.id,
      "pageId" => found.id,
      "tableId" => declared.id,
      "columns" => declared.columns.map { |column| { "key" => column.key, "label" => column.label } },
      "empty" => declared.empty,
      "rows" => rows.first(per_page).map { |row| slice_row(declared, row) },
      "total" => [total, 0].max,
      "limit" => per_page,
      "offset" => start,
    }
  end

  def action(plugin, page_id, action_id, params: {})
    found = find_page!(plugin, page_id)
    declared = found.action(action_id) ||
      raise(Error.new("action_not_found", "This page has no action #{action_id.to_s.inspect}."))
    handler = found.action_handlers[declared.id]
    raise Error.new("action_unwired", "This action is not wired.") unless handler

    raw = run_handler(
      plugin, found, handler, budget: action_budget, kind: "action",
      params: scalar_params(params)
    ) || {}
    body = hashish(raw)
    ok = body.key?("ok") ? !!body["ok"] : true
    {
      "ok" => ok,
      "pluginId" => plugin.id,
      "pageId" => found.id,
      "actionId" => declared.id,
      "message" => text(body["message"] || (ok ? "Done." : "That action could not be completed."), max: MESSAGE_MAX),
      "reload" => body.key?("reload") ? !!body["reload"] : ok,
    }
  end

  def find_page!(plugin, page_id)
    found = Array(plugin.pages).find { |entry| entry.id == page_id.to_s }
    found || raise(Error.new("page_not_found", "No page #{page_id.to_s.inspect} on #{plugin.id}.", http_status: 404))
  end
  private_class_method :find_page!

  def run_handler(plugin, page, handler, budget:, kind:, params: {}, limit: nil, offset: nil, query: nil)
    return nil unless handler

    ctx = Context.new(
      plugin: plugin, page: page, settings: plugin.settings.to_h,
      params: params, limit: limit, offset: offset, query: query
    )
    Timeout.timeout(budget) { handler.call(ctx) }
  rescue Timeout::Error
    warn "[plugin:#{plugin.id}] page #{page.id} #{kind} timed out"
    raise Error.new("page_timeout", "That #{kind} took too long. Try again.", http_status: 504)
  rescue Error
    raise
  rescue StandardError => e
    warn "[plugin:#{plugin.id}] page #{page.id} #{kind} failed: #{e.class}: #{e.message}"
    raise Error.new("page_failed", "That #{kind} could not be completed. Try again.", http_status: 502)
  end
  private_class_method :run_handler

  def slice_stats(page, raw)
    values = nested(raw, "stats")
    page.stats.to_h do |stat|
      cell = values[stat.id]
      row = cell.is_a?(Hash) ? hashish(cell) : { "value" => cell }
      [stat.id, {
        "value" => text(row["value"], max: VALUE_MAX),
        "hint" => row["hint"].to_s.strip.empty? ? nil : text(row["hint"], max: HINT_MAX),
        "tone" => TONES.include?(row["tone"].to_s) ? row["tone"].to_s : "default",
      }]
    end
  end
  private_class_method :slice_stats

  def slice_info(page, raw)
    values = nested(raw, "info")
    page.info.to_h do |item|
      cell = values[item.id]
      value = cell.is_a?(Hash) ? hashish(cell)["value"] : cell
      [item.id, { "value" => text(value, max: VALUE_MAX) }]
    end
  end
  private_class_method :slice_info

  def slice_row(table, row)
    hash = hashish(row)
    keys = table.columns.map(&:key)
    out = { "id" => text(hash["id"] || hash[keys.first], max: 80) }
    keys.each { |key| out[key] = cell(hash[key]) }
    out
  end
  private_class_method :slice_row

  def cell(value)
    case value
    when Integer then value
    when Float then value.finite? ? value : nil
    when TrueClass, FalseClass then value
    when nil then nil
    else text(value, max: VALUE_MAX)
    end
  end
  private_class_method :cell

  def scalar_params(params)
    hash = hashish(params)
    hash.keys.first(20).to_h do |key|
      value = hash[key]
      next [key.to_s, nil] unless scalar?(value)

      [key.to_s, value.is_a?(String) ? text(value, max: 500) : value]
    end
  end
  private_class_method :scalar_params

  def scalar?(value)
    value.nil? || value.is_a?(String) || value.is_a?(Integer) ||
      value.is_a?(Float) || value.is_a?(TrueClass) || value.is_a?(FalseClass)
  end
  private_class_method :scalar?

  def nested(raw, key)
    hashish(hashish(raw)[key])
  end
  private_class_method :nested

  def hashish(value)
    return {} unless value.is_a?(Hash)

    value.to_h { |key, item| [key.to_s, item] }
  end
  private_class_method :hashish

  def text(value, max:)
    string = CGI.unescapeHTML(value.to_s).gsub(/<[^>]*>/, "").gsub(/\s+/, " ").strip
    string[0, max]
  end
  private_class_method :text

  def clamp_limit(value)
    [[Integer(value, exception: false) || DEFAULT_LIMIT, 1].max, MAX_LIMIT].min
  end
  private_class_method :clamp_limit
end
