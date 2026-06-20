import React, { useState } from 'react'
import { Database, FileText, BrainCircuit, Search, Cpu, Network, X, Layers, Link, Image as ImageIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import './ArchitecturePanel.css'

const ARCH_DETAILS = {
  ingestion: {
    title: 'Document Ingestion',
    icon: FileText,
    type: 'Parsing',
    content: 'We use unstructured.io to parse complex document layouts. It identifies Headings, Paragraphs, Tables, and Images, returning them in a structured sequence with bounding boxes and page metadata.',
    tech: 'unstructured, pdfminer'
  },
  vision: {
    title: 'Vision-Language Model',
    icon: ImageIcon,
    type: 'Vision Extraction',
    content: 'Every extracted image and chart is passed through Qwen2-VL. It reads the visual data (bar graphs, pie charts, etc.) and translates it into a semantic text description which is injected as an Image Node into the graph.',
    tech: 'Qwen2-VL-2B-Instruct, MLX'
  },
  extraction_structural: {
    title: 'Structural Edges',
    icon: Network,
    type: 'Processing',
    content: 'We link nodes sequentially (Structural Edges) to preserve the original reading order of the document. This ensures that paragraphs following a heading remain connected in the graph.',
    tech: 'networkx'
  },
  extraction_semantic: {
    title: 'Semantic Edges',
    icon: Network,
    type: 'Processing',
    content: 'We compute cosine similarity to link text blocks with relevant Tables or Images (Semantic Edges) that may be physically distant but semantically related, forming a unified Knowledge Graph.',
    tech: 'sklearn, sentence-transformers'
  },
  chroma: {
    title: 'Vector Database',
    icon: Cpu,
    type: 'Storage',
    content: 'All extracted text chunks are embedded using high-dimensional sentence transformers. ChromaDB performs fast, approximate nearest-neighbor vector search to quickly find semantically relevant chunks.',
    tech: 'chromadb, sentence-transformers'
  },
  networkx: {
    title: 'Knowledge Graph',
    icon: Network,
    type: 'Storage',
    content: 'The graph topology is maintained in memory via NetworkX. This allows traversing 1-hop or 2-hop neighbors of retrieved nodes to expand the context window intelligently before generation.',
    tech: 'networkx'
  },
  retrieval: {
    title: 'Query Decomposition',
    icon: Search,
    type: 'Retrieval',
    content: 'Complex user queries are passed to a reasoning LLM to break them down into 2-3 simpler, focused sub-queries. Each sub-query runs an independent vector search against ChromaDB.',
    tech: 'Llama-3, Prompt Engineering'
  },
  generation: {
    title: 'Graph-Augmented Synthesis',
    icon: BrainCircuit,
    type: 'Generation',
    content: 'The union of all retrieved nodes and their graph neighbors is injected into the LLM context. The LLM synthesizes a final answer, strictly citing the source node IDs to ensure hallucination-free responses.',
    tech: 'Llama-3, RAG'
  }
}

export default function ArchitecturePanel() {
  const [selectedCard, setSelectedCard] = useState(null)

  const handleScroll = () => {
    if (selectedCard) {
      setSelectedCard(null)
    }
  }

  return (
    <div className="arch-panel">
      <div className="arch-content" onScroll={handleScroll}>
      <div className="arch-header">
        <h2>System Architecture</h2>
        <p>A high-level view of our Graph-Augmented RAG Pipeline.</p>
      </div>

      <div className="arch-diagram">
        {/* Stage 1: Ingestion */}
        <div className="arch-stage">
          <div className="arch-stage-header">
            <FileText size={20} />
            <h3>1. Document Ingestion</h3>
          </div>
          <div className="arch-card-group">
            <div className={`arch-card ${selectedCard === 'ingestion' ? 'is-selected' : ''}`} onClick={() => setSelectedCard('ingestion')}>
              <h4><FileText size={18} /> Partitioning & Parsing</h4>
              <p>Unstructured.io extracts text, tables, and images from raw PDFs and DOCXs.</p>
            </div>
            <div className={`arch-card ${selectedCard === 'vision' ? 'is-selected' : ''}`} onClick={() => setSelectedCard('vision')}>
              <h4><ImageIcon size={18} /> Vision Extraction</h4>
              <p>Qwen2-VL translates charts and images into semantic text descriptions.</p>
            </div>
          </div>
        </div>

        <div className="arch-connector" />

        {/* Stage 2: Processing */}
        <div className="arch-stage">
          <div className="arch-stage-header">
            <Network size={20} />
            <h3>2. Graph Extraction</h3>
          </div>
          <div className="arch-card-group">
            <div className={`arch-card ${selectedCard === 'extraction_structural' ? 'is-selected' : ''}`} onClick={() => setSelectedCard('extraction_structural')}>
              <h4><Layers size={18} /> Structural Edges</h4>
              <p>Preserves sequential reading order.</p>
            </div>
            <div className={`arch-card ${selectedCard === 'extraction_semantic' ? 'is-selected' : ''}`} onClick={() => setSelectedCard('extraction_semantic')}>
              <h4><Link size={18} /> Semantic Edges</h4>
              <p>Connects related text blocks to tables/images via cosine similarity.</p>
            </div>
          </div>
        </div>

        <div className="arch-connector" />

        {/* Stage 3: Storage */}
        <div className="arch-stage">
          <div className="arch-stage-header">
            <Database size={20} />
            <h3>3. Dual Storage System</h3>
          </div>
          <div className="arch-card-group">
            <div className={`arch-card ${selectedCard === 'chroma' ? 'is-selected' : ''}`} onClick={() => setSelectedCard('chroma')}>
              <h4><Cpu size={18} /> Vector Database</h4>
              <p>ChromaDB stores high-dimensional embeddings for fast semantic search.</p>
            </div>
            <div className={`arch-card ${selectedCard === 'networkx' ? 'is-selected' : ''}`} onClick={() => setSelectedCard('networkx')}>
              <h4><Network size={18} /> Knowledge Graph</h4>
              <p>NetworkX stores entity relationships and structural linkages.</p>
            </div>
          </div>
        </div>

        <div className="arch-connector" />

        {/* Stage 4: Retrieval & Generation */}
        <div className="arch-stage">
          <div className="arch-stage-header">
            <Search size={20} />
            <h3>4. Query & Generation</h3>
          </div>
          <div className="arch-card-group">
            <div className={`arch-card ${selectedCard === 'retrieval' ? 'is-selected' : ''}`} onClick={() => setSelectedCard('retrieval')}>
              <h4><Search size={18} /> Query Decomposition</h4>
              <p>Complex user queries are broken into focused sub-queries.</p>
            </div>
            <div className={`arch-card ${selectedCard === 'generation' ? 'is-selected' : ''}`} onClick={() => setSelectedCard('generation')}>
              <h4><BrainCircuit size={18} /> Graph-Augmented Synthesis</h4>
              <p>LLM generates answers with precise graph node citations.</p>
            </div>
          </div>
        </div>
      </div>
      </div>

      <AnimatePresence>
        {selectedCard && ARCH_DETAILS[selectedCard] && (
          <motion.div 
            className="arch-details-wrapper"
            initial={{ width: 0 }}
            animate={{ width: 300 }}
            exit={{ width: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <div className="arch-details-panel">
              <div className="arch-details-header">
                <span className="arch-details-type">{ARCH_DETAILS[selectedCard].type}</span>
                <button className="arch-details-close" onClick={() => setSelectedCard(null)}>
                  <X size={16} />
                </button>
              </div>
              <h3 className="arch-details-title">{ARCH_DETAILS[selectedCard].title}</h3>
              
              <div className="arch-details-content">
                {ARCH_DETAILS[selectedCard].content}
              </div>
              
              <div className="arch-details-sub">Technology</div>
              <div className="arch-tech-row">
                <span className="arch-tech-badge">{ARCH_DETAILS[selectedCard].tech}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
