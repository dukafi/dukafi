#!/usr/bin/env ruby
# frozen_string_literal: true

# Set the password on an account, from the command line.
#
#   bundle exec ruby scripts/passwd.rb you@example.com
#   bundle exec ruby scripts/passwd.rb --list
#   bundle exec ruby scripts/passwd.rb you@example.com --generate
#   bundle exec ruby scripts/passwd.rb shopper@example.com --customer
#
# In a container:
#
#   docker exec -it dukafi bundle exec ruby scripts/passwd.rb --list
#
# There is no self-service reset in Dukafi — no email flow, no "forgot
# password" link — so this is how a locked-out owner gets back in. It is
# deliberately a local command: anyone who can run it already has the database
# file, and could set the digest by hand anyway. What it adds is doing that
# correctly (bcrypt, the same cost the app uses, the same minimum lengths) and
# refusing the ways it usually goes wrong.
#
# THE PASSWORD IS NEVER AN ARGUMENT. It would sit in shell history and be
# visible in `ps` to every other user on the machine for as long as the command
# runs. It is prompted for without echo, or read from stdin when piped.

require "bcrypt"
require "io/console"
require "optparse"
require "securerandom"

require_relative "../config/environment"

MINIMUMS = {
  # Matches `POST /admin/api/cms/setup`, which refuses anything shorter. A CLI
  # that accepted a weaker password than the signup form would be a hole in
  # the same wall.
  admin: 12,
  # Matches CustomerAccount::MIN_PASSWORD_LENGTH.
  customer: 8,
}.freeze

options = { kind: :admin, generate: false, list: false, force: false }

parser = OptionParser.new do |opts|
  opts.banner = "Usage: bundle exec ruby scripts/passwd.rb [EMAIL] [options]"
  opts.separator ""
  opts.on("--customer", "Act on a storefront customer account rather than an admin") { options[:kind] = :customer }
  opts.on("--admin", "Act on an admin account (the default)") { options[:kind] = :admin }
  opts.on("-l", "--list", "List accounts and exit") { options[:list] = true }
  opts.on("-g", "--generate", "Generate a strong password and print it once") { options[:generate] = true }
  opts.on("--stdin", "Read the password from stdin instead of prompting") { options[:stdin] = true }
  opts.on("--force", "Skip the confirmation prompt") { options[:force] = true }
  opts.on("-h", "--help", "This text") do
    puts opts
    exit 0
  end
end
parser.parse!

KIND = options[:kind]
MODEL = KIND == :admin ? Admin : Customer
MINIMUM = MINIMUMS.fetch(KIND)

def die(message)
  warn "error: #{message}"
  exit 1
end

# ── Listing ──────────────────────────────────────────────────────────────────

def list_accounts(model, kind)
  rows = model.order(:email).all
  if rows.empty?
    puts "No #{kind} accounts."
    return
  end

  puts "#{rows.length} #{kind}#{'s' unless rows.length == 1}:"
  rows.each do |row|
    # A customer row can exist with no password at all — a guest who ordered
    # without registering. Saying so avoids "why won't it let me sign in".
    state = row.password_digest.to_s.empty? ? "no password set" : "password set"
    changed = row.updated_at && row.created_at && row.updated_at > row.created_at
    puts format("  %-40s %-16s created %s%s",
                row.email || "(no email)",
                state,
                row.created_at&.strftime("%Y-%m-%d") || "?",
                changed ? ", changed #{row.updated_at.strftime('%Y-%m-%d')}" : "")
  end
end

if options[:list]
  list_accounts(MODEL, KIND)
  exit 0
end

# ── Finding the account ──────────────────────────────────────────────────────

email = ARGV.shift.to_s.strip.downcase
if email.empty?
  warn parser.help
  exit 1
end

account = MODEL.first(email: email)

# Levenshtein, so a near miss is answered with the address that was meant
# rather than a bare "not found". Typing your own address wrong is by far the
# most likely reason to land here — a login failure looks identical whether
# the password is wrong or the address never existed.
def edit_distance(one, two)
  previous = (0..two.length).to_a
  one.each_char.with_index do |char, i|
    current = [i + 1]
    two.each_char.with_index do |other, j|
      current << [previous[j + 1] + 1, current[j] + 1, previous[j] + (char == other ? 0 : 1)].min
    end
    previous = current
  end
  previous.last
