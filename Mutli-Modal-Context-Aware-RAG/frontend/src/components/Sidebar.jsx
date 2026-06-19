import { useState, useEffect } from 'react'
import {
  UploadCloud,
  FileText,
  MessageSquare,
  Share2,
  Settings,
} from 'lucide-react'
import axios from 'axios'
import UploadCard from './UploadCard.jsx'
import './Sidebar.css'

const NAV_ITEMS = [
  { id: 'upload', label: 'Upload Documents', icon: UploadCloud },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'history', label: 'Chat History', icon: MessageSquare },
  { id: 'graph', label: 'Graph Explorer', icon: Share2 },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({ active, setActive }) {
  const [documents, setDocuments] = useState([])

  const fetchStatus = async () => {
    try {
      const res = await axios.get('/api/status')
      setDocuments(res.data.documents || [])
    } catch (err) {
      console.error("Failed to fetch status", err)
    }
  }

  useEffect(() => {
    fetchStatus()
    window.addEventListener('graph-updated', fetchStatus)
    return () => window.removeEventListener('graph-updated', fetchStatus)
  }, [])

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`sidebar-item ${active === id ? 'is-active' : ''}`}
            onClick={() => setActive(id)}
          >
            <Icon size={16} strokeWidth={2} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-panel">
        {active === 'upload' && <UploadCard />}

        {active === 'documents' && (
          <div className="sidebar-list">
            <p className="sidebar-list-title">Indexed documents</p>
            {documents.length === 0 && <div className="sidebar-hint" style={{margin: '0.5rem 1rem'}}>No documents uploaded yet.</div>}
            {documents.map((doc) => (
              <div 
                key={doc.id} 
                className="doc-row"
                onClick={() => alert("Document switching is coming in v2! For now, please re-upload a document to set it as the active graph context.")}
              >
                <FileText size={14} className="doc-row-icon" />
                <div className="doc-row-info">
                  <span className="doc-row-name">{doc.name}</span>
                  <span className="doc-row-meta">{doc.pages} pages</span>
                </div>
                <span className={`doc-badge doc-badge-${doc.status}`}>{doc.status}</span>
              </div>
            ))}
          </div>
        )}

        {active === 'history' && (
          <div className="sidebar-list">
            <p className="sidebar-list-title">Recent conversations</p>
            <div className="history-row is-active">Current Session</div>
            <div className="sidebar-hint" style={{margin: '0.5rem 1rem'}}>Chat history persists per session.</div>
          </div>
        )}

        {active === 'graph' && (
          <div className="sidebar-list">
            <p className="sidebar-list-title">Graph legend</p>
            <div className="legend-row"><span className="legend-dot" style={{ background: 'var(--node-blue)' }} /> Normal node</div>
            <div className="legend-row"><span className="legend-dot" style={{ background: 'var(--node-green)' }} /> Used in answer</div>
            <div className="legend-row"><span className="legend-dot" style={{ background: 'var(--node-yellow)' }} /> Selected</div>
            <p className="sidebar-hint">Click a node in the graph panel to inspect its content, page, and connections.</p>
          </div>
        )}

        {active === 'settings' && (
          <div className="sidebar-list">
            <p className="sidebar-list-title">Pipeline settings</p>
            <div className="setting-row"><span>Retrieval top-k</span><span className="mono">8</span></div>
            <div className="setting-row"><span>Reranker</span><span className="mono">bge-reranker-base</span></div>
            <div className="setting-row"><span>Generation model</span><span className="mono">llama-3-70b</span></div>
            <div className="setting-row"><span>Graph hop depth</span><span className="mono">1</span></div>
          </div>
        )}
      </div>
    </aside>
  )
}
