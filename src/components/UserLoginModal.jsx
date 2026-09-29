import { useState } from 'react'

export default function UserLoginModal({ onClose, onLoginSuccess }) {
  const [rollNumber, setRollNumber] = useState('')
  const [dob, setDob] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollNumber, dob }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      onLoginSuccess(data.user)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-modal" onClick={onClose}>
      <div className="admin-modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div style={{ marginBottom: 14 }}>
          <span className="badge" style={{ background: 'var(--violet-100)', color: 'var(--violet-600)' }}>
            ✦ Institutional Portal
          </span>
          <h2 style={{ marginTop: 8, fontSize: '1.4rem' }}>Member Login</h2>
          <p className="admin-muted" style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>
            Sign in as Student, Faculty, or Staff using your registered Roll / ID number and Date of Birth.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <label className="field">
            <span className="field__label">Roll / Identification Number</span>
            <input
              type="text"
              className="field__control"
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)}
              placeholder="e.g. CR80-NFC-ED25519 or FAC-CS-101"
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field__label">Date of Birth (Birthday)</span>
            <input
              type="date"
              className="field__control"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              required
            />
          </label>

          {error && (
            <div
              className="admin-error"
              style={
                error.toLowerCase().includes('pending')
                  ? {
                      background: '#fef3c7',
                      borderColor: '#f59e0b',
                      color: '#92400e',
                      fontWeight: 500,
                    }
                  : undefined
              }
            >
              {error.toLowerCase().includes('pending') ? '⏳ ' : '⚠️ '}
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button type="button" className="btn btn--ghost" onClick={onClose} style={{ flex: 1 }}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={loading} style={{ flex: 1.5 }}>
              {loading ? 'Authenticating…' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
