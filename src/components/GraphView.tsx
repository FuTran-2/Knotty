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
  onActiveGroupChange: (group: string) => void
  onSelectNode: (nodeId: string) => void
  onUpdateNode: (
    nodeId: string,
    patch: Partial<Pick<PersonNode, 'name' | 'contact' | 'notes' | 'relationship' | 'groups'>>,
  ) => void
  onDeleteNode: (nodeId: string) => void
}

export function GraphView({
  visibleNodes,
  selectedNode,
  activeGroup,
  onActiveGroupChange,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
}: GraphViewProps) {
  // ── Measured canvas size ──────────────────────────────────────────────────
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 })

  // ── Viewport: pan (screen-pixel offset) + zoom factor ────────────────────
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [isDraggingNode, setIsDraggingNode] = useState(false)

  // ── Per-node dragged positions (world coords, override computed layout) ───
  const [nodeOverrides, setNodeOverrides] = useState<Record<string, Position>>({})

  // ── Edit popup ────────────────────────────────────────────────────────────
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({
    name: '',
    contact: '',
    notes: '',
    relationship: 'Friend' as Relationship,
    groups: '',
  })

  const graphPaneRef = useRef<HTMLDivElement | null>(null)
  // tracks pan-drag start state
  const panStartRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)
  // suppress click after a pan drag
  const didPanRef = useRef(false)
  // zoom ref so node-drag closure always reads the current value
  const zoomRef = useRef(zoom)
  // node drag state ref
  const nodeDragRef = useRef<{
    nodeId: string
    startWorldX: number
    startWorldY: number
    startMx: number
    startMy: number
    moved: boolean
  } | null>(null)
  // suppress click on node after it was dragged
  const nodeDragMovedRef = useRef(false)

  const focusedGroup = activeGroup === 'all' ? null : activeGroup

  // keep zoomRef in sync so drag closures see the latest zoom
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  // Reset node overrides whenever the focused group changes
  useEffect(() => { setNodeOverrides({}) }, [focusedGroup])

  // ── ResizeObserver: measure pane and update graphSize ─────────────────────
  useEffect(() => {
    const pane = graphPaneRef.current
    if (!pane) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setGraphSize({ width, height })
    })
    observer.observe(pane)
    return () => observer.disconnect()
  }, [])

  // ── Keyboard shortcuts: Ctrl/Cmd +  -  0 ─────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        setZoom((z) => Math.min(4, +(z * 1.2).toFixed(4)))
      } else if (e.key === '-') {
        e.preventDefault()
        setZoom((z) => Math.max(0.2, +(z / 1.2).toFixed(4)))
      } else if (e.key === '0') {
        e.preventDefault()
        setZoom(1)
        setPan({ x: 0, y: 0 })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Derived data ──────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const bucket: Record<string, string[]> = {}
    visibleNodes.forEach((node) => {
      node.groups.forEach((g) => {
        const key = g.toLowerCase()
        bucket[key] = bucket[key] ?? []
        bucket[key].push(node.id)
      })
    })
    return Object.entries(bucket)
      .map(([group, nodeIds]) => ({ group, nodeIds }))
      .sort((a, b) => b.nodeIds.length - a.nodeIds.length)
  }, [visibleNodes])

  const memberNodes = useMemo(() => {
    if (!focusedGroup) return []
    return visibleNodes.filter((n) => n.groups.some((g) => g.toLowerCase() === focusedGroup))
  }, [focusedGroup, visibleNodes])

  const displayedNodes = useMemo(
    () => (focusedGroup ? memberNodes : []),
    [focusedGroup, memberNodes],
  )

  // ── Node positions in world coordinates ──────────────────────────────────
  const cx = graphSize.width / 2
  const cy = graphSize.height / 2

  const groupPositions = useMemo<Record<string, Position>>(() => {
    if (!graphSize.width) return {}
    const radius = Math.min(graphSize.width, graphSize.height) * 0.28
    const positions: Record<string, Position> = {}
    groups.forEach((item, i) => {
      const angle = (i / Math.max(groups.length, 1)) * Math.PI * 2 - Math.PI / 2
      positions[item.group] = {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      }
    })
    return positions
  }, [cx, cy, graphSize.width, graphSize.height, groups])

  const personPositions = useMemo<Record<string, Position>>(() => {
    if (!graphSize.width) return {}
    const radius = Math.min(graphSize.width, graphSize.height) * 0.3
    const positions: Record<string, Position> = {}
    displayedNodes.forEach((node, i) => {
      const angle = (i / Math.max(displayedNodes.length, 1)) * Math.PI * 2 - Math.PI / 2
      positions[node.id] = {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      }
    })
    return positions
  }, [displayedNodes, cx, cy, graphSize.width, graphSize.height])

  const editingPerson = useMemo(
    () => visibleNodes.find((n) => n.id === editingPersonId) ?? null,
    [editingPersonId, visibleNodes],
  )

  // ── Group navigation ──────────────────────────────────────────────────────
  const openGroup = (group: string) => {
    onActiveGroupChange(group)
  }

  const backToGroups = () => {
    onActiveGroupChange('all')
    setEditingPersonId(null)
  }

  // ── Edit popup helpers ────────────────────────────────────────────────────
  const beginEditing = (node: PersonNode) => {
    setEditingPersonId(node.id)
    setEditDraft({
      name: node.name,
      contact: node.contact,
      notes: node.notes,
      relationship: node.relationship,
      groups: node.groups.join(', '),
    })
  }

  const saveEdit = () => {
    if (!editingPersonId) return
    onUpdateNode(editingPersonId, {
      name: editDraft.name.trim(),
      contact: editDraft.contact.trim(),
      notes: editDraft.notes.trim(),
      relationship: normalizeRelationship(editDraft.relationship),
      groups: editDraft.groups
        .split(',')
        .map((g) => g.trim().toLowerCase())
        .filter(Boolean),
    })
    setEditingPersonId(null)
  }

  // ── Node drag ─────────────────────────────────────────────────────────────
  // worldPos: current world position of the node being pressed
  const handleNodeMouseDown = (
    e: React.MouseEvent,
    nodeId: string,
    worldPos: Position,
  ) => {
    e.stopPropagation() // prevent background pan from activating
    if (e.button !== 0) return

    nodeDragMovedRef.current = false
    nodeDragRef.current = {
      nodeId,
      startWorldX: worldPos.x,
      startWorldY: worldPos.y,
      startMx: e.clientX,
      startMy: e.clientY,
      moved: false,
    }

    const onMove = (ev: MouseEvent) => {
      const drag = nodeDragRef.current
      if (!drag) return
      const dx = ev.clientX - drag.startMx
      const dy = ev.clientY - drag.startMy
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        drag.moved = true
        nodeDragMovedRef.current = true
        setIsDraggingNode(true)
      }
      // Convert screen-pixel delta → world-coordinate delta (account for zoom)
      setNodeOverrides((prev) => ({
        ...prev,
        [drag.nodeId]: {
          x: drag.startWorldX + dx / zoomRef.current,
          y: drag.startWorldY + dy / zoomRef.current,
        },
      }))
    }

    const onUp = () => {
      nodeDragRef.current = null
      setIsDraggingNode(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      // Let the click event fire first, then clear the flag
      setTimeout(() => { nodeDragMovedRef.current = false }, 0)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Mouse wheel zoom (zoom centered on cursor position) ───────────────────
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = graphPaneRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const newZoom = Math.min(4, Math.max(0.2, zoom * factor))
    const ratio = newZoom / zoom
    // Keep world point under cursor fixed
    setPan((p) => ({
      x: mx - cx - (mx - cx - p.x) * ratio,
      y: my - cy - (my - cy - p.y) * ratio,
    }))
    setZoom(newZoom)
  }

  // ── Background pan drag ───────────────────────────────────────────────────
  const handleBgMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    didPanRef.current = false
    panStartRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
    setIsPanning(true)

    const onMove = (ev: MouseEvent) => {
      if (!panStartRef.current) return
      const dx = ev.clientX - panStartRef.current.mx
      const dy = ev.clientY - panStartRef.current.my
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPanRef.current = true
      setPan({ x: panStartRef.current.px + dx, y: panStartRef.current.py + dy })
    }
    const onUp = () => {
      panStartRef.current = null
      setIsPanning(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      // Let the click event fire first, then clear the flag
      setTimeout(() => { didPanRef.current = false }, 0)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Zoom buttons ──────────────────────────────────────────────────────────
  const zoomIn = () => setZoom((z) => Math.min(4, +(z * 1.25).toFixed(4)))
  const zoomOut = () => setZoom((z) => Math.max(0.2, +(z / 1.25).toFixed(4)))
  const zoomReset = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  // ── Don't render graph until pane is measured ─────────────────────────────
  const ready = graphSize.width > 0 && graphSize.height > 0

  // ── Inner group SVG transform ─────────────────────────────────────────────
  // Applies pan + zoom centered around the canvas center (cx, cy)
  const innerTransform = `translate(${cx + pan.x} ${cy + pan.y}) scale(${zoom}) translate(${-cx} ${-cy})`

  return (
    <main
      className={`graph-pane${isPanning ? ' is-panning' : ''}${isDraggingNode ? ' is-node-dragging' : ''}`}
      ref={graphPaneRef}
      onWheel={handleWheel}
    >
      {/* Floating controls */}
      <div className="graph-floating-controls">
        {focusedGroup && (
          <button type="button" onClick={backToGroups} title="Back to groups">
            ← Back
          </button>
        )}
        <button type="button" onClick={zoomOut} title="Zoom out (Ctrl -)">−</button>
        <button type="button" onClick={zoomReset} title="Reset zoom (Ctrl 0)">
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" onClick={zoomIn} title="Zoom in (Ctrl +)">+</button>
      </div>

      {/* SVG graph canvas */}
      <svg
        className={`graph-canvas${isPanning ? ' panning' : ''}`}
        onMouseDown={handleBgMouseDown}
      >
        {ready && (
          <>
            <defs>
              <radialGradient id="bg-glow" cx="50%" cy="50%">
                <stop offset="0%" stopColor="#c7d2fe" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Static background glow — not affected by pan/zoom */}
            <rect width={graphSize.width} height={graphSize.height} fill="url(#bg-glow)" />

            {/* All graph content inside the pan/zoom group */}
            <g transform={innerTransform}>
              {/* Edges — follow overridden positions */}
              {focusedGroup
                ? displayedNodes.map((node) => {
                    const pos = nodeOverrides[node.id] ?? personPositions[node.id]
                    if (!pos) return null
                    return (
                      <line
                        key={`edge-${node.id}`}
                        x1={cx} y1={cy} x2={pos.x} y2={pos.y}
                        stroke="rgba(148, 163, 184, 0.35)"
                        strokeWidth={1.3}
                      />
                    )
                  })
                : groups.map((item) => {
                    const pos = nodeOverrides[item.group] ?? groupPositions[item.group]
                    if (!pos) return null
                    return (
                      <line
                        key={`edge-${item.group}`}
                        x1={cx} y1={cy} x2={pos.x} y2={pos.y}
                        stroke="rgba(148, 163, 184, 0.35)"
                        strokeWidth={1.3}
                      />
                    )
                  })}

              {/* Center "You" node */}
              <g className="node-group" onClick={backToGroups}>
                <circle cx={cx} cy={cy} r={32} className="account-node" />
                <image
                  href={ACCOUNT_PHOTO}
                  x={cx - 20} y={cy - 20}
                  width={40} height={40}
                  clipPath="circle(20px at center)"
                />
                <text x={cx} y={cy + 52} textAnchor="middle" className="node-label">
                  {ACCOUNT_NAME}
                </text>
              </g>

              {/* Group or person nodes */}
              {focusedGroup
                ? displayedNodes.map((node, index) => {
                    // Use dragged position if available, else computed layout
                    const basePos = personPositions[node.id]
                    if (!basePos) return null
                    const pos = nodeOverrides[node.id] ?? basePos
                    const isSelected = node.id === selectedNode?.id
                    return (
                      <g
                        key={`${node.id}-${focusedGroup}`}
                        className="node-group person-node-enter"
                        style={{ animationDelay: `${index * 40}ms`, cursor: isDraggingNode && nodeDragRef.current?.nodeId === node.id ? 'grabbing' : 'grab' }}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id, pos)}
                        onClick={(e) => {
                          e.stopPropagation()
                          // Ignore click if the node was dragged
                          if (nodeDragMovedRef.current || didPanRef.current) return
                          onSelectNode(node.id)
                          beginEditing(node)
                        }}
                      >
                        <circle
                          cx={pos.x} cy={pos.y}
                          r={isSelected ? 28 : 24}
                          className="node-glow"
                          style={{ stroke: RELATIONSHIP_COLORS[node.relationship] }}
                        />
                        <image
                          href={node.photo}
                          x={pos.x - 18} y={pos.y - 18}
                          width={36} height={36}
                          clipPath="circle(18px at center)"
                        />
                        <text x={pos.x} y={pos.y + 36} textAnchor="middle" className="node-label">
                          {node.name}
                        </text>
                      </g>
                    )
                  })
                : groups.map((item) => {
                    const basePos = groupPositions[item.group]
                    if (!basePos) return null
                    const pos = nodeOverrides[item.group] ?? basePos
                    return (
                      <g
                        key={item.group}
                        className="node-group group-node"
                        style={{ cursor: isDraggingNode && nodeDragRef.current?.nodeId === item.group ? 'grabbing' : 'grab' }}
                        onMouseDown={(e) => handleNodeMouseDown(e, item.group, pos)}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (nodeDragMovedRef.current || didPanRef.current) return
                          openGroup(item.group)
                        }}
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
            </g>
          </>
        )}
      </svg>

      {/* Edit popup */}
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
                onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </label>
            <label>
              Contact
              <input
                value={editDraft.contact}
                onChange={(e) => setEditDraft((d) => ({ ...d, contact: e.target.value }))}
              />
            </label>
            <label>
              Relationship
              <select
                value={editDraft.relationship}
                onChange={(e) =>
                  setEditDraft((d) => ({ ...d, relationship: normalizeRelationship(e.target.value) }))
                }
              >
                {RELATIONSHIP_ORDER.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              Groups
              <input
                value={editDraft.groups}
                onChange={(e) => setEditDraft((d) => ({ ...d, groups: e.target.value }))}
              />
            </label>
            <label className="full">
              Notes
              <textarea
                rows={3}
                value={editDraft.notes}
                onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
              />
            </label>
          </div>
          <div className="node-popup-actions">
            <button
              type="button"
              className="danger"
              onClick={() => {
                onDeleteNode(editingPersonId!)
                setEditingPersonId(null)
              }}
            >
              Remove
            </button>
            <button type="button" onClick={saveEdit}>
              Save changes
            </button>
          </div>
        </section>
      ) : null}
    </main>
  )
}
