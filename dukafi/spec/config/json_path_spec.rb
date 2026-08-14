require_relative "../spec_helper"

# The one place the two database engines disagree.
#
# Everything else in Dukafi is portable Sequel — no raw DDL, no LIKE, no
# adapter-specific column types — so this module is the whole of the SQLite /
# Postgres divergence. If it drifts, a Postgres deploy loses the ability to
# find a page by its editor id or to resolve a cart region, and both fail as
# "not found" rather than as an error, which is the kind of bug that reaches
# production. Mock connections let both dialects be asserted from one process.
class JsonPathSpec < Minitest::Test
  def sqlite = @sqlite ||= Sequel.connect("mock://sqlite")
  def postgres = @postgres ||= Sequel.connect("mock://postgres")

  def where_text(db, value)
    db[:pages].where(JsonPath.text(:document, "id", db: db) => value).sql
  end

  def where_exists(db, node_id)
    document = Sequel.function(:coalesce, :published_document, :document)
    db[:pages].exclude(JsonPath.value(document, "nodes", node_id, db: db) => nil).sql
  end

  # `adapter_scheme` is how we connected; `database_type` is what answers.
  # A mock connection reports :mock for the former, and so did an early draft
  # of this module — which sent BOTH engines down the Postgres branch.
  def test_the_engine_is_identified_by_what_answers_not_by_how_we_connected
    assert JsonPath.sqlite?(sqlite)
    refute JsonPath.sqlite?(postgres)
  end

  def test_sqlite_uses_the_json1_function
    assert_includes where_text(sqlite, "abc"), %(json_extract(`document`, '$."id"'))
  end

  def test_postgres_casts_to_jsonb
    assert_includes where_text(postgres, "abc"), %("document"::jsonb ->> 'id')
  end

  # `->` yields jsonb, so a string comes back QUOTED and would never equal the
  # Ruby string. Only `->>` unwraps it. Getting this wrong makes every lookup
  # silently miss on Postgres while passing on SQLite.
  def test_postgres_unwraps_the_final_segment_to_text
    sql = where_text(postgres, "abc")

    assert_includes sql, "->>"
    refute_includes sql, "-> 'id')"
  end

  # An existence check wants the raw value, so the last segment stays `->`:
  # `->>` on a missing key is also NULL, but on a present OBJECT it would
  # return its text rendering rather than the object.
  def test_postgres_existence_keeps_the_value_as_jsonb
    sql = where_exists(postgres, "n-1")

    assert_includes sql, "-> 'nodes' -> 'n-1'"
    refute_includes sql, "->>"
    assert_includes sql, "IS NOT NULL"
  end

  def test_sqlite_existence_walks_the_same_path
    assert_includes where_exists(sqlite, "n-1"), %('$."nodes"."n-1"')
  end

  # Node ids are nanoid-style and routinely contain `-`; an unquoted SQLite
  # JSON path segment would not resolve one.
  def test_sqlite_quotes_every_path_segment
    assert_equal %($."a-1"."b.c"), JsonPath.sqlite_path(%w[a-1 b.c])
  end

  # The node id used to be interpolated into the path string. It is validated
  # upstream, but a quote in a segment must not be able to end the literal.
  def test_a_quote_in_a_segment_cannot_escape_the_sqlite_path
    assert_equal %($."a""b"), JsonPath.sqlite_path([%(a"b)])
  end

  # Sequel renders the comparison value as an escaped literal rather than a
  # placeholder, so the guarantee to assert is that an embedded quote is
  # DOUBLED and therefore cannot close the literal early.
  def test_a_quote_in_the_compared_value_is_escaped_on_both_engines
    [sqlite, postgres].each do |db|
      sql = where_text(db, "'; DROP TABLE pages; --")

      assert_includes sql, "'''; DROP TABLE pages; --'"
      # One opening and one closing quote for the value: an odd count would
      # mean the literal was terminated somewhere it should not have been.
      assert_equal 0, sql.count("'") % 2
    end
  end
end
