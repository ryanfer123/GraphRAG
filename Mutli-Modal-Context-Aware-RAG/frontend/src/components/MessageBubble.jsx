import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Sparkles, ChevronDown, ChevronRight } from 'lucide-react'
import SourceCard from './SourceCard.jsx'
import './MessageBubble.css'

export default function MessageBubble({ message, onCitationClick }) {
  const isUser = message.role === 'user'
  const [showSources, setShowSources] = useState(false)

  return (
    <motion.div
      className={`message-row ${isUser ? 'is-user' : 'is-assistant'}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="message-avatar">
        {isUser ? <User size={14} /> : <Sparkles size={14} />}
      </div>

      <div className="message-content">
        <div className="message-bubble">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>

        {message.citations?.length > 0 && (
          <div className="message-sources" style={{ marginTop: '10px' }}>
            <button 
              onClick={() => setShowSources(!showSources)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                background: 'none', 
                border: 'none', 
                color: 'var(--text-light)', 
                fontSize: '0.85rem', 
                cursor: 'pointer',
                padding: '4px 0'
              }}
            >
              {showSources ? <ChevronDown size={14} style={{marginRight: '4px'}}/> : <ChevronRight size={14} style={{marginRight: '4px'}}/>}
              {showSources ? 'Hide Sources Used' : `View Sources Used (${message.citations.length})`}
            </button>
            
            <AnimatePresence>
              {showSources && (
                <motion.div 
                  className="message-sources-list"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: 'hidden', marginTop: '8px' }}
                >
                  {message.citations.map((c) => (
                    <SourceCard
                      key={c.id}
                      citation={c}
                      onClick={() => onCitationClick?.(message.highlightedNodes, c)}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  )
}
