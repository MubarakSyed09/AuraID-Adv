import { useState } from 'react'
import Barcode from './Barcode'

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export default function IDCardPreview({
  data,
  photo,
  photoSettings = { saturation: 100, contrast: 100, zoom: 100 },
  glassTheme = 'lavender',
  verified = false,
  flipped,
  onFlip,
  frontRef,
  backRef,
}) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  function handleMouseMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    setTilt({ x: py * -12, y: px * 16 })
  }

  function handleMouseLeave() {
    setTilt({ x: 0, y: 0 })
  }

  const role = data.role || 'student'
  const isStudent = role === 'student'
  const name = data.fullName || 'Your Full Name'
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  const credentialId = data.rollNumber || data.fullName || 'AURA-ID'
  const photoStyle = {
    filter: `saturate(${photoSettings.saturation}%) contrast(${photoSettings.contrast}%)`,
    transform: `scale(${photoSettings.zoom / 100})`,
  }

  return (
    <div className={`card-scene glass-theme--${glassTheme} card-scene--${role}`}>
      <div
        className={`id-card id-card--${role} ${flipped ? 'id-card--flipped' : ''}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y + (flipped ? 180 : 0)}deg)`,
        }}
      >
        {/* FRONT SIDE (No barcode on front) */}
        <div className={`id-card__face id-card__face--front id-card__face--${role}`} ref={frontRef}>
          <div className="id-card__sheen" />

          {/* Top Brand & Role Crest */}
          <div className="id-card__top">
            <div className="id-card__brandmark">
              <span className={`id-card__mark id-card__mark--${role}`}>
                {isStudent ? '✦' : role === 'faculty' ? '🏛️' : '💼'}
              </span>
              <div>
                <p className="id-card__institution">{data.institution || 'AURA ACADEMY'}</p>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className={`badge ${verified ? 'badge--verified' : 'badge--pending'}`}>
                    <span className="badge__dot" />
                    {verified ? 'Verified' : 'Pending'}
                  </span>
                  <span className={`badge badge--role-${role}`}>
                    {role.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
            <button type="button" className="icon-btn" onClick={onFlip} aria-label="Flip card to back">
              ⟲
            </button>
          </div>

          {/* Member Identity & Portrait */}
          <div className={`id-card__identity id-card__identity--${role}`}>
            <div className={`id-card__photo-ring id-card__photo-ring--${role}`}>
              <div className="id-card__photo">
                {photo ? <img src={photo} alt={name} style={photoStyle} /> : <span>{initials || 'ID'}</span>}
              </div>
            </div>
            <div className="id-card__names">
              <p className="id-card__name">{name}</p>
              <p className="id-card__handle">
                {data.handle ? `${data.handle} · ` : ''}
                {data.bioTitle || (isStudent ? 'Student Scholar' : role === 'faculty' ? (data.degreeProgram || 'Faculty Instructor') : (data.degreeProgram || 'Campus Personnel'))}
              </p>
            </div>
          </div>

          {/* Role-Specific Stats / Metrics */}
          {isStudent ? (
            <div className="id-card__stats">
              <div>
                <span>{data.credits || '0'}</span>
                <label>credits</label>
              </div>
              <div>
                <span>{data.cohortRank || '0'}</span>
                <label>cohort rank</label>
              </div>
              <div>
                <span>{data.cgpa || '0.00'}</span>
                <label>cGPA</label>
              </div>
            </div>
          ) : role === 'faculty' ? (
            <div className="id-card__stats id-card__stats--faculty">
              <div>
                <span style={{ fontSize: '0.82rem', letterSpacing: '0.02em' }}>{data.rollNumber || 'FAC-AUTH'}</span>
                <label>Faculty ID</label>
              </div>
              <div>
                <span style={{ fontSize: '0.82rem' }}>{data.department ? data.department.split(' ')[0] : 'ACADEMIC'}</span>
                <label>Department</label>
              </div>
              <div>
                <span style={{ fontSize: '0.82rem', color: 'var(--card-ink)' }}>PROFESSORIAL</span>
                <label>Appointment</label>
              </div>
            </div>
          ) : (
            <div className="id-card__stats id-card__stats--staff">
              <div>
                <span style={{ fontSize: '0.82rem', letterSpacing: '0.02em' }}>{data.rollNumber || 'STF-AUTH'}</span>
                <label>Employee ID</label>
              </div>
              <div>
                <span style={{ fontSize: '0.82rem' }}>{data.department ? data.department.split(' ')[0] : 'OPERATIONS'}</span>
                <label>Division</label>
              </div>
              <div>
                <span style={{ fontSize: '0.82rem', color: 'var(--card-ink)' }}>AUTHORIZED</span>
                <label>Standing</label>
              </div>
            </div>
          )}

          {/* Role-Specific Metadata */}
          <dl className={`id-card__meta id-card__meta--${role}`}>
            {isStudent ? (
              <>
                <div>
                  <dt>Degree &amp; Section</dt>
                  <dd>
                    {data.degreeProgram || 'Undeclared major'}
                    {data.section ? ` · Sec ${data.section}` : ''}
                  </dd>
                </div>
                <div>
                  <dt>Department</dt>
                  <dd>{data.department || '—'}</dd>
                </div>
                <div>
                  <dt>Type / Batch</dt>
                  <dd>{[data.studentType, data.batch].filter(Boolean).join(' · ') || '—'}</dd>
                </div>
              </>
            ) : role === 'faculty' ? (
              <>
                <div>
                  <dt>Academic Title / Rank</dt>
                  <dd>{data.degreeProgram || 'Faculty Member'}</dd>
                </div>
                <div>
                  <dt>Department / School</dt>
                  <dd>{data.department || 'Academic Division'}</dd>
                </div>
                <div>
                  <dt>Tenure / Period</dt>
                  <dd>{data.batch || 'Permanent Faculty'}</dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt>Position / Title</dt>
                  <dd>{data.degreeProgram || 'Administrative Staff'}</dd>
                </div>
                <div>
                  <dt>Department / Unit</dt>
                  <dd>{data.department || 'Campus Operations'}</dd>
                </div>
                <div>
                  <dt>Employment Status</dt>
                  <dd>{data.batch || 'Permanent Staff'}</dd>
                </div>
              </>
            )}
          </dl>

          <div className="id-card__footer">
            <span className="id-card__verify-url">auraid.edu/verify/{data.rollNumber || 'credential-uid'}</span>
            <span className="id-card__exp">EXP {formatDate(data.validUntil)}</span>
          </div>

          <div className="id-card__actions">
            <button
              type="button"
              className={`chip-btn ${verified ? 'chip-btn--solid' : ''}`}
              title={verified ? 'Credential is verified and approved' : 'Pending authoritative approval'}
            >
              {verified ? '✓ Verified' : '⏳ Pending'}
            </button>
            <button type="button" className="chip-btn chip-btn--icon" onClick={onFlip} aria-label="Flip Card">
              ⟲ Flip to Back
            </button>
          </div>
        </div>

        {/* BACK SIDE (WITH BARCODE) */}
        <div className={`id-card__face id-card__face--back id-card__face--back-${role}`} ref={backRef}>
          <div className="id-card__sheen" />
          <div className="id-card__magstripe" />

          <div className="id-card__back-content">
            {/* Backside Contact Details: Email, Blood Group, Phone Number, Residential Address */}
            <dl className="id-card__contact">
              <div className="id-card__contact-item">
                <dt>Email</dt>
                <dd title={data.email}>{data.email || '—'}</dd>
              </div>
              <div className="id-card__contact-item">
                <dt>Blood Group</dt>
                <dd>{data.bloodGroup || '—'}</dd>
              </div>
              <div className="id-card__contact-item">
                <dt>Phone Number</dt>
                <dd>{data.phone || '—'}</dd>
              </div>
              <div className="id-card__contact-item id-card__contact-item--address">
                <dt>Residential Address</dt>
                <dd className="id-card__address" title={data.address}>
                  {data.address || '—'}
                </dd>
              </div>
            </dl>

            {/* Scannable Code 128 Barcode with Member ID */}
            <div className="id-card__barcode-section">
              <Barcode value={credentialId} />
              <p className="id-card__barcode-id">ID: {credentialId}</p>
            </div>

            <p className="id-card__signature">
              {isStudent
                ? "Registrar's Office · cryptographically verified"
                : role === 'faculty'
                ? 'Office of Academic Affairs · Certified Credential'
                : 'Campus Operations Directorate · Cryptographically Verified'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}