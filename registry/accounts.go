package main

import (
	"database/sql"
	"errors"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

// Accounts.
//
// A plugin author signs up with an email and a password, and everything they
// publish belongs to that account. This is the whole identity model — there
// are no roles, no teams, and no permissions table. Exactly one account is an
// admin, and it is whichever one holds the email in REGISTRY_ADMIN_EMAIL.
//
// That is a deliberate choice rather than a placeholder. A registry has one
// job that needs privilege — deciding what gets listed — and an admin flag in
// the database is a row somebody can UPDATE. An environment variable is a
// deploy-time decision, and losing the database does not lose control of who
// can approve.

var (
	ErrEmailTaken   = errors.New("that email already has an account")
	ErrInvalidLogin = errors.New("email or password is wrong")
	ErrWeakPassword = errors.New("password must be at least 10 characters")
	// bcrypt's own limit. Named rather than inline so the HTTP layer can map
	// it to 400 like the other credential problems — as a bare error it fell
	// through to a 500, which told the user nothing they could act on.
	ErrPasswordTooLong = errors.New("password must be 72 bytes or fewer")
	ErrInvalidEmail    = errors.New("that does not look like an email address")
	ErrSessionExpired  = errors.New("session expired")
	ErrNotYours        = errors.New("that plugin belongs to another account")
)

// Long enough that a stolen laptop is the threat rather than a guessed
// session, short enough that an abandoned session is not a permanent key.
const sessionLifetime = 30 * 24 * time.Hour

// bcrypt's own limit is 72 bytes and it SILENTLY TRUNCATES past it, which
// would make two different long passwords equivalent. Refused instead.
const maxPasswordBytes = 72

const minPasswordRunes = 10

type Account struct {
	ID          string     `json:"id"`
	Email       string     `json:"email"`
	CreatedAt   time.Time  `json:"createdAt"`
	LastLoginAt *time.Time `json:"lastLoginAt,omitempty"`

	// Not a column. Derived per request from REGISTRY_ADMIN_EMAIL so that
	// changing who reviews is a redeploy, not an UPDATE statement.
	Admin bool `json:"admin"`
}

func (s *Store) migrateAccounts() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS accounts (
		  id            TEXT PRIMARY KEY,
		  email         TEXT NOT NULL,
		  password_hash TEXT NOT NULL,
		  created_at    TEXT NOT NULL,
		  last_login_at TEXT
		);
		-- Case-insensitive: nobody thinks Ann@x.com and ann@x.com are two
		-- people, and letting both exist means one of them can never log in.
		CREATE UNIQUE INDEX IF NOT EXISTS accounts_email ON accounts(lower(email));

		CREATE TABLE IF NOT EXISTS sessions (
		  token      TEXT PRIMARY KEY,
		  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
		  created_at TEXT NOT NULL,
		  expires_at TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);
		CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
	`)
	return err
}

// NormalizeEmail is the one place an address is folded, so the signup check,
// the login lookup and the admin comparison can never disagree.
func NormalizeEmail(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func ValidateCredentials(email, password string) (string, error) {
	normalized := NormalizeEmail(email)
	address, err := mail.ParseAddress(normalized)
	// ParseAddress accepts `Name <a@b>`, which is not what anyone means by an
	// email field — insisting the parse round-trips rejects it.
	if err != nil || address.Address != normalized || !strings.Contains(normalized, ".") {
		return "", ErrInvalidEmail
	}
	if utf8.RuneCountInString(password) < minPasswordRunes {
		return "", ErrWeakPassword
	}
	if len(password) > maxPasswordBytes {
		return "", ErrPasswordTooLong
	}
	return normalized, nil
}

func (s *Store) CreateAccount(email, password string) (Account, error) {
	normalized, err := ValidateCredentials(email, password)
	if err != nil {
		return Account{}, err
	}
	if _, err := s.AccountByEmail(normalized); err == nil {
		return Account{}, ErrEmailTaken
	} else if !errors.Is(err, ErrNotFound) {
		return Account{}, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return Account{}, err
	}
	account := Account{ID: newToken(), Email: normalized, CreatedAt: time.Now().UTC()}
	_, err = s.db.Exec(`INSERT INTO accounts (id, email, password_hash, created_at) VALUES (?,?,?,?)`,
		account.ID, account.Email, string(hash), iso(account.CreatedAt))
	if err != nil {
		// The unique index is the real guard — the check above races with a
		// second signup for the same address arriving at the same moment.
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return Account{}, ErrEmailTaken
		}
		return Account{}, err
	}
	return account, nil
}

// Authenticate verifies a password.
//
// A missing account still costs one bcrypt comparison. Returning early would
// make "no such email" measurably faster than "wrong password", which turns
// the login form into an account-enumeration oracle.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("dukafi-registry-timing-equaliser"), bcrypt.DefaultCost)

func (s *Store) Authenticate(email, password string) (Account, error) {
	normalized := NormalizeEmail(email)
	var (
		account   Account
		hash      string
		created   string
		lastLogin sql.NullString
	)
	row := s.db.QueryRow(`SELECT id, email, password_hash, created_at, last_login_at FROM accounts WHERE lower(email) = ?`, normalized)
	err := row.Scan(&account.ID, &account.Email, &hash, &created, &lastLogin)
	if errors.Is(err, sql.ErrNoRows) {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
		return Account{}, ErrInvalidLogin
	}
	if err != nil {
		return Account{}, err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return Account{}, ErrInvalidLogin
	}

	account.CreatedAt, _ = time.Parse(time.RFC3339, created)
	if lastLogin.Valid {
		if parsed, parseErr := time.Parse(time.RFC3339, lastLogin.String); parseErr == nil {
			account.LastLoginAt = &parsed
		}
	}
	_, _ = s.db.Exec(`UPDATE accounts SET last_login_at=? WHERE id=?`, iso(time.Now().UTC()), account.ID)
	return account, nil
}

func (s *Store) AccountByEmail(email string) (Account, error) {
	row := s.db.QueryRow(`SELECT id, email, created_at, last_login_at FROM accounts WHERE lower(email) = ?`, NormalizeEmail(email))
	return scanAccount(row)
}

func (s *Store) AccountByID(id string) (Account, error) {
	row := s.db.QueryRow(`SELECT id, email, created_at, last_login_at FROM accounts WHERE id = ?`, id)
	return scanAccount(row)
}

func scanAccount(row scanner) (Account, error) {
	var (
		account   Account
		created   string
		lastLogin sql.NullString
	)
	err := row.Scan(&account.ID, &account.Email, &created, &lastLogin)
	if errors.Is(err, sql.ErrNoRows) {
		return Account{}, ErrNotFound
	}
	if err != nil {
		return Account{}, err
	}
	account.CreatedAt, _ = time.Parse(time.RFC3339, created)
	if lastLogin.Valid {
		if parsed, parseErr := time.Parse(time.RFC3339, lastLogin.String); parseErr == nil {
			account.LastLoginAt = &parsed
		}
	}
	return account, nil
}

// ── Sessions ─────────────────────────────────────────────────────────────────

func (s *Store) CreateSession(accountID string) (string, time.Time, error) {
	token := newToken()
	now := time.Now().UTC()
	expires := now.Add(sessionLifetime)
	_, err := s.db.Exec(`INSERT INTO sessions (token, account_id, created_at, expires_at) VALUES (?,?,?,?)`,
		token, accountID, iso(now), iso(expires))
	return token, expires, err
}

func (s *Store) AccountBySession(token string) (Account, error) {
	if token == "" {
		return Account{}, ErrNotFound
	}
	var (
		accountID string
		expires   string
	)
	row := s.db.QueryRow(`SELECT account_id, expires_at FROM sessions WHERE token = ?`, token)
	if err := row.Scan(&accountID, &expires); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Account{}, ErrNotFound
		}
		return Account{}, err
	}
	expiresAt, err := time.Parse(time.RFC3339, expires)
	if err != nil || time.Now().UTC().After(expiresAt) {
		// Delete on the way past. Expiry is enforced here regardless, but
		// leaving dead rows behind means the table only ever grows.
		_ = s.DeleteSession(token)
		return Account{}, ErrSessionExpired
	}
	return s.AccountByID(accountID)
}

func (s *Store) DeleteSession(token string) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE token = ?`, token)
	return err
}

// PruneSessions clears everything already expired. Called on the same sweep as
// the manifest refresh.
func (s *Store) PruneSessions() error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE expires_at < ?`, iso(time.Now().UTC()))
	return err
}
