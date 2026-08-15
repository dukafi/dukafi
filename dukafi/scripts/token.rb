# Personal access tokens from the command line.
#
#   bundle exec ruby scripts/token.rb issue "Claude Code"
#   bundle exec ruby scripts/token.rb list
#   bundle exec ruby scripts/token.rb revoke 3
#
# There is no admin UI for these yet, and the HTTP route needs a session
# cookie — which means logging in with curl just to get a token for a local
# test. This talks to the database directly, which is fine for something you
# run on the same machine as the store.
#
# The token is printed ONCE. Only its SHA-256 is stored, so there is no way to
# recover it afterwards; issue another one.

require_relative "../config/environment"

def usage
  warn <<~TEXT
    usage:
      ruby scripts/token.rb issue <name>    mint a token (printed once)
      ruby scripts/token.rb list            show tokens, without their secrets
      ruby scripts/token.rb revoke <id>     stop a token working
  TEXT
  exit 1
end

command = ARGV[0].to_s

case command
when "issue"
  name = ARGV[1].to_s
  usage if name.strip.empty?

  record, plaintext = PersonalAccessToken.issue!(name: name)
  puts
  puts "  #{plaintext}"
  puts
  puts "Token ##{record.id} (#{record.name}). This is the only time it is shown."
  puts
  puts "Connect Claude Code with:"
  puts
  puts "  claude mcp add --transport http dukafi \\"
  puts "    http://localhost:#{ENV.fetch('PORT', '9292')}/admin/api/mcp \\"
  puts %(    --header "Authorization: Bearer #{plaintext}")
  puts

when "list"
  tokens = PersonalAccessToken.order(:id).all
  if tokens.empty?
    puts "No tokens yet. Create one with: ruby scripts/token.rb issue \"Claude Code\""
    exit
  end

  tokens.each do |token|
    state = token.revoked? ? "revoked" : "active"
    used = token.last_used_at ? "last used #{token.last_used_at}" : "never used"
    puts format("%-4s %-24s %-16s %-9s %s",
                "##{token.id}", token.name[0, 24], "#{token.token_prefix}…", state, used)
  end

when "revoke"
  id = ARGV[1].to_s
  usage if id.strip.empty?

  token = PersonalAccessToken[id.to_i]
  abort "No token ##{id}" if token.nil?

  token.revoke!
  puts "Revoked ##{token.id} (#{token.name})."

else
  usage
end
