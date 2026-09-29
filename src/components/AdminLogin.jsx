import { useState } from 'react'

export default function AdminLogin({ onBack, onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      const res = await fetch('/api/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password}) })
      const text = await res.text()
      let data = {}
      try { data = text ? JSON.parse(text) : {} } catch {
        throw new Error(`Admin API returned an invalid response (${res.status}). Check the Netlify Functions deployment.`)
      }
      if (!res.ok) throw new Error(data.error || `Login failed (${res.status})`)
      onLogin()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return <div className="admin-page">
    <div className="admin-auth-card">
      <div className="admin-auth-brand">✦ <span>AuraID</span> <small>Admin</small></div>
      <p className="admin-kicker">Restricted access</p>
      <h1>Administrator Login</h1>
      <p className="admin-muted">Only authorized administrators can view issued credential records and student data.</p>
      <form onSubmit={submit} className="admin-login-form">
        <label>Password</label>
        <input autoFocus type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={16} required placeholder="Enter your admin password" />
        {error && <div className="admin-error">{error}</div>}
        <button className="btn btn--generate" disabled={busy}>{busy ? 'Authenticating…' : '🔐 Secure login'}</button>
      </form>
      <button className="btn btn--ghost admin-back" onClick={onBack}>← Back to AuraID</button>
    </div>
  </div>
}
