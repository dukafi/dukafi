Sequel.migration do
  change do
    # Optimistic concurrency for pages.
    #
    # The editor has always SENT `baseSeqs` with every save — "the base seqs
    # covering exactly the rows this save touches" — and the server has always
    # thrown them away, because pages had no version to compare against and
    # `data_row` reported a hardcoded `seq: 0`.
    #
    # That was survivable while the editor was the only writer. MCP made it a
    # data-loss path: an agent edits a page, the merchant's open tab still
    # holds the old copy, and the next save silently overwrites the agent's
    # work with no error anywhere.
    #
    # Bumped by EVERY writer, and compared against what the client based its
    # edit on.
    alter_table(:pages) do
      add_column :seq, Integer, null: false, default: 0
    end
  end
end
