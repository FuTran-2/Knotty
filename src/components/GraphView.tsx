import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ACCOUNT_NAME,
  ACCOUNT_PHOTO,
  RELATIONSHIP_COLORS,
  RELATIONSHIP_ORDER,
  normalizeRelationship,
} from '../types/network'
import type { PersonNode, Relationship } from '../types/network'

type Position = { x: number; y: number }

type GraphViewProps = {
  visibleNodes: PersonNode[]
  selectedNode: PersonNode | null
  activeGroup: string
  relationshipFilter: 'all' | Relationship
  onActiveGroupChange: (group: string) => void
  onRelationshipFilterChange: (value: 'all' | Relationship) => void
  onSelectNode: (nodeId: string) => void
  onUpdateRelationship: (relationship: Relationship) => void
  onUpdateNode: (
    nodeId: string,
    patch: Partial<Pick<PersonNode, 'name' | 'contact' | 'notes' | 'relationship' | 'groups'>>,
  ) => void
}

export function GraphView({
  visibleNodes,
  selectedNode,
  activeGroup,
  relationshipFilter,
  onActiveGroupChange,
  onRelationshipFilterChange,
  onSelectNode,
  onUpdateRelationship,
  onUpdateNode,
}: GraphViewProps) {
  const [graphSize, setGraphSize] = useState({ width: 800, height: 680 })
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1, active: false })
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({
    name: '',
    contact: '',
    notes: '',
    relationship: 'Friend' as Relationship,
    groups: '',
  })

  const graphPaneRef = useRef<HTMLDivElement | null>(null)
  const zoomTimeout = useRef<number | null>(null)
  const focusedGroup = activeGroup === 'all' ? null : activeGroup

  useEffect(() => {
    const pane = graphPaneRef.current
    if (!pane) return

    const observer = new ResizeObserver((entries) => {
      const size = entries[0].contentRect
      setGraphSize({ width: size.width, height: size.height })
    })

    observer.observe(pane)
    return () => observer.disconnect()
  }, [])

  useEffect(
    () => () => {
      if (zoomTimeout.current) {
        window.clearTimeout(zoomTimeout.current)
      }
    },
    [],
  )

  const groups = useMemo(() => {
    const grouped: Record<string, string[]> = {}
    visibleNodes.forEach((node) => {
      node.groups.forEach((group) => {
        const key = group.toLowerCase()
        grouped[key] = grouped[key] ?? []
        grouped[key].push(node.id)
      })
    })
    return Object.entries(grouped)
      .map(([group, nodeIds]) => ({ group, nodeIds }))
      .sort((a, b) => b.nodeIds.length - a.nodeIds.length)
  }, [visibleNodes])

  const memberNodes = useMemo(() => {
    if (!focusedGroup) return []
    return visibleNodes.filter((node) => node.groups.some((group) => group.toLowerCase() === focusedGroup))
  }, [focusedGroup, visibleNodes])

  const displayedNodes = useMemo(
    () => (focusedGroup ? memberNodes : []),
    [focusedGroup, memberNodes],
  )

  const groupPositions = useMemo(() => {
    const centerX = graphSize.width / 2
    const centerY = graphSize.height / 2
    const radius = Math.min(graphSize.width, graphSize.height) * 0.28
    const positions: Record<string, Position> = {}
    groups.forEach((item, index) => {
      const angle = (index / Math.max(groups.length, 1)) * Math.PI * 2 - Math.PI / 2
      positions[item.group] = {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      }
    })
    return positions
  }, [graphSize.height, graphSize.width, groups])

  const personPositions = useMemo(() => {
    const centerX = graphSize.width / 2
    const centerY = graphSize.height / 2
    const radius = Math.min(graphSize.width, graphSize.height) * 0.3
    const positions: Record<string, Position> = {}
    displayedNodes.forEach((node, index) => {
      const angle = (index / Math.max(displayedNodes.length, 1)) * Math.PI * 2 - Math.PI / 2
      positions[node.id] = {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      }
    })
    return positions
  }, [displayedNodes, graphSize.height, graphSize.width])

  const ringCenter = selectedNode ? personPositions[selectedNode.id] : undefined
  const editingPerson = useMemo(
    () => visibleNodes.find((node) => node.id === editingPersonId) ?? null,
    [editingPersonId, visibleNodes],
  )

  const startGroupZoom = (group: string) => {
    const target = groupPositions[group]
    if (!target) return

    const centerX = graphSize.width / 2
    const centerY = graphSize.height / 2

    setCamera({
      x: centerX - target.x,
      y: centerY - target.y,
      scale: 1.65,
      active: true,
    })

    if (zoomTimeout.current) window.clearTimeout(zoomTimeout.current)
    zoomTimeout.current = window.setTimeout(() => {
      onActiveGroupChange(group)
      setCamera({ x: 0, y: 0, scale: 1, active: false })
      zoomTimeout.current = null
    }, 360)
  }

  const backToGroups = () => {
    onActiveGroupChange('all')
    setEditingPersonId(null)
  }

  const beginEditingPerson = (node: PersonNode) => {
    setEditingPersonId(node.id)
    setEditDraft({
      name: node.name,
      contact: node.contact,
      notes: node.notes,
      relationship: node.relationship,
      groups: node.groups.join(', '),
    })
  }

  const savePersonEdit = () => {
    if (!editingPersonId) return
    onUpdateNode(editingPersonId, {
      name: editDraft.name.trim(),
      contact: editDraft.contact.trim(),
      notes: editDraft.notes.trim(),
      relationship: normalizeRelationship(editDraft.relationship),
      groups: editDraft.groups
        .split(',')
        .map((group) => group.trim().toLowerCase())
        .filter(Boolean),
    })
    setEditingPersonId(null)
  }

  return (
    <main className="graph-pane" ref={graphPaneRef}>
      <div className="graph-toolbar">
        <div className="relationship-tabs">
          {focusedGroup ? (
            <button type="button" onClick={backToGroups}>
              Back
            </button>
          ) : null}
          <button
            type="button"
            className={relationshipFilter === 'all' ? 'active' : ''}
            onClick={() => onRelationshipFilterChange('all')}
          >
            all
          </button>
          {RELATIONSHIP_ORDER.map((type) => (
            <button
              key={type}
              type="button"
              className={relationshipFilter === type ? 'active' : ''}
              onClick={() => onRelationshipFilterChange(type)}
            >
              {type}
            </button>
          ))}
        </div>
        <span>
          {focusedGroup ? `${focusedGroup} (${displayedNodes.length})` : `${groups.length} groups`}
        </span>
      </div>

      <div
        className={`graph-stage ${camera.active ? 'zooming' : ''}`}
        style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}
      >
        <svg viewBox={`0 0 ${graphSize.width} ${graphSize.height}`} className="graph-canvas">
        <defs>
          <radialGradient id="bg-glow" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#c7d2fe" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={graphSize.width} height={graphSize.height} fill="url(#bg-glow)" />

        {focusedGroup
          ? displayedNodes.map((node) => {
              const pos = personPositions[node.id]
              if (!pos) return null
              return (
                <line
                  key={`account-${node.id}`}
                  x1={graphSize.width / 2}
                  y1={graphSize.height / 2}
                  x2={pos.x}
                  y2={pos.y}
                  stroke="rgba(148, 163, 184, 0.35)"
                  strokeWidth={1.3}
                />
              )
            })
          : groups.map((item) => {
              const pos = groupPositions[item.group]
              if (!pos) return null
              return (
                <line
                  key={`group-${item.group}`}
                  x1={graphSize.width / 2}
                  y1={graphSize.height / 2}
                  x2={pos.x}
                  y2={pos.y}
                  stroke="rgba(148, 163, 184, 0.35)"
                  strokeWidth={1.3}
                />
              )
            })}

        <g className="node-group" onClick={backToGroups}>
          <circle cx={graphSize.width / 2} cy={graphSize.height / 2} r={32} className="account-node" />
          <image
            href={ACCOUNT_PHOTO}
            x={graphSize.width / 2 - 20}
            y={graphSize.height / 2 - 20}
            width={40}
            height={40}
            clipPath="circle(20px at center)"
          />
          <text x={graphSize.width / 2} y={graphSize.height / 2 + 52} textAnchor="middle" className="node-label">
            {ACCOUNT_NAME}
          </text>
        </g>

        {focusedGroup
          ? displayedNodes.map((node, index) => {
              const pos = personPositions[node.id]
              if (!pos) return null
              const isSelected = node.id === selectedNode?.id
              return (
                <g
                  key={`${node.id}-${focusedGroup}`}
                  className="node-group person-node-enter"
                  style={{ animationDelay: `${index * 40}ms` }}
                  onClick={() => {
                    onSelectNode(node.id)
                    beginEditingPerson(node)
                  }}
                >
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={isSelected ? 28 : 24}
                    className="node-glow"
                    style={{ stroke: RELATIONSHIP_COLORS[node.relationship] }}
                  />
                  <image
                    href={node.photo}
                    x={pos.x - 18}
                    y={pos.y - 18}
                    width={36}
                    height={36}
                    clipPath="circle(18px at center)"
                  />
                  <text x={pos.x} y={pos.y + 36} textAnchor="middle" className="node-label">
                    {node.name}
                  </text>
                </g>
              )
            })
          : groups.map((item) => {
              const pos = groupPositions[item.group]
              if (!pos) return null
              return (
                <g
                  key={item.group}
                  className="node-group group-node"
                  onClick={() => startGroupZoom(item.group)}
                >
                  <circle cx={pos.x} cy={pos.y} r={28} className="node-glow group-bubble" />
                  <text x={pos.x} y={pos.y + 4} textAnchor="middle" className="node-label group-label">
                    {item.group.slice(0, 8)}
                  </text>
                  <text x={pos.x} y={pos.y + 40} textAnchor="middle" className="node-label group-count">
                    {item.nodeIds.length} people
                  </text>
                </g>
              )
            })}
        </svg>
      </div>

      {selectedNode && ringCenter ? (
        <div className="ring-selector" style={{ left: ringCenter.x, top: ringCenter.y }}>
          {RELATIONSHIP_ORDER.map((item, index) => {
            const angle = (index / RELATIONSHIP_ORDER.length) * Math.PI * 2 - Math.PI / 2
            const radius = 78
            const x = Math.cos(angle) * radius
            const y = Math.sin(angle) * radius
            return (
              <button
                key={item}
                type="button"
                onClick={() => onUpdateRelationship(item)}
                title={`Set relationship: ${item}`}
                style={{ transform: `translate(${x}px, ${y}px)`, borderColor: RELATIONSHIP_COLORS[item] }}
                className={selectedNode.relationship === item ? 'active' : ''}
              >
                {item[0]}
              </button>
            )
          })}
        </div>
      ) : null}

      {editingPerson ? (
        <section className="node-popup">
          <div className="node-popup-header">
            <h3>{editingPerson.name}</h3>
            <button type="button" onClick={() => setEditingPersonId(null)}>
              Close
            </button>
          </div>
          <div className="node-popup-grid">
            <label>
              Name
              <input
                value={editDraft.name}
                onChange={(event) => setEditDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              Contact
              <input
                value={editDraft.contact}
                onChange={(event) =>
                  setEditDraft((current) => ({ ...current, contact: event.target.value }))
                }
              />
            </label>
            <label>
              Relationship
              <select
                value={editDraft.relationship}
                onChange={(event) =>
                  setEditDraft((current) => ({
                    ...current,
                    relationship: normalizeRelationship(event.target.value),
                  }))
                }
              >
                {RELATIONSHIP_ORDER.map((relationship) => (
                  <option key={relationship} value={relationship}>
                    {relationship}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Groups
              <input
                value={editDraft.groups}
                onChange={(event) => setEditDraft((current) => ({ ...current, groups: event.target.value }))}
              />
            </label>
            <label className="full">
              Notes
              <textarea
                rows={3}
                value={editDraft.notes}
                onChange={(event) => setEditDraft((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
          </div>
          <div className="node-popup-actions">
            <button type="button" onClick={savePersonEdit}>
              Save changes
            </button>
          </div>
        </section>
      ) : null}
    </main>
  )
}
