import { useMemo, useState } from 'react'
import './App.css'
import { GraphView } from './components/GraphView'
import { Sidebar } from './components/Sidebar'
import { parseLinkedInConnectionsCsv } from './lib/csv'
import { normalizeRelationship } from './types/network'
import { createNodeId, initialNodes } from './types/network'
import type { NodeDraft, PersonNode, Relationship } from './types/network'

function App() {
  const [nodes, setNodes] = useState<PersonNode[]>(initialNodes)
  const [activeGroup, setActiveGroup] = useState('all')
  const [search, setSearch] = useState('')
  const [relationshipFilter, setRelationshipFilter] = useState<'all' | Relationship>('all')
  const [selectedNodeId, setSelectedNodeId] = useState(initialNodes[0].id)

  const groups = useMemo(() => {
    const bucket = new Set<string>()
    nodes.forEach((node) => node.groups.forEach((group) => bucket.add(group.toLowerCase())))
    return ['all', ...Array.from(bucket).sort()]
  }, [nodes])

  const visibleNodes = useMemo(() => {
    const q = search.trim().toLowerCase()
    return nodes.filter((node) => {
      const groupOk =
        activeGroup === 'all' || node.groups.some((group) => group.toLowerCase() === activeGroup)
      const relationshipOk = relationshipFilter === 'all' || node.relationship === relationshipFilter
      const searchOk =
        !q ||
        node.name.toLowerCase().includes(q) ||
        node.contact.toLowerCase().includes(q) ||
        node.notes.toLowerCase().includes(q)
      return groupOk && relationshipOk && searchOk
    })
  }, [activeGroup, nodes, relationshipFilter, search])

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

  const updateRelationship = (value: Relationship) => {
    const targetId = selectedNode?.id
    if (!targetId) return

    setNodes((current) =>
      current.map((node) =>
        node.id === targetId
          ? {
              ...node,
              relationship: value,
            }
          : node,
      ),
    )
  }

  const updateNode = (
    nodeId: string,
    patch: Partial<Pick<PersonNode, 'name' | 'contact' | 'notes' | 'relationship' | 'groups'>>,
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

  const importLinkedInCsv = async (file: File) => {
    const text = await file.text()
    const imported = parseLinkedInConnectionsCsv(text)

    if (imported.length > 0) {
      setNodes((current) => [...imported, ...current])
      setSelectedNodeId(imported[0].id)
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        nodesCount={nodes.length}
        groups={groups}
        activeGroup={activeGroup}
        onActiveGroupChange={setActiveGroup}
        search={search}
        onSearchChange={setSearch}
        onImportLinkedInCsv={importLinkedInCsv}
        onAddNode={onAddNode}
      />
      <GraphView
        visibleNodes={visibleNodes}
        selectedNode={selectedNode}
        activeGroup={activeGroup}
        relationshipFilter={relationshipFilter}
        onActiveGroupChange={setActiveGroup}
        onRelationshipFilterChange={setRelationshipFilter}
        onSelectNode={setSelectedNodeId}
        onUpdateRelationship={updateRelationship}
        onUpdateNode={updateNode}
      />
    </div>
  )
}

export default App
