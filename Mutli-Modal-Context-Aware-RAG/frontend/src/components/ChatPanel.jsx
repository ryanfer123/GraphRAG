import { useState, useRef, useEffect } from 'react'
import { ArrowUp, Loader2, Sparkles, Paperclip, Settings, SlidersHorizontal, Mic } from 'lucide-react'
import axios from 'axios'
import MessageBubble from './MessageBubble.jsx'
import './ChatPanel.css'

export default function ChatPanel({ onHighlightNodes }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const [thinkingStepIdx, setThinkingStepIdx] = useState(0)

  const thinkingSteps = [
    "Vectorizing query...",
    "Retrieving semantic neighborhood...",
    "Expanding context via 2-hop graph walk...",
    "Reranking candidates with ms-marco-L-6...",
    "Prompting llama-3.3-70b-versatile for synthesis...",
    "Generating final grounded answer..."
  ]
  
  const scrollRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isThinking])

  // Cycle through thinking steps
  useEffect(() => {
    let interval;
    if (isThinking) {
      setThinkingStepIdx(0);
      interval = setInterval(() => {
        setThinkingStepIdx(prev => Math.min(prev + 1, thinkingSteps.length - 1));
      }, 1500);
    } else {
      setThinkingStepIdx(0);
    }
    return () => clearInterval(interval);
  }, [isThinking])

  // Fetch chat history on component mount
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await axios.get('/api/chat/history')
        if (res.data && res.data.history && res.data.history.length > 0) {
          const loadedMessages = res.data.history.map(msg => ({
            id: msg._id || `msg-${Date.now()}-${Math.random()}`,
            role: msg.role,
            content: msg.content,
            citations: msg.citations || [],
            highlightedNodes: []
          }))
          setMessages(loadedMessages)
        } else {
          setMessages([])
        }
      } catch (err) {
        console.error("Failed to load chat history:", err)
      }
    }
    fetchHistory()
    
    const handleClear = () => setMessages([])
    window.addEventListener('chat-cleared', handleClear)
    window.addEventListener('graph-updated', fetchHistory)
    return () => {
      window.removeEventListener('chat-cleared', handleClear)
      window.removeEventListener('graph-updated', fetchHistory)
    }
  }, [])

  const handleSend = async () => {
    const question = input.trim()
    if (!question || isThinking) return

    const userMsg = { id: `u-${Date.now()}`, role: 'user', content: question }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsThinking(true)

    try {
      const res = await axios.post('/api/chat', { query: question })
      
      const assistantMsg = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: res.data.answer,
        citations: res.data.citations,
        highlightedNodes: res.data.highlightedNodes,
      }
      setMessages((prev) => [...prev, assistantMsg])
      onHighlightNodes?.(res.data.highlightedNodes)
    } catch (err) {
      console.error("Chat error", err)
      const errorMsg = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: "Sorry, I encountered an error. Please ensure a document has been uploaded.",
        citations: [],
        highlightedNodes: []
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsThinking(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleCitationClick = (nodeIds) => {
    onHighlightNodes?.(nodeIds)
  }

  const handleMicClick = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser.")
      return
    }
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript
      setInput(prev => prev ? `${prev} ${transcript}` : transcript)
    }
    recognition.start()
  }

  const handleAttachClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      alert("Document attached and processed successfully!")
    } catch (err) {
      console.error(err)
      alert("Failed to attach document.")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <section className="chat-panel">
      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: '2rem', color: '#888' }}>
            <Sparkles size={32} style={{ opacity: 0.5, marginBottom: '1rem' }} />
            <p>Upload a document and ask a question.</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onCitationClick={handleCitationClick} />
        ))}

        {isThinking && (
          <div className="chat-thinking">
            <Loader2 size={14} className="chat-thinking-spinner animate-spin" />
            {thinkingSteps[thinkingStepIdx]}
          </div>
        )}
      </div>

      <div className="chat-input-wrapper" style={{ position: 'relative' }}>
        
        {/* Settings Popover */}
        {showSettings && (
          <div style={{ position: 'absolute', bottom: '100%', left: '10px', marginBottom: '10px', background: '#fff', border: '1px solid #ddd', padding: '15px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10 }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '13px' }}>Model Settings</h4>
            <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label>Temperature: <input type="range" min="0" max="1" step="0.1" defaultValue="0.7" style={{width: '80px', verticalAlign: 'middle'}}/></label>
              <label>Max Tokens: <input type="number" defaultValue="512" style={{width: '60px', padding: '2px'}}/></label>
            </div>
          </div>
        )}

        {/* Options Popover */}
        {showOptions && (
          <div style={{ position: 'absolute', bottom: '100%', left: '90px', marginBottom: '10px', background: '#fff', border: '1px solid #ddd', padding: '15px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10 }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '13px' }}>Chat Options</h4>
            <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label><input type="checkbox" defaultChecked /> Use Graph Context</label>
              <label><input type="checkbox" /> Web Search Fallback</label>
            </div>
          </div>
        )}

        <div className="chat-input-top">
          <Sparkles size={14} className="chat-input-sparkle" />
          <textarea
            className="chat-input"
            placeholder="Ask a question about your documents..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
        </div>
        <div className="chat-input-bottom">
          <div className="chat-input-actions-left">
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
            <button className="chat-input-action-btn" onClick={handleAttachClick}>
              {isUploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />} Attach
            </button>
            <button className="chat-input-action-btn" onClick={() => { setShowSettings(!showSettings); setShowOptions(false) }}>
              <Settings size={13} /> Settings
            </button>
            <button className="chat-input-action-btn" onClick={() => { setShowOptions(!showOptions); setShowSettings(false) }}>
              <SlidersHorizontal size={13} /> Options
            </button>
          </div>
          <div className="chat-input-actions-right">
            <button className="chat-input-action-icon" onClick={handleMicClick} style={{ color: isListening ? 'red' : 'inherit' }}>
              <Mic size={14} />
            </button>
            <button className="chat-send" onClick={handleSend} disabled={!input.trim() || isThinking || isUploading}>
              <ArrowUp size={15} />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
