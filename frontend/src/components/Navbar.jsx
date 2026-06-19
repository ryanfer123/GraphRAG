import { Link } from 'react-router-dom'
import { Brain } from 'lucide-react'
import './Navbar.css'

export default function Navbar() {
  return (
    <header className="navbar">
      <Link to="/" className="navbar-brand">
        <div className="brand-logo-badge" style={{ marginRight: '4px' }}>
          <Brain size={15} strokeWidth={2.5} />
        </div>
        <span className="navbar-title">GraphRAG</span>
        <span className="navbar-sub">Document Intelligence</span>
      </Link>
      <div className="navbar-status">
        <span className="status-dot" style={{ background: '#00f5a0' }} />
        Backend: Online
      </div>
    </header>
  )
}
