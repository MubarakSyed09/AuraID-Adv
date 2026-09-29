import { ROLES } from '../utils/themeManager'

export default function TopNav({
  activeRole = 'student',
  currentUser = null,
  onOpenLogin,
  onLogoutUser,
  onReplayIntro,
  onAdmin,
  onOpenVerify,
}) {
  const roleConfig = ROLES[activeRole] || ROLES.student

  return (
    <header className="topnav">
      <div className="topnav__brand">
        <span className="topnav__logo">✦</span>
        <div>
          <p className="topnav__name">
            AuraID <span className="pill pill--brand">Studio</span>
          </p>
          <p className="topnav__sub">
            Digital Identity &amp; Credential Platform
          </p>
        </div>
      </div>

      <nav className="topnav__actions" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Active Role Theme Pill */}
        <span className="role-badge" title={roleConfig.description}>
          {roleConfig.badge}
        </span>

        <button type="button" className="btn btn--ghost btn--sm" onClick={onOpenVerify} title="Verify ID Card or Scan Barcode">
          🛡️ Verify ID
        </button>

        {currentUser ? (
          <div className="auth-status-pill">
            <span style={{ fontWeight: 600 }}>{currentUser.fullName}</span>
            <span
              className="badge"
              style={{
                fontSize: '0.62rem',
                background: currentUser.verificationStatus === 'verified' ? '#dcfce7' : '#fef3c7',
                color: currentUser.verificationStatus === 'verified' ? '#166534' : '#92400e',
              }}
            >
              {currentUser.verificationStatus === 'verified' ? '✓ Verified' : '⏳ Pending'}
            </span>
            <button
              type="button"
              className="link-btn"
              onClick={onLogoutUser}
              style={{ fontSize: '0.72rem', marginLeft: 4 }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onOpenLogin}>
            👤 Member Login
          </button>
        )}

        <button type="button" className="btn btn--ghost btn--sm" onClick={onAdmin}>
          🔐 Admin
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onReplayIntro}>
          ▷ Replay intro
        </button>
      </nav>
    </header>
  )
}