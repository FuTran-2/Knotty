import { createAvatarUrl, createNodeId } from '../types/network'
import type { PersonNode } from '../types/network'

const parseCsvRow = (row: string): string[] => {
  const cells: string[] = []
  let current = ''
  let inQuote = false

  for (let i = 0; i < row.length; i += 1) {
    const char = row[i]
    const next = row[i + 1]

    if (char === '"' && inQuote && next === '"') {
      current += '"'
      i += 1
      continue
    }
    if (char === '"') {
      inQuote = !inQuote
      continue
    }
    if (char === ',' && !inQuote) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }

  cells.push(current.trim())
  return cells
}

export function parseLinkedInConnectionsCsv(content: string): PersonNode[] {
  // LinkedIn prepends 3 note lines before the actual CSV header — skip them
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  // Find the real header row (contains "First Name")
  const headerLineIndex = lines.findIndex((line) =>
    line.toLowerCase().includes('first name'),
  )
  if (headerLineIndex < 0 || headerLineIndex >= lines.length - 1) return []

  const headers = parseCsvRow(lines[headerLineIndex]).map((h) => h.toLowerCase())
  const col = (key: string) => headers.findIndex((h) => h === key.toLowerCase())

  const firstNameIdx   = col('first name')
  const lastNameIdx    = col('last name')
  const urlIdx         = col('url')
  const emailIdx       = col('email address')
  const companyIdx     = col('company')
  const positionIdx    = col('position')
  const connectedOnIdx = col('connected on')

  const imported: PersonNode[] = []

  lines.slice(headerLineIndex + 1).forEach((line) => {
    const cells = parseCsvRow(line)
    const get = (idx: number) => (idx >= 0 ? (cells[idx] ?? '').trim() : '')

    const first = get(firstNameIdx)
    const last  = get(lastNameIdx)
    const name  = `${first} ${last}`.trim()
    if (!name) return

    const url         = get(urlIdx)
    const email       = get(emailIdx)
    const company     = get(companyIdx)
    const position    = get(positionIdx)
    const connectedOn = get(connectedOnIdx)

    const groups: string[] = ['linkedin']
    const posLower = position.toLowerCase()
    if (posLower.includes('engineer') || posLower.includes('developer')) groups.push('software engineer')

    const contactParts = [email, url, company, position].filter(Boolean)
    const notesParts = ['Imported from LinkedIn CSV export']
    if (connectedOn) notesParts.push(`Connected: ${connectedOn}`)

    imported.push({
      id: createNodeId(),
      name,
      photo: createAvatarUrl(name),
      contact: contactParts.join(' | '),
      relationship: 'Professional',
      notes: notesParts.join(' · '),
      groups,
      source: 'linkedin',
    })
  })

  return imported
}
