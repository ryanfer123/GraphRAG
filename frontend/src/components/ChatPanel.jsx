import { useState, useRef, useEffect } from 'react'
import { ArrowUp, Loader2, Sparkles, Paperclip, Settings, SlidersHorizontal, Mic, ChevronDown, Check } from 'lucide-react'
import axios from 'axios'
import MessageBubble from './MessageBubble.jsx'
import './ChatPanel.css'

let localChatHistoryCache = null;
let localChatStatusCache = null;

export default function ChatPanel({ onHighlightNodes }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [selectedModel, setSelectedModel] = useState('Llama 3.1-8b')
  const [answerStyle, setAnswerStyle] = useState('default')
  const [showStylePicker, setShowStylePicker] = useState(false)
  const [thinkingStepIdx, setThinkingStepIdx] = useState(0)
  const [hasDocument, setHasDocument] = useState(false)
  const textareaRef = useRef(null)

  const thinkingSteps = [
    "Vectorizing query...",
    "Retrieving semantic neighborhood...",
    "Expanding context via 2-hop graph walk...",
    "Reranking candidates with ms-marco-L-6...",
    "Prompting llama-3.1-8b via Groq for synthesis...",
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
    const fetchHistory = async (force = false) => {
      if (!force && localChatHistoryCache) {
        setMessages(localChatHistoryCache);
        return;
      }
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
          localChatHistoryCache = loadedMessages;
          setMessages(loadedMessages)
        } else {
          localChatHistoryCache = [];
          setMessages([])
        }
      } catch (err) {
        console.error("Failed to load chat history:", err)
      }
    }
    
    const fetchStatus = async (force = false) => {
      if (!force && localChatStatusCache !== null) {
        setHasDocument(localChatStatusCache);
        return;
      }
      try {
        const res = await axios.get('/api/status')
        localChatStatusCache = (res.data.documents && res.data.documents.length > 0);
        setHasDocument(localChatStatusCache)
      } catch (err) {
        console.error("Failed to fetch status:", err)
      }
    }

    fetchHistory()
    fetchStatus()
    
    const handleClear = () => {
      localChatHistoryCache = [];
      setMessages([]);
    }
    const handleGraphUpdated = () => {
      fetchHistory(true)
      fetchStatus(true)
    }
    
    window.addEventListener('chat-cleared', handleClear)
    window.addEventListener('graph-updated', handleGraphUpdated)
    return () => {
      window.removeEventListener('chat-cleared', handleClear)
      window.removeEventListener('graph-updated', handleGraphUpdated)
    }
  }, [])

  const handleSend = async () => {
    const question = input.trim()
    if (!question || isThinking) return

    const userMsg = { id: `u-${Date.now()}`, role: 'user', content: question }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setIsThinking(true)

    try {
      const res = await axios.post('/api/chat', { query: question, answer_style: answerStyle })
      
      const assistantMsg = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: res.data.answer,
        citations: res.data.citations,
        highlightedNodes: res.data.highlightedNodes,
      }
      setMessages((prev) => [...prev, assistantMsg])
      onHighlightNodes?.(res.data.highlightedNodes)
      window.dispatchEvent(new Event('chat-updated'))
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
            <Sparkles size={48} color="var(--text-dim)" style={{ marginBottom: '16px', opacity: 0.5 }} />
            <h3 style={{ fontSize: '18px', margin: '0 0 8px 0', fontFamily: 'var(--font-display)', color: 'var(--text)' }}>No Chat History</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-dim)', margin: 0, maxWidth: '250px' }}>Upload a document and ask a question to start the conversation.</p>
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
        
        {/* Unified Model Picker Popover */}
        {showModelPicker && (
          <div style={{ position: 'absolute', bottom: '100%', left: '10px', marginBottom: '10px', background: '#fff', color: '#000', border: '2px solid #000', padding: '8px', borderRadius: '12px', boxShadow: '4px 4px 0px #000', zIndex: 10, width: '280px', fontFamily: 'var(--font-body)' }}>
            <div style={{ padding: '4px 8px', fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Models</div>
            
            <div onClick={() => { setSelectedModel('Llama 3.1-8b'); setShowModelPicker(false) }} style={{ padding: '8px', cursor: 'pointer', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: selectedModel === 'Llama 3.1-8b' ? '#f0f0f0' : 'transparent' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#000', fontSize: '13px' }}>Llama 3.1-8b</div>
                <div style={{ fontSize: '11px', color: '#666' }}>Fastest for quick answers</div>
              </div>
              {selectedModel === 'Llama 3.1-8b' && <Check size={16} color="#000" />}
            </div>

            <div style={{ height: '1px', background: '#ddd', margin: '8px 0' }}></div>
            
            <div style={{ padding: '4px 8px', fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Settings</div>
            <div style={{ padding: '4px 8px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '10px', color: '#000' }}>
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                Temperature <input type="range" min="0" max="1" step="0.1" defaultValue="0.7" style={{width: '80px', accentColor: '#000'}} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" defaultChecked className="brutalist-checkbox" /> Use Graph Context
              </label>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', position: 'relative' }}>
                <span>Answer Style</span>
                <div 
                  onClick={() => setShowStylePicker(!showStylePicker)}
                  style={{ width: '120px', padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '2px solid #000', background: '#fff', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '2px 2px 0px #000', outline: 'none' }}
                >
                  <span style={{ fontWeight: 600 }}>{answerStyle === 'default' ? 'Default (Bullets)' : answerStyle.charAt(0).toUpperCase() + answerStyle.slice(1)}</span>
                  <ChevronDown size={12} />
                </div>
                {showStylePicker && (
                  <div style={{ position: 'absolute', top: '100%', right: '0', marginTop: '8px', background: '#fff', border: '2px solid #000', borderRadius: '8px', boxShadow: '4px 4px 0px #000', zIndex: 20, width: '130px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {['default', 'concise', 'academic', 'formal'].map(style => (
                      <div 
                        key={style}
                        onClick={() => { setAnswerStyle(style); setShowStylePicker(false); }}
                        style={{ padding: '8px 10px', fontSize: '11px', cursor: 'pointer', borderBottom: style !== 'formal' ? '1px solid #eee' : 'none', background: answerStyle === style ? '#f0f0f0' : '#fff', fontWeight: answerStyle === style ? 600 : 400 }}
                        onMouseEnter={(e) => e.target.style.background = '#f9f9f9'}
                        onMouseLeave={(e) => e.target.style.background = answerStyle === style ? '#f0f0f0' : '#fff'}
                      >
                        {style === 'default' ? 'Default (Bullets)' : style.charAt(0).toUpperCase() + style.slice(1)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ height: '1px', background: '#ddd', margin: '8px 0' }}></div>
            
            <div onClick={() => { handleAttachClick(); setShowModelPicker(false) }} style={{ padding: '8px', cursor: 'pointer', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: '#000' }}>
              {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />} 
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Attach Document</span>
            </div>
          </div>
        )}

        <div className="chat-input-top">
          <Sparkles size={14} className="chat-input-sparkle" />
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder="Ask a question about your documents..."
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = `${e.target.scrollHeight}px`
            }}
            onKeyDown={handleKeyDown}
            rows={1}
          />
        </div>
        <div className="chat-input-bottom">
          <div className="chat-input-actions-left">
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
            <button 
              className="chat-input-action-btn model-picker-btn" 
              onClick={() => setShowModelPicker(!showModelPicker)}
              style={{ background: '#fff', color: '#000', border: '2px solid #000', borderRadius: '16px', padding: '4px 10px 4px 12px', boxShadow: 'none' }}
            >
              <span style={{ fontWeight: 600, marginRight: '4px' }}>{selectedModel}</span>
              <ChevronDown size={14} style={{ color: '#000' }} />
            </button>
          </div>
          <div className="chat-input-actions-right">
            <button className="chat-input-action-icon" onClick={handleMicClick} style={{ color: isListening ? 'red' : 'inherit' }}>
              <Mic size={14} />
            </button>
            <button className="chat-send" onClick={handleSend} disabled={!input.trim() || isThinking || isUploading || !hasDocument}>
              <ArrowUp size={15} />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
