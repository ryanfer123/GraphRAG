import { X, Hash, Link2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import './NodeDetails.css'

export default function NodeDetails({ node, connections, onClose }) {
  return (
    <AnimatePresence>
      <motion.div
        className="node-details"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.2 }}
      >
        <div className="node-details-header">
          <span className={`node-details-type type-${node.type}`}>{node.type}</span>
          <button className="node-details-close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <h4 className="node-details-title">{node.label}</h4>

        <div className="node-details-meta">
          <span className="mono"><Hash size={11} /> Page {node.page}</span>
          <span className="mono"><Link2 size={11} /> {connections.length} connections</span>
        </div>

        <p className="node-details-content">{node.content}</p>

        {connections.length > 0 && (
          <div className="node-details-connections">
            <p className="node-details-sub">Connections</p>
            {connections.map((c) => (
              <div key={c.id} className="connection-row">
                <span className={`connection-kind kind-${c.kind}`}>{c.kind}</span>
                <span className="mono">{c.source} → {c.target}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
