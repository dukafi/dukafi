import DOMPurify from 'dompurify'
import { GlobalWindow } from 'happy-dom'
import {
  configureRichtextSanitizer,
  type DOMPurifyRuntime,
} from '@core/sanitize'

type DOMPurifyFactory = (window: Window) => DOMPurifyRuntime

let installed = false
const serverSanitizerState: { window: GlobalWindow | null } = { window: null }

export function installServerRichtextSanitizer(): void {
  if (installed) return

  serverSanitizerState.window = new GlobalWindow({ url: 'http://localhost/' })
  const createDOMPurify = DOMPurify as unknown as DOMPurifyFactory
  const purifier = createDOMPurify(serverSanitizerState.window as unknown as Window)
  configureRichtextSanitizer(purifier)
  installed = true
}

installServerRichtextSanitizer()
