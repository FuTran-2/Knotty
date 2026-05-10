import { useEffect, useMemo, useState } from 'react'
import { Hub } from 'aws-amplify/utils'
import './App.css'
import { ChatBot } from './components/ChatBot'
import { GraphView } from './components/GraphView'
import { LoginPage } from './components/LoginPage'
import { Sidebar } from './components/Sidebar'
import { getCurrentUser, signOut } from './lib/auth'
import type { AuthUser } from './lib/auth'
import { parseLinkedInConnectionsCsv } from './lib/csv'
import { normalizeRelationship } from './types/network'
import { createNodeId, initialNodes } from './types/network'
import type { NodeDraft, PersonNode } from './types/network'

const DoodleLayer = () => (
  <div className="doodle-layer" aria-hidden="true">
    <svg className="doodle doodle-1" viewBox="0 0 100 100"><path d="M50 10 L60 40 L90 40 L65 60 L75 90 L50 70 L25 90 L35 60 L10 40 L40 40 Z" fill="var(--crayon-yellow)" stroke="#000" strokeWidth="2"/></svg>
    <svg className="doodle doodle-2" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="var(--crayon-blue)" strokeWidth="3" strokeDasharray="10 5"/></svg>
    <svg className="doodle doodle-3" viewBox="0 0 100 20"><path d="M0 10 Q25 0 50 10 T100 10" fill="none" stroke="var(--crayon-red)" strokeWidth="3"/></svg>
    <svg className="doodle doodle-4" viewBox="0 0 100 100"><path d="M10 10 L90 90 M90 10 L10 90" fill="none" stroke="var(--crayon-green)" strokeWidth="4"/></svg>
  </div>
)

