import { useMemo, useState, useCallback, useEffect } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Heading1, FileText, Table2, Image as ImageIcon } from 'lucide-react'
import axios from 'axios'
import NodeDetails from './NodeDetails.jsx'
import './GraphPanel.css'

const TYPE_ICON = {
  heading: Heading1,
  paragraph: FileText,
  table: Table2,
  figure: ImageIcon,
}

function layoutNodes(nodes, edges) {
  const childrenMap = {}
  edges.forEach((e) => {
    childrenMap[e.source] = childrenMap[e.source] || []
    childrenMap[e.source].push(e.target)
  })

  let roots = nodes.filter((n) => n.type === 'heading')
  if (roots.length === 0) {
      roots = nodes.slice(0, 3) // Fallback 
  }

  const levelOf = {}
  const queue = roots.map((r) => ({ id: r.id, level: 0 }))
  const visited = new Set()

  while (queue.length) {
    const { id, level } = queue.shift()
    if (visited.has(id)) continue
    visited.add(id)
    levelOf[id] = level
    ;(childrenMap[id] || []).forEach((c) => queue.push({ id: c, level: level + 1 }))
  }

  const columns = {}
  const unconnected = []
  
  nodes.forEach((n) => {
    if (levelOf[n.id] !== undefined) {
      const level = levelOf[n.id]
      columns[level] = columns[level] || []
      columns[level].push(n)
    } else {
      unconnected.push(n)
    }
  })

  const positioned = {}
  let maxY = 0
  
  Object.entries(columns).forEach(([level, group]) => {
    group.forEach((n, i) => {
      const y = i * 110 + 30
      positioned[n.id] = {
        x: Number(level) * 260 + 40,
        y: y,
      }
      if (y > maxY) maxY = y
    })
  })

  // Grid layout for unconnected nodes to prevent vertical infinite stacking
  const startY = maxY > 0 ? maxY + 150 : 30
  const cols = Math.max(5, Math.ceil(Math.sqrt(unconnected.length)))
  
  unconnected.forEach((n, i) => {
    const row = Math.floor(i / cols)
    const col = i % cols
    positioned[n.id] = {
      x: col * 260 + 40,
      y: startY + row * 110
    }
  })

  return positioned
}

function GraphNode({ data }) {
  const Icon = TYPE_ICON[data.nodeType] || FileText
  return (
    <div className={`graph-node graph-node-${data.status}`}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Icon size={13} className="graph-node-icon" />
      <span className="graph-node-label">{data.label}</span>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}

const nodeTypes = { docNode: GraphNode }

export default function GraphPanel({ highlightedNodes = [], isMainView = false }) {
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] })
  const [documents, setDocuments] = useState([])
  const [activeDocId, setActiveDocId] = useState('')

  const formatTitle = (name) => {
    if (!name || name === 'Unknown') return name;
    let title = name.replace(/\.[^/.]+$/, "");
    title = title.replace(/[-_]/g, " ");
    return title.replace(/\b\w/g, l => l.toUpperCase());
  }

  const fetchGraph = useCallback(async () => {
    try {
      const res = await axios.get('/api/graph')
      setGraphData(res.data)
    } catch (err) {
      console.error("Failed to fetch graph data", err)
    }
    
    try {
      const statusRes = await axios.get('/api/status')
      setDocuments(statusRes.data.documents || [])
      setActiveDocId(statusRes.data.active_doc_id || '')
    } catch (err) {
      console.error("Failed to fetch status data", err)
    }
  }, [])

  const handleDocumentChange = async (e) => {
    const docId = e.target.value
    try {
      await axios.post('/api/switch', { doc_id: docId })
      window.dispatchEvent(new Event('graph-updated'))
    } catch (err) {
      alert("Failed to switch document: " + (err.response?.data?.detail || err.message))
    }
  }

  useEffect(() => {
    fetchGraph()
    window.addEventListener('graph-updated', fetchGraph)
    return () => window.removeEventListener('graph-updated', fetchGraph)
  }, [fetchGraph])

  const positions = useMemo(
    () => layoutNodes(graphData.nodes, graphData.edges),
    [graphData]
  )

  const flowNodes = useMemo(() => {
    return graphData.nodes.map((n) => {
      let status = 'normal'
      if (selectedNodeId === n.id) status = 'selected'
      else if (highlightedNodes.includes(n.id)) status = 'used'

      return {
        id: n.id,
        type: 'docNode',
        position: positions[n.id] || { x: Math.random() * 500, y: Math.random() * 500 },
        data: { label: n.label, nodeType: n.type, status },
      }
    })
  }, [positions, highlightedNodes, selectedNodeId, graphData.nodes])

  const flowEdges = useMemo(() => {
    return graphData.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: e.kind === 'semantic',
      style: {
        stroke: e.kind === 'semantic' ? 'var(--accent-2)' : 'var(--border)',
        strokeWidth: e.kind === 'semantic' ? 1.4 : 1.2,
        strokeDasharray: e.kind === 'semantic' ? '4 3' : undefined,
      },
    }))
  }, [graphData.edges])

  const handleNodeClick = useCallback((_, node) => {
    setSelectedNodeId(node.id)
  }, [])

  useEffect(() => {
    if (highlightedNodes.length) setSelectedNodeId(null)
  }, [highlightedNodes])

  const selectedNode = graphData.nodes.find((n) => n.id === selectedNodeId)
  const connections = selectedNode
    ? graphData.edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
    : []

  return (
    <section className={`graph-panel ${isMainView ? 'is-main-view' : ''}`}>
      <div className="graph-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span className="graph-panel-title">Graph Explorer</span>
          {isMainView && documents.length > 0 && (
            <select 
              value={activeDocId} 
              onChange={handleDocumentChange}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: '2px solid #000',
                background: '#fff',
                fontFamily: 'inherit',
                fontSize: '12px',
                fontWeight: '600',
                outline: 'none',
                cursor: 'pointer',
                maxWidth: '250px'
              }}
            >
              <option value="global">Global Knowledge Base</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {formatTitle(doc.name)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="graph-legend-inline">
          <span><i style={{ background: 'var(--node-blue)' }} /> normal</span>
          <span><i style={{ background: 'var(--node-green)' }} /> used</span>
          <span><i style={{ background: 'var(--node-yellow)' }} /> selected</span>
        </div>
      </div>

      <div className="graph-canvas">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          onPaneClick={() => setSelectedNodeId(null)}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color="rgba(0, 0, 0, 0.08)" gap={18} size={1.2} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            style={{ background: 'var(--surface)', borderLeft: '2px solid #000', borderTop: '2px solid #000' }}
            maskColor="rgba(250, 240, 230, 0.6)"
            nodeStrokeColor="#000000"
            nodeStrokeWidth={2}
            nodeColor={(n) => {
              if (n.data?.status === 'selected') return '#ff5e5b';
              if (n.data?.status === 'used') return '#ff9f43';
              return '#fdba74';
            }}
          />
        </ReactFlow>
      </div>

      {selectedNode && (
        <NodeDetails
          node={selectedNode}
          connections={connections}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </section>
  )
}
