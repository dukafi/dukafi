# Reaching into a JSON column, on either adapter.
#
# Pages store their node tree as a JSON string in a `text` column, and two
# queries need the database to look inside it rather than loading and parsing
# every row in Ruby:
#
#   · finding a page by the id the editor gave it (AdminApi#find_page_for)
#   · finding which published page contains a given node (Fragments#find_published_node)
#
# SQLite answers those with the JSON1 function `json_extract`; Postgres has no
# such function and uses the `->` / `->>` operators against a `::jsonb` cast.
# That is the ONLY place the two adapters diverge in this codebase — no raw
# DDL, no LIKE, no adapter-specific column types — so it is worth one small
# module rather than a second query layer.
#
# Both branches parameterise the path segments. The SQLite version previously
# interpolated a node id straight into the JSON path string; keeping the value
# in a bind variable removes that sharp edge on both adapters.
module JsonPath
  module_function

  # `database_type`, not `adapter_scheme`: the scheme describes HOW we
  # connected (`sqlite`, `mock`, `jdbc`) while the type describes what is
  # actually answering. They differ for a mock connection and under JDBC, and
  # only the type is the thing that decides which JSON syntax parses.
  def sqlite?(db = DB)
    db.database_type == :sqlite
  end

  # The value at a path, as a SQL expression. NULL when the path is absent,
  # which is what `IS NOT NULL` existence checks rely on.
  def value(column, *keys, db: DB)
    if sqlite?(db)
      Sequel.lit("json_extract(?, ?)", column, sqlite_path(keys))
    else
      Sequel.lit("(?::jsonb#{' -> ?' * keys.length})", column, *keys.map(&:to_s))
    end
  end

  # The value at a path as TEXT, for comparing against a Ruby string.
  #
  # The distinction matters on Postgres: `->` yields jsonb, so a string value
  # comes back quoted ("abc") and would never equal 'abc'. `->>` unwraps it.
  # SQLite's json_extract already returns a bare scalar.
  def text(column, *keys, db: DB)
    return value(column, *keys, db: db) if sqlite?(db)

    last = keys.last.to_s
    leading = keys[0..-2].map(&:to_s)
    Sequel.lit("(?::jsonb#{' -> ?' * leading.length} ->> ?)", column, *leading, last)
  end

  # `$."a"."b"` — every segment quoted so ids containing `-` or `.` resolve.
  def sqlite_path(keys)
    "$.#{keys.map { |key| %("#{key.to_s.gsub('"', '""')}") }.join('.')}"
  end
end
