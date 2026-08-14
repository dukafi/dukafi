export function formDisplayName(formId: string): string {
  return humanizeIdentifier(stripGeneratedSuffix(formId || 'form'))
}

export function humanizeIdentifier(value: string): string {
  const words = value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return 'Form'
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
}

export function slugifyFormTableName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'form-submissions'
}

function stripGeneratedSuffix(value: string): string {
  const tokens = value.trim().split(/[-_]+/).filter(Boolean)
  let suffixStart = tokens.length
  let sawStrongGeneratedToken = false

  for (let index = tokens.length - 1; index >= 1; index -= 1) {
    const token = tokens[index]!
    if (isGeneratedIdToken(token)) {
      suffixStart = index
      sawStrongGeneratedToken = true
      continue
    }

    if (isGeneratedIdFragment(token)) {
      suffixStart = index
      continue
    }

    break
  }

  return sawStrongGeneratedToken ? tokens.slice(0, suffixStart).join('-') || value : value
}

function isGeneratedIdToken(token: string): boolean {
  return token.length >= 8
    && /[a-z]/.test(token)
    && /[A-Z]/.test(token)
    && (/\d/.test(token) || token.length >= 16)
}

function isGeneratedIdFragment(token: string): boolean {
  return token.length >= 8
    && /[a-z]/.test(token)
    && uppercaseCount(token) >= 2
}

function uppercaseCount(value: string): number {
  return value.replace(/[^A-Z]/g, '').length
}
