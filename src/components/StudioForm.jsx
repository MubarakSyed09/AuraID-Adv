import FormField from './FormField'
import PhotoCapture from './PhotoCapture'
import {
  isRoleLocked,
  ROLES,
  getThemesForRole,
  getDefaultThemeForRole,
  isThemeValidForRole,
} from '../utils/themeManager'

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

export default function StudioForm({
  activeTab,
  onTabChange,
  formData,
  onFieldChange,
  onClear,
  photo,
  onPhotoChange,
  photoSettings,
  onPhotoSettingsChange,
  verified,
  verificationReason,
  glassTheme,
  onGlassThemeChange,
  onComplete,
}) {
  const currentRole = formData.role || 'student'
  const isStudent = currentRole === 'student'
  const isFaculty = currentRole === 'faculty'
  const roleLocked = isRoleLocked()

  const tabs = [
    { id: 'personal', label: 'Personal Details', icon: '◍' },
    {
      id: 'academic',
      label: isStudent ? 'Academic Details' : isFaculty ? 'Faculty Details' : 'Staff Details',
      icon: '◔',
    },
    { id: 'biometrics', label: 'Biometrics & Photo', icon: '◎' },
    { id: 'security', label: 'Security & Theme', icon: '◈' },
  ]

  const tabIndex = tabs.findIndex((t) => t.id === activeTab)

  const metaMap = {
    personal: {
      title: isStudent
        ? 'Personal Profile & Emergency Identity'
        : isFaculty
        ? 'Faculty Personal Profile & Identity'
        : 'Staff Personal Profile & Identity',
      subtitle: 'Cryptographically anchored member biodata, residential address and medical marker.',
    },
    academic: {
      title: isStudent
        ? 'Academic & Institutional Record'
        : isFaculty
        ? 'Faculty Appointment & Academic Department'
        : 'Staff Assignment & Institutional Unit',
      subtitle: isStudent
        ? 'Degree program, section, cohort metrics, and academic batch.'
        : isFaculty
        ? 'Academic designation, department, and faculty employment tenure.'
        : 'Staff designation, administrative department, and employment status.',
    },
    biometrics: {
      title: 'Biometric Photo Capture',
      subtitle: 'Upload a file or capture one live — used for the card portrait.',
    },
    security: {
      title: 'Security & Theme',
      subtitle: 'Institutional verification state and physical card glass finish.',
    },
  }
  const meta = metaMap[activeTab] || metaMap.personal

  function handleChange(e) {
    onFieldChange(e.target.name, e.target.value)
  }

  function handleRoleChange(newRole) {
    if (roleLocked) return
    onFieldChange('role', newRole)
    if (!isThemeValidForRole(glassTheme, newRole)) {
      onGlassThemeChange(getDefaultThemeForRole(newRole))
    }
    // If switching away from student, clear student-only fields
    if (newRole !== 'student') {
      onFieldChange('studentType', '')
      onFieldChange('section', '')
      onFieldChange('cgpa', '')
      onFieldChange('credits', '')
      onFieldChange('cohortRank', '')
    }
  }

  function goTo(delta) {
    const nextIndex = (tabIndex + delta + tabs.length) % tabs.length
    onTabChange(tabs[nextIndex].id)
  }

  function getCircularOffset(index) {
    let offset = index - tabIndex
    if (offset > tabs.length / 2) offset -= tabs.length
    if (offset < -tabs.length / 2) offset += tabs.length
    return offset
  }

  return (
    <section className="studio-form">
      <div className="studio-form__intro">
        <div>
          <p className="studio-form__kicker">ID Studio · Credential Creator</p>
          <p className="studio-form__lead">Configure your official institutional digital credential.</p>
        </div>
        <button type="button" className="link-btn" onClick={onClear}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 12a8 8 0 1 1 3 6.2M4 12V7m0 5h5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Clear blanks
        </button>
      </div>

      {/* Role Selector */}
      <div className="role-selection-bar" style={{ marginBottom: 16 }}>
        <span className="field__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Institutional Role
          {roleLocked && <small style={{ color: 'var(--violet-600)', fontWeight: 600 }}>(Locked by login)</small>}
        </span>
        <div className="role-picker">
          {Object.values(ROLES).map((r) => (
            <button
              key={r.id}
              type="button"
              className={`role-chip ${currentRole === r.id ? 'is-active' : ''}`}
              onClick={() => handleRoleChange(r.id)}
              disabled={roleLocked && currentRole !== r.id}
            >
              <span>{r.badge.split(' ')[0]}</span>
              {r.name}
            </button>
          ))}
        </div>
      </div>

      <div
        className="studio-tabs studio-tabs--orbit"
        role="tablist"
        aria-label="Credential sections"
        onWheel={(e) => {
          if (Math.abs(e.deltaY) < 4) return
          e.preventDefault()
          goTo(e.deltaY > 0 ? 1 : -1)
        }}
      >
        <button
          type="button"
          className="studio-tabs__arrow studio-tabs__arrow--prev"
          onClick={() => goTo(-1)}
          aria-label="Previous category"
        >
          ‹
        </button>

        <div className="studio-tabs__orbit">
          {tabs.map((tab, index) => {
            const offset = getCircularOffset(index)
            const distance = Math.abs(offset)
            const wheelAngle = offset * 72
            const x = Math.sin((wheelAngle * Math.PI) / 180) * 116
            const depth = Math.cos((wheelAngle * Math.PI) / 180) * 108
            const scale = offset === 0 ? 1 : distance === 1 ? 0.84 : 0.68
            const opacity = offset === 0 ? 1 : distance === 1 ? 0.78 : 0.36

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`studio-tabs__tab ${activeTab === tab.id ? 'is-active' : ''}`}
                style={{
                  '--tab-x': `${x}px`,
                  '--tab-depth': `${depth}px`,
                  '--tab-scale': scale,
                  '--tab-opacity': opacity,
                  '--tab-angle': `${wheelAngle}deg`,
                  '--tab-z': 20 - distance,
                }}
                onClick={() => onTabChange(tab.id)}
              >
                <span className="studio-tabs__icon">{tab.icon}</span>
                {tab.label}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          className="studio-tabs__arrow studio-tabs__arrow--next"
          onClick={() => goTo(1)}
          aria-label="Next category"
        >
          ›
        </button>
      </div>

      <div className="studio-panel">
        <div className="studio-panel__header">
          <div>
            <h2>{meta.title}</h2>
            <p>{meta.subtitle}</p>
          </div>
          <span className="pill pill--muted">Step {String(tabIndex + 1).padStart(2, '0')} / 04</span>
        </div>

        {activeTab === 'personal' && (
          <div className="studio-panel__body">
            <div className="field-grid">
              <FormField
                label="Full legal name"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                required
                placeholder="Enter your full legal name..."
              />
              <FormField
                label={isStudent ? 'Roll / Identification Number' : isFaculty ? 'Faculty / Employee ID' : 'Staff / Employee ID'}
                name="rollNumber"
                value={formData.rollNumber}
                onChange={handleChange}
                required
                placeholder={isStudent ? 'e.g. CR80-NFC-ED25519' : isFaculty ? 'e.g. FAC-CS-101' : 'e.g. STF-ADM-301'}
              />
              <FormField
                label="Date of birth"
                name="dob"
                type="date"
                value={formData.dob}
                onChange={handleChange}
                required
              />
              <FormField
                label="Institutional / personal email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="e.g. name@university.edu"
              />
              <FormField
                label="Primary phone number"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                placeholder="e.g. +1 (555) 000-0000"
              />

              {/* Role-Specific Personal Info */}
              {isStudent ? (
                <>
                  <FormField
                    label="Social / portfolio handle"
                    name="handle"
                    value={formData.handle}
                    onChange={handleChange}
                    placeholder="e.g. @your_handle"
                  />
                  <FormField
                    label="Card bio subtitle / title"
                    name="bioTitle"
                    value={formData.bioTitle}
                    onChange={handleChange}
                    placeholder="e.g. Computer Science Scholar"
                    span={2}
                  />
                </>
              ) : isFaculty ? (
                <>
                  <FormField
                    label="Faculty Designation / Rank"
                    name="degreeProgram"
                    value={formData.degreeProgram}
                    onChange={handleChange}
                    placeholder="e.g. Professor of Distributed Systems"
                  />
                  <FormField
                    label="Academic Department / School"
                    name="department"
                    value={formData.department}
                    onChange={handleChange}
                    placeholder="e.g. School of Engineering"
                  />
                </>
              ) : (
                <>
                  <FormField
                    label="Staff Designation / Title"
                    name="degreeProgram"
                    value={formData.degreeProgram}
                    onChange={handleChange}
                    placeholder="e.g. Senior Academic Administrator"
                  />
                  <FormField
                    label="Department / Operational Unit"
                    name="department"
                    value={formData.department}
                    onChange={handleChange}
                    placeholder="e.g. Office of the Registrar"
                  />
                </>
              )}

              <FormField
                label="Residency Address"
                name="address"
                value={formData.address || ''}
                onChange={handleChange}
                placeholder="e.g. 42 Maple Street, Apt 3B, Boston, MA"
                span={2}
              />
            </div>

            <div className="blood-group">
              <span className="field__label">Blood group classification</span>
              <div className="blood-group__options">
                {BLOOD_GROUPS.map((bg) => (
                  <button
                    key={bg}
                    type="button"
                    className={`blood-chip ${formData.bloodGroup === bg ? 'is-active' : ''}`}
                    onClick={() => onFieldChange('bloodGroup', bg)}
                  >
                    {bg}
                  </button>
                ))}
              </div>
            </div>

            <div className="subsection">
              <p className="subsection__title">Emergency contact</p>
              <div className="field-grid">
                <FormField
                  label="Contact name & relationship"
                  name="emergencyName"
                  value={formData.emergencyName}
                  onChange={handleChange}
                  placeholder="e.g. Dr. Tariq Ahmed (Guardian)"
                />
                <FormField
                  label="Emergency phone line"
                  name="emergencyPhone"
                  type="tel"
                  value={formData.emergencyPhone}
                  onChange={handleChange}
                  placeholder="+1 (617) 555-0199"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'academic' && (
          <div className="studio-panel__body">
            <div className="field-grid">
              <FormField
                label="University / institution"
                name="institution"
                value={formData.institution}
                onChange={handleChange}
                required
                placeholder="e.g. Aura Academy"
              />
              <FormField
                label={isStudent ? 'Student Roll / ID number' : isFaculty ? 'Faculty / Employee ID' : 'Staff / Employee ID'}
                name="rollNumber"
                value={formData.rollNumber}
                onChange={handleChange}
                required
                placeholder={isStudent ? 'e.g. CR80-NFC-ED25519' : isFaculty ? 'e.g. FAC-CS-101' : 'e.g. STF-ADM-301'}
              />
              <FormField
                label={isStudent ? 'Degree program / major' : isFaculty ? 'Academic designation / title' : 'Staff designation / role'}
                name="degreeProgram"
                value={formData.degreeProgram}
                onChange={handleChange}
                required
                placeholder={isStudent ? 'e.g. B.Sc. Computer Science' : isFaculty ? 'e.g. Professor of Distributed Systems' : 'e.g. Senior Academic Administrator'}
              />
              <FormField
                label={isStudent ? 'Academic department / faculty' : isFaculty ? 'Academic department / school' : 'Administrative department / unit'}
                name="department"
                value={formData.department}
                onChange={handleChange}
                placeholder={isStudent ? 'e.g. School of Engineering' : isFaculty ? 'e.g. Department of Computer Science' : 'e.g. Office of the Registrar'}
              />
              <FormField
                label={isStudent ? 'Academic batch' : isFaculty ? 'Tenure / employment period' : 'Employment status / appointment'}
                name="batch"
                value={formData.batch}
                onChange={handleChange}
                placeholder={isStudent ? 'e.g. 2024 – 2028' : isFaculty ? 'e.g. Tenured Faculty' : 'e.g. Permanent Full-Time'}
              />

              {/* STUDENT ONLY FIELDS: Student Type & Section */}
              {isStudent && (
                <>
                  <div className="field" style={{ gridColumn: 'span 1' }}>
                    <span className="field__label">
                      Student Type <span className="field__required">*</span>
                    </span>
                    <div className="student-type-picker">
                      <button
                        type="button"
                        className={`student-type-chip ${formData.studentType === 'Day Scholar' ? 'is-active' : ''}`}
                        onClick={() => onFieldChange('studentType', 'Day Scholar')}
                      >
                        ☀️ Day Scholar
                      </button>
                      <button
                        type="button"
                        className={`student-type-chip ${formData.studentType === 'Hosteler' ? 'is-active' : ''}`}
                        onClick={() => onFieldChange('studentType', 'Hosteler')}
                      >
                        🏢 Hosteler
                      </button>
                    </div>
                  </div>

                  <FormField
                    label="Academic / Class Section"
                    name="section"
                    value={formData.section}
                    onChange={handleChange}
                    placeholder="e.g. Section A, Alpha-1"
                  />

                  <FormField
                    label="Current cGPA"
                    name="cgpa"
                    value={formData.cgpa}
                    onChange={handleChange}
                    placeholder="e.g. 3.95"
                  />
                  <FormField
                    label="Credits earned"
                    name="credits"
                    value={formData.credits}
                    onChange={handleChange}
                    placeholder="e.g. 96"
                  />
                  <FormField
                    label="Cohort rank"
                    name="cohortRank"
                    value={formData.cohortRank}
                    onChange={handleChange}
                    placeholder="e.g. 12"
                  />
                </>
              )}

              <FormField
                label="Card valid until"
                name="validUntil"
                type="date"
                value={formData.validUntil}
                onChange={handleChange}
                required
                span={2}
              />
            </div>
          </div>
        )}

        {activeTab === 'biometrics' && (
          <div className="studio-panel__body">
            <PhotoCapture
              photo={photo}
              onPhotoChange={onPhotoChange}
              photoSettings={photoSettings}
              onPhotoSettingsChange={onPhotoSettingsChange}
            />
          </div>
        )}

        {activeTab === 'security' && (
          <div className="studio-panel__body">
            {/* Status Display: Pending vs Verified */}
            <div className="security-row">
              <span className="field__label">Registrar Verification Status</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                <span className={`pill ${verified ? 'pill--secure' : 'pill--muted'}`}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: verified ? '#16a34a' : '#d97706',
                    }}
                  />
                  {verified ? '✓ Verified' : '⏳ Pending'}
                </span>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--ink-2)', maxWidth: 380 }}>
                  {verified
                    ? verificationReason || 'Credential has been approved and verified by the institutional administrator.'
                    : 'New registrations start as Pending. An institutional administrator will inspect and approve your credential.'}
                </p>
              </div>
            </div>


            {/* Role-Aware Glass Theme Swatches */}
            <div className="security-row">
              <span className="field__label">
                {currentRole === 'student' ? 'Student' : isFaculty ? 'Faculty' : 'Staff'} card glass finish
              </span>
              <div className="glass-swatches">
                {getThemesForRole(currentRole).map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    className={`glass-swatch glass-swatch--${theme.id} ${
                      glassTheme === theme.id ? 'is-active' : ''
                    }`}
                    onClick={() => onGlassThemeChange(theme.id)}
                  >
                    {theme.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="studio-panel__nav">
          <button type="button" className="btn btn--ghost" onClick={() => goTo(-1)}>
            ← Previous
          </button>
          {activeTab === 'security' ? (
            <button type="button" className="btn btn--complete" onClick={onComplete}>
              ✓ Submit &amp; Verify Credential
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => goTo(1)}>
              Next category →
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