end

unless account
  candidates = MODEL.exclude(email: nil).select_map(:email)
  near = candidates.map { |candidate| [edit_distance(email, candidate), candidate] }
                   .select { |distance, _| distance <= [email.length / 3, 6].min }
                   .sort_by(&:first)
                   .map(&:last)
                   .first(3)

  message = "no #{KIND} account for #{email}"
  message += "\n  did you mean: #{near.join(', ')}" unless near.empty?
  message += "\n  list them all with: --list"
  die(message)
end

# ── Getting the new password ─────────────────────────────────────────────────

def prompt_secret(label)
  # noecho only works on a real terminal. Piped input is a legitimate way to
  # script this, so fall back rather than crash — but say which mode is on, so
  # nobody types a password into a visible prompt believing it is hidden.
  if $stdin.tty?
    $stdout.print label
    value = $stdin.noecho(&:gets).to_s.chomp
    $stdout.puts
    value
  else
    $stdin.gets.to_s.chomp
  end
end

if options[:generate]
  # ~154 bits. Base58-ish: no look-alike characters, because this gets read off
  # one screen and typed into another.
  alphabet = ("a".."z").to_a + ("A".."Z").to_a + ("2".."9").to_a - %w[l I O o]
  password = Array.new(26) { alphabet[SecureRandom.random_number(alphabet.length)] }.join
else
  password = prompt_secret("New password for #{email}: ")
  die "no password given" if password.empty?

  unless options[:stdin] || !$stdin.tty?
    again = prompt_secret("Repeat it: ")
    die "the two entries did not match — nothing was changed" unless password == again
  end
end

die "password must be at least #{MINIMUM} characters (#{KIND} minimum)" if password.length < MINIMUM

# bcrypt silently truncates past 72 BYTES, which would make two different long
# passwords equivalent — and the user would never know which one works.
die "password must be 72 bytes or fewer (bcrypt's limit)" if password.bytesize > 72

# ── Confirming ───────────────────────────────────────────────────────────────

if !options[:force] && $stdin.tty?
  $stdout.print "Change the password for #{KIND} #{email}? [y/N] "
  answer = $stdin.gets.to_s.strip.downcase
  unless %w[y yes].include?(answer)
    puts "Nothing was changed."
    exit 0
  end
end

# ── Writing it ───────────────────────────────────────────────────────────────

# A customer row can exist with no password: a guest who checked out without
# registering. Setting one here turns that record into a real account, which is
# a bigger thing than changing a password and is worth saying out loud.
#
# CustomerAccount.register deliberately REFUSES to do this over the web when
# the record has orders — claiming someone else's order history is a takeover,
# and email ownership cannot be proved offline. This tool is the deliberate
# escape hatch for that guard: a support action taken by someone who already
# has shell access to the machine, not a path a stranger can reach.
first_password = account.password_digest.to_s.empty?

account.password_digest = BCrypt::Password.create(password)
# The global :timestamps plugin touches updated_at, which is what makes a reset
# visible afterwards — `--list` shows it, and it is the only record that this
# happened.
account.save

puts
if first_password
  order_count = KIND == :customer ? account.orders_dataset.count : 0
  puts "Account CREATED for #{KIND} #{email} — it had no password until now."
  if order_count.positive?
    puts "  This record already had #{order_count} order#{'s' unless order_count == 1}."
    puts "  Whoever holds this password can now see that order history, so be"
    puts "  sure the address belongs to the person who asked."
  end
else
  puts "Password changed for #{KIND} #{email}."
end
if options[:generate]
  puts
  puts "  #{password}"
  puts
  puts "Shown once. Put it in a password manager now — it is not recoverable"
  puts "from the database, only replaceable."
end

# Two honest caveats. Both are properties of how sessions work here, not
# oversights in this script, and a merchant who assumes otherwise after a
# suspected compromise would be wrong about their exposure.
puts
puts "Note: existing signed-in sessions are cookie-based and are NOT ended by"
puts "      this change. To force everyone out, rotate SESSION_SECRET and restart."
if KIND == :admin && PersonalAccessToken.count.positive?
  puts "      #{PersonalAccessToken.count} personal access token(s) also remain valid."
end
