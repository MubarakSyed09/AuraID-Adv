import { useState, useEffect } from 'react'

export default function PublicVerifyModal({ initialId = '', onClose }) {
  const [queryId, setQueryId] = useState(initialId)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function performLookup(idToVerify) {
    const clean = String(idToVerify || '').trim()
    if (!clean) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch(`/api/verify/${encodeURIComponent(clean)}`)
      const data = await res.json()
      if (res.ok && data.found && data.member) {
        setResult(data.member)
      } else {
        setError(data.error || `No institutional credential found for ID "${clean}".`)
      }
    } catch (err) {
      setError('Unable to contact verification service. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialId) {
      performLookup(initialId)
    }
  }, [initialId])

  function handleSubmit(e) {
    e.preventDefault()
    performLookup(queryId)
  }

  return (
    <div className="admin-modal" onClick={onClose}>
      <div
        className="admin-modal-card"
        style={{ maxWidth: 540 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: '1.4rem' }}>🛡️</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Institutional ID Verification</h2>
            <p className="admin-muted" style={{ margin: 0, fontSize: '0.78rem' }}>
              Cryptographic verification of AuraID student, faculty &amp; staff credentials.
            </p>
          </div>
        </div>

        {/* Search Input Bar for Barcode or Roll Number */}
        <form onSubmit={handleSubmit} style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <input
            type="text"
            className="field__control"
            placeholder="Scan barcode or enter Roll / Employee ID…"
            value={queryId}
            onChange={(e) => setQueryId(e.target.value)}
            style={{ flex: 1 }}
            autoFocus
          />
          <button
            type="submit"
            className="btn btn--primary btn--verify"
            disabled={loading || !queryId.trim()}
            style={{ padding: '0 18px', whiteSpace: 'nowrap' }}
          >
            {loading ? 'Verifying…' : '🔍 Verify'}
          </button>
        </form>

        {error && (
          <div
            className="admin-error"
            style={{
              marginTop: 14,
              background: '#fff1f2',
              borderColor: '#fecdd3',
              color: '#9f1239',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: '0.82rem',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Verification Result Card */}
        {result && (
          <div
            style={{
              marginTop: 16,
              background: result.verified ? '#f0fdf4' : '#fffbeb',
              border: `1px solid ${result.verified ? '#86efac' : '#fde68a'}`,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 10px',
                    borderRadius: 999,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    background: result.verified ? '#dcfce7' : '#fef3c7',
                    color: result.verified ? '#15803d' : '#b45309',
                    marginBottom: 6,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: result.verified ? '#16a34a' : '#d97706' }} />
                  {result.verified ? '✓ Official Verified Credential' : '⏳ Pending Administrative Verification'}
                </span>
                <h3 style={{ margin: '4px 0 2px', fontSize: '1.15rem', color: 'var(--ink-0)' }}>
                  {result.fullName}
                </h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--ink-1)' }}>
                  {result.institution || 'Aura Academy'} · <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{result.role}</span>
                </p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Identifier
                </span>
                <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9rem' }}>
                  {result.rollNumber}
                </p>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '10px 14px',
                marginTop: 14,
                paddingTop: 14,
                borderTop: '1px solid rgba(0, 0, 0, 0.08)',
                fontSize: '0.8rem',
              }}
            >
              <div>
                <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                  {result.role === 'student' ? 'Major / Degree' : 'Title / Appointment'}
                </span>
                <strong>{result.degreeProgram || '—'}</strong>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                  Department / Division
                </span>
                <strong>{result.department || 'Academic Division'}</strong>
              </div>

              {result.role === 'student' && result.studentType && (
                <div>
                  <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                    Enrollment Status
                  </span>
                  <strong>{[result.studentType, result.section ? `Sec ${result.section}` : null].filter(Boolean).join(' · ')}</strong>
                </div>
              )}

              {result.address && (
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                    Residential Address
                  </span>
                  <span>📍 {result.address}</span>
                </div>
              )}

              <div>
                <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                  Verification Method
                </span>
                <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: '#15803d', fontWeight: 600 }}>
                  {result.verificationMethod}
                </span>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                  Card Validity
                </span>
                <span>EXP {result.validUntil || '2028-06-30'}</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
