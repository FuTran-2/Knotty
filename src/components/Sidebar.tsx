import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  ACCOUNT_NAME,
  ACCOUNT_PHOTO,
  RELATIONSHIP_ORDER,
  createAvatarUrl,
  normalizeRelationship,
} from '../types/network'
import type { NodeDraft, Relationship } from '../types/network'

type SidebarProps = {
  nodesCount: number
  groups: string[]
  activeGroup: string
  onActiveGroupChange: (group: string) => void
  search: string
  onSearchChange: (value: string) => void
  onImportLinkedInCsv: (file: File) => Promise<void>
  onAddNode: (draft: NodeDraft) => void
}

type FormState = {
  name: string
  photo: string
  contact: string
  relationship: Relationship
  groups: string
  notes: string
}

const initialForm: FormState = {
  name: '',
  photo: '',
  contact: '',
  relationship: 'Friend',
  groups: '',
  notes: '',
}

export function Sidebar({
  nodesCount,
  groups,
  activeGroup,
  onActiveGroupChange,
  search,
  onSearchChange,
  onImportLinkedInCsv,
  onAddNode,
}: SidebarProps) {
  const [form, setForm] = useState<FormState>(initialForm)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) return

    onAddNode({
      name,
      photo: form.photo.trim() || createAvatarUrl(name),
      contact: form.contact.trim(),
      relationship: form.relationship,
      notes: form.notes.trim(),
      groups: form.groups
        .split(',')
        .map((group) => group.trim().toLowerCase())
        .filter(Boolean),
    })

    setForm(initialForm)
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    await onImportLinkedInCsv(file)
    event.target.value = ''
  }

  return (
    <aside className="left-pane">
      <div className="account-card">
        <img src={ACCOUNT_PHOTO} alt={ACCOUNT_NAME} />
        <div>
          <h1>{ACCOUNT_NAME}</h1>
          <p>{nodesCount} connections</p>
        </div>
      </div>

      <div className="panel">
        <h2>Groups</h2>
        <div className="group-tabs">
          {groups.map((group) => (
            <button
              key={group}
              type="button"
              className={group === activeGroup ? 'active' : ''}
              onClick={() => onActiveGroupChange(group)}
            >
              {group}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Search & Filter</h2>
        <input
          type="text"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search name, note, contact..."
        />
        <p className="small">LinkedIn API is restricted, so use CSV export import below.</p>
        <label className="file-input">
          Import LinkedIn CSV
          <input type="file" accept=".csv,text/csv" onChange={handleImport} />
        </label>
      </div>

      <form className="panel add-form" onSubmit={handleSubmit}>
        <h2>Add Person</h2>
        <input
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          placeholder="Name"
          required
        />
        <input
          value={form.photo}
          onChange={(event) => setForm((current) => ({ ...current, photo: event.target.value }))}
          placeholder="Photo URL (optional)"
        />
        <input
          value={form.contact}
          onChange={(event) => setForm((current) => ({ ...current, contact: event.target.value }))}
          placeholder="Contact info"
        />
        <select
          value={form.relationship}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              relationship: normalizeRelationship(event.target.value),
            }))
          }
        >
          {RELATIONSHIP_ORDER.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <input
          value={form.groups}
          onChange={(event) => setForm((current) => ({ ...current, groups: event.target.value }))}
          placeholder="Groups (comma separated)"
        />
        <textarea
          value={form.notes}
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          placeholder="Notes"
          rows={3}
        />
        <button type="submit">Create node</button>
      </form>
    </aside>
  )
}
