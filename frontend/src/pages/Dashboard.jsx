import { useState } from 'react'
import Navbar from '../components/Navbar.jsx'
import Sidebar from '../components/Sidebar.jsx'
import ChatPanel from '../components/ChatPanel.jsx'
import GraphPanel from '../components/GraphPanel.jsx'
import DocumentSummary from '../components/DocumentSummary.jsx'
import './Dashboard.css'

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('upload')
  const [highlightedNodes, setHighlightedNodes] = useState(['2', '5', '7'])

  return (
    <div className="dashboard">
      <Navbar />
      <div className="dashboard-body">
        <Sidebar active={activeTab} setActive={setActiveTab} />
        {activeTab === 'graph' ? (
          <GraphPanel highlightedNodes={highlightedNodes} isMainView={true} />
        ) : (
          <>
            <ChatPanel onHighlightNodes={setHighlightedNodes} />
            <DocumentSummary />
          </>
        )}
      </div>
    </div>
  )
}
