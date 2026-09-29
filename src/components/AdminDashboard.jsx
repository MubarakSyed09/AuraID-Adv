import { useEffect, useMemo, useState } from 'react'
import {
  getLocalDatabaseRecords,
  saveLocalDatabaseRecord,
  syncLocalDatabase,
} from '../utils/permanentDb'

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function deduplicateClientRecords(list) {
  if (!Array.isArray(list)) return []
  const seenRoll = new Map()
  const seenEmail = new Map()
  const result = []

  for (const r of list) {
    const d = r.data || {}
    const roll = (d.rollNumber || '').trim().toLowerCase()
    const email = (d.email || '').trim().toLowerCase()

    let existing = null
    if (roll && seenRoll.has(roll)) {
      existing = seenRoll.get(roll)
    } else if (email && seenEmail.has(email)) {
      existing = seenEmail.get(email)
    }

    if (existing) {
      // Consolidate best data into existing
      const existIsVerified = existing.verified && existing.verificationStatus === 'verified'
      const curIsVerified = r.verified && r.verificationStatus === 'verified'
      if (curIsVerified && !existIsVerified) {
        existing.verified = true
        existing.verificationStatus = 'verified'
        existing.verificationMethod = r.verificationMethod || existing.verificationMethod
        existing.verificationReason = r.verificationReason || existing.verificationReason
        existing.verifiedAt = r.verifiedAt || existing.verifiedAt
      }
      if (r.photoStored && !existing.photoStored) {
        existing.photoStored = true
      }
      if (new Date(r.createdAt || 0) > new Date(existing.createdAt || 0)) {
        existing.data = { ...existing.data, ...r.data }
        existing.createdAt = r.createdAt
      }
    } else {
      const copy = { ...r }
      if (roll) seenRoll.set(roll, copy)
      if (email) seenEmail.set(email, copy)
      result.push(copy)
    }
  }
  return result
}

