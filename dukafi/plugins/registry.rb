require "timeout"
require_relative "filter_context"
require_relative "page"

# The plugin system.
#
# A plugin is TRUSTED code the operator installed: it registers Ruby that runs
# on this server and JS that reaches the admin and the storefront. There is no
# sandbox that makes a stranger's plugin safe, so plugins live in-repo and are
# loaded at boot — not fetched at runtime, not installed from a marketplace.
# The seams below are shaped so runtime loading COULD be added later behind a
# real trust story; nothing here assumes it.
#
# A plugin extends Dukafi through registries that already exist (publisher
# modules, node actions, binding frames, fragments, runtimes) plus settings,
# payment rails, quotes, filters, events, public routes, jobs, dashboard
# pages, and install lifecycle. See docs/plugin-api.md.
class Dukafi
  module Plugins
    class Plugin
      Setting = Data.define(:key, :type, :label, :secret)

      attr_reader :id, :settings_schema, :payment_providers, :event_handlers,
                  :quotes, :filters, :public_routes, :jobs, :catalogue_fields, :pages

      def initialize(id)
        @id = id.to_s
        @name = @id
        @version = "0.0.0"
        @hidden = false
        @settings_schema = []
        @payment_providers = {}
        @payment_provider_meta = {}
        @event_handlers = Hash.new { |hash, key| hash[key] = [] }
        @quotes = {}
        @filters = Hash.new { |hash, key| hash[key] = [] }
        @public_routes = []
        @jobs = []
        @pages = []
        @catalogue_fields = { product: [], variant: [] }
        @install_hooks = []
        @activate_hooks = []
        @uninstall_hooks = []
      end

      def name(value = nil)
        value ? @name = value.to_s : @name
      end

      def version(value = nil)
        value ? @version = value.to_s : @version
      end

      # Built-in settings storage that is not a merchant plugin — the editor
      # AI assistant. Hidden plugins stay registered (their settings still
      # work) but never appear in Dashboard → Plugins or MCP `list_plugins`.
      def hidden(value = nil)
        value.nil? ? @hidden : (@hidden = !!value)
      end

      def hidden?
        @hidden
      end

      # Declares the fields the admin settings form renders. `secret: true`
      # values are WRITE-ONLY over the API: the admin can set them and see
      # whether they are set, but never read them back. SQLite sits on disk
      # unencrypted, so this doesn't make a token confidential against someone
      # with the file — it stops one leaking through the browser.
      def setting(key, type: :string, label: nil, secret: false)
        @settings_schema << Setting.new(
          key: key.to_s, type: type, label: label || key.to_s, secret: secret
        )
      end

      def secret(key, label: nil) = setting(key, type: :string, label: label, secret: true)
      def integer(key, label: nil) = setting(key, type: :integer, label: label)

      # `label` and `fields` are what lets a PAGE offer this provider without
      # naming it. A storefront that hardcodes "Pay with M-Pesa" and
      # `provider: "payhero"` breaks the moment a merchant installs a
      # different plugin — so a provider describes itself, and the page loops
      # whatever is configured.
      #
      # `fields` are the inputs this provider needs collected before it can
      # charge (an M-Pesa number, say). Each is
      # `{ name:, label:, type:, placeholder: }`. Declaring none is fine: a
      # hosted-checkout provider collects everything on its own page.
      def payment_provider(slug, provider, label: nil, fields: [], checkout: true)
        @payment_providers[slug.to_s] = provider
        @payment_provider_meta[slug.to_s] = {
          "slug" => slug.to_s,
          "name" => label.to_s.empty? ? name : label.to_s,
          "fields" => Array(fields).map { |field| field.transform_keys(&:to_s) },
          "checkout" => checkout != false,
        }
      end

      def payment_provider_meta(slug) = @payment_provider_meta[slug.to_s]

      # Handlers run AFTER the triggering transaction commits, and a raising
      # handler never fails the customer's request — see `emit`.
      def on(event, &handler)
        @event_handlers[event.to_sym] << handler
      end

      # A quote is a pure function the host re-runs on POST. The browser may
      # preview an amount; the charge uses this, never the preview.
      def quote(name, &handler)
        @quotes[name.to_s] = handler
      end

      def filter(event, &handler)
        @filters[event.to_sym] << handler
      end

      def public_route(method, path, &handler)
        @public_routes << { method: method.to_s.upcase, path: normalize_route_path(path), handler: handler }
      end

      def public_get(path, &handler) = public_route("GET", path, &handler)
      def public_post(path, &handler) = public_route("POST", path, &handler)

      def job(name, every:, &handler)
        @jobs << { name: name.to_s, every: every.to_s, handler: handler }
      end

      # Extra attributes this plugin hangs off the catalogue. Origin and
      # mileage belong here, not as new columns on variants.
      def product_field(key, label: nil, type: :string)
        add_catalogue_field(:product, key, label, type)
      end

      def variant_field(key, label: nil, type: :string)
        add_catalogue_field(:variant, key, label, type)
      end

      def add_catalogue_field(owner, key, label, type)
        name = key.to_s
        kind = type.to_s
        raise ArgumentError, "#{name.inspect} is not a field name." unless name.match?(CatalogueFields::KEY)
        raise ArgumentError, "#{name.inspect} is a core field." if CatalogueFields::RESERVED.include?(name)
        raise ArgumentError, "type must be string, integer or boolean." unless CatalogueFields::TYPES.include?(kind)
        return if @catalogue_fields[owner].any? { |entry| entry[:key] == name }

        @catalogue_fields[owner] << { key: name, label: (label || name).to_s, type: kind }
      end

      # A Dashboard page the host renders. Stats, info, tables, actions —
      # the plugin names them and later fills them; it does not ship UI.
      def page(id, title:, nav_label: nil, description: nil, &block)
        raise ArgumentError, "A plugin may declare at most #{PluginPage::MAX_PAGES} pages." if @pages.length >= PluginPage::MAX_PAGES

        built = PluginPage.build(id, title:, nav_label:, description:, &block)
        raise ArgumentError, "This plugin already has a page #{built.id.inspect}." if @pages.any? { |entry| entry.id == built.id }

        @pages << built
      end

      def on_install(&handler) = @install_hooks << handler
      def on_activate(&handler) = @activate_hooks << handler
      def on_uninstall(&handler) = @uninstall_hooks << handler

      def run_install(ctx = {}) = run_lifecycle(@install_hooks, ctx)
      def run_activate(ctx = {}) = run_lifecycle(@activate_hooks, ctx)
      def run_uninstall(ctx = {}) = run_lifecycle(@uninstall_hooks, ctx)

      # Plugin-emitted events are always namespaced so a mailer cannot forge
      # `order.paid`.
      def emit(name, payload = nil)
        Dukafi::Plugins.emit(Dukafi::Plugins.namespaced_event(id, name), payload)
      end

      def log(kind, message, payload = {})
        PluginLog.record(plugin_id: id, kind: kind, message: message, payload: payload)
      end

      # Documents this plugin owns. Not products, not orders — those go
      # through CommerceWrites. A Woo id → our product id map lives here.
      def storage
        PluginStorage.new(@id)
      end

      def settings
        Settings.for(@id)
      end

      # What Dashboard → Plugins and MCP `list_plugins` return. Secrets are
      # reported as set/not-set, never as their value.
      def to_admin_payload
        values = settings
        {
          "id" => id, "name" => name, "version" => version,
          "configured" => values.configured?,
          "paymentProviders" => payment_providers.keys,
          "productFields" => @catalogue_fields[:product].map { |entry| entry.merge(pluginId: id).transform_keys(&:to_s) },
          "variantFields" => @catalogue_fields[:variant].map { |entry| entry.merge(pluginId: id).transform_keys(&:to_s) },
          "pages" => @pages.map(&:to_h),
          "settings" => settings_schema.map do |setting|
            stored = values[setting.key].to_s
            {
              "key" => setting.key, "label" => setting.label, "type" => setting.type.to_s,
              "secret" => setting.secret,
              "isSet" => !stored.empty?,
              "value" => setting.secret ? nil : stored,
            }
          end,
        }
      end

      def normalize_route_path(path)
        value = path.to_s.strip
        value = "/#{value}" unless value.start_with?("/")
        value = value.sub(%r{/\z}, "")
        value.empty? ? "/" : value
      end

      def run_lifecycle(hooks, ctx)
        payload = { plugin: self, purge: false }.merge(ctx)
        Array(hooks).each do |hook|
          hook.call(payload)
        rescue StandardError => e
          warn "[plugin:#{id}] lifecycle hook failed: #{e.class}: #{e.message}"
        end
      end
    end

    class << self
      def registry
        @registry ||= {}
      end

      def register(id)
        plugin = Plugin.new(id)
        yield plugin if block_given?
        registry[plugin.id] = plugin
      end

      def all = registry.values
      def visible = all.reject(&:hidden?)
      def find(id) = registry[id.to_s]
      def find_visible(id)
        plugin = find(id)
        plugin unless plugin&.hidden?
      end

      def unregister(id)
        registry.delete(id.to_s)
      end

      # On-disk directory for an installed plugin. Nil when the id would
      # climb out of the plugins root — that is a path, not a plugin name.
      def directory_for(plugin)
        root = File.expand_path(Paths.plugins_root)
        dir = File.expand_path(File.join(root, plugin.id.to_s))
        return nil unless dir.start_with?("#{root}#{File::SEPARATOR}")

        dir
      end

      # Every provider a page may offer RIGHT NOW: registered, and its plugin
      # fully configured. An unconfigured one is left out rather than shown and
      # then refused — a button that cannot work is worse than no button.
      def configured_payment_providers
        visible.flat_map do |plugin|
          next [] unless plugin.settings.configured?

          plugin.payment_providers.keys.filter_map do |slug|
            meta = plugin.payment_provider_meta(slug) ||
                   { "slug" => slug, "name" => plugin.name, "fields" => [] }
            next if meta["checkout"] == false

            meta.merge("pluginId" => plugin.id)
          end
        end
      end

      def payment_provider(slug)
        all.each do |plugin|
          provider = plugin.payment_providers[slug.to_s]
          return [plugin, provider] if provider
        end
        nil
      end

      def payment_provider_slugs
        all.flat_map { |plugin| plugin.payment_providers.keys }.uniq.sort
      end

      # Fire a lifecycle event.
      #
      # There is no job runner in Dukafi (Puma only), so handlers run inside
      # the request. Two rules follow, both enforced here:
      #   - a handler that raises is logged and swallowed, because a broken
      #     analytics plugin must not fail a customer's checkout
      #   - callers emit AFTER their transaction commits, so a handler can
      #     never roll back the thing it is reacting to
      def emit(event, payload = nil)
        all.each do |plugin|
          plugin.event_handlers[event.to_sym].each do |handler|
            handler.call(payload)
          rescue StandardError => e
            warn "[plugin:#{plugin.id}] #{event} handler failed: #{e.class}: #{e.message}"
          end
        end
        payload
      end

      def reset!
        @registry = {}
      end

      # Milliseconds are the point. A filter that needs a network round-trip
      # belongs on a job; the host time-boxes so a hung plugin cannot stall
      # a form POST.
      def filter_budget
        @filter_budget || 0.25
      end

      def filter_budget=(seconds)
        @filter_budget = seconds
      end

      def apply_filters(event, ctx)
        all.each do |plugin|
          Array(plugin.filters[event.to_sym]).each do |handler|
            begin
              Timeout.timeout(filter_budget) { handler.call(ctx) }
            rescue Timeout::Error
              warn "[plugin:#{plugin.id}] #{event} filter timed out"
              ctx.halt("That action could not be completed. Try again.")
            rescue StandardError => e
              warn "[plugin:#{plugin.id}] #{event} filter failed: #{e.class}: #{e.message}"
              ctx.halt("That action could not be completed. Try again.")
            end
            return ctx if ctx.halted?
          end
        end
        ctx
      end

      def run_quote(plugin_id, name, inputs)
        plugin = find_visible(plugin_id)
        raise ArgumentError, "No plugin #{plugin_id.inspect}." unless plugin

        handler = plugin.quotes[name.to_s]
        raise ArgumentError, "#{plugin_id.inspect} has no quote #{name.inspect}." unless handler

        result = handler.call(stringify_keys(inputs), plugin.settings.to_h)
        result = stringify_keys(result)
        unless result.is_a?(Hash) && result.key?("amount_cents")
          raise ArgumentError, "Quote #{name.inspect} did not return amount_cents."
        end

        result
      end

      def namespaced_event(plugin_id, name)
        raw = name.to_s
        own = "plugin.#{plugin_id}."
        raw.start_with?(own) ? raw : "#{own}#{raw}"
      end

      def find_public_route(plugin_id, method, path)
        plugin = find_visible(plugin_id)
        return nil unless plugin

        want = plugin.normalize_route_path(path)
        plugin.public_routes.find do |route|
          route[:method] == method.to_s.upcase && route[:path] == want
        end
      end

      # First boot after files land runs on_install once (keyed in settings),
      # then on_activate every process start.
      def boot!
        visible.each do |plugin|
          ensure_installed!(plugin)
          plugin.run_activate
        rescue StandardError => e
          warn "[plugin:#{plugin.id}] boot failed: #{e.class}: #{e.message}"
        end
      end

      def ensure_installed!(plugin)
        marker = PluginSetting.first(plugin_id: plugin.id, key: "_installed_at")
        return if marker

        plugin.run_install
        PluginSetting.create(plugin_id: plugin.id, key: "_installed_at",
                             value: Time.now.utc.iso8601, updated_at: Time.now)
        emit(:"plugin.installed", plugin)
      end

      def stringify_keys(hash)
        return {} unless hash.is_a?(Hash)

        hash.to_h { |key, value| [key.to_s, value] }
      end
    end
  end
end
