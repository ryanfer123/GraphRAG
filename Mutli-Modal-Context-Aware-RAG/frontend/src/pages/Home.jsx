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
        <p className="home-eyebrow mono">Document intelligence, explained visually</p>
        <h1 className="home-title">
          Ask your documents.
          <br />
          See <span className="home-title-accent">why</span> the answer is true.
        </h1>
        <p className="home-subtitle">
          A hybrid retrieval system that pairs vector search with a knowledge graph —
          so every answer traces back to a page, a table, or a figure you can inspect.
        </p>
        <button className="home-cta" onClick={() => navigate('/login')}>
          Get Started <ArrowRight size={16} />
        </button>

        <div className="home-feature-row">
          <div className="home-feature">
            <FileSearch size={18} />
            <h3>Hybrid Retrieval</h3>
            <p>Vector search + 1-hop graph walk + reranking, before generation ever runs.</p>
          </div>
          <div className="home-feature">
            <Share2 size={18} />
            <h3>Graph Explorer</h3>
            <p>Structural and semantic links rendered as an interactive, clickable graph.</p>
          </div>
          <div className="home-feature">
            <Sparkles size={18} />
            <h3>Cited Answers</h3>
            <p>Every response highlights the exact nodes — pages, tables, figures — it used.</p>
          </div>
        </div>
      </main>
    </div>
  )
}