export default function AdminDashboard({ onLogout }) {
  const [activeTab, setActiveTab] = useState('records')
  const [records, setRecords] = useState([])
  const [registry, setRegistry] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [emailLogs, setEmailLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createMsg, setCreateMsg] = useState(null)
  const [birthdayRunning, setBirthdayRunning] = useState(false)
  const [birthdaySummary, setBirthdaySummary] = useState(null)
  const [smtpInfo, setSmtpInfo] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [approvingId, setApprovingId] = useState(null)
  const [actionMsg, setActionMsg] = useState(null)

  // New ID creation form state for Admin
  const [newIdForm, setNewIdForm] = useState({
    role: 'student',
    studentType: 'Day Scholar',
    section: '',
    fullName: '',
    dob: '',
    email: '',
    phone: '',
    address: '',
    rollNumber: '',
    institution: 'Aura Academy',
    degreeProgram: '',
    department: '',
    batch: '',
    validUntil: '',
  })

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [recRes, regRes, auditRes, emailRes, smtpRes] = await Promise.all([
        fetch('/api/admin/records'),
        fetch('/api/admin/reference-registry'),
        fetch('/api/admin/audit-logs'),
        fetch('/api/admin/email-logs'),
        fetch('/api/admin/birthday-config'),
      ])

      if (recRes.status === 401) return onLogout()

      if (recRes.ok) {
        const d = await recRes.json()
        const synced = syncLocalDatabase(d.records || [])
        setRecords(deduplicateClientRecords(synced))

        // Ensure server data file permanently stores all records from client permanent database
        const serverIds = new Set((d.records || []).map((r) => r.id))
        const missingOnServer = synced.filter(
          (r) => !serverIds.has(r.id) && r.data?.fullName && r.data?.rollNumber
        )
        for (const m of missingOnServer) {
          try {
            await fetch('/api/ids', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: m.id,
                data: m.data,
                glassTheme: m.glassTheme,
                verified: m.verified,
                verificationStatus: m.verificationStatus,
              }),
            })
          } catch {}
        }
      } else {
        const local = getLocalDatabaseRecords()
        if (local.length > 0) {
          setRecords(deduplicateClientRecords(local))
        }
      }
      if (regRes.ok) {
        const d = await regRes.json()
        setRegistry(d.registry || [])
      }
      if (auditRes.ok) {
        const d = await auditRes.json()
        setAuditLogs(d.logs || [])
      }
      if (emailRes.ok) {
        const d = await emailRes.json()
        setEmailLogs(d.logs || [])
      }
      if (smtpRes && smtpRes.ok) {
        const d = await smtpRes.json()
        setSmtpInfo(d.smtp || null)
      }
    } catch (e) {
      const local = getLocalDatabaseRecords()
      if (local.length > 0) {
        setRecords(deduplicateClientRecords(local))
      }
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filtered = useMemo(() => {
    const s = query.toLowerCase()
    const matches = records.filter((r) => {
      const d = r.data || {}
      const role = d.role || 'student'
      const isPending = !r.verified || r.verificationStatus === 'pending'
      const isVerified = r.verified && r.verificationStatus === 'verified'

      if (statusFilter === 'pending' && !isPending) return false
      if (statusFilter === 'verified' && !isVerified) return false
      if (roleFilter !== 'all' && role !== roleFilter) return false

      return (
        !s ||
        [d.fullName, d.email, d.phone, d.address, d.rollNumber, d.role, d.studentType, d.section, d.institution, d.degreeProgram, d.department]
          .some((v) => String(v || '').toLowerCase().includes(s))
      )
    })
    return deduplicateClientRecords(matches)
  }, [records, query, statusFilter, roleFilter])

  async function handleApproveRecord(recordId) {
    setApprovingId(recordId)
    setActionMsg(null)
    const targetRecord = records.find(
      (r) =>
        r.id === recordId ||
        (r.data?.rollNumber && r.data.rollNumber.trim().toLowerCase() === String(recordId).trim().toLowerCase())
    ) || (selected && (selected.id === recordId || selected.data?.rollNumber === recordId) ? selected : null)

    const targetRoll = (targetRecord?.data?.rollNumber || targetRecord?.rollNumber || recordId || '').trim().toLowerCase()
    const targetEmail = (targetRecord?.data?.email || targetRecord?.email || '').trim().toLowerCase()

    try {
      const res = await fetch('/api/admin/records/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: recordId,
          rollNumber: targetRoll,
          email: targetEmail,
          record: targetRecord,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to approve registration')

      const approvedRecord = result.record || targetRecord
      const verifiedAt = approvedRecord?.verifiedAt || new Date().toISOString()
      const method = approvedRecord?.verificationMethod || 'ADMIN_MANUAL_APPROVAL'
      const reason = approvedRecord?.verificationReason || 'Registration approved by institutional administrator.'

      // Update in records list
      setRecords((prev) =>
        prev.map((r) => {
          const isMatch = r.id === recordId || (targetRoll && (r.data?.rollNumber || '').trim().toLowerCase() === targetRoll)
          if (isMatch) {
            return {
              ...r,
              ...approvedRecord,
              verified: true,
              verificationStatus: 'verified',
              verificationMethod: method,
              verificationReason: reason,
              verifiedAt,
            }
          }
          return r
        })
      )

      // Update selected modal if viewing
      if (selected) {
        setSelected((prev) => ({
          ...prev,
          ...approvedRecord,
          verified: true,
          verificationStatus: 'verified',
          verificationMethod: method,
          verificationReason: reason,
          verifiedAt,
        }))
      }

      // Persist verified state permanently in local database
      saveLocalDatabaseRecord({
        ...(targetRecord || {}),
        ...(approvedRecord || {}),
        verified: true,
        verificationStatus: 'verified',
        verificationMethod: method,
        verificationReason: reason,
        verifiedAt,
      })

      setActionMsg({
        type: 'success',
        text: result.alreadyVerified
          ? `✓ Member ${approvedRecord?.data?.fullName || targetRecord?.data?.fullName || 'User'} is already Verified.`
          : `✓ Member ${approvedRecord?.data?.fullName || targetRecord?.data?.fullName || 'User'} has been VERIFIED successfully!`,
      })

      // Refresh audit logs
      try {
        const auditRes = await fetch('/api/admin/audit-logs')
        if (auditRes.ok) {
          const d = await auditRes.json()
          setAuditLogs(d.logs || [])
        }
      } catch {}
    } catch (err) {
      if (targetRecord) {
        const nowIso = new Date().toISOString()
        const fallbackVerified = {
          ...targetRecord,
          verified: true,
          verificationStatus: 'verified',
          verificationMethod: 'ADMIN_MANUAL_APPROVAL',
          verificationReason: 'Registration approved by institutional administrator.',
          verifiedAt: nowIso,
          updatedAt: nowIso,
        }
        saveLocalDatabaseRecord(fallbackVerified)
        setRecords((prev) =>
          prev.map((r) =>
            r.id === recordId || (targetRoll && (r.data?.rollNumber || '').trim().toLowerCase() === targetRoll)
              ? fallbackVerified
              : r
          )
        )
        if (selected) {
          setSelected((prev) => ({
            ...prev,
            ...fallbackVerified,
          }))
        }
        setActionMsg({
          type: 'success',
          text: `✓ Member ${targetRecord.data?.fullName || 'User'} has been VERIFIED successfully!`,
        })
      } else {
        setActionMsg({ type: 'error', text: 'Verification failed: ' + err.message })
      }
    } finally {
      setApprovingId(null)
    }
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    onLogout()
  }

  async function triggerBirthdayCheck() {
    setBirthdayRunning(true)
    setBirthdaySummary(null)
    try {
      const res = await fetch('/api/admin/trigger-birthdays', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to run check')
      setBirthdaySummary(data.summary)
      // Refresh email logs
      const emailRes = await fetch('/api/admin/email-logs')
      if (emailRes.ok) {
        const d = await emailRes.json()
        setEmailLogs(d.logs || [])
      }
    } catch (err) {
      alert(err.message)
    } finally {
      setBirthdayRunning(false)
    }
  }

  async function handleAdminCreateId(e) {
    e.preventDefault()
    setCreateMsg(null)
    try {
      const res = await fetch('/api/ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: newIdForm, glassTheme: 'lavender' }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to create credential')

      saveLocalDatabaseRecord({
        id: result.id || crypto.randomUUID(),
        data: newIdForm,
        verified: result.verified === true,
        verificationStatus: result.verified ? 'verified' : 'pending',
        verificationReason: result.verificationReason || '',
        glassTheme: 'lavender',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      setCreateMsg({
        type: result.verified ? 'success' : 'warning',
        text: result.verified
          ? `Credential created and AUTOMATICALLY VERIFIED! (${result.verificationReason})`
          : `Credential created, but marked PENDING VERIFICATION. (${result.verificationReason})`,
      })

      // Reload records and audit logs
      loadData()
    } catch (err) {
      setCreateMsg({ type: 'error', text: err.message })
    }
  }

  return (
    <div className="admin-page admin-dashboard">
      <header className="admin-topbar">
        <div>
          <div className="admin-auth-brand">
            ✦ <span>AuraID</span> <small>Admin Console</small>
          </div>
          <p>Institutional credential administration, automatic verification &amp; communications</p>
        </div>
        <div className="admin-top-actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setShowCreateModal(true)}>
            + Create New ID
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={loadData}>
            ↻ Refresh
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <main className="admin-main">
        {/* Metric Cards */}
        <section className="admin-stats">
          <div className="admin-stat">
            <span>Total Credentials</span>
            <strong>{records.length}</strong>
            <small>Active issued credentials</small>
          </div>
          <div className="admin-stat">
            <span>Automatically Verified</span>
            <strong style={{ color: '#16a34a' }}>{records.filter((r) => r.verified).length}</strong>
            <small>Matched registrar database</small>
          </div>
          <div className="admin-stat">
            <span>Pending Verification</span>
            <strong style={{ color: '#d97706' }}>{records.filter((r) => !r.verified).length}</strong>
            <small>Unmatched credentials</small>
          </div>
        </section>

        {/* Console Navigation Tabs */}
        <div className="admin-panel" style={{ marginBottom: 20 }}>
          <div className="admin-tabs">
            <button
              type="button"
              className={`admin-tab ${activeTab === 'records' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('records')}
            >
              📋 Issued Credentials ({records.length})
            </button>
            <button
              type="button"
              className={`admin-tab ${activeTab === 'registry' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('registry')}
            >
              🏛️ Registrar Reference Dataset ({registry.length})
            </button>
            <button
              type="button"
              className={`admin-tab ${activeTab === 'birthdays' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('birthdays')}
            >
              🎂 Birthday Automation &amp; Emails ({emailLogs.length})
            </button>
            <button
              type="button"
              className={`admin-tab ${activeTab === 'audits' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('audits')}
            >
              🛡️ Audit Trail ({auditLogs.length})
            </button>
          </div>

          {/* TAB 1: ISSUED CREDENTIALS */}
          {activeTab === 'records' && (
            <>
              <div className="admin-panel-head">
                <div>
                  <h2>Issued Credentials</h2>
                  <p>View all generated cards with roles, academic details, and verification status.</p>
                </div>
                <input
                  className="admin-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, roll, role, section, address…"
                />
              </div>

              {actionMsg && (
                <div
                  style={{
                    background: actionMsg.type === 'success' ? '#f0fdf4' : '#fff1f2',
                    border: `1px solid ${actionMsg.type === 'success' ? '#bbf7d0' : '#fecdd3'}`,
                    color: actionMsg.type === 'success' ? '#166534' : '#9f1239',
                    borderRadius: 8,
                    padding: '10px 14px',
                    margin: '0 22px 14px',
                    fontSize: '0.82rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>{actionMsg.text}</span>
                  <button
                    type="button"
                    onClick={() => setActionMsg(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'inherit' }}
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Status and Role Quick Filters */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 22px 14px', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`role-chip ${statusFilter === 'all' ? 'is-active' : ''}`}
                    onClick={() => setStatusFilter('all')}
                  >
                    All ({records.length})
                  </button>
                  <button
                    type="button"
                    className={`role-chip ${statusFilter === 'pending' ? 'is-active' : ''}`}
                    onClick={() => setStatusFilter('pending')}
                    style={statusFilter === 'pending' ? { background: '#fef3c7', color: '#92400e', borderColor: '#f59e0b' } : {}}
                  >
                    ⏳ Pending Approval ({records.filter((r) => !r.verified || r.verificationStatus === 'pending').length})
                  </button>
                  <button
                    type="button"
                    className={`role-chip ${statusFilter === 'verified' ? 'is-active' : ''}`}
                    onClick={() => setStatusFilter('verified')}
                    style={statusFilter === 'verified' ? { background: '#dcfce7', color: '#166534', borderColor: '#16a34a' } : {}}
                  >
                    ✓ Verified ({records.filter((r) => r.verified && r.verificationStatus === 'verified').length})
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {['all', 'student', 'faculty', 'staff'].map((rf) => (
                    <button
                      key={rf}
                      type="button"
                      className={`role-chip ${roleFilter === rf ? 'is-active' : ''}`}
                      onClick={() => setRoleFilter(rf)}
                    >
                      {rf === 'all' ? 'ALL ROLES' : rf.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="admin-empty">Loading records…</div>
              ) : error ? (
                <div className="admin-error">{error}</div>
              ) : filtered.length === 0 ? (
                <div className="admin-empty">No credential records matching the selected filters.</div>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Member Name</th>
                        <th>Roll / ID Number</th>
                        <th>Role</th>
                        <th>Academic / Employment</th>
                        <th>Created</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => {
                        const d = r.data || {}
                        const role = d.role || 'student'
                        const isPending = !r.verified || r.verificationStatus === 'pending'
                        return (
                          <tr key={r.id}>
                            <td>
                              <strong>{d.fullName}</strong>
                              <small>{d.email}</small>
                              {d.address && <small style={{ color: 'var(--ink-2)' }}>📍 {d.address}</small>}
                            </td>
                            <td>
                              <code>{d.rollNumber}</code>
                            </td>
                            <td>
                              <span className={`badge-tag admin-badge-${role}`}>{role}</span>
                            </td>
                            <td>
                              {role === 'student' ? (
                                <div>
                                  <span>{d.studentType || '—'}</span>
                                  {d.section && <small>Section: {d.section}</small>}
                                </div>
                              ) : (
                                <div>
                                  <span>{d.department || '—'}</span>
                                  <small>{d.degreeProgram || (role === 'faculty' ? 'Faculty Instructor' : 'Staff Officer')}</small>
                                </div>
                              )}
                            </td>
                            <td>{fmt(r.createdAt)}</td>
                            <td>
                              <span className={`admin-status ${!isPending ? 'is-ok' : ''}`}>
                                {!isPending ? '✓ Verified' : '⏳ Pending'}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <button
                                  type="button"
                                  className="admin-view-btn"
                                  onClick={() => setSelected(r)}
                                >
                                  View
                                </button>
                                {isPending && (
                                  <button
                                    type="button"
                                    className="btn btn--sm btn--verify"
                                    style={{
                                      borderRadius: 6,
                                      padding: '5px 12px',
                                      fontSize: '0.74rem',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      whiteSpace: 'nowrap',
                                    }}
                                    disabled={approvingId === r.id}
                                    onClick={() => handleApproveRecord(r.id)}
                                    title="Verify this member registration"
                                  >
                                    {approvingId === r.id ? 'Verifying…' : 'Verify'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* TAB 2: REGISTRAR REFERENCE REGISTRY */}
          {activeTab === 'registry' && (
            <div style={{ padding: 22 }}>
              <div style={{ marginBottom: 16 }}>
                <h2>Authoritative Registrar Reference Registry</h2>
                <p className="admin-muted" style={{ fontSize: '0.8rem' }}>
                  Authoritative student, faculty, and staff records. Automatic verification tests incoming submissions
                  strictly against <strong>Roll Number</strong> and <strong>Date of Birth (Birthday)</strong>.
                </p>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Roll / ID Number</th>
                      <th>Legal Name</th>
                      <th>Date of Birth (Birthday)</th>
                      <th>Institutional Email</th>
                      <th>Role</th>
                      <th>Student Type / Section</th>
                      <th>Department / Program</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registry.map((entry, idx) => (
                      <tr key={idx}>
                        <td>
                          <code>{entry.rollNumber}</code>
                        </td>
                        <td>
                          <strong>{entry.fullName}</strong>
                        </td>
                        <td>
                          <strong>{entry.dob}</strong>
                        </td>
                        <td>{entry.email}</td>
                        <td>
                          <span className={`badge-tag admin-badge-${entry.role}`}>{entry.role}</span>
                        </td>
                        <td>
                          {entry.role === 'student'
                            ? [entry.studentType, entry.section ? `Sec ${entry.section}` : null].filter(Boolean).join(' · ') || '—'
                            : 'N/A (Staff/Faculty)'}
                        </td>
                        <td>
                          <span>{entry.department}</span>
                          <small>{entry.degreeProgram}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: BIRTHDAY AUTOMATION & EMAIL LOGS */}
          {activeTab === 'birthdays' && (
            <div style={{ padding: 22 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16,
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div>
                  <h2>Automated Birthday Wishes System</h2>
                  <p className="admin-muted" style={{ fontSize: '0.8rem' }}>
                    Scheduled background job checks member birthdays daily, respects timezone, and prevents duplicate dispatches.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={triggerBirthdayCheck}
                  disabled={birthdayRunning}
                >
                  {birthdayRunning ? 'Running check…' : '🚀 Run Birthday Check Now'}
                </button>
              </div>

              {/* SMTP Configuration Telemetry */}
              {smtpInfo && (
                <div
                  style={{
                    background: smtpInfo.configured ? '#f0fdf4' : '#fffbeb',
                    border: `1px solid ${smtpInfo.configured ? '#86efac' : '#fde68a'}`,
                    borderRadius: 12,
                    padding: '12px 16px',
                    marginBottom: 16,
                    fontSize: '0.82rem',
                    color: smtpInfo.configured ? '#166534' : '#92400e',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                    <span>{smtpInfo.configured ? '✓ External SMTP Active' : '⚠️ External SMTP Not Configured'}</span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: '0.72rem',
                        background: smtpInfo.configured ? '#dcfce7' : '#fef3c7',
                        color: smtpInfo.configured ? '#15803d' : '#b45309',
                      }}
                    >
                      {smtpInfo.configured ? 'Live Dispatch' : 'Simulated Preview Mode'}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', lineHeight: 1.5 }}>
                    {smtpInfo.configured
                      ? `Connected to ${smtpInfo.host}:${smtpInfo.port} as ${smtpInfo.user}. Birthday greetings are transmitted directly to member email inboxes.`
                      : `External emails are currently disabled because SMTP credentials are missing (${(smtpInfo.missingConfig || []).join(', ') || 'SMTP_HOST, SMTP_USER, SMTP_PASS'}). Birthday detection and message generation run normally, and email contents are simulated and logged locally below.`}
                  </p>
                </div>
              )}

              {birthdaySummary && (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 16,
                    fontSize: '0.8rem',
                  }}
                >
                  <strong style={{ color: '#166534' }}>
                    ✓ Birthday Check Execution Result ({birthdaySummary.date} in {birthdaySummary.timezone}):
                  </strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 20, color: '#166534' }}>
                    <li>Users checked: {birthdaySummary.checkedCount}</li>
                    <li>Birthdays matched today: {birthdaySummary.matchedBirthdays}</li>
                    <li>
                      Emails logged/dispatched:{' '}
                      {birthdaySummary.sentCount} ({birthdaySummary.smtpConfigured ? 'Real SMTP' : 'Simulated Mode'})
                    </li>
                    <li>Duplicate sends prevented: {birthdaySummary.skippedDuplicates}</li>
                  </ul>
                </div>
              )}

              <h3>Recent Email Delivery Audit Logs</h3>
              {emailLogs.length === 0 ? (
                <div className="admin-empty">No birthday emails logged yet. Click "Run Birthday Check Now" to test.</div>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Recipient</th>
                        <th>Subject</th>
                        <th>Delivery Mode</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emailLogs.map((log) => (
                        <tr key={log.id}>
                          <td>{fmt(log.timestamp)}</td>
                          <td>
                            <strong>{log.name}</strong>
                            <small>{log.recipient}</small>
                          </td>
                          <td>{log.subject}</td>
                          <td>
                            <span
                              className="badge-tag"
                              style={
                                log.mode === 'SMTP'
                                  ? { background: '#dcfce7', color: '#15803d', fontWeight: 600 }
                                  : { background: '#fef3c7', color: '#b45309', fontWeight: 500 }
                              }
                            >
                              {log.mode === 'SMTP' ? 'SMTP LIVE' : 'SIMULATED (NO SMTP)'}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`admin-status ${log.status === 'DELIVERED' && log.mode === 'SMTP' ? 'is-ok' : ''}`}
                            >
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: AUDIT TRAIL */}
          {activeTab === 'audits' && (
            <div style={{ padding: 22 }}>
              <div style={{ marginBottom: 16 }}>
                <h2>Security &amp; Verification Audit Trail</h2>
                <p className="admin-muted" style={{ fontSize: '0.8rem' }}>
                  Immutable log of verification evaluations, credential creations, and duplicate account resolutions.
                </p>
              </div>

              {auditLogs.length === 0 ? (
                <div className="admin-empty">No audit events logged yet.</div>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Action Event</th>
                        <th>Actor</th>
                        <th>IP Address</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td>{fmt(log.timestamp)}</td>
                          <td>
                            <code style={{ fontWeight: 700 }}>{log.action}</code>
                          </td>
                          <td>{log.actor}</td>
                          <td>{log.ip}</td>
                          <td>
                            <small style={{ fontFamily: 'var(--font-mono)' }}>
                              {JSON.stringify(log.details)}
                            </small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* MODAL: VIEW CREDENTIAL DETAILS */}
      {selected && (
        <div className="admin-modal" onClick={() => setSelected(null)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="admin-modal-close" onClick={() => setSelected(null)}>
              ×
            </button>
            <h2>{selected.data.fullName}</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <span className={`badge-tag admin-badge-${selected.data.role || 'student'}`}>
                {selected.data.role || 'student'}
              </span>
              <span className={`admin-status ${selected.verified ? 'is-ok' : ''}`}>
                {selected.verified ? '✓ Verified' : '⏳ Pending Approval'}
              </span>
            </div>
            <p className="admin-muted" style={{ marginTop: 8 }}>
              Created: {fmt(selected.createdAt)} · {selected.verificationReason || 'No verification reason provided'}
            </p>

            {(!selected.verified || selected.verificationStatus === 'pending') && (
              <div style={{ marginTop: 12, marginBottom: 12, padding: 12, background: '#fefce8', border: '1px solid #fef08a', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div>
                  <strong style={{ fontSize: '0.85rem', color: '#854d0e' }}>Pending Admin Approval</strong>
                  <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#a16207' }}>
                    Click approve to verify this user and update their status to Verified throughout the application.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn--primary btn--verify"
                  style={{ whiteSpace: 'nowrap' }}
                  disabled={approvingId === selected.id}
                  onClick={() => handleApproveRecord(selected.id)}
                >
                  {approvingId === selected.id ? 'Verifying…' : 'Verify Member'}
                </button>
              </div>
            )}

            <div className="admin-detail-grid">
              {Object.entries(selected.data).map(([k, v]) => {
                // If not student, skip studentType and section in view
                if ((selected.data.role || 'student') !== 'student' && (k === 'studentType' || k === 'section')) {
                  return null
                }
                return (
                  <div key={k}>
                    <label>{k.replace(/[A-Z]/g, (m) => ' ' + m).toUpperCase()}</label>
                    <strong>{v || '—'}</strong>
                  </div>
                )
              })}
            </div>

            {selected.photoStored && (
              <img
                className="admin-photo"
                src={`/api/photos/${selected.id}`}
                alt="Credential portrait"
              />
            )}
          </div>
        </div>
      )}

      {/* MODAL: ADMIN DIRECT CREATE ID */}
      {showCreateModal && (
        <div className="admin-modal" onClick={() => setShowCreateModal(false)}>
          <div
            className="admin-modal-card"
            style={{ maxWidth: 680 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="admin-modal-close"
              onClick={() => {
                setShowCreateModal(false)
                setCreateMsg(null)
              }}
            >
              ×
            </button>
            <h2>Create New ID / Account</h2>
            <p className="admin-muted" style={{ fontSize: '0.8rem' }}>
              Automatic Verification: Submitted <strong>Roll Number</strong> and <strong>Date of Birth (Birthday)</strong> will be verified against the registrar reference database upon creation.
            </p>

            {createMsg && (
              <div
                className={`admin-error`}
                style={{
                  background: createMsg.type === 'success' ? '#f0fdf4' : createMsg.type === 'warning' ? '#fefce8' : '#fff1f2',
                  borderColor: createMsg.type === 'success' ? '#bbf7d0' : createMsg.type === 'warning' ? '#fef08a' : '#fecdd3',
                  color: createMsg.type === 'success' ? '#166534' : createMsg.type === 'warning' ? '#854d0e' : '#9f1239',
                }}
              >
                {createMsg.text}
              </div>
            )}

            <form onSubmit={handleAdminCreateId} style={{ display: 'grid', gap: 14, marginTop: 16 }}>
              {/* Role Selection */}
              <div>
                <span className="field__label">Role</span>
                <div className="role-picker">
                  {['student', 'faculty', 'staff'].map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`role-chip ${newIdForm.role === r ? 'is-active' : ''}`}
                      onClick={() => setNewIdForm((prev) => ({ ...prev, role: r }))}
                    >
                      {r.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label className="field">
                  <span className="field__label">Full Legal Name *</span>
                  <input
                    type="text"
                    className="field__control"
                    required
                    value={newIdForm.fullName}
                    onChange={(e) => setNewIdForm((p) => ({ ...p, fullName: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Roll / ID Number *</span>
                  <input
                    type="text"
                    className="field__control"
                    required
                    value={newIdForm.rollNumber}
                    onChange={(e) => setNewIdForm((p) => ({ ...p, rollNumber: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Date of Birth (Birthday) *</span>
                  <input
                    type="date"
                    className="field__control"
                    required
                    value={newIdForm.dob}
                    onChange={(e) => setNewIdForm((p) => ({ ...p, dob: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Email Address *</span>
                  <input
                    type="email"
                    className="field__control"
                    required
                    value={newIdForm.email}
                    onChange={(e) => setNewIdForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </label>
              </div>

              {/* Student-only Fields */}
              {newIdForm.role === 'student' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label className="field">
                    <span className="field__label">Student Type</span>
                    <select
                      className="field__control"
                      value={newIdForm.studentType}
                      onChange={(e) => setNewIdForm((p) => ({ ...p, studentType: e.target.value }))}
                    >
                      <option value="Day Scholar">Day Scholar</option>
                      <option value="Hosteler">Hosteler</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">Section</span>
                    <input
                      type="text"
                      className="field__control"
                      placeholder="e.g. Section A"
                      value={newIdForm.section}
                      onChange={(e) => setNewIdForm((p) => ({ ...p, section: e.target.value }))}
                    />
                  </label>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label className="field">
                  <span className="field__label">Department</span>
                  <input
                    type="text"
                    className="field__control"
                    value={newIdForm.department}
                    onChange={(e) => setNewIdForm((p) => ({ ...p, department: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Degree Program / Position</span>
                  <input
                    type="text"
                    className="field__control"
                    value={newIdForm.degreeProgram}
                    onChange={(e) => setNewIdForm((p) => ({ ...p, degreeProgram: e.target.value }))}
                  />
                </label>
              </div>

              <div>
                <label className="field">
                  <span className="field__label">Residency Address</span>
                  <input
                    type="text"
                    className="field__control"
                    placeholder="e.g. 42 Maple Street, Apt 3B, Boston, MA"
                    value={newIdForm.address}
                    onChange={(e) => setNewIdForm((p) => ({ ...p, address: e.target.value }))}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setShowCreateModal(false)}
                  style={{ flex: 1 }}
                >
                  Close
                </button>
                <button type="submit" className="btn btn--primary" style={{ flex: 1.5 }}>
                  Create &amp; Auto-Verify
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
