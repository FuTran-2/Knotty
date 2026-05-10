import { useEffect, useMemo, useRef, useState } from 'react'
import { NodeDetail } from './NodeDetail'
import {
  ACCOUNT_NAME,
  ACCOUNT_PHOTO,
  RELATIONSHIP_COLORS,
  RELATIONSHIP_ORDER,
} from '../types/network'
import type { PersonNode, Relationship } from '../types/network'

type Position = { x: number; y: number; vx: number; vy: number }

type GraphViewProps = {
  visibleNodes: PersonNode[]
  selectedNode: PersonNode | null
  relationshipFilter: 'all' | Relationship
  onRelationshipFilterChange: (value: 'all' | Relationship) => void
  onSelectNode: (nodeId: string) => void
  onUpdateRelationship: (relationship: Relationship) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function GraphView({
  visibleNodes,
  selectedNode,
  relationshipFilter,
  onRelationshipFilterChange,
  onSelectNode,
  onUpdateRelationship,
}: GraphViewProps) {
  const [positions, setPositions] = useState<Record<string, Position>>({})
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const [graphSize, setGraphSize] = useState({ width: 800, height: 680 })

  const graphRef = useRef<SVGSVGElement | null>(null)
  const graphPaneRef = useRef<HTMLDivElement | null>(null)

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes])

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

  useEffect(() => {
    let frame = 0

    const animate = () => {
      setPositions((current) => {
        if (visibleNodes.length === 0) return current

        const next = { ...current }
        const centerX = graphSize.width / 2
        const centerY = graphSize.height / 2
        let changed = false

        visibleNodes.forEach((node, index) => {
          let pos = next[node.id]

          if (!pos) {
            const angle = (index / Math.max(visibleNodes.length, 1)) * Math.PI * 2
            const radius = Math.min(graphSize.width, graphSize.height) * 0.28
            pos = {
              x: centerX + Math.cos(angle) * radius,
              y: centerY + Math.sin(angle) * radius,
              vx: 0,
              vy: 0,
            }
            next[node.id] = pos
            changed = true
          }

          if (dragging?.id === node.id) return

          const angle = (index / Math.max(visibleNodes.length, 1)) * Math.PI * 2
          const radius = Math.min(graphSize.width, graphSize.height) * (0.18 + (index % 4) * 0.07)
          const targetX = centerX + Math.cos(angle) * radius
          const targetY = centerY + Math.sin(angle) * radius
          const pull = 0.015

          pos.vx += (targetX - pos.x) * pull
          pos.vy += (targetY - pos.y) * pull
          pos.vx *= 0.88
          pos.vy *= 0.88

          const nextX = clamp(pos.x + pos.vx, 28, graphSize.width - 28)
          const nextY = clamp(pos.y + pos.vy, 28, graphSize.height - 28)
          if (nextX !== pos.x || nextY !== pos.y) changed = true
          pos.x = nextX
          pos.y = nextY
        })

        Object.keys(next).forEach((id) => {
          if (!visibleNodeIds.has(id)) {
            delete next[id]
            changed = true
          }
        })

        return changed ? next : current
      })

      frame = window.requestAnimationFrame(animate)
    }

    frame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frame)
  }, [dragging?.id, graphSize.height, graphSize.width, visibleNodeIds, visibleNodes])

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!dragging || !graphRef.current) return
      const rect = graphRef.current.getBoundingClientRect()
      const x = event.clientX - rect.left - dragging.offsetX
      const y = event.clientY - rect.top - dragging.offsetY

      setPositions((current) => ({
        ...current,
        [dragging.id]: {
          ...(current[dragging.id] ?? {
            x: graphSize.width / 2,
            y: graphSize.height / 2,
            vx: 0,
            vy: 0,
          }),
          x: clamp(x, 28, graphSize.width - 28),
          y: clamp(y, 28, graphSize.height - 28),
          vx: 0,
          vy: 0,
        },
      }))
    }

    const onMouseUp = () => setDragging(null)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragging, graphSize.height, graphSize.width])

  const edges = useMemo(() => {
    const list: Array<{ id: string; a: string; b: string }> = visibleNodes.map((node) => ({
      id: `account-${node.id}`,
      a: 'account',
      b: node.id,
    }))

    const grouped: Record<string, string[]> = {}
    visibleNodes.forEach((node) => {
      node.groups.forEach((group) => {
        const key = group.toLowerCase()
        grouped[key] = grouped[key] ?? []
        grouped[key].push(node.id)
      })
    })

    Object.entries(grouped).forEach(([group, ids]) => {
      for (let i = 0; i < ids.length - 1; i += 1) {
        list.push({
          id: `${group}-${ids[i]}-${ids[i + 1]}-${i}`,
          a: ids[i],
          b: ids[i + 1],
        })
      }
    })

    return list
  }, [visibleNodes])

  const ringCenter = selectedNode ? positions[selectedNode.id] : undefined

  return (
    <main className="graph-pane" ref={graphPaneRef}>
      <div className="graph-toolbar">
        <div className="relationship-tabs">
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
        <span>{visibleNodes.length} nodes in view</span>
      </div>

      <svg ref={graphRef} viewBox={`0 0 ${graphSize.width} ${graphSize.height}`} className="graph-canvas">
        <defs>
          <radialGradient id="bg-glow" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#c7d2fe" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={graphSize.width} height={graphSize.height} fill="url(#bg-glow)" />

        {edges.map((edge) => {
          const a =
            edge.a === 'account'
              ? { x: graphSize.width / 2, y: graphSize.height / 2 }
              : positions[edge.a] ?? { x: graphSize.width / 2, y: graphSize.height / 2 }
          const b =
            edge.b === 'account'
              ? { x: graphSize.width / 2, y: graphSize.height / 2 }
              : positions[edge.b] ?? { x: graphSize.width / 2, y: graphSize.height / 2 }

          return (
            <line
              key={edge.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="rgba(148, 163, 184, 0.35)"
              strokeWidth={1.3}
            />
          )
        })}

        <g>
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

        {visibleNodes.map((node) => {
          const pos = positions[node.id] ?? { x: graphSize.width / 2, y: graphSize.height / 2 }
          const isSelected = node.id === selectedNode?.id

          return (
            <g
              key={node.id}
              onMouseDown={(event) => {
                if (!graphRef.current) return
                const rect = graphRef.current.getBoundingClientRect()
                setDragging({
                  id: node.id,
                  offsetX: event.clientX - rect.left - pos.x,
                  offsetY: event.clientY - rect.top - pos.y,
                })
              }}
              onClick={() => onSelectNode(node.id)}
              className="node-group"
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
        })}
      </svg>

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

      {selectedNode ? <NodeDetail selectedNode={selectedNode} /> : null}
    </main>
  )
}
