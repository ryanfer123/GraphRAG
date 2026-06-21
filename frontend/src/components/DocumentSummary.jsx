import { useState, useEffect } from 'react'
import { FileText, Sparkles, CheckCircle2, Tag, Layers, AlertCircle, RefreshCw, ChevronRight, ChevronLeft, ChevronDown } from 'lucide-react'
import axios from 'axios'
import './DocumentSummary.css'

let localDocumentsCache = null;

export default function DocumentSummary({ isMainView = false }) {
  const [documents, setDocuments] = useState(localDocumentsCache || [])
  const [selectedDocId, setSelectedDocId] = useState('current_doc')
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  const fetchStatus = async (force = false) => {
    if (!force && localDocumentsCache) {
      setDocuments(localDocumentsCache);
      return;
    }
    try {
      const res = await axios.get('/api/status')
      localDocumentsCache = res.data.documents || [];
      setDocuments(localDocumentsCache)
    } catch (err) {
      console.error("Failed to fetch status", err)
    }
  }

  useEffect(() => {
    fetchStatus()
    const handleGraphUpdate = () => {
      fetchStatus(true)
      setSelectedDocId('current_doc')
    }
    
    const handleUploadStarted = (e) => {
      const { id, name } = e.detail
      setDocuments(prev => [...prev, {
         id,
         name,
         is_active: false,
         status: 'processing',
         pages: '?',
         details: { size: 'Processing...', entitiesCount: 0, relationsCount: 0, textCount: 0, tableCount: 0, imageCount: 0, category: 'Analyzing...' },
         summary: {
           summary: 'Document is currently being processed. This can take a few minutes for larger files...',
           highlights: ['Extracting text and tables...', 'Running vision models on images...', 'Building semantic network...'],
           entities: ['Processing...']
         }
      }])
      setSelectedDocId(id)
    }

    window.addEventListener('graph-updated', handleGraphUpdate)
    window.addEventListener('upload-started', handleUploadStarted)
    return () => {
      window.removeEventListener('graph-updated', handleGraphUpdate)
      window.removeEventListener('upload-started', handleUploadStarted)
    }
  }, [])

  const activeDoc = documents.find(d => d.is_active)
  const fallbackDoc = activeDoc || documents[0]
  const selectedDoc = documents.find(d => d.id === selectedDocId) || fallbackDoc

  if (!selectedDoc) {
    if (!isMainView) return null;
    return (
      <section className={`doc-summary-panel ${isMainView ? 'is-main-view' : ''}`}>
        <div className="doc-summary-header">
          <div className="doc-summary-header-left">
            <span className="doc-summary-title">Document Summary</span>
          </div>
        </div>
        <div className="doc-summary-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center' }}>
          <FileText size={48} color="var(--text-dim)" style={{ marginBottom: '16px', opacity: 0.5 }} />
          <h3 style={{ fontSize: '18px', margin: '0 0 8px 0', fontFamily: 'var(--font-display)', color: 'var(--text)' }}>No Document Available</h3>
          <p style={{ fontSize: '14px', color: 'var(--text-dim)', margin: 0, maxWidth: '250px' }}>Upload a document to view its AI summary and extracted concepts.</p>
        </div>
      </section>
    )
  }

  const details = selectedDoc.details || {}

  const formatTitle = (name) => {
    if (!name || name === 'Unknown') return name;
    // Remove file extension
    let title = name.replace(/\.[^/.]+$/, "");
    // Replace hyphens and underscores with spaces
    title = title.replace(/[-_]/g, " ");
    // Capitalize each word
    title = title.replace(/\b\w/g, l => l.toUpperCase());
    return title;
  }

  return (
    <section className={`doc-summary-panel ${isMainView ? 'is-main-view' : ''} ${isCollapsed && !isMainView ? 'is-collapsed' : ''}`}>
      {!isMainView && (
        <button 
          className="collapse-toggle-side-btn" 
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Expand Summary" : "Collapse Summary"}
        >
          {isCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      )}

      <div className="doc-summary-header">
        <div className="doc-summary-header-left">
          <span className="doc-summary-title">Document Summary</span>
        </div>
        <div className="doc-summary-select-wrapper" style={{ position: 'relative' }}>
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
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: '2px 2px 0px #000',
              width: '160px'
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {formatTitle(documents.find(d => d.id === selectedDoc.id)?.name || 'Select Document')}
            </span>
            <ChevronDown size={14} style={{ flexShrink: 0, marginLeft: '4px' }} />
          </div>
          {showPicker && (
            <div style={{ position: 'absolute', top: '100%', right: '0', marginTop: '4px', background: '#fff', border: '2px solid #000', borderRadius: '4px', boxShadow: '4px 4px 0px #000', zIndex: 50, width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '200px', overflowY: 'auto' }}>
              {documents.map((doc) => (
                <div 
                  key={doc.id}
                  onClick={() => { setSelectedDocId(doc.id); setShowPicker(false); }}
                  style={{ padding: '6px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #eee', background: selectedDoc.id === doc.id ? '#f0f0f0' : '#fff', fontWeight: selectedDoc.id === doc.id ? 600 : 400 }}
                  onMouseEnter={(e) => e.target.style.background = '#f9f9f9'}
                  onMouseLeave={(e) => e.target.style.background = selectedDoc.id === doc.id ? '#f0f0f0' : '#fff'}
                >
                  {formatTitle(doc.name)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="doc-summary-content">
        {/* Document Meta Row */}
        <div className="meta-grid">
          <div className="meta-card">
            <span className="meta-card-label">Pages</span>
            <span className="meta-card-value">{selectedDoc.pages}</span>
          </div>
          <div className="meta-card">
            <span className="meta-card-label">Size</span>
            <span className="meta-card-value">{details.size || 'N/A'}</span>
          </div>
          <div className="meta-card">
            <span className="meta-card-label">Graph Nodes</span>
            <span className="meta-card-value">{details.entitiesCount || 0}</span>
          </div>
          <div className="meta-card">
            <span className="meta-card-label">Graph Edges</span>
            <span className="meta-card-value">{details.relationsCount || 0}</span>
          </div>
          {isMainView && (
            <>
              <div className="meta-card">
                <span className="meta-card-label">Paragraphs</span>
                <span className="meta-card-value">{details.textCount || 0}</span>
              </div>
              <div className="meta-card">
                <span className="meta-card-label">Tables</span>
                <span className="meta-card-value">{details.tableCount || 0}</span>
              </div>
              <div className="meta-card">
                <span className="meta-card-label">Images</span>
                <span className="meta-card-value">{details.imageCount || 0}</span>
              </div>
            </>
          )}
        </div>

        {/* Ingestion status card */}
        <div className={`status-banner banner-${selectedDoc.status}`}>
          {selectedDoc.status === 'indexed' ? (
            <>
              <CheckCircle2 size={16} className="status-banner-icon" />
              <span>Document is fully indexed and ready for retrieval.</span>
            </>
          ) : selectedDoc.status === 'inactive' ? (
            <>
              <AlertCircle size={16} className="status-banner-icon text-red" />
              <span>Document is inactive. Please re-upload to chat.</span>
            </>
          ) : selectedDoc.status === 'error' ? (
            <>
              <AlertCircle size={16} className="status-banner-icon text-red" />
              <span>Processing failed. Please try uploading again.</span>
            </>
          ) : (
            <>
              <RefreshCw size={16} className="status-banner-icon status-spinner" />
              <span>Processing: Entity extraction in progress...</span>
            </>
          )}
        </div>

        {/* Summary text section */}
        <div className="summary-section">
          <div className="section-title-row">
            <Sparkles size={15} className="section-icon text-accent" />
            <h3>AI Summary</h3>
          </div>
          <div className="summary-box">
            <p>{details.summary || 'No summary available.'}</p>
          </div>
        </div>

        {/* Key Takeaways */}
        {details.highlights && details.highlights.length > 0 && (
          <div className="summary-section">
            <div className="section-title-row">
              <Layers size={15} className="section-icon text-green" />
              <h3>Key Takeaways</h3>
            </div>
            <ul className="takeaways-list">
              {details.highlights.map((highlight, idx) => (
                <li key={idx} className="takeaway-item">
                  <span className="takeaway-marker" />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Extracted Entities / Concept Tags */}
        {details.entities && details.entities.length > 0 && (
          <div className="summary-section">
            <div className="section-title-row">
              <Tag size={15} className="section-icon text-blue" />
              <h3>Extracted Concepts</h3>
            </div>
            <div className="entity-tags">
              {details.entities.map((entity, idx) => {
                const colors = ['tag-blue', 'tag-green', 'tag-yellow', 'tag-orange', 'tag-red']
                const colorClass = colors[idx % colors.length]
                return (
                  <span key={idx} className={`entity-tag ${colorClass}`}>
                    {entity}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Category Badge moved to bottom */}
        {details.category && typeof details.category === 'string' && (
          <div className="summary-section" style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', justifyContent: 'center' }}>
            <span className="doc-category-badge" style={{ fontSize: '12px', padding: '6px 12px' }}>
              {details.category}
            </span>
          </div>
        )}

        </div>
      )}
    </section>
  )
}
