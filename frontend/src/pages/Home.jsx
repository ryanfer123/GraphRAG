import { useNavigate } from 'react-router-dom'
import { Brain, ArrowRight, FileSearch, Share2, Sparkles } from 'lucide-react'
import NetworkBackground from '../components/NetworkBackground.jsx'
import './Home.css'

export default function Home() {
  const navigate = useNavigate()

  return (
    <div className="home">
      <NetworkBackground />
      <div className="home-glow" />
      <header className="home-nav">
        <div className="home-brand">
          <div className="brand-logo-badge" style={{ background: 'var(--accent-2)' }}>
            <Brain size={15} strokeWidth={2.5} />
          </div>
          <span>GraphRAG</span>
        </div>
      </header>

      <main className="home-hero">
        <p className="home-eyebrow mono">Dell Hackathon 2026 Project</p>
        <h1 className="home-title">
          Multi-Modal GraphRAG Engine.
          <br />
          See <span className="home-title-accent">exactly</span> how your AI thinks.
        </h1>
        <p className="home-subtitle">
          An advanced retrieval system fusing vector search with interactive knowledge graphs. 
          Every answer provides verifiable citations linking directly to the source text, data tables, and figures.
        </p>
        <button className="home-cta" onClick={() => navigate('/login')}>
          Get Started <ArrowRight size={16} />
        </button>

        <div className="home-feature-row">
          <div className="home-feature">
            <FileSearch size={18} />
            <h3>Multi-Modal Ingestion</h3>
            <p>Extracts text, structured tables, and images from documents, linking them into a unified knowledge graph.</p>
          </div>
          <div className="home-feature">
            <Share2 size={18} />
            <h3>Graph-Augmented Retrieval</h3>
            <p>Combines vector similarity with graph traversal to retrieve deep, interconnected context across your entire document.</p>
          </div>
          <div className="home-feature">
            <Sparkles size={18} />
            <h3>Verifiable Citations</h3>
            <p>Eliminates hallucinations by tracing every answer back to the exact paragraph, table, or figure used.</p>
          </div>
        </div>
      </main>
    </div>
  )
}
