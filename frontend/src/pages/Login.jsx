import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brain, ArrowRight, Loader2, Lock, Mail } from 'lucide-react'
import axios from 'axios'
import NetworkBackground from '../components/NetworkBackground.jsx'
import './Login.css'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [error, setError] = useState('')

  const handleAuth = async (e) => {
    e.preventDefault()
    if (!email || !password) return
    setIsAuthenticating(true)
    setError('')
    
    try {
      const endpoint = isRegistering ? '/api/register' : '/api/login'
      const res = await axios.post(endpoint, { email, password })
      localStorage.setItem('token', res.data.token)
      navigate('/dashboard')
    } catch (err) {
      setError("Authentication failed: " + (err.response?.data?.detail || err.message))
    } finally {
      setIsAuthenticating(false)
    }
  }

  return (
    <div className="login-page">
      <NetworkBackground />
      <div className="login-glow" />
      
      <div className="login-container">
        <div className="login-brand">
          <div className="brand-logo-badge" style={{ background: 'var(--accent-2)' }}>
            <Brain size={18} strokeWidth={2.5} />
          </div>
          <span>GraphRAG</span>
        </div>
        
        <form className="login-form" onSubmit={handleAuth}>
          <h2>{isRegistering ? "Create an account" : "Welcome back"}</h2>
          <p className="login-subtitle">
            {isRegistering ? "Sign up to start building your graph." : "Sign in to query your knowledge graph."}
          </p>

          {error && (
            <div className="login-error-banner">
              {error}
            </div>
          )}
          
          <div className="input-group">
            <Mail size={16} className="input-icon" />
            <input 
              type="email" 
              placeholder="Email address" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div className="input-group">
            <Lock size={16} className="input-icon" />
            <input 
              type="password" 
              placeholder="Password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          <button 
            type="submit" 
            className="login-btn" 
            disabled={isAuthenticating || !email || !password}
          >
            {isAuthenticating ? (
              <><Loader2 size={16} className="animate-spin" /> {isRegistering ? "Creating account..." : "Authenticating..."}</>
            ) : (
              <>{isRegistering ? "Sign Up" : "Sign In"} <ArrowRight size={16} /></>
            )}
          </button>
          
          <div className="login-footer">
            <p>
              {isRegistering ? "Already have an account?" : "Don't have an account?"} 
              <span 
                style={{color: 'var(--accent-2)', cursor: 'pointer', marginLeft: '5px', fontWeight: '600'}} 
                onClick={() => {
                  setIsRegistering(!isRegistering)
                  setError('')
                }}
              >
                {isRegistering ? "Sign In" : "Sign Up"}
              </span>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
