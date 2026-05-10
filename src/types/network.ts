export type Relationship = 'Family' | 'Friend' | 'Professional' | 'Mentor' | 'Other'

export type NodeSource = 'manual' | 'linkedin'

export type PersonNode = {
  id: string
  name: string
  photo: string
  contact: string
  relationship: Relationship
  notes: string
  groups: string[]
  source: NodeSource
}

export type NodeDraft = {
  name: string
  photo: string
  contact: string
  relationship: Relationship
  notes: string
  groups: string[]
}

export const RELATIONSHIP_ORDER: Relationship[] = [
  'Family',
  'Friend',
  'Professional',
  'Mentor',
  'Other',
]

export const RELATIONSHIP_COLORS: Record<Relationship, string> = {
  Family: '#f97316',
  Friend: '#22c55e',
  Professional: '#0ea5e9',
  Mentor: '#a855f7',
  Other: '#94a3b8',
}

export const ACCOUNT_NAME = 'You'
export const ACCOUNT_PHOTO = createAvatarUrl('KnottyAccount')

export const normalizeRelationship = (value: string): Relationship => {
  const clean = value.trim().toLowerCase()
  if (clean === 'family') return 'Family'
  if (clean === 'friend') return 'Friend'
  if (clean === 'professional') return 'Professional'
  if (clean === 'mentor') return 'Mentor'
  return 'Other'
}

export const createNodeId = () => `n-${Math.random().toString(36).slice(2, 10)}`

export function createAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(seed)}`
}

export const initialNodes: PersonNode[] = [
  {
    id: 'n-1',
    name: 'Ari Kim',
    photo: createAvatarUrl('Ari Kim'),
    contact: 'ari@example.com',
    relationship: 'Friend',
    notes: 'Weekend climbing partner',
    groups: ['friend'],
    source: 'manual',
  },
  {
    id: 'n-2',
    name: 'Maya Nguyen',
    photo: createAvatarUrl('Maya Nguyen'),
    contact: 'maya@example.com',
    relationship: 'Family',
    notes: 'Cousin living in Toronto',
    groups: ['family'],
    source: 'manual',
  },
  {
    id: 'n-3',
    name: 'Noah Patel',
    photo: createAvatarUrl('Noah Patel'),
    contact: 'noah@acme.dev',
    relationship: 'Professional',
    notes: 'Engineering manager',
    groups: ['software engineer', 'linkedin'],
    source: 'linkedin',
  },
]
