require_relative "../spec_helper"

# The one-shot outcome that survives from a form POST to the region GET that
# renders it. Everything here is about NOT leaving state behind: these ride in
# a cookie, and a stale entry is a ghost error on a later page.
class FormFlashSpec < Minitest::Test
  def test_an_outcome_survives_exactly_one_read
    session = {}
    FormFlash.write(session, "region", reason: "invalid_credentials", ok: false)

    assert_equal({ "reason" => "invalid_credentials", "ok" => false },
                 FormFlash.take(session, "region"))
    assert_nil FormFlash.take(session, "region")
  end

  # Two forms on one page each get their own banner.
  def test_outcomes_are_kept_apart_by_region
    session = {}
    FormFlash.write(session, "login", reason: "invalid_credentials", ok: false)
    FormFlash.write(session, "signup", reason: "already_registered", ok: false)

    assert_equal "invalid_credentials", FormFlash.take(session, "login").fetch("reason")
    assert_equal "already_registered", FormFlash.take(session, "signup").fetch("reason")
  end

  # A merchant who wired no form region gets the event and nothing else —
  # there is no region to address, so holding the outcome would only grow the
  # cookie.
  def test_an_outcome_with_no_region_is_not_stored
    session = {}
    FormFlash.write(session, "", reason: "invalid_credentials", ok: false)

    assert_empty session
  end

  # Emptied entirely rather than left as `{}`, so the cookie stops carrying a
  # dead key on every subsequent request.
  def test_the_key_disappears_once_the_last_outcome_is_read
    session = {}
    FormFlash.write(session, "region", reason: "signed_in", ok: true)
    FormFlash.take(session, "region")

    refute session.key?(FormFlash::KEY)
  end

  # These live in a cookie with a hard 4KB ceiling. A visitor who triggers many
  # forms without ever rendering them must not be able to grow it without
  # bound; the oldest entry goes first.
  def test_old_outcomes_are_dropped_once_the_cap_is_reached
    session = {}
    (1..(FormFlash::LIMIT + 2)).each do |index|
      FormFlash.write(session, "region-#{index}", reason: "invalid_email", ok: false)
    end

    assert_operator session.fetch(FormFlash::KEY).length, :<=, FormFlash::LIMIT
    assert_nil FormFlash.take(session, "region-1")
    refute_nil FormFlash.take(session, "region-#{FormFlash::LIMIT + 2}")
  end
end
