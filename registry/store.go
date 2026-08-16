package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// Storage. SQLite because a plugin registry is a catalogue of hundreds, read
// far more than written, and a single file that can be copied is worth more
// operationally than anything it gives up. Pure-Go driver, so the binary is
// static and the image needs no libc.

const (
	StatusPending  = "pending"
	StatusApproved = "approved"
	StatusRejected = "rejected"
	StatusUnlisted = "unlisted"
)

var ErrNotFound = errors.New("not found")

// ErrDuplicate is returned when a plugin id is already listed by someone else.
// The id is what a store installs by, so two plugins cannot share one.
var ErrDuplicate = errors.New("a plugin with that id is already listed")

type Plugin struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Version     string   `json:"version"`
	Author      string   `json:"author"`
	Homepage    string   `json:"homepage,omitempty"`
	Category    string   `json:"category"`
	License     string   `json:"license,omitempty"`
	Images      []string `json:"images"`
	Logo        string   `json:"logo,omitempty"`
	MinDukafi   string   `json:"minDukafiVersion,omitempty"`

	Pricing      Pricing      `json:"pricing"`
	Distribution Distribution `json:"distribution"`

	Status      string `json:"status"`
	ManifestURL string `json:"manifestUrl"`
	// The account that published it. Blank only for rows created before
	// accounts existed, which the owner queries treat as belonging to nobody.
	AccountID   string     `json:"accountId,omitempty"`
	SubmittedAt time.Time  `json:"submittedAt"`
	ApprovedAt  *time.Time `json:"approvedAt,omitempty"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	// Why a submission was turned down. Shown to the submitter through their
	// own token, never in the public listing.
	RejectReason string `json:"rejectReason,omitempty"`
	// When the registry last successfully re-read the manifest, and what went
	// wrong if it could not.
	RefreshedAt  *time.Time `json:"refreshedAt,omitempty"`
	RefreshError string     `json:"refreshError,omitempty"`

	// Unexported so it cannot leak through any JSON response by accident —
	// the token is the submitter's only proof that a listing is theirs, and an
	// admin listing that happened to include it would hand every listing away.
	submitToken string
}

// SubmitToken is the submitter's follow-up handle, returned once at submission.
func (p Plugin) SubmitToken() string { return p.submitToken }

// PublicView is what an anonymous browse returns.
//
// `manifestUrl`, the submitter's token and the reject reason are deliberately
// absent: the first is an implementation detail a store does not need, and
// the other two belong to the submitter.
func (p Plugin) PublicView() map[string]any {
	view := map[string]any{
		"id": p.ID, "name": p.Name, "description": p.Description,
		"version": p.Version, "author": p.Author, "category": p.Category,
		"images": p.Images, "pricing": p.Pricing,
		"updatedAt": p.UpdatedAt.UTC().Format(time.RFC3339),
		// What a store needs to know BEFORE it offers an install button: a
		// licensed plugin needs a key, a public one does not.
		"licensed": p.Distribution.Type == DistributionLicensed,
		"distribution": map[string]any{
			"type":        p.Distribution.Type,
			"downloadUrl": p.Distribution.DownloadURL,
			"sha256":      p.Distribution.SHA256,
			"licenseUrl":  p.Distribution.LicenseURL,
			"checkUrl":    p.Distribution.CheckURL,
		},
	}
	if p.Homepage != "" {
		view["homepage"] = p.Homepage
	}
	if p.Logo != "" {
		view["logo"] = p.Logo
	}
	if p.License != "" {
		view["license"] = p.License
	}
	if p.MinDukafi != "" {
		view["minDukafiVersion"] = p.MinDukafi
	}
	return view
}

// OwnerView is what the publishing account sees about its own listing.
//
// Everything PublicView hides EXCEPT the submit token: the status is the
// answer they are waiting for, and the reject and refresh errors are the two
// things that tell them what to fix. A URL-hosted listing still shows
// `manifestUrl`; a dashboard upload shows `hosted` instead. The token stays
// unexported because nothing needs it any more — the account is the proof of
// ownership now.
func (p Plugin) OwnerView() map[string]any {
	view := p.PublicView()
	view["status"] = p.Status
	view["hosted"] = isHostedManifest(p.ManifestURL)
	if !isHostedManifest(p.ManifestURL) {
		view["manifestUrl"] = p.ManifestURL
	}
	view["submittedAt"] = p.SubmittedAt.UTC().Format(time.RFC3339)
	if p.ApprovedAt != nil {
		view["approvedAt"] = p.ApprovedAt.UTC().Format(time.RFC3339)
	}
	if p.RefreshedAt != nil {
		view["refreshedAt"] = p.RefreshedAt.UTC().Format(time.RFC3339)
	}
	if p.RejectReason != "" {
		view["rejectReason"] = p.RejectReason
	}
	if p.RefreshError != "" {
		view["refreshError"] = p.RefreshError
	}
	return view
}

type Version struct {
	Version string    `json:"version"`
	SHA256  string    `json:"sha256,omitempty"`
	SeenAt  time.Time `json:"seenAt"`
}

type Store struct{ db *sql.DB }

func OpenStore(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, err
	}
	// One writer. SQLite serialises writes anyway, and a pool of writers under
	// contention produces "database is locked" instead of waiting.
	db.SetMaxOpenConns(1)
	store := &Store{db: db}
	if err := store.migrate(); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS plugins (
		  id             TEXT PRIMARY KEY,
		  name           TEXT NOT NULL,
		  description    TEXT NOT NULL,
		  version        TEXT NOT NULL,
		  author         TEXT NOT NULL DEFAULT '',
		  homepage       TEXT NOT NULL DEFAULT '',
		  category       TEXT NOT NULL,
		  license        TEXT NOT NULL DEFAULT '',
		  images         TEXT NOT NULL DEFAULT '[]',
		  min_dukafi     TEXT NOT NULL DEFAULT '',
		  pricing        TEXT NOT NULL DEFAULT '{}',
		  distribution   TEXT NOT NULL DEFAULT '{}',
		  status         TEXT NOT NULL,
		  manifest_url   TEXT NOT NULL,
		  submit_token   TEXT NOT NULL,
		  submitter_note TEXT NOT NULL DEFAULT '',
		  reject_reason  TEXT NOT NULL DEFAULT '',
		  submitted_at   TEXT NOT NULL,
		  approved_at    TEXT,
		  updated_at     TEXT NOT NULL,
		  refreshed_at   TEXT,
		  refresh_error  TEXT NOT NULL DEFAULT ''
		);
		CREATE INDEX IF NOT EXISTS plugins_status ON plugins(status);
		CREATE INDEX IF NOT EXISTS plugins_category ON plugins(category);
		CREATE UNIQUE INDEX IF NOT EXISTS plugins_submit_token ON plugins(submit_token);

		-- Every version the registry has ever seen, so a store can show a
		-- history and pin to something older instead of only ever knowing
		-- "latest".
		CREATE TABLE IF NOT EXISTS plugin_versions (
		  plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
		  version   TEXT NOT NULL,
		  sha256    TEXT NOT NULL DEFAULT '',
		  seen_at   TEXT NOT NULL,
		  PRIMARY KEY (plugin_id, version)
		);

		-- Submissions are rate limited per source, and the counter has to
		-- survive a restart or a restart IS the bypass.
		CREATE TABLE IF NOT EXISTS submission_attempts (
		  source     TEXT NOT NULL,
		  at         TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS submission_attempts_source ON submission_attempts(source, at);
	`)
	if err != nil {
		return err
	}
	if err := s.migrateAccounts(); err != nil {
		return err
	}
	// SQLite has no ADD COLUMN IF NOT EXISTS, and this runs on every boot, so
	// the column is added only when table_info says it is missing. Kept as an
	// ALTER rather than folded into the CREATE above because a registry that
	// has been running since before accounts existed still has rows in it.
	if err := s.addColumnIfMissing("plugins", "account_id", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := s.addColumnIfMissing("plugins", "logo", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	_, err = s.db.Exec(`CREATE INDEX IF NOT EXISTS plugins_account ON plugins(account_id)`)
	return err
}

func (s *Store) addColumnIfMissing(table, column, definition string) error {
	rows, err := s.db.Query(`SELECT name FROM pragma_table_info(?)`, table)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return err
		}
		if name == column {
			return nil
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	_, err = s.db.Exec(`ALTER TABLE ` + table + ` ADD COLUMN ` + column + ` ` + definition)
	return err
}

// Submit records a fetched manifest as pending, owned by an account.
//
// The manifest has already been fetched and validated — this only decides
// whether the id is free.
func (s *Store) Submit(m *Manifest, manifestURL, note, accountID string) (Plugin, error) {
	existing, err := s.Get(m.ID)
	switch {
	case err == nil && existing.AccountID != "" && existing.AccountID != accountID:
		// Someone else's id. The id is what a store installs by, so letting a
		// second account claim it would swap what every store already has.
		return Plugin{}, ErrDuplicate
	case err == nil && existing.ManifestURL != manifestURL:
		// The owner pointing their own listing at a new URL. Legitimate — a
		// vendor moves hosts — so the URL is updated in place and the listing
		// goes back to pending, because the thing we approved is now served
		// from somewhere nobody has reviewed.
		if err := s.setManifestURL(m.ID, manifestURL); err != nil {
			return Plugin{}, err
		}
		existing.ManifestURL = manifestURL
		updated, applyErr := s.applyManifest(existing, m)
		return updated, applyErr
	case err == nil:
		// Same account, same source: update in place rather than creating a
		// second row the admin has to reconcile. A rejected listing that the
		// owner submits again goes back in the queue — that is how a fix is
		// reviewed. An approved listing stays approved: a new version is not
		// a new plugin.
		updated, applyErr := s.applyManifest(existing, m)
		if applyErr != nil {
			return Plugin{}, applyErr
		}
		if existing.Status == StatusRejected {
			return s.SetStatus(existing.ID, StatusPending, "")
		}
		return updated, nil
	case !errors.Is(err, ErrNotFound):
		return Plugin{}, err
	}

	token := newToken()
	now := time.Now().UTC()
	images, _ := json.Marshal(m.Images)
	pricing, _ := json.Marshal(m.Pricing)
	distribution, _ := json.Marshal(m.Distribution)

	_, err = s.db.Exec(`
		INSERT INTO plugins (id, name, description, version, author, homepage, category, license, logo,
		                     images, min_dukafi, pricing, distribution, status, manifest_url,
		                     account_id, submit_token, submitter_note, submitted_at, updated_at,
		                     refreshed_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		m.ID, m.Name, m.Description, m.Version, m.Author, m.Homepage, m.Category, m.License, m.Logo,
		string(images), m.MinDukafiVersion, string(pricing), string(distribution),
		StatusPending, manifestURL, accountID, token, note, iso(now), iso(now), iso(now))
	if err != nil {
		return Plugin{}, err
	}
	s.recordVersion(m.ID, m.Version, m.Distribution.SHA256, now)

	return s.Get(m.ID)
}

// setManifestURL moves a listing to a new source and sends it back for review.
//
// Re-review is the point. Approval said "this plugin, served from here, is
// fine"; a new host is a claim nobody has checked, and silently following it
// would make approval meaningless for anyone who can edit their own DNS.
func (s *Store) setManifestURL(id, manifestURL string) error {
	_, err := s.db.Exec(
		`UPDATE plugins SET manifest_url=?, status=?, approved_at=NULL, reject_reason='' WHERE id=?`,
		manifestURL, StatusPending, id)
	return err
}

// Withdraw removes a listing entirely. Only its owner can call it, and only
// while it has never been approved — an approved plugin that vanishes breaks
// every store that installed it, so those get unlisted by an admin instead.
func (s *Store) Withdraw(id, accountID string) error {
	plugin, err := s.Get(id)
	if err != nil {
		return err
	}
	if plugin.AccountID == "" || plugin.AccountID != accountID {
		return ErrNotYours
	}
	if plugin.ApprovedAt != nil {
		return errors.New("an approved listing cannot be withdrawn — ask for it to be unlisted")
	}
	_, err = s.db.Exec(`DELETE FROM plugins WHERE id=?`, id)
	return err
}

// applyManifest writes a re-fetched manifest over a listing.
//
// STATUS IS NOT TOUCHED. An approved plugin whose vendor ships 1.4.0 stays
// approved — re-approving every release would make the registry useless — and
// a rejected one does not sneak back by editing its own JSON.
func (s *Store) applyManifest(existing Plugin, m *Manifest) (Plugin, error) {
	now := time.Now().UTC()
	images, _ := json.Marshal(m.Images)
	pricing, _ := json.Marshal(m.Pricing)
	distribution, _ := json.Marshal(m.Distribution)

	_, err := s.db.Exec(`
		UPDATE plugins SET name=?, description=?, version=?, author=?, homepage=?, category=?,
		                   license=?, logo=?, images=?, min_dukafi=?, pricing=?, distribution=?,
		                   updated_at=?, refreshed_at=?, refresh_error=''
		WHERE id=?`,
		m.Name, m.Description, m.Version, m.Author, m.Homepage, m.Category, m.License, m.Logo,
		string(images), m.MinDukafiVersion, string(pricing), string(distribution),
		iso(now), iso(now), existing.ID)
	if err != nil {
		return Plugin{}, err
	}
	s.recordVersion(m.ID, m.Version, m.Distribution.SHA256, now)
	return s.Get(existing.ID)
}

func (s *Store) recordVersion(id, version, sha string, at time.Time) {
	// Ignoring the error on purpose: a duplicate version is the normal case
	// (nothing changed since the last refresh), and losing the history entry
	// is not worth failing a refresh over.
	_, _ = s.db.Exec(`
		INSERT INTO plugin_versions (plugin_id, version, sha256, seen_at) VALUES (?,?,?,?)
		ON CONFLICT(plugin_id, version) DO NOTHING`, id, version, sha, iso(at))
}

func (s *Store) RecordRefreshError(id, message string) error {
	_, err := s.db.Exec(`UPDATE plugins SET refresh_error=?, refreshed_at=? WHERE id=?`,
		message, iso(time.Now().UTC()), id)
	return err
}

func (s *Store) SetStatus(id, status, reason string) (Plugin, error) {
	if _, err := s.Get(id); err != nil {
		return Plugin{}, err
	}
	now := iso(time.Now().UTC())
	var err error
	if status == StatusApproved {
		_, err = s.db.Exec(`UPDATE plugins SET status=?, reject_reason='', approved_at=COALESCE(approved_at, ?), updated_at=? WHERE id=?`,
			status, now, now, id)
	} else {
		_, err = s.db.Exec(`UPDATE plugins SET status=?, reject_reason=?, updated_at=? WHERE id=?`,
			status, reason, now, id)
	}
	if err != nil {
		return Plugin{}, err
	}
	return s.Get(id)
}

type ListOptions struct {
	Status   string
	Category string
	Query    string
	Licensed *bool
	// Scopes the result to one account's own listings. Empty means no scoping;
	// it is never treated as "the rows with no owner", which would hand the
	// pre-accounts rows to whoever asked first.
	AccountID string
	Limit     int
	Offset    int
}

func (s *Store) List(opts ListOptions) ([]Plugin, int, error) {
	where := []string{"1=1"}
	args := []any{}
	if opts.Status != "" {
		where = append(where, "status = ?")
		args = append(args, opts.Status)
	}
	if opts.Category != "" {
		where = append(where, "category = ?")
		args = append(args, opts.Category)
	}
	if opts.AccountID != "" {
		where = append(where, "account_id = ?")
		args = append(args, opts.AccountID)
	}
	if opts.Query != "" {
		// Name and description only. Searching the manifest URL would let a
		// visitor find listings by host, which is not theirs to browse.
		where = append(where, "(lower(name) LIKE ? OR lower(description) LIKE ?)")
		like := "%" + strings.ToLower(opts.Query) + "%"
		args = append(args, like, like)
	}
	clause := strings.Join(where, " AND ")

	var total int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM plugins WHERE `+clause, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	limit := opts.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.db.Query(`
		SELECT id, name, description, version, author, homepage, category, license, logo, images,
		       min_dukafi, pricing, distribution, status, manifest_url, account_id, submit_token,
		       reject_reason, submitted_at, approved_at, updated_at, refreshed_at, refresh_error
		FROM plugins WHERE `+clause+`
		ORDER BY (status='approved') DESC, updated_at DESC
		LIMIT ? OFFSET ?`, append(args, limit, opts.Offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	plugins := []Plugin{}
	for rows.Next() {
		plugin, err := scanPlugin(rows)
		if err != nil {
			return nil, 0, err
		}
		// Filtered here rather than in SQL: `licensed` is a property of the
		// distribution JSON, and a LIKE against it would match a plugin that
		// merely mentions the word.
		if opts.Licensed != nil && (plugin.Distribution.Type == DistributionLicensed) != *opts.Licensed {
			continue
		}
		plugins = append(plugins, plugin)
	}
	return plugins, total, rows.Err()
}

func (s *Store) Get(id string) (Plugin, error) {
	row := s.db.QueryRow(`
		SELECT id, name, description, version, author, homepage, category, license, logo, images,
		       min_dukafi, pricing, distribution, status, manifest_url, account_id, submit_token,
		       reject_reason, submitted_at, approved_at, updated_at, refreshed_at, refresh_error
		FROM plugins WHERE id = ?`, id)
	return scanPlugin(row)
}

func (s *Store) GetByToken(token string) (Plugin, error) {
	row := s.db.QueryRow(`
		SELECT id, name, description, version, author, homepage, category, license, logo, images,
		       min_dukafi, pricing, distribution, status, manifest_url, account_id, submit_token,
		       reject_reason, submitted_at, approved_at, updated_at, refreshed_at, refresh_error
		FROM plugins WHERE submit_token = ?`, token)
	return scanPlugin(row)
}

func (s *Store) Versions(id string) ([]Version, error) {
	rows, err := s.db.Query(`SELECT version, sha256, seen_at FROM plugin_versions WHERE plugin_id=? ORDER BY seen_at DESC`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	versions := []Version{}
	for rows.Next() {
		var v Version
		var seenAt string
		if err := rows.Scan(&v.Version, &v.SHA256, &seenAt); err != nil {
			return nil, err
		}
		v.SeenAt, _ = time.Parse(time.RFC3339, seenAt)
		versions = append(versions, v)
	}
	return versions, rows.Err()
}

func (s *Store) CategoryCounts() (map[string]int, error) {
	rows, err := s.db.Query(`SELECT category, COUNT(*) FROM plugins WHERE status='approved' GROUP BY category`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := map[string]int{}
	for _, category := range Categories {
		counts[category] = 0
	}
	for rows.Next() {
		var category string
		var count int
		if err := rows.Scan(&category, &count); err != nil {
			return nil, err
		}
		counts[category] = count
	}
	return counts, rows.Err()
}

// RecentSubmissions counts attempts from one source inside a window. Stored
// rather than held in memory, because a restart would otherwise clear the
// counter and a restart is something a submitter can cause.
func (s *Store) RecentSubmissions(source string, window time.Duration) (int, error) {
	var count int
	since := iso(time.Now().UTC().Add(-window))
	err := s.db.QueryRow(`SELECT COUNT(*) FROM submission_attempts WHERE source=? AND at > ?`, source, since).Scan(&count)
	return count, err
}

func (s *Store) RecordSubmissionAttempt(source string) error {
	_, err := s.db.Exec(`INSERT INTO submission_attempts (source, at) VALUES (?,?)`, source, iso(time.Now().UTC()))
	return err
}

// PruneSubmissionAttempts keeps the rate-limit table from growing forever.
func (s *Store) PruneSubmissionAttempts(olderThan time.Duration) error {
	_, err := s.db.Exec(`DELETE FROM submission_attempts WHERE at < ?`, iso(time.Now().UTC().Add(-olderThan)))
	return err
}

type scanner interface {
	Scan(dest ...any) error
}

func scanPlugin(row scanner) (Plugin, error) {
	var (
		p                             Plugin
		images, pricing, distribution string
		submittedAt, updatedAt        string
		approvedAt, refreshedAt       sql.NullString
	)
	err := row.Scan(&p.ID, &p.Name, &p.Description, &p.Version, &p.Author, &p.Homepage,
		&p.Category, &p.License, &p.Logo, &images, &p.MinDukafi, &pricing, &distribution,
		&p.Status, &p.ManifestURL, &p.AccountID, &p.submitToken, &p.RejectReason,
		&submittedAt, &approvedAt, &updatedAt, &refreshedAt, &p.RefreshError)
	if errors.Is(err, sql.ErrNoRows) {
		return Plugin{}, ErrNotFound
	}
	if err != nil {
		return Plugin{}, fmt.Errorf("reading plugin: %w", err)
	}

	_ = json.Unmarshal([]byte(images), &p.Images)
	_ = json.Unmarshal([]byte(pricing), &p.Pricing)
	_ = json.Unmarshal([]byte(distribution), &p.Distribution)
	if p.Images == nil {
		p.Images = []string{}
	}
	p.SubmittedAt, _ = time.Parse(time.RFC3339, submittedAt)
	p.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)
	if approvedAt.Valid {
		if parsed, err := time.Parse(time.RFC3339, approvedAt.String); err == nil {
			p.ApprovedAt = &parsed
		}
	}
	if refreshedAt.Valid {
		if parsed, err := time.Parse(time.RFC3339, refreshedAt.String); err == nil {
			p.RefreshedAt = &parsed
		}
	}
	return p, nil
}

func iso(t time.Time) string { return t.UTC().Format(time.RFC3339) }

func newToken() string {
	buffer := make([]byte, 24)
	if _, err := rand.Read(buffer); err != nil {
		// crypto/rand failing is not something to paper over with a weaker
		// token: the token is the submitter's only proof of ownership.
		panic("registry: no randomness available: " + err.Error())
	}
	return base64.RawURLEncoding.EncodeToString(buffer)
}
