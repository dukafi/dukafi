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
# modules, node actions, binding frames, fragments, runtimes) plus two things
# this file adds: settings storage and lifecycle events.
class Dukafi
  module Plugins
    class Plugin
      Setting = Data.define(:key, :type, :label, :secret)

      attr_reader :id, :settings_schema, :payment_providers, :event_handlers

      def initialize(id)
        @id = id.to_s
        @name = @id
        @version = "0.0.0"
        @settings_schema = []
        @payment_providers = {}
        @event_handlers = Hash.new { |hash, key| hash[key] = [] }
      end

      def name(value = nil)
        value ? @name = value.to_s : @name
      end

      def version(value = nil)
        value ? @version = value.to_s : @version
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

      def payment_provider(slug, provider)
        @payment_providers[slug.to_s] = provider
      end

      # Handlers run AFTER the triggering transaction commits, and a raising
      # handler never fails the customer's request — see `emit`.
      def on(event, &handler)
        @event_handlers[event.to_sym] << handler
      end

      def settings
        Settings.for(@id)
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
      def find(id) = registry[id.to_s]

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
    end
  end
end
