/**
 * Spawn the production server in a child process, wait until /health
 * answers, return a handle that the bench can kill on completion.
 *
 * Picks a free port via Bun's net APIs so two parallel bench runs don't
 * collide. Uses a fresh SQLite DB seeded from `.tmp/dev.db` if present,
 * otherwise falls back to whatever the server defaults to (it will run
 * migrations on first boot).
 */
import { spawn } from 'bun'
import { resolve } from 'node:path'
import { mkdirSync, existsSync, copyFileSync } from 'node:fs'

const REPO_ROOT = resolve(import.meta.dir, '../../..')

export interface ServerHandle {
  /** Base URL the bench should hit, e.g. `http://127.0.0.1:54321`. */
  baseUrl: string
  /** The chosen port. */
  port: number
  /** Wall time from spawn to first 200 from /health, in milliseconds. */
  bootMs: number
  /** Kill the child + clean up. Idempotent. */
  stop(): Promise<void>
  /** Read live RSS in MB. Returns null if the process is gone. */
  readRssMb(): number | null
}

async function findFreePort(): Promise<number> {
  // Bun's net.listen lets us claim ephemeral port 0 then read it back.
  const server = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: { data() {}, open() {}, close() {}, error() {}, drain() {} },
  })
  const port = server.port
  server.stop()
  return port
}

async function waitForHealth(baseUrl: string, timeoutMs = 30_000): Promise<number> {
  const t0 = performance.now()
  const deadline = t0 + timeoutMs
  while (performance.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`, {
        // Short per-attempt timeout so a hung server still loops.
        signal: AbortSignal.timeout(500),
      })
      if (res.ok) return performance.now() - t0
    } catch {
      // not ready yet
    }
    await Bun.sleep(50)
  }
  throw new Error(`Server at ${baseUrl} did not become healthy within ${timeoutMs}ms`)
}

interface StartOptions {
  /** Existing SQLite file to clone for this run. Defaults to `.tmp/dev.db`. */
  seedDbPath?: string
  /** Where to write the per-run DB. Defaults to `.tmp/benchmarks/bench-<port>.db`. */
  runDbPath?: string
  /** Stdout/stderr log file (defaults to `.tmp/benchmarks/server.log`). */
  logFile?: string
  /** Set `STATIC_DIR` so the server serves the built bundle. */
  staticDir?: string
}

export async function startServer(opts: StartOptions = {}): Promise<ServerHandle> {
  const port = await findFreePort()
  const baseUrl = `http://127.0.0.1:${port}`

  const benchDir = resolve(REPO_ROOT, '.tmp/benchmarks')
  mkdirSync(benchDir, { recursive: true })

  const seedDb = opts.seedDbPath ?? resolve(REPO_ROOT, '.tmp/dev.db')
  const runDb = opts.runDbPath ?? resolve(benchDir, `bench-${port}.db`)
  if (existsSync(seedDb)) {
    copyFileSync(seedDb, runDb)
  }
  // Else: server will boot with an empty DB and run migrations.

  const env: Record<string, string> = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    DATABASE_URL: `sqlite:${runDb}`,
  }
  if (opts.staticDir) env.STATIC_DIR = opts.staticDir

  const logFile = opts.logFile ?? resolve(benchDir, `server-${port}.log`)
  const logHandle = Bun.file(logFile).writer()

  const proc = spawn({
    cmd: ['bun', 'server/index.ts'],
    cwd: REPO_ROOT,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  // Pipe stdout + stderr to the log file (non-blocking, fire and forget).
  void pipeStream(proc.stdout, logHandle)
  void pipeStream(proc.stderr, logHandle)

  const bootMs = await waitForHealth(baseUrl).catch(async (err) => {
    proc.kill()
    await logHandle.flush()
    throw new Error(
      `${(err as Error).message}\nServer log: ${logFile}`,
    )
  })

  let stopped = false
  const stop = async (): Promise<void> => {
    if (stopped) return
    stopped = true
    proc.kill()
    await proc.exited
    await logHandle.flush()
    try {
      logHandle.end()
    } catch {
      // logHandle.end has historically been undefined on some Bun versions; ignore.
    }
  }

  const readRssMb = (): number | null => {
    if (stopped) return null
    try {
      // `ps -o rss=` returns KB. arm64 macOS has it at /bin/ps; same path on linux.
      const out = Bun.spawnSync({ cmd: ['/bin/ps', '-o', 'rss=', '-p', String(proc.pid)] })
      const kb = Number(out.stdout.toString().trim())
      if (!Number.isFinite(kb)) return null
      return kb / 1024
    } catch {
      return null
    }
  }

  return { baseUrl, port, bootMs, stop, readRssMb }
}

async function pipeStream(stream: ReadableStream<Uint8Array> | null, sink: ReturnType<typeof Bun.file>['writer'] extends () => infer T ? T : never): Promise<void> {
  if (!stream) return
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) return
    if (value) sink.write(value)
  }
}
