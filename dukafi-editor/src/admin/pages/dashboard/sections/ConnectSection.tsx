/**
 * ConnectSection — hook an AI client up to this store.
 *
 * Two ways in, and which one a client can use is decided by the client, not
 * by the merchant:
 *
 *   · Cursor, Claude Code and Lovable accept a bearer header, so they use a
 *     token minted here.
 *   · Claude's own connectors have no header field at all and can only do
 *     OAuth, which needs no token — the client registers itself and the
 *     merchant approves a consent screen.
 *
 * So this screen does the first case properly and explains the second, rather
 * than pretending one set of instructions fits both.
 *
 * The token is shown ONCE, at creation, because only its SHA-256 is stored.
 * That is why the copy-ready command is rendered right there and not on the
 * list below: after this render there is nothing left to build it from.
 */
import { useCallback, useEffect, useState } from 'react'
import { Type, type Static } from '@core/utils/typeboxHelpers'
import { apiRequest } from '@core/http'
import { getErrorMessage } from '@core/utils/errorMessage'
import { Button } from '@ui/components/Button'
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from '@ui/components/DataTable'
import { EmptyState } from '@ui/components/EmptyState'
import { Input } from '@ui/components/Input'
import styles from '../DashboardPage.module.css'

const TokenSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  tokenPrefix: Type.String(),
  lastUsedAt: Type.Union([Type.String(), Type.Null()]),
  revokedAt: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
})
const TokenListSchema = Type.Object({ tokens: Type.Array(TokenSchema) })
// The plaintext appears in this response and nowhere else, ever.
const TokenCreatedSchema = Type.Object({
  token: Type.Intersect([TokenSchema, Type.Object({ token: Type.String() })]),
})

type Token = Static<typeof TokenSchema>

function when(value: string | null): string {
  if (!value) return 'Never'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString()
}

/** Where this store is reachable — what the client has to be pointed at. */
function mcpUrl(): string {
  return `${window.location.origin}/admin/api/mcp`
}

function claudeCodeCommand(token: string): string {
  return [
    'claude mcp add --transport http dukafi \\',
    `  ${mcpUrl()} \\`,
    `  --header "Authorization: Bearer ${token}"`,
  ].join('\n')
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused (insecure origin, denied permission).
      // The text is on screen and selectable either way, so this is not worth
      // an error state — the button simply does not confirm.
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => void copy()}>
      {copied ? 'Copied' : label}
    </Button>
  )
}

export function ConnectSection() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [issued, setIssued] = useState<{ name: string; token: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const { tokens: rows } = await apiRequest('/admin/api/cms/tokens', {
        schema: TokenListSchema,
        fallbackMessage: 'Could not load access tokens',
      })
      setTokens(rows)
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load access tokens'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const create = async () => {
    if (name.trim().length === 0 || creating) return
    setCreating(true)
    try {
      const { token } = await apiRequest('/admin/api/cms/tokens', {
        method: 'POST',
        body: { name: name.trim() },
        schema: TokenCreatedSchema,
        fallbackMessage: 'Could not create the token',
      })
      setIssued({ name: token.name, token: token.token })
      setName('')
      setError(null)
      await load()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not create the token'))
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (token: Token) => {
    try {
      await apiRequest(`/admin/api/cms/tokens/${encodeURIComponent(token.id)}`, {
        method: 'DELETE',
        fallbackMessage: 'Could not revoke the token',
      })
      await load()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not revoke the token'))
    }
  }

  return (
    <section className={styles.section} aria-label="Connect an AI client">
      <header className={styles.sectionHeader}>
        <div>
          <h2>Connect an AI client</h2>
          <p className={styles.connectHint}>
            Let Cursor, Claude Code or Lovable read and edit this store.
          </p>
        </div>
      </header>

      {error && <p role="alert" className={styles.error}>{error}</p>}

      {/* Shown once. After this render the plaintext is gone for good. */}
      {issued && (
        <div className={styles.connectCard} data-testid="issued-token">
          <h3>“{issued.name}” is ready</h3>
          <p className={styles.connectHint}>
            Copy this now — it is shown once and cannot be recovered. Create another
            if you lose it.
          </p>

          <pre className={styles.codeBlock}><code>{issued.token}</code></pre>
          <CopyButton value={issued.token} label="Copy token" />

          <h4>Claude Code</h4>
          <pre className={styles.codeBlock}><code>{claudeCodeCommand(issued.token)}</code></pre>
          <CopyButton value={claudeCodeCommand(issued.token)} label="Copy command" />

          <h4>Cursor — add to <code>mcp.json</code></h4>
          <pre className={styles.codeBlock}><code>{JSON.stringify({
            mcpServers: {
              dukafi: { url: mcpUrl(), headers: { Authorization: `Bearer ${issued.token}` } },
            },
          }, null, 2)}</code></pre>

          <h4>Lovable — Chat connectors → add MCP server</h4>
          <p className={styles.connectHint}>
            Server URL <code>{mcpUrl()}</code>, authentication “Bearer token”, and paste
            the token above. Lovable connects from its own servers, so this store has to
            be reachable on the public internet — a localhost URL will not work.
          </p>

          <Button type="button" variant="ghost" size="sm" onClick={() => setIssued(null)}>
            Done
          </Button>
        </div>
      )}

      <div className={styles.connectCard}>
        <h3>New token</h3>
        <p className={styles.connectHint}>
          Name it after the tool and machine you will use it from, so you know which
          one to revoke later.
        </p>
        <div className={styles.inlineForm}>
          <Input
            value={name}
            placeholder="Claude Code on my laptop"
            aria-label="Token name"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void create() }}
          />
          <Button type="button" variant="primary" onClick={() => void create()} disabled={creating || name.trim().length === 0}>
            {creating ? 'Creating…' : 'Create token'}
          </Button>
        </div>
      </div>

      <div className={styles.connectCard}>
        <h3>Claude connectors</h3>
        <p className={styles.connectHint}>
          Claude’s own connectors do not accept a token — they use OAuth instead, so
          there is nothing to copy. In Claude, add a custom connector pointing at{' '}
          <code>{mcpUrl()}</code> and leave the client ID and secret empty. You will be
          asked to log in here and approve it. This needs a public <code>https://</code>
          address.
        </p>
      </div>

      {loading ? null : tokens.length === 0 ? (
        <EmptyState title="No tokens yet" description="Create one above to connect a client." />
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableRow>
              <DataTableHeader>Name</DataTableHeader>
              <DataTableHeader>Token</DataTableHeader>
              <DataTableHeader>Last used</DataTableHeader>
              <DataTableHeader>Status</DataTableHeader>
              <DataTableHeader> </DataTableHeader>
            </DataTableRow>
          </DataTableHead>
          <DataTableBody>
            {tokens.map((token) => (
              <DataTableRow key={token.id}>
                <DataTableCell>{token.name}</DataTableCell>
                <DataTableCell><code>{token.tokenPrefix}…</code></DataTableCell>
                <DataTableCell>{when(token.lastUsedAt)}</DataTableCell>
                <DataTableCell>{token.revokedAt ? 'Revoked' : 'Active'}</DataTableCell>
                <DataTableCell>
                  {token.revokedAt ? null : (
                    <Button type="button" variant="ghost" size="sm" onClick={() => void revoke(token)}>
                      Revoke
                    </Button>
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </section>
  )
}
