import { useNavigate } from 'react-router-dom'
import { Brain, ArrowRight, FileSearch, Share2, Sparkles, Coins } from 'lucide-react'
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
            <p>Breaks down data silos by extracting text, tables, and images, linking them into a unified, relationship-aware knowledge graph.</p>
          </div>
          <div className="home-feature">
            <Share2 size={18} />
            <h3>Graph-Augmented Retrieval</h3>
            <p>Avoids arbitrary chunking by traversing graph edges to synthesize distributed context and resolve cross-section references.</p>
          </div>
          <div className="home-feature">
            <Sparkles size={18} />
            <h3>Verifiable Citations</h3>
            <p>Eliminates hallucinations with grounded answers, providing full explainability by highlighting the exact source nodes used.</p>
          </div>
          <div className="home-feature">
            <Coins size={18} />
            <h3>Token-Free Parsing</h3>
            <p>Achieves maximum cost-efficiency by using local, lightweight capabilities for extraction instead of expensive API tokens.</p>
          </div>
        </div>
      </main>
    </div>
  )
}
