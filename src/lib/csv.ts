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
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length <= 1) return []

  const headers = parseCsvRow(lines[0]).map((header) => header.toLowerCase())
  const column = (key: string) => headers.findIndex((header) => header === key.toLowerCase())

  const firstNameIndex = column('first name')
  const lastNameIndex = column('last name')
  const emailIndex = column('email address')
  const companyIndex = column('company')
  const positionIndex = column('position')

  const imported: PersonNode[] = []

  lines.slice(1).forEach((line) => {
    const cells = parseCsvRow(line)
    const first = firstNameIndex >= 0 ? cells[firstNameIndex] ?? '' : ''
    const last = lastNameIndex >= 0 ? cells[lastNameIndex] ?? '' : ''
    const name = `${first} ${last}`.trim()
    if (!name) return

    const email = emailIndex >= 0 ? cells[emailIndex] ?? '' : ''
    const company = companyIndex >= 0 ? cells[companyIndex] ?? '' : ''
    const position = positionIndex >= 0 ? cells[positionIndex] ?? '' : ''
    const groups = ['linkedin']
    if (position.toLowerCase().includes('engineer')) groups.push('software engineer')

    imported.push({
      id: createNodeId(),
      name,
      photo: createAvatarUrl(name),
      contact: [email, company, position].filter(Boolean).join(' | '),
      relationship: 'Professional',
      notes: 'Imported from LinkedIn connections CSV export',
      groups,
      source: 'linkedin',
    })
  })

  return imported
}
