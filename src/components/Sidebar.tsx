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
  onAddGroup: (name: string) => void
}

type PersonFormState = {
  name: string
  photo: string
  contact: string
  relationship: Relationship
  groups: string
  notes: string
}

const initialPersonForm: PersonFormState = {
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
  onAddGroup,
}: SidebarProps) {
  const [openPanel, setOpenPanel] = useState<null | 'person' | 'group'>(null)
  const [personForm, setPersonForm] = useState<PersonFormState>(initialPersonForm)
  const [groupName, setGroupName] = useState('')

  const togglePanel = (panel: 'person' | 'group') => {
    setOpenPanel((current) => (current === panel ? null : panel))
  }

  const handleAddPerson = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = personForm.name.trim()
    if (!name) return
    onAddNode({
      name,
      photo: personForm.photo.trim() || createAvatarUrl(name),
      contact: personForm.contact.trim(),
      relationship: personForm.relationship,
      notes: personForm.notes.trim(),
      groups: personForm.groups
        .split(',')
        .map((g) => g.trim().toLowerCase())
        .filter(Boolean),
    })
    setPersonForm(initialPersonForm)
    setOpenPanel(null)
  }

  const handleAddGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = groupName.trim()
    if (!name) return
    onAddGroup(name)
    setGroupName('')
    setOpenPanel(null)
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

      <div className="panel">
        <div className="action-buttons">
          <button
            type="button"
            className={`action-btn${openPanel === 'person' ? ' active' : ''}`}
            onClick={() => togglePanel('person')}
          >
            + Add Person
          </button>
          <button
            type="button"
            className={`action-btn${openPanel === 'group' ? ' active' : ''}`}
            onClick={() => togglePanel('group')}
          >
            + Add Group
          </button>
        </div>

        {openPanel === 'person' && (
          <form onSubmit={handleAddPerson} className="inline-form">
            <input
              value={personForm.name}
              onChange={(e) => setPersonForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Name"
              required
              autoFocus
            />
            <input
              value={personForm.photo}
              onChange={(e) => setPersonForm((f) => ({ ...f, photo: e.target.value }))}
              placeholder="Photo URL (optional)"
            />
            <input
              value={personForm.contact}
              onChange={(e) => setPersonForm((f) => ({ ...f, contact: e.target.value }))}
              placeholder="Contact info"
            />
            <select
              value={personForm.relationship}
              onChange={(e) =>
                setPersonForm((f) => ({ ...f, relationship: normalizeRelationship(e.target.value) }))
              }
            >
              {RELATIONSHIP_ORDER.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <input
              value={personForm.groups}
              onChange={(e) => setPersonForm((f) => ({ ...f, groups: e.target.value }))}
              placeholder="Groups (comma separated)"
            />
            <textarea
              value={personForm.notes}
              onChange={(e) => setPersonForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Notes"
              rows={3}
            />
            <button type="submit" className="inline-form-submit">Create Person</button>
          </form>
        )}

        {openPanel === 'group' && (
          <form onSubmit={handleAddGroup} className="inline-form">
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              required
              autoFocus
            />
            <button type="submit" className="inline-form-submit">Create Group</button>
          </form>
        )}
      </div>
    </aside>
  )
}
