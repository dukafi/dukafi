require_relative "../spec_helper"
require "bcrypt"
require "open3"

# The password CLI is the only route back in for a locked-out owner — there is
# no email reset — so the things worth pinning down are the ways a recovery
# tool fails badly: writing a digest the login route will not accept, accepting
# a password weaker than the signup form, or leaking the password somewhere it
# outlives the command.
class PasswdScriptSpec < Minitest::Test
  SCRIPT = File.expand_path("../../scripts/passwd.rb", __dir__)

  def setup
    Admin.dataset.delete
    Customer.dataset.delete
    @admin = Admin.create(
      email: "owner@example.com",
      password_digest: BCrypt::Password.create("the-original-password"),
      created_at: Time.now, updated_at: Time.now
    )
  end

  # Runs the real script in a child process against this suite's database, so
  # what is exercised is the actual command an operator types.
  def run_script(*args, stdin: nil)
    environment = ENV.to_h.merge("DUKAFY_DB" => Paths.database)
    Open3.capture3(environment, RbConfig.ruby, SCRIPT, *args, stdin_data: stdin.to_s)
  end

  def digest_for(email)
    Admin.first(email: email).password_digest
  end

  # The property everything else rests on: the digest this writes is one the
  # login route accepts. A tool that "succeeds" and leaves you locked out is
  # worse than no tool.
  def test_the_new_password_verifies_the_way_the_login_route_checks_it
    _out, err, status = run_script("owner@example.com", "--stdin", "--force",
                                   stdin: "a-fresh-long-password\n")
    assert status.success?, "script failed: #{err}"

    stored = BCrypt::Password.new(digest_for("owner@example.com"))
    assert_equal stored, "a-fresh-long-password"
    refute_equal stored, "the-original-password"
  end

  def test_the_old_password_stops_working
    run_script("owner@example.com", "--stdin", "--force", stdin: "a-fresh-long-password\n")
    refute_equal BCrypt::Password.new(digest_for("owner@example.com")), "the-original-password"
  end

  # 12 is what POST /admin/api/cms/setup enforces. A CLI that accepted less
  # would be a hole in the same wall.
  def test_an_admin_password_shorter_than_the_signup_minimum_is_refused
    before = digest_for("owner@example.com")
    _out, err, status = run_script("owner@example.com", "--stdin", "--force", stdin: "tooshort\n")

    refute status.success?
    assert_includes err, "at least 12"
    assert_equal before, digest_for("owner@example.com"), "a refused password still wrote a digest"
  end

  # bcrypt truncates silently past 72 bytes, which would make two different
  # long passwords equivalent — and nobody would find out until one of them
  # unexpectedly worked.
  def test_a_password_past_bcrypts_truncation_point_is_refused
    before = digest_for("owner@example.com")
    _out, err, status = run_script("owner@example.com", "--stdin", "--force", stdin: ("x" * 73) + "\n")

    refute status.success?
    assert_includes err, "72 bytes"
    assert_equal before, digest_for("owner@example.com")
  end

  def test_a_customer_uses_the_lower_customer_minimum
    Customer.create(
      email: "shopper@example.com",
      password_digest: BCrypt::Password.create("old-shopper-pw"),
      created_at: Time.now, updated_at: Time.now
    )
    _out, err, status = run_script("shopper@example.com", "--customer", "--stdin", "--force",
                                   stdin: "eightchr\n")
    assert status.success?, "script failed: #{err}"
    assert_equal BCrypt::Password.new(Customer.first(email: "shopper@example.com").password_digest),
                 "eightchr"
  end

  def test_an_unknown_address_changes_nothing_and_suggests_the_near_miss
    before = digest_for("owner@example.com")
    # One character off, the way a real person mistypes their own address.
    _out, err, status = run_script("ownr@example.com", "--stdin", "--force", stdin: "a-fresh-long-password\n")

    refute status.success?
    assert_includes err, "owner@example.com"
    assert_equal before, digest_for("owner@example.com")
  end

  def test_an_unrelated_address_is_refused_without_a_bogus_suggestion
    _out, err, status = run_script("someone@elsewhere.invalid", "--stdin", "--force",
                                   stdin: "a-fresh-long-password\n")
    refute status.success?
    refute_includes err, "did you mean"
  end

  # A generated password is useless if it is not shown, and dangerous if it is
  # shown but does not work.
  def test_generate_prints_a_password_that_actually_works
    out, err, status = run_script("owner@example.com", "--generate", "--force")
    assert status.success?, "script failed: #{err}"

    printed = out.lines.map(&:strip).find { |line| line.match?(/\A[A-Za-z2-9]{20,}\z/) }
    refute_nil printed, "no password appeared in the output:\n#{out}"
    assert_equal BCrypt::Password.new(digest_for("owner@example.com")), printed
  end

  # The reset has to leave a trace. `--list` reads updated_at to report it, and
  # it is the only record that this happened at all.
  def test_a_change_moves_updated_at
    @admin.update(updated_at: Time.now - 86_400)
    was = Admin.first(email: "owner@example.com").updated_at

    run_script("owner@example.com", "--stdin", "--force", stdin: "a-fresh-long-password\n")

    assert_operator Admin.first(email: "owner@example.com").updated_at, :>, was
  end

  def test_listing_reports_accounts_without_revealing_digests
    out, _err, status = run_script("--list")
    assert status.success?
    assert_includes out, "owner@example.com"
    refute_includes out, digest_for("owner@example.com"),
                     "the listing printed the password digest"
    refute_includes out, "$2a$", "the listing printed a bcrypt hash"
  end

  # The whole reason the password is prompted for rather than taken as argv:
  # an argument is visible in `ps` and lands in shell history. If a future
  # edit adds a positional password, this fails.
  def test_a_password_cannot_be_passed_as_an_argument
    before = digest_for("owner@example.com")
    _out, _err, _status = run_script("owner@example.com", "hunter2-hunter2", "--force", stdin: "")
    assert_equal before, digest_for("owner@example.com"),
                 "a positional argument was accepted as the password"
  end
end
