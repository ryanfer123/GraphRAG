import { useState } from 'react'
import { Brain, HelpCircle } from 'lucide-react'
import './Navbar.css'

export default function Navbar() {
  const [showHelp, setShowHelp] = useState(false)

  return (
    <>
      <header className="navbar">
        <div onClick={() => window.location.href = '/dashboard'} className="navbar-brand" style={{ cursor: 'pointer' }}>
          <div className="brand-logo-badge" style={{ marginRight: '4px' }}>
            <Brain size={15} strokeWidth={2.5} />
          </div>
          <span className="navbar-title">GraphRAG</span>
          <span className="navbar-sub">Document Intelligence</span>
        </div>
        
        <button className="navbar-help-btn" onClick={() => setShowHelp(true)}>
          <HelpCircle size={14} strokeWidth={2.5} />
          <span>How to Use</span>
        </button>
      </header>

      {showHelp && (
        <div className="navbar-modal-overlay">
          <div className="navbar-modal-box">
            <div className="navbar-modal-header">
              <h3>How to Use GraphRAG</h3>
            </div>
            <div className="navbar-modal-content">
              <ol>
                <li><strong>Upload a Document:</strong> Go to the "Upload Documents" tab and drop your PDF or DOCX file. It will be parsed into an intelligent graph of text, tables, and images.</li>
                <li><strong>Explore the Graph:</strong> Use the "Graph Explorer" to visualize the exact relationships extracted from your document. You can click on nodes to inspect them!</li>
                <li><strong>Ask Questions:</strong> Start a "New Chat" and ask complex questions. The system will traverse the graph, find the exact paragraphs/tables needed, and cite its sources directly.</li>
              </ol>
            </div>
            <div className="navbar-modal-actions">
              <button className="navbar-modal-btn" onClick={() => setShowHelp(false)}>Got it!</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
