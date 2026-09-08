require_relative "../spec_helper"

class SmtpPluginSpec < Minitest::Test
  FakeSession = Struct.new(:messages) do
    def send_message(body, from, to)
      messages << { body: body, from: from, to: to }
    end
  end

  FakeSmtp = Struct.new(:host, :port, :session, :started) do
    attr_accessor :open_timeout, :read_timeout
    def enable_starttls_auto; end
    def start(_helo, _user, _password, _auth)
      self.started = true
      yield session
    end
  end

  def setup
    PluginSetting.dataset.delete
    settings = Dukafi::Plugins::Settings.for("smtp")
    settings[:host] = "smtp.example.com"
    settings[:port] = "587"
    settings[:username] = "user"
    settings[:password] = "pass"
    settings[:from] = "Duka <orders@example.com>"
  end

  def test_smtp_delivers_a_message
    session = FakeSession.new([])
    fake = FakeSmtp.new("smtp.example.com", 587, session, false)
    message = Mailer::Message.new(to: "buyer@example.com", subject: "Hi", text: "plain",
                                   html: "<p>Hi</p>", reply_to: nil)
    Net::SMTP.stub :new, fake do
      result = DukafiSmtp::Provider.deliver(message: message, config: Dukafi::Plugins::Settings.for("smtp").to_h)
      assert result.ok, result.error
    end
    assert fake.started
    assert_equal 1, session.messages.length
    assert_includes session.messages.first[:body], "buyer@example.com"
    assert_includes session.messages.first[:body], "Hi"
    assert_equal "orders@example.com", session.messages.first[:from]
  end
end
