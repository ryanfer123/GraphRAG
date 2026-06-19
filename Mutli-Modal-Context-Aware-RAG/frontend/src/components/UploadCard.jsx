import { useState, useCallback } from 'react'
import { UploadCloud, FileCheck2, Loader2 } from 'lucide-react'
import axios from 'axios'
import './UploadCard.css'

export default function UploadCard({ onUploadSuccess }) {
  const [isDragging, setIsDragging] = useState(false)
  const [files, setFiles] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null)

  const processUpload = async (fileList) => {
    if (fileList.length === 0) return
    setIsUploading(true)
    setUploadStatus('uploading')
    
    // We only support single file upload for now per the backend spec
    const file = fileList[0]
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setUploadStatus('success')
      window.dispatchEvent(new CustomEvent('graph-updated'))
      if (onUploadSuccess) {
        onUploadSuccess(response.data)
      }
    } catch (err) {
      console.error("Upload failed", err)
      setUploadStatus('error')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    setFiles(droppedFiles)
    processUpload(droppedFiles)
  }, [])

  const handleSelect = (e) => {
    const selectedFiles = Array.from(e.target.files)
    setFiles(selectedFiles)
    processUpload(selectedFiles)
  }

  return (
    <div className="upload-card">
      <label
        className={`upload-dropzone ${isDragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <UploadCloud size={22} className="upload-icon" />
        <p className="upload-text">Drop PDF or DOCX files here</p>
        <p className="upload-subtext">or click to browse</p>
        <input
          type="file"
          accept=".pdf,.docx"
          onChange={handleSelect}
          hidden
        />
      </label>

      {files.length > 0 && (
        <div className="upload-queue">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="upload-queue-row">
              {isUploading ? (
                 <Loader2 size={13} className="upload-queue-icon animate-spin" />
              ) : (
                 <FileCheck2 size={13} className="upload-queue-icon" />
              )}
              <span className="upload-queue-name">{f.name}</span>
              <span className="upload-queue-status">
                {uploadStatus === 'uploading' ? 'processing...' : uploadStatus === 'success' ? 'indexed' : 'failed'}
              </span>
            </div>
          ))}
          <p className="upload-note">
            Ingestion (Unstructured.io, MLX Qwen2-VL) running on backend...
          </p>
        </div>
      )}
    </div>
  )
}
