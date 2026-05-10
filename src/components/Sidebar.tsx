import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  ACCOUNT_PHOTO,
  RELATIONSHIP_ORDER,
  createAvatarUrl,
  normalizeRelationship,
} from '../types/network'
import type { NodeDraft, Relationship } from '../types/network'
import type { AuthUser } from '../lib/auth'

type SidebarProps = {
  authUser: AuthUser
  nodesCount: number
  groups: string[]
  activeGroup: string
  onActiveGroupChange: (group: string) => void
  search: string
  onSearchChange: (value: string) => void
  onImportLinkedInCsv: (file: File) => Promise<number>
  onAddNode: (draft: NodeDraft) => void
  onAddGroup: (name: string) => void
  onSignOut: () => void
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

const DoodleStar = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
)

const DoodleArrow = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="32" height="32">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

export function Sidebar({
  authUser,
  nodesCount,
  groups,
  activeGroup,
  onActiveGroupChange,
  search,
  onSearchChange,
  onImportLinkedInCsv,
  onAddNode,
  onAddGroup,
  onSignOut,
}: SidebarProps) {
  const [openPanel, setOpenPanel] = useState<null | 'person' | 'group'>(null)
  const [personForm, setPersonForm] = useState<PersonFormState>(initialPersonForm)
  const [groupName, setGroupName] = useState('')
  const [importStatus, setImportStatus] = useState<null | { count: number; error?: string }>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    onActiveGroupChange('all') // navigate to main view so the new bubble is visible
    setGroupName('')
    setOpenPanel(null)
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setImportStatus(null)
    try {
      const count = await onImportLinkedInCsv(file)
      setImportStatus({ count })
    } catch {
      setImportStatus({ count: 0, error: 'Could not parse the file. Make sure it is a LinkedIn Connections CSV.' })
    }
    event.target.value = ''
  }

  return (
    <aside className="left-pane">
      <div className="account-card">
        <img src={ACCOUNT_PHOTO} alt={authUser.name} />
        <div className="account-card-info">
          <h1>{authUser.name}</h1>
          <p>{nodesCount} connections</p>
        </div>
        <button type="button" className="signout-btn" onClick={onSignOut} title="Sign out">
          <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
            <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-1.168a.75.75 0 10-1.004-1.116l-2.5 2.25a.75.75 0 000 1.116l2.5 2.25a.75.75 0 101.004-1.116L8.704 10.75H18.25A.75.75 0 0019 10z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <div className="panel">
        <DoodleStar className="doodle-star-panel" />
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
        <h2>Search</h2>
        <input
          type="text"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search name, note, contact..."
        />
      </div>

      {/* LinkedIn Import */}
      <div className="panel linkedin-import-panel">
        <h2>Import from LinkedIn</h2>
        <ol className="linkedin-steps">
          <li>
            Go to{' '}
            <a href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noreferrer">
              LinkedIn → Settings
            </a>
          </li>
          <li>Data Privacy → <strong>Get a copy of your data</strong></li>
          <li>Select <strong>Connections</strong> → Request archive</li>
          <li>Download the ZIP, then upload <code>Connections.csv</code> below</li>
        </ol>

        <button
          type="button"
          className="linkedin-import-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-14 9v2h14v-2H5z" />
          </svg>
          Upload Connections.csv
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={handleImport}
        />

        {importStatus && (
          <p className={`import-status ${importStatus.error ? 'import-error' : 'import-success'}`}>
            {importStatus.error
              ? importStatus.error
              : `Imported ${importStatus.count} connection${importStatus.count !== 1 ? 's' : ''} successfully.`}
          </p>
        )}
      </div>

      <div className="panel">
        <DoodleArrow className="doodle-arrow-panel" />
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
