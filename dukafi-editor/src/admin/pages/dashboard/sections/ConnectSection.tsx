/**
 * ConnectSection — hook an AI client up to this store.
 *
 * Cursor, Claude Code and Lovable accept a bearer header, so they use a
 * token minted here. Create happens in a dialog, like every other dashboard
 * table — the page is the list, not a stack of instruction cards.
 *
 * The token is shown ONCE, at creation, because only its SHA-256 is stored.
 * That is why the copy-ready command stays in the same dialog and not on
 * the list: after this render there is nothing left to build it from.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Type, type Static } from '@core/utils/typeboxHelpers'
import { apiRequest } from '@core/http'
import { getErrorMessage } from '@core/utils/errorMessage'
import { Button } from '@ui/components/Button'
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from '@ui/components/DataTable'
import { Dialog } from '@ui/components/Dialog'
import { EmptyState } from '@ui/components/EmptyState'
import { FormField } from '@ui/components/FormField'
import { Input } from '@ui/components/Input'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import styles from '../DashboardPage.module.css'

const TOKEN_FORM_ID = 'connect-token-form'

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

function cursorConfig(token: string): string {
  return JSON.stringify({
    mcpServers: {
      dukafi: { url: mcpUrl(), headers: { Authorization: `Bearer ${token}` } },
    },
  }, null, 2)
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
  const [dialogOpen, setDialogOpen] = useState(false)
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

  const closeDialog = () => {
    setDialogOpen(false)
    setIssued(null)
    setName('')
    setCreating(false)
  }

  const create = async (event?: FormEvent) => {
    event?.preventDefault()
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
        <Button type="button" variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
          <PlusIcon size={14} aria-hidden="true" />
          <span>New token</span>
        </Button>
      </header>

      {error && !dialogOpen && <p role="alert" className={styles.error}>{error}</p>}

      {loading ? null : tokens.length === 0 ? (
        <EmptyState
          title="No tokens yet"
          description="Create one to connect a client."
        />
      ) : (
        <DataTable aria-label="Tokens">
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

      <TokenDialog
        open={dialogOpen}
        name={name}
        creating={creating}
        issued={issued}
        error={error}
        onNameChange={setName}
        onCreate={create}
        onClose={closeDialog}
      />
    </section>
  )
}

function TokenDialog({
  open,
  name,
  creating,
  issued,
  error,
  onNameChange,
  onCreate,
  onClose,
}: {
  open: boolean
  name: string
  creating: boolean
  issued: { name: string; token: string } | null
  error: string | null
  onNameChange: (value: string) => void
  onCreate: (event?: FormEvent) => void
  onClose: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={issued ? `“${issued.name}” is ready` : 'New token'}
      size={issued ? 'xl' : 'md'}
      closeOnBackdrop={!issued}
      footer={
        issued ? (
          <Button type="button" variant="primary" size="sm" onClick={onClose}>
            <span>Done</span>
          </Button>
        ) : (
          <>
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={creating}>
              <span>Cancel</span>
            </Button>
            <Button
              type="submit"
              form={TOKEN_FORM_ID}
              variant="primary"
              size="sm"
              disabled={creating || name.trim().length === 0}
            >
              <span>{creating ? 'Creating…' : 'Create token'}</span>
            </Button>
          </>
        )
      }
    >
      {issued ? (
        <div className={styles.issuedToken} data-testid="issued-token">
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
          <pre className={styles.codeBlock}><code>{cursorConfig(issued.token)}</code></pre>

          <h4>Lovable — Chat connectors → add MCP server</h4>
          <p className={styles.connectHint}>
            Server URL <code>{mcpUrl()}</code>, authentication “Bearer token”, and paste
            the token above. Lovable connects from its own servers, so this store has to
            be reachable on the public internet — a localhost URL will not work.
          </p>
        </div>
      ) : (
        <form id={TOKEN_FORM_ID} className={styles.dialogForm} onSubmit={(event) => void onCreate(event)}>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <FormField
            label="Name"
            htmlFor="token-name"
            description="Name it after the tool and machine you will use it from, so you know which one to revoke later."
          >
            <Input
              id="token-name"
              value={name}
              placeholder="Claude Code on my laptop"
              aria-label="Token name"
              onChange={(event) => onNameChange(event.target.value)}
            />
          </FormField>
        </form>
      )}
    </Dialog>
  )
}
