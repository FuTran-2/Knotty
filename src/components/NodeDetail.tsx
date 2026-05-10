import type { PersonNode } from '../types/network'

type NodeDetailProps = {
  selectedNode: PersonNode
}

export function NodeDetail({ selectedNode }: NodeDetailProps) {
  return (
    <section className="node-detail">
      <img src={selectedNode.photo} alt={selectedNode.name} />
      <div>
        <h3>{selectedNode.name}</h3>
        <p>{selectedNode.contact || 'No contact info yet'}</p>
        <p>{selectedNode.notes || 'No notes yet'}</p>
        <div className="detail-meta">
          <span>{selectedNode.relationship}</span>
          <span>{selectedNode.groups.join(', ') || 'ungrouped'}</span>
          <span>{selectedNode.source === 'linkedin' ? 'LinkedIn import' : 'Manual'}</span>
        </div>
      </div>
    </section>
  )
}
