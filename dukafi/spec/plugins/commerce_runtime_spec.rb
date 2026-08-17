require_relative "../spec_helper"

class CommerceRuntimeSpec < Minitest::Test
  def setup
    PluginLog.dataset.delete
  end

  def teardown
    Dukafi::Plugins.unregister("runtime-lab")
    PluginSetting.where(plugin_id: "runtime-lab").delete
    Dukafi::Plugins.filter_budget = nil
  end

  def test_a_raising_filter_halts_fail_closed
    Dukafi::Plugins.register("runtime-lab") do |p|
      p.filter :"form.submitting" do |_ctx|
        raise "calendar down"
      end
    end
    ctx = PluginFilterContext.new(form_id: "booking", fields: {})

    Dukafi::Plugins.apply_filters(:"form.submitting", ctx)

    assert ctx.halted?
    assert_includes ctx.halt_message, "could not be completed"
  end

  def test_a_slow_filter_times_out_as_a_halt
    Dukafi::Plugins.filter_budget = 0.05
    Dukafi::Plugins.register("runtime-lab") do |p|
      p.filter :"form.submitting" do |ctx|
        sleep 1
        ctx
      end
    end
    ctx = PluginFilterContext.new(form_id: "booking", fields: {})

    Dukafi::Plugins.apply_filters(:"form.submitting", ctx)

    assert ctx.halted?
  end

  def test_a_quote_must_return_amount_cents
    Dukafi::Plugins.register("runtime-lab") do |p|
      p.quote :broken do |_inputs, _settings|
        { "label" => "no amount" }
      end
    end

    error = assert_raises(ArgumentError) do
      Dukafi::Plugins.run_quote("runtime-lab", "broken", {})
    end
    assert_includes error.message, "amount_cents"
  end

  def test_plugin_emitted_events_are_namespaced
    seen = []
    Dukafi::Plugins.register("runtime-lab") do |p|
      p.on :"plugin.runtime-lab.slot_taken" do |payload|
        seen << payload
      end
    end
    plugin = Dukafi::Plugins.find("runtime-lab")
    plugin.emit("slot_taken", { "id" => "slot-1" })
    plugin.emit("plugin.runtime-lab.slot_taken", { "id" => "slot-2" })

    assert_equal %w[slot-1 slot-2], seen.map { |row| row["id"] }
  end

  def test_a_checkout_false_rail_is_hidden_from_the_page
    Dukafi::Plugins.register("runtime-lab") do |p|
      p.name "Lab rail"
      p.setting :token, label: "Token"
      p.payment_provider "lab-rail", Object, checkout: false
    end
    Dukafi::Plugins.find("runtime-lab").settings[:token] = "set"

    slugs = Dukafi::Plugins.configured_payment_providers.map { |row| row["slug"] }
    refute_includes slugs, "lab-rail"
  end

  def test_p_log_writes_the_logs_table
    Dukafi::Plugins.find("probe").log("mail", "Would send a receipt", { "to" => "ada@example.test" })

    row = PluginLog.where(plugin_id: "probe", kind: "mail").last
    assert_equal "Would send a receipt", row.message
    assert_equal "ada@example.test", row.payload_data["to"]
  end
end
