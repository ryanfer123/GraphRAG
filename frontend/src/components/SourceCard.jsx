import { FileText, Table2, Image as ImageIcon } from 'lucide-react'
import './SourceCard.css'

const TYPE_ICON = {
  paragraph: FileText,
  table: Table2,
  figure: ImageIcon,
}

export default function SourceCard({ citation, onClick }) {
  const Icon = TYPE_ICON[citation.type] || FileText

  return (
    <button className="source-card" onClick={onClick}>
      <Icon size={13} className="source-card-icon" />
      <div className="source-card-body">
        <div className="source-card-head">
          <span className="source-card-page mono">Page {citation.page}</span>
          <span className={`source-card-type type-${citation.type}`}>{citation.type}</span>
        </div>
        <p className="source-card-content">{citation.content}</p>
      </div>
    </button>
  )
}
