import { useState, useCallback } from 'react'
import { UploadCloud, FileCheck2, Loader2 } from 'lucide-react'
import axios from 'axios'
import './UploadCard.css'

export default function UploadCard({ onUploadSuccess }) {
  const [isDragging, setIsDragging] = useState(false)
  const [files, setFiles] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [progressMsg, setProgressMsg] = useState('')
  const [progressVal, setProgressVal] = useState(0)

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
      
      const docId = response.data.doc_id;
      window.dispatchEvent(new CustomEvent('upload-started', { detail: { id: docId, name: file.name } }));
      
      
      const eventSource = new EventSource(`/api/upload/stream/${docId}`);
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("SSE update:", data);
        if (data.status === 'error') {
          console.error("Upload stream error:", data.message);
          setUploadStatus('error');
          setProgressMsg(data.message || 'Processing failed');
          setIsUploading(false);
          eventSource.close();
        } else {
          setProgressVal(data.progress || 0);
          setProgressMsg(data.message || '');
          if (data.status === 'completed') {
            setUploadStatus('success');
            setIsUploading(false);
            window.dispatchEvent(new CustomEvent('graph-updated'));
            if (onUploadSuccess) onUploadSuccess(response.data);
            eventSource.close();
          }
        }
      };
      
      eventSource.onerror = (err) => {
        console.error("SSE Error", err);
        eventSource.close();
        if (uploadStatus !== 'success') {
          setUploadStatus('error');
          setIsUploading(false);
        }
      };

    } catch (err) {
      console.error("Upload failed", err)
      setUploadStatus('error')
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
          
          {(isUploading || uploadStatus === 'success') && progressVal >= 0 && (
            <div className="upload-progress-container">
              <div className="upload-progress-bar" style={{ width: `${Math.max(progressVal, 2)}%` }}></div>
            </div>
          )}
          
          <p className="upload-note">
            {progressMsg ? progressMsg : "Starting upload stream..."}
          </p>
        </div>
      )}
    </div>
  )
}
