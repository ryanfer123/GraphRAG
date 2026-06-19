import { useState, useEffect } from 'react'
import { FileText, Sparkles, CheckCircle2, Tag, Layers, AlertCircle, RefreshCw } from 'lucide-react'
import axios from 'axios'
import './DocumentSummary.css'

export default function DocumentSummary() {
  const [documents, setDocuments] = useState([])
  const [selectedDocId, setSelectedDocId] = useState('current_doc')

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

  const selectedDoc = documents.find(d => d.id === selectedDocId) || documents[0]

  if (!selectedDoc) {
    return null
  }

  const details = selectedDoc.details || {}

  return (
    <section className="doc-summary-panel">
      <div className="doc-summary-header">
        <span className="doc-summary-title">Document Summary</span>
        <div className="doc-summary-select-wrapper">
          <select 
            className="doc-summary-select" 
            value={selectedDocId} 
            onChange={(e) => setSelectedDocId(e.target.value)}
          >
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

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
            <span className="meta-card-label">Entities</span>
            <span className="meta-card-value">{details.entitiesCount || 0}</span>
          </div>
          <div className="meta-card">
            <span className="meta-card-label">Relations</span>
            <span className="meta-card-value">{details.relationsCount || 0}</span>
          </div>
        </div>

        {/* Ingestion status card */}
        <div className={`status-banner banner-${selectedDoc.status}`}>
          {selectedDoc.status === 'indexed' ? (
            <>
              <CheckCircle2 size={16} className="status-banner-icon" />
              <span>Document is fully indexed and ready for retrieval.</span>
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
      </div>
    </section>
  )
}
