Sequel.migration do
  change do
    # Clients that registered themselves via RFC 7591. Claude, Cursor and the
    # rest arrive unannounced and register on first connect, so there is no
    # pre-shared client to configure.
    #
    # PUBLIC clients only — no client_secret column, deliberately. A desktop
    # app cannot keep a secret, which is exactly why OAuth 2.1 requires PKCE
    # instead of pretending otherwise.
    create_table(:oauth_clients) do
      primary_key :id
      String :client_id, null: false, unique: true
      String :client_name, null: false
      String :redirect_uris_json, text: true, null: false
      String :software_id
      DateTime :created_at, null: false
      DateTime :updated_at, null: false

      index :client_id, unique: true
    end

    # One row per in-flight authorization. Short-lived and single-use: an
    # authorization code that can be replayed is the whole attack.
    create_table(:oauth_authorization_codes) do
      primary_key :id
      String :code_hash, null: false, unique: true
      String :client_id, null: false
      String :redirect_uri, null: false
      # S256 only. OAuth 2.1 removed `plain`, and accepting it would let anyone
      # who intercepts the redirect complete the exchange.
      String :code_challenge, null: false
      String :scope, null: false
      # RFC 8707: which resource this code may be exchanged for a token FOR.
      # Carried through to the token so audience validation has something to
      # check against.
      String :resource
      Integer :admin_id, null: false
      DateTime :expires_at, null: false
      DateTime :used_at
      DateTime :created_at, null: false

      index :code_hash, unique: true
    end

    # Access and refresh tokens, hashed at rest exactly like personal access
    # tokens. `resource` is the audience — a token minted for one Dukafi must
    # not be accepted by another.
    create_table(:oauth_tokens) do
      primary_key :id
      String :access_token_hash, null: false, unique: true
      String :refresh_token_hash, unique: true
      String :client_id, null: false
      Integer :admin_id, null: false
      String :scope, null: false
      String :resource
      DateTime :expires_at, null: false
      DateTime :revoked_at
      DateTime :last_used_at
      DateTime :created_at, null: false
      DateTime :updated_at, null: false

      index :access_token_hash, unique: true
      index :refresh_token_hash
    end
  end
end
