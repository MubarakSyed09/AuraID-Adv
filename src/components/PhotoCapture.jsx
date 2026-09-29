import { useRef, useState, useEffect } from 'react'

const DEFAULT_SETTINGS = { saturation: 100, contrast: 100, zoom: 100 }

export default function PhotoCapture({
  photo,
  onPhotoChange,
  photoSettings = DEFAULT_SETTINGS,
  onPhotoSettingsChange,
}) {
  const [mode, setMode] = useState('idle')
  const [error, setError] = useState('')
  const [facingMode, setFacingMode] = useState('user') // 'user' (front) or 'environment' (back)
  const [isStarting, setIsStarting] = useState(false)
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const videoRef = useRef(null)
  const fileInputRef = useRef(null)
  const streamRef = useRef(null)

  // Enumerate devices to check if front and rear cameras exist
  useEffect(() => {
    async function checkCameras() {
      try {
        if (navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const videoInputs = devices.filter((d) => d.kind === 'videoinput')
          setHasMultipleCameras(videoInputs.length > 1)
        }
      } catch {}
    }
    checkCameras()
  }, [])

  // Stop stream upon component unmount
  useEffect(() => {
    return () => stopStream()
  }, [])

  // Attach stream to video whenever mode becomes 'camera' and video element is mounted
  useEffect(() => {
    if (mode === 'camera' && videoRef.current && streamRef.current) {
      const videoEl = videoRef.current
      if (videoEl.srcObject !== streamRef.current) {
        videoEl.srcObject = streamRef.current
      }
      videoEl.play().catch((err) => {
        console.warn('Video playback warning:', err)
      })
    }
  }, [mode, facingMode])

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch {}
      })
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  async function startCamera(targetFacing = facingMode) {
    setError('')
    setIsStarting(true)

    // Check secure context
    if (
      typeof window !== 'undefined' &&
      !window.isSecureContext &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      setError('Camera access requires a secure connection (HTTPS or localhost). Please access this site over HTTPS.')
      setIsStarting(false)
      setMode('idle')
      return
    }

    // Check mediaDevices support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Your browser or webview environment does not support camera access (getUserMedia API missing).')
      setIsStarting(false)
      setMode('idle')
      return
    }

    // Stop any existing stream before starting a new one
    stopStream()

    try {
      let stream
      try {
        // Preferred resilient constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 640 },
            height: { ideal: 640 },
          },
          audio: false,
        })
      } catch (initialErr) {
        // Fallback constraint if overconstrained
        if (initialErr.name === 'OverconstrainedError' || initialErr.name === 'ConstraintNotSatisfiedError') {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        } else {
          throw initialErr
        }
      }

      streamRef.current = stream
      setFacingMode(targetFacing)
      setMode('camera')
    } catch (err) {
      console.error('Camera startup error:', err)
      let userMsg = 'Camera access failed.'
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        userMsg = 'Camera permission was denied. Please allow camera permissions in your browser address bar and try again.'
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        userMsg = 'No camera device was detected on your system. Please connect a camera or upload a photo.'
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        userMsg = 'Camera is currently in use by another application (e.g. Zoom, Meet, or another browser tab). Please close it and retry.'
      } else if (err.name === 'SecurityError') {
        userMsg = 'Camera access was blocked due to browser security restrictions or permissions policy.'
      } else if (err.message) {
        userMsg = `Camera error: ${err.message}`
      }
      setError(userMsg)
      setMode('idle')
    } finally {
      setIsStarting(false)
    }
  }

  function toggleCamera() {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user'
    startCamera(nextFacing)
  }

  function capturePhoto() {
    const video = videoRef.current
    if (!video || !video.videoWidth) {
      setError('Camera video feed is not ready yet. Please wait a moment and click Capture.')
      return
    }

    const canvas = document.createElement('canvas')
    const size = Math.min(video.videoWidth, video.videoHeight) || 480
    canvas.width = 480
    canvas.height = 480
    const ctx = canvas.getContext('2d')
    const sx = (video.videoWidth - size) / 2
    const sy = (video.videoHeight - size) / 2

    // Only mirror front-facing camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }

    ctx.drawImage(video, sx, sy, size, size, 0, 0, canvas.width, canvas.height)
    onPhotoChange(canvas.toDataURL('image/jpeg', 0.92))
    stopStream()
    setMode('idle')
  }

  function cancelCamera() {
    stopStream()
    setMode('idle')
    setError('')
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    const reader = new FileReader()
    reader.onload = () => onPhotoChange(reader.result)
    reader.readAsDataURL(file)
  }

  function updateSetting(name, value) {
    onPhotoSettingsChange?.({ ...photoSettings, [name]: Number(value) })
  }

  const photoStyle = {
    filter: `saturate(${photoSettings.saturation}%) contrast(${photoSettings.contrast}%)`,
    transform: `scale(${photoSettings.zoom / 100})`,
  }

  return (
    <div className="photo-capture">
      <div className="photo-capture__stage">
        {mode === 'camera' ? (
          <video
            ref={videoRef}
            className={`photo-capture__video ${facingMode === 'environment' ? 'is-rear' : ''}`}
            muted
            playsInline
            autoPlay
            onLoadedMetadata={(e) => e.target.play().catch(() => {})}
          />
        ) : photo ? (
          <img src={photo} alt="Captured preview" className="photo-capture__preview" style={photoStyle} />
        ) : (
          <div className="photo-capture__placeholder" aria-label="No photo selected">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="12" cy="8.5" r="3.4" />
              <path d="M4.5 20c1.4-4 4-6 7.5-6s6.1 2 7.5 6" />
            </svg>
          </div>
        )}
      </div>

      <div className="photo-capture__side">
        <p className="photo-capture__title">Biometric ID Photo</p>
        <p className="photo-capture__hint">Square, front-facing, plain background works best.</p>

        {error && (
          <div className="photo-capture__banner" role="alert">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div className="photo-capture__actions">
          {mode === 'camera' ? (
            <>
              <button type="button" className="btn btn--ghost" onClick={cancelCamera}>
                Cancel
              </button>
              {(hasMultipleCameras || true) && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={toggleCamera}
                  title={`Switch to ${facingMode === 'user' ? 'back' : 'front'} camera`}
                >
                  🔄 {facingMode === 'user' ? 'Use Rear' : 'Use Front'}
                </button>
              )}
              <button type="button" className="btn btn--primary" onClick={capturePhoto}>
                📸 Take Snapshot
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload photo
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => startCamera(facingMode)}
                disabled={isStarting}
              >
                {isStarting ? 'Starting camera…' : '🎥 Use Live Camera'}
              </button>
            </>
          )}
        </div>
      </div>

      {photo && mode !== 'camera' && (
        <div className="photo-adjustments">
          <div className="photo-adjustments__header">
            <div>
              <p className="photo-adjustments__title">Photo fine-tuning</p>
              <p className="photo-adjustments__hint">Adjust contrast, saturation, and crop zoom for the badge.</p>
            </div>
            <button
              type="button"
              className="link-btn"
              onClick={() => onPhotoSettingsChange?.(DEFAULT_SETTINGS)}
            >
              Reset
            </button>
          </div>

          <div className="photo-adjustments__controls">
            <label className="photo-slider">
              <span>
                <span>Saturation</span>
                <b>{photoSettings.saturation}%</b>
              </span>
              <input
                type="range"
                min="0"
                max="200"
                value={photoSettings.saturation}
                onChange={(e) => updateSetting('saturation', e.target.value)}
              />
            </label>
            <label className="photo-slider">
              <span>
                <span>Contrast</span>
                <b>{photoSettings.contrast}%</b>
              </span>
              <input
                type="range"
                min="50"
                max="180"
                value={photoSettings.contrast}
                onChange={(e) => updateSetting('contrast', e.target.value)}
              />
            </label>
            <label className="photo-slider">
              <span>
                <span>Zoom</span>
                <b>{photoSettings.zoom}%</b>
              </span>
              <input
                type="range"
                min="100"
                max="180"
                value={photoSettings.zoom}
                onChange={(e) => updateSetting('zoom', e.target.value)}
              />
            </label>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
    </div>
  )
}
