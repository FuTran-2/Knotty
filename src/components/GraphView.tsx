import { useEffect, useMemo, useRef, useState } from 'react'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from 'd3-force'
import type { SimulationNodeDatum } from 'd3-force'
import {
  ACCOUNT_NAME,
  ACCOUNT_PHOTO,
  RELATIONSHIP_COLORS,
  RELATIONSHIP_ORDER,
  createAvatarUrl,
  normalizeRelationship,
} from '../types/network'
import type { PersonNode, Relationship } from '../types/network'
import { uploadPhoto } from '../lib/upload'

type Position = { x: number; y: number }
type FNode = SimulationNodeDatum & { id: string }
type FLink = { source: string; target: string }

type GraphViewProps = {
  visibleNodes: PersonNode[]
  selectedNode: PersonNode | null
  activeGroup: string
  /** All known group names (including standalone groups with no members yet) */
  allGroups: string[]
  onActiveGroupChange: (group: string) => void
  onSelectNode: (nodeId: string) => void
  onUpdateNode: (
    nodeId: string,
    patch: Partial<Pick<PersonNode, 'name' | 'photo' | 'contact' | 'notes' | 'relationship' | 'groups'>>,
  ) => void
  onDeleteNode: (nodeId: string) => void
}

export function GraphView({
  visibleNodes,
  selectedNode,
  activeGroup,
  allGroups,
  onActiveGroupChange,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
}: GraphViewProps) {
  // ── Canvas size ───────────────────────────────────────────────────────────
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 })

  // ── Viewport ──────────────────────────────────────────────────────────────
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [isDraggingNode, setIsDraggingNode] = useState(false)

  // ── Force-simulation positions (updated on every sim tick) ────────────────
  const [groupPositions, setGroupPositions] = useState<Record<string, Position>>({})
  const [personPositions, setPersonPositions] = useState<Record<string, Position>>({})

  // ── Simulation refs (mutable — mutations don't trigger re-render) ─────────
  const groupSimRef = useRef<ReturnType<typeof forceSimulation<FNode>> | null>(null)
  const personSimRef = useRef<ReturnType<typeof forceSimulation<FNode>> | null>(null)
  const groupSimNodesRef = useRef<FNode[]>([])
  const personSimNodesRef = useRef<FNode[]>([])

  // ── Edit popup ────────────────────────────────────────────────────────────
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({
    name: '',
    photo: '',
    contact: '',
    notes: '',
    relationship: 'Friend' as Relationship,
    groups: '',
  })
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const graphPaneRef = useRef<HTMLDivElement | null>(null)
  const panStartRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)
  const didPanRef = useRef(false)
  const zoomRef = useRef(zoom)
  const nodeDragRef = useRef<{
    nodeId: string
    startWorldX: number
    startWorldY: number
    startMx: number
    startMy: number
    moved: boolean
  } | null>(null)
  const nodeDragMovedRef = useRef(false)
  // whether we are currently in the person view (captured at drag-start)
  const dragIsPersonViewRef = useRef(false)

  const focusedGroup = activeGroup === 'all' ? null : activeGroup

  useEffect(() => { zoomRef.current = zoom }, [zoom])

  // ── ResizeObserver ────────────────────────────────────────────────────────
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

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
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
    allGroups.forEach((g) => { bucket[g.toLowerCase()] = [] })
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
  }, [visibleNodes, allGroups])

  const memberNodes = useMemo(() => {
    if (!focusedGroup) return []
    return visibleNodes.filter((n) => n.groups.some((g) => g.toLowerCase() === focusedGroup))
  }, [focusedGroup, visibleNodes])

  const displayedNodes = useMemo(
    () => (focusedGroup ? memberNodes : []),
    [focusedGroup, memberNodes],
  )

  const cx = graphSize.width / 2
  const cy = graphSize.height / 2

  // ── Group force simulation ─────────────────────────────────────────────────
  // Runs when in the "all groups" view. Each group node is connected to the
  // fixed center, repels other groups, and avoids overlap.
  useEffect(() => {
    groupSimRef.current?.stop()
    if (!graphSize.width || !graphSize.height || focusedGroup !== null) return
    if (groups.length === 0) { setGroupPositions({}); return }

    const radius = Math.min(graphSize.width, graphSize.height) * 0.28
    const linkDist = Math.max(radius * 0.8, 100)

    // Reuse existing positions so nodes don't jump when groups change
    const prevMap = new Map(groupSimNodesRef.current.map((n) => [n.id, n]))

    const simNodes: FNode[] = groups.map((item, i) => {
      const prev = prevMap.get(item.group)
      if (prev) return { id: item.group, x: prev.x ?? cx, y: prev.y ?? cy, fx: prev.fx, fy: prev.fy }
      const angle = (i / Math.max(groups.length, 1)) * Math.PI * 2 - Math.PI / 2
      return {
        id: item.group,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      }
    })

    const centerNode: FNode = { id: '__center__', x: cx, y: cy, fx: cx, fy: cy }
    const allSimNodes: FNode[] = [centerNode, ...simNodes]
    const links: FLink[] = simNodes.map((n) => ({ source: '__center__', target: n.id }))

    groupSimNodesRef.current = simNodes

    const sim = forceSimulation<FNode>(allSimNodes)
      .force('link', forceLink<FNode, FLink>(links).id((d) => d.id).distance(linkDist).strength(0.9))
      .force('charge', forceManyBody<FNode>().strength(-280))
      .force('collide', forceCollide<FNode>(62))
      .force('center', forceCenter<FNode>(cx, cy).strength(0.04))
      .on('tick', () => {
        const pos: Record<string, Position> = {}
        simNodes.forEach((n) => { if (n.x != null && n.y != null) pos[n.id] = { x: n.x, y: n.y } })
        setGroupPositions({ ...pos })
      })

    groupSimRef.current = sim
    return () => { sim.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.map((g) => g.group).join(','), cx, cy, graphSize.width, graphSize.height, focusedGroup])

  // ── Person force simulation ───────────────────────────────────────────────
  // Runs when inside a focused group. Person nodes spread around the center.
  useEffect(() => {
    personSimRef.current?.stop()
    if (!graphSize.width || !graphSize.height || focusedGroup === null) return
    if (displayedNodes.length === 0) { setPersonPositions({}); return }

    const radius = Math.min(graphSize.width, graphSize.height) * 0.3
    const linkDist = Math.max(radius * 0.75, 90)

    const simNodes: FNode[] = displayedNodes.map((node, i) => {
      const angle = (i / Math.max(displayedNodes.length, 1)) * Math.PI * 2 - Math.PI / 2
      return {
        id: node.id,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      }
    })

    const centerNode: FNode = { id: '__center__', x: cx, y: cy, fx: cx, fy: cy }
    const allSimNodes: FNode[] = [centerNode, ...simNodes]
    const links: FLink[] = simNodes.map((n) => ({ source: '__center__', target: n.id }))

    personSimNodesRef.current = simNodes

    const sim = forceSimulation<FNode>(allSimNodes)
      .force('link', forceLink<FNode, FLink>(links).id((d) => d.id).distance(linkDist).strength(0.9))
      .force('charge', forceManyBody<FNode>().strength(-220))
      .force('collide', forceCollide<FNode>(52))
      .force('center', forceCenter<FNode>(cx, cy).strength(0.04))
      .on('tick', () => {
        const pos: Record<string, Position> = {}
        simNodes.forEach((n) => { if (n.x != null && n.y != null) pos[n.id] = { x: n.x, y: n.y } })
        setPersonPositions({ ...pos })
      })

    personSimRef.current = sim
    return () => { sim.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedNodes.map((n) => n.id).join(','), cx, cy, graphSize.width, graphSize.height, focusedGroup])

  const editingPerson = useMemo(
    () => visibleNodes.find((n) => n.id === editingPersonId) ?? null,
    [editingPersonId, visibleNodes],
  )

  // ── Group navigation ──────────────────────────────────────────────────────
  const openGroup = (group: string) => { onActiveGroupChange(group) }

  const backToGroups = () => {
    onActiveGroupChange('all')
    setEditingPersonId(null)
  }

  // ── Edit popup helpers ────────────────────────────────────────────────────
  const beginEditing = (node: PersonNode) => {
    setPhotoError(null)
    setEditingPersonId(node.id)
    setEditDraft({
      name: node.name,
      photo: node.photo,
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
      photo: editDraft.photo || createAvatarUrl(editDraft.name.trim()),
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

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoUploading(true)
    setPhotoError(null)
    try {
      const url = await uploadPhoto(file, editingPersonId ?? undefined)
      setEditDraft((d) => ({ ...d, photo: url }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPhotoError(msg)
    } finally {
      setPhotoUploading(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  // ── Node drag ─────────────────────────────────────────────────────────────
  // Fixes the node in the simulation while dragging, then releases on mouse-up.
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string, worldPos: Position) => {
    e.stopPropagation()
    if (e.button !== 0) return

    nodeDragMovedRef.current = false
    dragIsPersonViewRef.current = focusedGroup !== null
    nodeDragRef.current = {
      nodeId,
      startWorldX: worldPos.x,
      startWorldY: worldPos.y,
      startMx: e.clientX,
      startMy: e.clientY,
      moved: false,
    }

    // Fix node in the active simulation so the force doesn't fight the drag
    const simNodes = dragIsPersonViewRef.current ? personSimNodesRef.current : groupSimNodesRef.current
    const simNode = simNodes.find((n) => n.id === nodeId)
    if (simNode) {
      simNode.fx = worldPos.x
      simNode.fy = worldPos.y
      const sim = dragIsPersonViewRef.current ? personSimRef.current : groupSimRef.current
      sim?.alphaTarget(0.3).restart()
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
      const newX = drag.startWorldX + dx / zoomRef.current
      const newY = drag.startWorldY + dy / zoomRef.current
      // Move the fixed position in the simulation
      if (simNode) { simNode.fx = newX; simNode.fy = newY }
      // Immediately reflect position in state for lag-free visual feedback
      if (dragIsPersonViewRef.current) {
        setPersonPositions((prev) => ({ ...prev, [nodeId]: { x: newX, y: newY } }))
      } else {
        setGroupPositions((prev) => ({ ...prev, [nodeId]: { x: newX, y: newY } }))
      }
    }

    const onUp = () => {
      nodeDragRef.current = null
      setIsDraggingNode(false)
      const sim = dragIsPersonViewRef.current ? personSimRef.current : groupSimRef.current
      sim?.alphaTarget(0)
      // If it was just a click (no real move), release the node back into the sim
      if (simNode && !nodeDragMovedRef.current) {
        simNode.fx = undefined
        simNode.fy = undefined
      }
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setTimeout(() => { nodeDragMovedRef.current = false }, 0)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Mouse wheel zoom ──────────────────────────────────────────────────────
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = graphPaneRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const newZoom = Math.min(4, Math.max(0.2, zoom * factor))
    const ratio = newZoom / zoom
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
      setTimeout(() => { didPanRef.current = false }, 0)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Zoom buttons ──────────────────────────────────────────────────────────
  const zoomIn = () => setZoom((z) => Math.min(4, +(z * 1.25).toFixed(4)))
  const zoomOut = () => setZoom((z) => Math.max(0.2, +(z / 1.25).toFixed(4)))
  const zoomReset = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  const ready = graphSize.width > 0 && graphSize.height > 0
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

            <rect width={graphSize.width} height={graphSize.height} fill="url(#bg-glow)" />

            <g transform={innerTransform}>
              {/* Edges */}
              {focusedGroup
                ? displayedNodes.map((node) => {
                    const pos = personPositions[node.id]
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
                    const pos = groupPositions[item.group]
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
                    const pos = personPositions[node.id]
                    if (!pos) return null
                    const isSelected = node.id === selectedNode?.id
                    return (
                      <g
                        key={`${node.id}-${focusedGroup}`}
                        className="node-group person-node-enter"
                        style={{
                          animationDelay: `${index * 40}ms`,
                          cursor: isDraggingNode && nodeDragRef.current?.nodeId === node.id ? 'grabbing' : 'grab',
                        }}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id, pos)}
                        onClick={(e) => {
                          e.stopPropagation()
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
                    const pos = groupPositions[item.group]
                    if (!pos) return null
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

          {/* Photo upload */}
          <div className="node-popup-photo">
            <img
              src={editDraft.photo || createAvatarUrl(editDraft.name)}
              alt={editDraft.name}
              className="node-popup-avatar"
            />
            <div className="node-popup-photo-actions">
              <button
                type="button"
                className="photo-upload-btn"
                disabled={photoUploading}
                onClick={() => photoInputRef.current?.click()}
              >
                {photoUploading ? (
                  <><span className="photo-upload-spinner" /> Processing…</>
                ) : (
                  'Upload photo'
                )}
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePhotoFileChange}
              />
              {editDraft.photo && (
                <button
                  type="button"
                  className="photo-remove-btn"
                  onClick={() => setEditDraft((d) => ({ ...d, photo: '' }))}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          {photoError && (
            <div className="photo-upload-error">
              Upload failed: {photoError}
            </div>
          )}

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
