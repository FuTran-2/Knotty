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

function App() {
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

  const groups = useMemo(() => {
    const bucket = new Set<string>()
    nodes.forEach((node) => node.groups.forEach((group) => bucket.add(group.toLowerCase())))
    standaloneGroups.forEach((g) => bucket.add(g.toLowerCase()))
    return ['all', ...Array.from(bucket).sort()]
  }, [nodes, standaloneGroups])

  const addGroup = (name: string) => {
    const normalized = name.trim().toLowerCase()
    if (!normalized) return
    setStandaloneGroups((current) =>
      current.includes(normalized) ? current : [...current, normalized],
    )
  }

  const visibleNodes = useMemo(() => {
    const q = search.trim().toLowerCase()
    return nodes.filter((node) => {
      const groupOk =
        activeGroup === 'all' || node.groups.some((group) => group.toLowerCase() === activeGroup)
      const searchOk =
        !q ||
        node.name.toLowerCase().includes(q) ||
        node.contact.toLowerCase().includes(q) ||
        node.notes.toLowerCase().includes(q)
      return groupOk && searchOk
    })
  }, [activeGroup, nodes, search])

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
