class Dukafi
  module Plugins
    # A plugin's page in Dashboard — layout only.
    #
    # The host owns the chrome: stat cards, info rows, paginated tables,
    # action buttons. The plugin names those widgets and later fills them
    # with JSON (`PluginPages`). It never returns HTML. That is the whole
    # point: Railway usage and a WooCommerce import look like the rest of
    # the Dashboard, not like a second admin app.
    class PluginPage
      ID = /\A[a-z][a-z0-9-]{0,39}\z/
      MAX_PAGES = 5
      MAX_STATS = 8
      MAX_INFO = 8
      MAX_TABLES = 3
      MAX_ACTIONS = 6
      MAX_COLUMNS = 8
      ACTION_KINDS = %w[primary secondary danger].freeze

      Stat = Data.define(:id, :label)
      Info = Data.define(:id, :label)
      Column = Data.define(:key, :label)
      Table = Data.define(:id, :label, :columns, :empty)
      Action = Data.define(:id, :label, :kind, :confirm)

      attr_reader :id, :title, :nav_label, :description, :stats, :info, :tables, :actions
      attr_accessor :load_handler, :table_handlers, :action_handlers

      def self.build(id, title:, nav_label: nil, description: nil)
        page = new(id, title:, nav_label:, description:)
        yield Builder.new(page) if block_given?
        page
      end

      def initialize(id, title:, nav_label: nil, description: nil)
        @id = normalize_id(id, "page")
        @title = clip(title, 80, "title")
        @nav_label = clip(nav_label.nil? || nav_label.to_s.empty? ? @title : nav_label, 40, "nav label")
        @description = description.to_s.strip.empty? ? nil : clip(description, 280, "description")
        @stats = []
        @info = []
        @tables = []
        @actions = []
        @load_handler = nil
        @table_handlers = {}
        @action_handlers = {}
      end

      def table(id)
        @tables.find { |entry| entry.id == id.to_s }
      end

      def action(id)
        @actions.find { |entry| entry.id == id.to_s }
      end

      def to_h
        {
          "id" => id,
          "title" => title,
          "navLabel" => nav_label,
          "description" => description,
          "stats" => stats.map { |entry| { "id" => entry.id, "label" => entry.label } },
          "info" => info.map { |entry| { "id" => entry.id, "label" => entry.label } },
          "tables" => tables.map do |entry|
            {
              "id" => entry.id,
              "label" => entry.label,
              "empty" => entry.empty,
              "columns" => entry.columns.map { |column| { "key" => column.key, "label" => column.label } },
            }
          end,
          "actions" => actions.map do |entry|
            {
              "id" => entry.id,
              "label" => entry.label,
              "kind" => entry.kind,
              "confirm" => entry.confirm,
            }
          end,
        }
      end

      def add_stat(id, label:)
        raise ArgumentError, "A page may declare at most #{MAX_STATS} stats." if @stats.length >= MAX_STATS

        @stats << Stat.new(id: unique_widget(id, "stat"), label: clip(label, 40, "stat label"))
      end

      def add_info(id, label:)
        raise ArgumentError, "A page may declare at most #{MAX_INFO} info rows." if @info.length >= MAX_INFO

        @info << Info.new(id: unique_widget(id, "info"), label: clip(label, 40, "info label"))
      end

      def add_table(id, label:, columns:, empty: nil)
        raise ArgumentError, "A page may declare at most #{MAX_TABLES} tables." if @tables.length >= MAX_TABLES

        list = Array(columns)
        raise ArgumentError, "A table needs at least one column." if list.empty?
        raise ArgumentError, "A table may declare at most #{MAX_COLUMNS} columns." if list.length > MAX_COLUMNS

        seen = []
        parsed = list.map do |column|
          hash = stringify(column)
          key = unique_in(normalize_id(hash["key"] || hash["id"], "column"), seen, "column")
          seen << key
          Column.new(key: key, label: clip(hash["label"] || key, 40, "column label"))
        end
        @tables << Table.new(
          id: unique_widget(id, "table"),
          label: clip(label, 40, "table label"),
          columns: parsed,
          empty: clip(empty.to_s.empty? ? "Nothing yet" : empty, 80, "empty message"),
        )
      end

      def add_action(id, label:, kind: "primary", confirm: nil)
        raise ArgumentError, "A page may declare at most #{MAX_ACTIONS} actions." if @actions.length >= MAX_ACTIONS

        name = kind.to_s
        raise ArgumentError, "Action kind must be #{ACTION_KINDS.join(', ')}." unless ACTION_KINDS.include?(name)

        @actions << Action.new(
          id: unique_widget(id, "action"),
          label: clip(label, 40, "action label"),
          kind: name,
          confirm: confirm.to_s.strip.empty? ? nil : clip(confirm, 200, "confirm"),
        )
      end

      class Builder
        def initialize(page)
          @page = page
        end

        def stat(id, label:) = @page.add_stat(id, label:)
        def info(id, label:) = @page.add_info(id, label:)
        def table(id, label:, columns:, empty: nil) = @page.add_table(id, label:, columns:, empty:)
        def action(id, label:, kind: "primary", confirm: nil) = @page.add_action(id, label:, kind:, confirm:)
        def load(&handler) = @page.load_handler = handler
        def rows(id, &handler) = @page.table_handlers[id.to_s] = handler
        def run(id, &handler) = @page.action_handlers[id.to_s] = handler
      end

      def normalize_id(value, what)
        id = value.to_s
        raise ArgumentError, "#{id.inspect} cannot be a #{what} id. Use lowercase letters, numbers and hyphens." unless id.match?(ID)

        id
      end

      def unique_widget(id, what)
        unique_in(normalize_id(id, what), widget_ids, what)
      end

      def unique_in(id, existing, what)
        raise ArgumentError, "This page already has a #{what} #{id.inspect}." if existing.include?(id)

        id
      end

      def widget_ids
        stats.map(&:id) + info.map(&:id) + tables.map(&:id) + actions.map(&:id)
      end

      def clip(value, max, what)
        text = value.to_s.strip
        raise ArgumentError, "A #{what} is required." if text.empty?
        raise ArgumentError, "A #{what} must be #{max} characters or fewer." if text.length > max

        text
      end

      def stringify(value)
        return {} unless value.is_a?(Hash)

        value.to_h { |key, item| [key.to_s, item] }
      end
    end
  end
end
