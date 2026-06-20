import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Heading1, FileText, Table2, Image as ImageIcon, ChevronDown } from 'lucide-react'
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
  // 1. Find structural edges
  const structNext = {}
  const structPrev = {}
  edges.forEach((e) => {
    if (e.kind === 'structural') {
      structNext[e.source] = e.target
      structPrev[e.target] = e.source
    }
  })

  // 2. Find the start of the structural chain (node with no incoming structural edge)
  // If there are multiple components, we'll find multiple starts
  const starts = nodes.filter(n => !structPrev[n.id])
  
  // 3. Build the ordered list of nodes
  const orderedNodes = []
  const visited = new Set()

  const traverse = (startId) => {
    let curr = startId
    while (curr && !visited.has(curr)) {
      visited.add(curr)
      const node = nodes.find(n => n.id === curr)
      if (node) orderedNodes.push(node)
      curr = structNext[curr]
    }
  }

  // Traverse from true starts
  starts.forEach(n => traverse(n.id))

  // Any nodes that were missed (e.g. part of a cycle or isolated)
  nodes.forEach(n => {
    if (!visited.has(n.id)) {
      traverse(n.id)
    }
  })

  // 4. Lay out the ordered nodes in a wrapping grid
  const positioned = {}
  const cols = 6 // Number of nodes per row
  const xSpacing = 260
  const ySpacing = 120
  
  orderedNodes.forEach((n, i) => {
    const row = Math.floor(i / cols)
    const col = i % cols
    positioned[n.id] = {
      x: col * xSpacing + 40,
      y: row * ySpacing + 40
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
  const [showPicker, setShowPicker] = useState(false)

  const formatTitle = (name) => {
    if (!name || name === 'Unknown') return name;
    let title = name.replace(/\.[^/.]+$/, "");
    title = title.replace(/[-_]/g, " ");
    return title.replace(/\b\w/g, l => l.toUpperCase());
  }

  const [errorMsg, setErrorMsg] = useState(null)
  const graphCacheRef = useRef({})

  const fetchGraph = useCallback(async () => {
    try {
      const statusRes = await axios.get('/api/status')
      setDocuments(statusRes.data.documents || [])
      const currentDocId = statusRes.data.active_doc_id || ''
      setActiveDocId(currentDocId)

      if (currentDocId && graphCacheRef.current[currentDocId]) {
        setGraphData(graphCacheRef.current[currentDocId])
        return // Use cached graph
      }

      const res = await axios.get('/api/graph')
      setGraphData(res.data)
      if (currentDocId && res.data.nodes.length > 0) {
        graphCacheRef.current[currentDocId] = res.data
      }
    } catch (err) {
      console.error("Failed to fetch graph/status data", err)
    }
  }, [])

  const handleDocumentChange = async (e) => {
    const docId = e.target.value
    try {
      await axios.post('/api/switch', { doc_id: docId })
      window.dispatchEvent(new Event('graph-updated'))
    } catch (err) {
      setErrorMsg("Document graph not currently in memory. Please re-upload.")
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
            <div style={{ position: 'relative' }}>
              <div 
                onClick={() => setShowPicker(!showPicker)}
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
                  maxWidth: '250px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '2px 2px 0px #000'
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeDocId === 'global' ? 'Global Knowledge Base' : formatTitle(documents.find(d => d.id === activeDocId)?.name || 'Select Document')}
                </span>
                <ChevronDown size={14} style={{ flexShrink: 0 }} />
              </div>
              {showPicker && (
                <div style={{ position: 'absolute', top: '100%', left: '0', marginTop: '4px', background: '#fff', border: '2px solid #000', borderRadius: '4px', boxShadow: '4px 4px 0px #000', zIndex: 50, width: 'max-content', minWidth: '100%', display: 'flex', flexDirection: 'column', maxHeight: '200px', overflowY: 'auto' }}>
                  <div 
                    onClick={() => { handleDocumentChange({target: {value: 'global'}}); setShowPicker(false); }}
                    style={{ padding: '6px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #eee', background: activeDocId === 'global' ? '#f0f0f0' : '#fff', fontWeight: activeDocId === 'global' ? 600 : 400 }}
                    onMouseEnter={(e) => e.target.style.background = '#f9f9f9'}
                    onMouseLeave={(e) => e.target.style.background = activeDocId === 'global' ? '#f0f0f0' : '#fff'}
                  >
                    Global Knowledge Base
                  </div>
                  {documents.map((doc) => (
                    <div 
                      key={doc.id}
                      onClick={() => { handleDocumentChange({target: {value: doc.id}}); setShowPicker(false); }}
                      style={{ padding: '6px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #eee', background: activeDocId === doc.id ? '#f0f0f0' : '#fff', fontWeight: activeDocId === doc.id ? 600 : 400 }}
                      onMouseEnter={(e) => e.target.style.background = '#f9f9f9'}
                      onMouseLeave={(e) => e.target.style.background = activeDocId === doc.id ? '#f0f0f0' : '#fff'}
                    >
                      {formatTitle(doc.name)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="graph-legend-inline">
          <span><i style={{ background: 'var(--node-normal)' }} /> normal</span>
          <span><i style={{ background: 'var(--node-used)' }} /> used</span>
          <span><i style={{ background: 'var(--node-selected)' }} /> selected</span>
        </div>
      </div>

      <div className="graph-canvas">
        {graphData.nodes.length === 0 && (
          <div className="graph-empty-state">
            <h3>No Graph Available</h3>
            <p>Upload a document to see its knowledge graph.</p>
          </div>
        )}
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
      {errorMsg && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
          <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: 'var(--radius-lg)', border: '2px solid #000', boxShadow: '4px 4px 0px #000', maxWidth: '400px', width: '90%' }}>
            <h3 style={{ marginTop: 0, marginBottom: '12px', color: 'var(--text)' }}>Action Failed</h3>
            <p style={{ marginBottom: '20px', color: 'var(--text-dim)', fontSize: '14px', lineHeight: 1.5 }}>
              {errorMsg}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setErrorMsg(null)}
                style={{ padding: '8px 16px', background: 'var(--accent-2)', color: '#fff', border: '2px solid #000', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', boxShadow: '2px 2px 0px #000' }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
