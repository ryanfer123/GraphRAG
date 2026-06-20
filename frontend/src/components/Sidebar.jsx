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
  { id: 'settings', label: 'Pipeline Config', icon: Settings },
]

export default function Sidebar({ active, setActive }) {
  const [documents, setDocuments] = useState([])
  const [activeDocId, setActiveDocId] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [docToDelete, setDocToDelete] = useState(null)

  const showError = (msg) => {
    setErrorMsg(msg)
    if (window.errorTimeout) clearTimeout(window.errorTimeout)
    window.errorTimeout = setTimeout(() => setErrorMsg(null), 4000)
  }

  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)

  const fetchStatus = async () => {
    try {
      const res = await axios.get('/api/status')
      setDocuments(res.data.documents || [])
      setActiveDocId(res.data.active_doc_id)
    } catch (err) {
      console.error("Failed to fetch status", err)
    }
  }

  const fetchSessions = async () => {
    try {
      const res = await axios.get('/api/chat/sessions')
      setSessions(res.data.sessions || [])
      setActiveSessionId(res.data.active_session_id)
    } catch (err) {
      console.error("Failed to fetch sessions", err)
    }
  }

  useEffect(() => {
    fetchStatus()
    fetchSessions()
    const handleGraphUpdated = () => {
      fetchStatus()
      fetchSessions()
    }
    const handleChatUpdated = () => {
      fetchSessions()
    }
    window.addEventListener('graph-updated', handleGraphUpdated)
    window.addEventListener('chat-updated', handleChatUpdated)
    return () => {
      window.removeEventListener('graph-updated', handleGraphUpdated)
      window.removeEventListener('chat-updated', handleChatUpdated)
    }
  }, [])

  const formatTitle = (name) => {
    if (!name || name === 'Unknown') return name;
    let title = name.replace(/\.[^/.]+$/, "");
    title = title.replace(/[-_]/g, " ");
    return title.replace(/\b\w/g, l => l.toUpperCase());
  }

  const handleSwitch = async (docId, status) => {
    if (status !== 'indexed') {
      showError("This document graph is no longer in memory. Please re-upload it to explore.");
      return;
    }
    try {
      await axios.post('/api/switch', { doc_id: docId });
      fetchStatus();
      window.dispatchEvent(new Event('graph-updated'));
    } catch (err) {
      showError("Failed to switch document: " + (err.response?.data?.detail || err.message));
    }
  }

  const confirmDelete = async (docId) => {
    try {
      await axios.delete(`/api/documents/${docId}`);
      setDocToDelete(null);
      fetchStatus();
      window.dispatchEvent(new Event('graph-updated'));
    } catch (err) {
      showError("Failed to delete document: " + (err.response?.data?.detail || err.message));
      setDocToDelete(null);
    }
  }

  const handleDelete = (e, docId) => {
    e.stopPropagation();
    setDocToDelete(docId);
  }

  const handleNewChat = async () => {
    try {
      await axios.post('/api/chat/session/new');
      fetchSessions();
      window.dispatchEvent(new Event('chat-cleared'));
      window.dispatchEvent(new Event('graph-updated'));
    } catch (err) {
      showError("Failed to start new chat: " + (err.response?.data?.detail || err.message));
    }
  }

  const handleSwitchSession = async (sessionId, docId) => {
    try {
      await axios.post('/api/chat/session/switch', { session_id: sessionId, doc_id: docId });
      fetchSessions();
      fetchStatus(); // Need to fetch status since active doc may have changed
      window.dispatchEvent(new Event('chat-cleared'));
      window.dispatchEvent(new Event('graph-updated'));
    } catch (err) {
      showError("Failed to switch session: " + (err.response?.data?.detail || err.message));
    }
  }

  return (
    <aside className="sidebar">
      {errorMsg && (
        <div className="sidebar-toast">
          {errorMsg}
        </div>
      )}
      
      {docToDelete && (
        <div className="sidebar-confirm-overlay">
          <div className="sidebar-confirm-box">
            <p>Delete this document?</p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button className="confirm-btn danger" onClick={() => confirmDelete(docToDelete)}>Delete</button>
              <button className="confirm-btn cancel" onClick={() => setDocToDelete(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

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
            <div 
              className={`doc-row ${activeDocId === 'global' ? 'is-active' : ''}`}
              onClick={() => handleSwitch('global', 'indexed')}
              style={{ cursor: 'pointer', marginBottom: '8px', border: '1px solid var(--border)' }}
            >
              <FileText size={14} className="doc-row-icon" style={{color: 'var(--primary)'}} />
              <div className="doc-row-info">
                <span className="doc-row-name" style={{fontWeight: 600}}>Global Knowledge Base</span>
                <span className="doc-row-meta">Search across all documents</span>
              </div>
            </div>
            
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
                  <span className="doc-row-name">{formatTitle(doc.name)}</span>
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
            {sessions.map((session, index) => (
              <div 
                key={session.id}
                className={`history-row ${session.id === activeSessionId ? 'is-active' : ''}`}
                onClick={() => handleSwitchSession(session.id, session.doc_id)}
                style={{ cursor: 'pointer', marginTop: index === 0 ? '8px' : '4px', display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 12px' }}
              >
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {new Date(session.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                <span style={{ fontSize: '13px', fontWeight: '500', color: session.id === activeSessionId ? 'black' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {formatTitle(session.doc_name)}
                </span>
              </div>
            ))}
            {sessions.length === 0 && (
              <div className="sidebar-hint" style={{margin: '0.5rem 1rem'}}>No sessions yet. Send a message to start!</div>
            )}
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
