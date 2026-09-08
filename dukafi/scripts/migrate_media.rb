#!/usr/bin/env ruby
require_relative "../config/environment"

target = ARGV.each_cons(2).find { |left, _| left == "--to" }&.last
abort "usage: ruby scripts/migrate_media.rb --to ADAPTER [--dry-run] [--delete-local]" if target.to_s.empty? || target == "local"

MigrateMedia.call(
  target: target,
  dry_run: ARGV.include?("--dry-run"),
  delete_local: ARGV.include?("--delete-local"),
)
