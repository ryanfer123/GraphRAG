import { useState, useEffect } from 'react'
import {
  UploadCloud,
  FileText,
  MessageSquare,
  Share2,
  Settings,
  Trash2,
  PlusCircle,
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

  const handleSwitch = async (docId, status) => {
    if (status !== 'indexed') {
      alert("This document graph is no longer in memory. Please re-upload it to explore.");
      return;
    }
    try {
      await axios.post('/api/switch', { doc_id: docId });
      fetchStatus();
      window.dispatchEvent(new Event('graph-updated'));
    } catch (err) {
      alert("Failed to switch document: " + (err.response?.data?.detail || err.message));
    }
  }

  const handleDelete = async (e, docId) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this document?")) return;
    try {
      await axios.delete(`/api/documents/${docId}`);
      fetchStatus();
      window.dispatchEvent(new Event('graph-updated'));
    } catch (err) {
      alert("Failed to delete document: " + (err.response?.data?.detail || err.message));
    }
  }

  const handleNewChat = async () => {
    if (!confirm("Are you sure you want to clear the current chat history?")) return;
    try {
      await axios.delete('/api/chat/history');
      window.dispatchEvent(new Event('chat-cleared'));
    } catch (err) {
      alert("Failed to clear chat: " + (err.response?.data?.detail || err.message));
    }
  }

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
                className={`doc-row ${doc.is_active ? 'is-active' : ''}`}
                onClick={() => handleSwitch(doc.id, doc.status)}
                style={{ cursor: doc.status === 'indexed' ? 'pointer' : 'not-allowed', opacity: doc.status === 'indexed' ? 1 : 0.6 }}
              >
                <FileText size={14} className="doc-row-icon" />
                <div className="doc-row-info">
                  <span className="doc-row-name">{doc.name}</span>
                  <span className="doc-row-meta">{doc.pages} pages</span>
                </div>
                {doc.is_active ? (
                  <span className="doc-badge doc-badge-active">ACTIVE</span>
                ) : (
                  <span className={`doc-badge doc-badge-${doc.status}`}>{doc.status}</span>
                )}
                <div 
                  className="doc-delete-btn" 
                  onClick={(e) => handleDelete(e, doc.id)}
                  title="Delete Document"
                >
                  <Trash2 size={14} />
                </div>
              </div>
            ))}
          </div>
        )}

        {active === 'history' && (
          <div className="sidebar-list">
            <p className="sidebar-list-title">Recent conversations</p>
            <button className="new-chat-btn" onClick={handleNewChat}>
              <PlusCircle size={14} /> New Chat
            </button>
            <div className="history-row is-active" style={{marginTop: '8px'}}>Current Session</div>
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
            <div className="setting-row"><span>Retrieval top-k</span><span className="mono">6</span></div>
            <div className="setting-row"><span>Reranker</span><span className="mono">ms-marco-L-6</span></div>
            <div className="setting-row"><span>Generation model</span><span className="mono">llama-3.3-70b</span></div>
            <div className="setting-row"><span>Graph hop depth</span><span className="mono">2</span></div>
          </div>
        )}
      </div>
    </aside>
  )
}
