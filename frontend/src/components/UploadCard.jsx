import { useState, useCallback, useEffect, useRef } from 'react'
import { UploadCloud, FileCheck2, Loader2, XCircle } from 'lucide-react'
import axios from 'axios'
import './UploadCard.css'

export default function UploadCard({ onUploadSuccess }) {
  const [isDragging, setIsDragging] = useState(false)
  const [files, setFiles] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [progressMsg, setProgressMsg] = useState('')
  const [progressVal, setProgressVal] = useState(0)
  const [currentDocId, setCurrentDocId] = useState(null)
  const eventSourceRef = useRef(null)

  useEffect(() => {
    // The error popup now requires manual dismissal or retry
  }, [uploadStatus])

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
      setCurrentDocId(docId);
      window.dispatchEvent(new CustomEvent('upload-started', { detail: { id: docId, name: file.name } }));
      
      
      eventSourceRef.current = new EventSource(`/api/upload/stream/${docId}`);
      eventSourceRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("SSE update:", data);
        if (data.status === 'error') {
          console.error("Upload stream error:", data.message);
          setUploadStatus('error');
          setProgressMsg(data.message || 'Processing failed');
          setIsUploading(false);
          if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
        } else if (data.status === 'cancelled') {
          setUploadStatus(null);
          setIsUploading(false);
          setFiles([]);
          if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
        } else {
          setProgressVal(data.progress || 0);
          setProgressMsg(data.message || '');
          if (data.status === 'completed') {
            setUploadStatus('success');
            setIsUploading(false);
            window.dispatchEvent(new CustomEvent('graph-updated'));
            if (onUploadSuccess) onUploadSuccess(response.data);
            if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
          }
        }
      };
      
      eventSourceRef.current.onerror = (err) => {
        console.error("SSE Error", err);
        if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
        if (uploadStatus !== 'success' && uploadStatus !== 'cancelled') {
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

  const cancelUpload = async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (currentDocId) {
      try {
        await axios.post(`/api/upload/cancel/${currentDocId}`)
      } catch (err) {
        console.error("Failed to cancel upload:", err)
      }
    }
    setUploadStatus(null)
    setIsUploading(false)
    setFiles([])
    setCurrentDocId(null)
    setProgressVal(0)
    setProgressMsg('')
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
              {isUploading && (
                <button className="upload-cancel-x" onClick={cancelUpload} title="Cancel Upload">
                  <XCircle size={14} />
                </button>
              )}
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

      {uploadStatus === 'error' && (
        <div className="upload-error-overlay">
          <div className="upload-error-popup">
            <h3 style={{ margin: 0, fontSize: '18px' }}>Upload Failed</h3>
            <p style={{ margin: '8px 0 16px', fontSize: '13px' }}>
              {progressMsg || "An error occurred while uploading the document. Please try again."}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button 
                className="upload-error-btn btn-cancel"
                onClick={() => {
                  setUploadStatus(null);
                  setFiles([]);
                }}
              >
                Cancel
              </button>
              <button 
                className="upload-error-btn btn-retry"
                onClick={() => processUpload(files)}
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