function App() {
  const [toasts, setToasts] = useState<Array<{ id: number; text: string }>>([])
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const restoreUser = async () => {
      const user = await getCurrentUser()
      if (!mounted) return
      setAuthUser(user)
      setAuthLoading(false)
    }

    const stopListening = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn' || payload.event === 'signInWithRedirect') {
        void restoreUser()
      }

      if (payload.event === 'signedOut') {
        setAuthUser(null)
      }
    })

    void restoreUser()

    return () => {
      mounted = false
      stopListening()
    }
  }, [])

  const handleSignOut = async () => {
    await signOut()
    setAuthUser(null)
  }

  const [nodes, setNodes] = useState<PersonNode[]>(initialNodes)
  const [standaloneGroups, setStandaloneGroups] = useState<string[]>([])
  const [activeGroup, setActiveGroup] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState(initialNodes[0].id)
  const searchQuery = search.trim().toLowerCase()
  const pushToast = (text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((current) => [...current, { id, text }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id))
    }, 2800)
  }

  const groups = useMemo(() => {
    const bucket = new Set<string>()
    nodes.forEach((node) => node.groups.forEach((group) => bucket.add(group.toLowerCase())))
    standaloneGroups.forEach((g) => bucket.add(g.toLowerCase()))
    return ['all', ...Array.from(bucket).sort()]
  }, [nodes, standaloneGroups])

  const addGroup = (name: string) => {
    const normalized = name.trim().toLowerCase()
    if (!normalized) return
    const exists = standaloneGroups.includes(normalized)
    setStandaloneGroups((current) =>
      current.includes(normalized) ? current : [...current, normalized],
    )
    if (!exists) pushToast(`Group "${normalized}" added`)
  }

  const visibleNodes = useMemo(() => {
    return nodes.filter((node) => {
      const groupOk =
        activeGroup === 'all' || node.groups.some((group) => group.toLowerCase() === activeGroup)
      const searchOk =
        !searchQuery ||
        node.name.toLowerCase().includes(searchQuery) ||
        node.contact.toLowerCase().includes(searchQuery) ||
        node.notes.toLowerCase().includes(searchQuery)
      return groupOk && searchOk
    })
  }, [activeGroup, nodes, searchQuery])

  const searchMatchNode = useMemo(() => {
    if (!searchQuery) return null
    return (
      nodes.find((node) =>
        node.name.toLowerCase().includes(searchQuery) ||
        node.contact.toLowerCase().includes(searchQuery) ||
        node.notes.toLowerCase().includes(searchQuery),
      ) ?? null
    )
  }, [nodes, searchQuery])

  useEffect(() => {
    if (!searchMatchNode) return
    const nextGroup = searchMatchNode.groups[0]?.toLowerCase() ?? 'all'
    if (activeGroup !== nextGroup) setActiveGroup(nextGroup)
    if (selectedNodeId !== searchMatchNode.id) setSelectedNodeId(searchMatchNode.id)
  }, [searchMatchNode, activeGroup, selectedNodeId])

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? visibleNodes[0] ?? nodes[0] ?? null,
    [nodes, selectedNodeId, visibleNodes],
  )

  const onAddNode = (draft: NodeDraft) => {
    const nextNode: PersonNode = {
      id: createNodeId(),
      name: draft.name,
      photo: draft.photo,
      contact: draft.contact,
      relationship: draft.relationship,
      groups: draft.groups,
      notes: draft.notes,
      source: 'manual',
    }

    setNodes((current) => [nextNode, ...current])
    setSelectedNodeId(nextNode.id)
    pushToast(`${nextNode.name} added to your network`)
  }

  const updateNode = (
    nodeId: string,
    patch: Partial<Pick<PersonNode, 'name' | 'photo' | 'contact' | 'notes' | 'relationship' | 'groups'>>,
  ) => {
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== nodeId) return node
        return {
          ...node,
          ...patch,
          relationship: patch.relationship ? normalizeRelationship(patch.relationship) : node.relationship,
        }
      }),
    )
  }

  const deleteNode = (nodeId: string) => {
    setNodes((current) => current.filter((node) => node.id !== nodeId))
    setSelectedNodeId((current) => (current === nodeId ? (nodes[0]?.id ?? '') : current))
  }

  const importLinkedInCsv = async (file: File): Promise<number> => {
    const text = await file.text()
    const imported = parseLinkedInConnectionsCsv(text)

    if (imported.length > 0) {
      setNodes((current) => [...imported, ...current])
      setSelectedNodeId(imported[0].id)
    }
    return imported.length
  }

  // groups without the leading 'all' sentinel, for chatbot and add-user forms
  const allGroups = useMemo(() => groups.filter((g) => g !== 'all'), [groups])

  if (authLoading) {
    return <div className="login-shell"><div className="login-loading" /></div>
  }

  if (!authUser) {
    return <LoginPage onLogin={setAuthUser} />
  }

  return (
    <div className="app-shell">
      <DoodleLayer />
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className="doodle-toast" role="status">
            <span className="doodle-toast-pin" aria-hidden="true">★</span>
            {toast.text}
          </div>
        ))}
      </div>
      <Sidebar
        authUser={authUser}
        nodesCount={nodes.length}
        groups={groups}
        activeGroup={activeGroup}
        onActiveGroupChange={setActiveGroup}
        search={search}
        onSearchChange={setSearch}
        onImportLinkedInCsv={importLinkedInCsv}
        onAddNode={onAddNode}
        onAddGroup={addGroup}
        onSignOut={handleSignOut}
      />
      <GraphView
        visibleNodes={visibleNodes}
        selectedNode={selectedNode}
        activeGroup={activeGroup}
        allGroups={allGroups}
        autoOpenNodeId={searchQuery ? searchMatchNode?.id ?? null : null}
        onActiveGroupChange={setActiveGroup}
        onSelectNode={setSelectedNodeId}
        onUpdateNode={updateNode}
        onDeleteNode={deleteNode}
      />
      <ChatBot allGroups={allGroups} onAddNode={onAddNode} />
    </div>
  )
}

export default App
