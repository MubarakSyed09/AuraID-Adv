import { useState, useEffect } from 'react'
import AdminLogin from './components/AdminLogin'
import AdminDashboard from './components/AdminDashboard'
import IntroScreen from './components/IntroScreen'
import TopNav from './components/TopNav'
import StudioForm from './components/StudioForm'
import PreviewPanel from './components/PreviewPanel'
import ResultScreen from './components/ResultScreen'
import UserLoginModal from './components/UserLoginModal'
import PublicVerifyModal from './components/PublicVerifyModal'
import {
  getStoredRole,
  setRoleTheme,
  clearRoleLock,
  applyRoleTheme,
  isRoleLocked,
  isThemeValidForRole,
  getDefaultThemeForRole,
} from './utils/themeManager'
import {
  getSavedCardState,
  saveCardState,
  clearSavedCardState,
  isIntroSeen,
  setIntroSeen,
  isAdminActive,
  setAdminActive,
  saveLocalDatabaseRecord,
  syncLocalDatabase,
} from './utils/permanentDb'

const INITIAL_FORM = {
  role: 'student',
  studentType: 'Day Scholar',
  section: '',
  fullName: '',
  dob: '',
  email: '',
  phone: '',
  address: '',
  handle: '',
  bioTitle: '',
  bloodGroup: '',
  emergencyName: '',
  emergencyPhone: '',
  institution: 'Aura Academy',
  rollNumber: '',
  degreeProgram: '',
  department: '',
  batch: '',
  cgpa: '',
  credits: '',
  cohortRank: '',
  validUntil: '',
}

export default function App() {
  const savedCard = getSavedCardState()
  const hasSavedData = Boolean(
    savedCard &&
      (savedCard.completed ||
        savedCard.formData?.fullName ||
        savedCard.formData?.rollNumber ||
        savedCard.photo)
  )

  const [showIntro, setShowIntro] = useState(() => {
    if (hasSavedData) return false
    return !isIntroSeen()
  })
  const [activeTab, setActiveTab] = useState(savedCard?.activeTab || 'personal')
  const [formData, setFormData] = useState(savedCard?.formData || INITIAL_FORM)
  const [photo, setPhoto] = useState(savedCard?.photo || null)
  const [photoSettings, setPhotoSettings] = useState(
    savedCard?.photoSettings || { saturation: 100, contrast: 100, zoom: 100 }
  )
  const [completed, setCompleted] = useState(Boolean(savedCard?.completed))
  const [glassTheme, setGlassTheme] = useState(savedCard?.glassTheme || 'lavender')
  const [verified, setVerified] = useState(Boolean(savedCard?.verified))
  const [verificationReason, setVerificationReason] = useState(savedCard?.verificationReason || '')
  const [adminView, setAdminView] = useState(() => isAdminActive())
  const [adminLoggedIn, setAdminLoggedIn] = useState(() => isAdminActive())
  const [saveError, setSaveError] = useState('')
  const [credentialRecordId, setCredentialRecordId] = useState(savedCard?.credentialRecordId || null)

  // Member session & login modal
  const [currentUser, setCurrentUser] = useState(null)
  const [showLoginModal, setShowLoginModal] = useState(false)

  // Public ID / Barcode Verification Modal
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [verifyModalId, setVerifyModalId] = useState('')

  // Persist active card & form state automatically so refreshing never removes data
  useEffect(() => {
    if (formData && (formData.fullName || formData.rollNumber || photo || completed)) {
      saveCardState({
        formData,
        photo,
        photoSettings,
        glassTheme,
        completed,
        verified,
        verificationReason,
        credentialRecordId,
        activeTab,
      })
    }
  }, [
    formData,
    photo,
    photoSettings,
    glassTheme,
    completed,
    verified,
    verificationReason,
    credentialRecordId,
    activeTab,
  ])

  // Initialize theme on mount, sync permanent database records, check member & admin sessions
  useEffect(() => {
    const savedRole = getStoredRole()
    applyRoleTheme(savedRole)

    // Check if URL has ?verify=ID or #verify=ID (from scanning barcode or visiting verification link)
    const urlParams = new URLSearchParams(window.location.search)
    const verifyParam = urlParams.get('verify') || ''
    if (verifyParam) {
      setVerifyModalId(verifyParam)
      setShowVerifyModal(true)
    }

    async function checkAuthAndSync() {
      // 1. Sync database records
      try {
        const idRes = await fetch('/api/ids')
        if (idRes.ok) {
          const idData = await idRes.json()
          if (Array.isArray(idData.records)) {
            syncLocalDatabase(idData.records)
          }
        }
      } catch {}

      // Check if current user / card's roll number is verified in the permanent database
      const myRoll = (savedCard?.formData?.rollNumber || formData?.rollNumber || '').trim().toLowerCase()
      if (myRoll) {
        const localRecs = getLocalDatabaseRecords()
        const matched = localRecs.find(
          (r) => (r.data?.rollNumber || r.rollNumber || '').trim().toLowerCase() === myRoll
        )
        if (matched && (matched.verified === true || matched.verificationStatus === 'verified')) {
          setVerified(true)
          setVerificationReason(matched.verificationReason || 'Registration approved by institutional administrator.')
          if (matched.data) {
            setFormData((prev) => ({ ...prev, ...matched.data }))
          }
        }
      }

      // 2. Check Admin session
      try {
        const adminRes = await fetch('/api/admin/me')
        if (adminRes.ok) {
          const adm = await adminRes.json()
          if (adm.authenticated) {
            setAdminActive(true)
            setAdminLoggedIn(true)
            setAdminView(true)
          }
        }
      } catch {}

      // 3. Check Member session
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const data = await res.json()
          if (data.authenticated && data.user) {
            setCurrentUser(data.user)
            const userRole = data.user.role || 'student'
            setFormData((prev) => ({
              ...prev,
              ...data.user,
              role: userRole,
            }))
            setVerified(data.user.verificationStatus === 'verified' || data.user.verified === true)
            setRoleTheme(userRole, { isLocked: true })
            const activeTheme = isThemeValidForRole(data.user.glassTheme, userRole)
              ? data.user.glassTheme
              : getDefaultThemeForRole(userRole)
            setGlassTheme(activeTheme)
          }
        }
      } catch {}
    }
    checkAuthAndSync()
  }, [])

  function handleFieldChange(name, value) {
    setFormData((prev) => {
      const next = { ...prev, [name]: value }
      if (name === 'role') {
        setRoleTheme(value)
        if (!isThemeValidForRole(glassTheme, value)) {
          setGlassTheme(getDefaultThemeForRole(value))
        }
      }
      return next
    })
  }

  function handleUserLoginSuccess(user) {
    setCurrentUser(user)
    const userRole = user.role || 'student'
    const newForm = {
      ...formData,
      ...user,
      role: userRole,
    }
    setFormData(newForm)
    const isVer = user.verificationStatus === 'verified' || user.verified === true
    setVerified(isVer)
    setVerificationReason(
      user.verificationReason || 'Cryptographically verified institutional credential.'
    )
    setRoleTheme(userRole, { isLocked: true })
    const activeTheme = isThemeValidForRole(user.glassTheme, userRole)
      ? user.glassTheme
      : getDefaultThemeForRole(userRole)
    setGlassTheme(activeTheme)

    saveLocalDatabaseRecord({
      id: user.id || user.rollNumber,
      data: newForm,
      verified: isVer,
      verificationStatus: isVer ? 'verified' : 'pending',
      verificationReason: user.verificationReason,
      glassTheme: activeTheme,
      createdAt: user.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    saveCardState({
      formData: newForm,
      photo,
      photoSettings,
      glassTheme: activeTheme,
      completed,
      verified: isVer,
      verificationReason: user.verificationReason,
      credentialRecordId: user.id || user.rollNumber,
      activeTab,
    })
  }

  async function handleUserLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {}
    setCurrentUser(null)
    clearRoleLock()
    clearSavedCardState()
  }

  async function saveCredential() {
    setSaveError('')
    const recId = credentialRecordId || crypto.randomUUID()
    const record = {
      id: recId,
      data: formData,
      photoStored: Boolean(photo),
      photo: photo,
      verified,
      verificationStatus: verified ? 'verified' : 'pending',
      verificationReason: verificationReason || 'Registration submitted.',
      glassTheme,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // 1. Immediately store permanently in local database
    saveLocalDatabaseRecord(record)
    saveCardState({
      formData,
      photo,
      photoSettings,
      glassTheme,
      completed: true,
      verified,
      verificationReason,
      credentialRecordId: recId,
      activeTab,
    })

    // 2. Sync with backend API
    try {
      const response = await fetch('/api/ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recId, data: formData, photo, glassTheme }),
      })
      if (response.ok) {
        const result = await response.json()
        setCredentialRecordId(result.id)
        const isVer = result.verified === true
        setVerified(isVer)
        setVerificationReason(result.verificationReason || '')
        saveLocalDatabaseRecord({
          ...record,
          id: result.id,
          verified: isVer,
          verificationStatus: isVer ? 'verified' : 'pending',
          verificationReason: result.verificationReason || record.verificationReason,
        })
      }
    } catch (err) {
      console.warn('Backend sync warning: ID is permanently stored in local database store.', err)
    }

    return true
  }

  function handleClear() {
    clearSavedCardState()
    const defaultRole = currentUser ? currentUser.role : 'student'
    setFormData({ ...INITIAL_FORM, role: defaultRole })
    setPhoto(null)
    setPhotoSettings({ saturation: 100, contrast: 100, zoom: 100 })
    setVerified(false)
    setVerificationReason('')
    setCompleted(false)
    setCredentialRecordId(null)
    setSaveError('')
    setGlassTheme(getDefaultThemeForRole(defaultRole))
  }

  if (adminView) {
    if (adminLoggedIn) {
      return (
        <AdminDashboard
          onLogout={() => {
            setAdminActive(false)
            setAdminLoggedIn(false)
            setAdminView(false)
          }}
        />
      )
    }
    return (
      <AdminLogin
        onBack={() => {
          setAdminActive(false)
          setAdminView(false)
        }}
        onLogin={() => {
          setAdminActive(true)
          setAdminLoggedIn(true)
        }}
      />
    )
  }

  return (
    <div className="app" data-role-theme={formData.role || 'student'}>
      {showIntro && (
        <IntroScreen
          onFinish={() => {
            setIntroSeen(true)
            setShowIntro(false)
          }}
        />
      )}

      {!showIntro && completed && (
        <ResultScreen
          data={formData}
          photo={photo}
          photoSettings={photoSettings}
          glassTheme={glassTheme}
          verified={verified}
          onEdit={() => {
            setCompleted(false)
            saveCardState({ ...getSavedCardState(), completed: false })
          }}
        />
      )}

      {!showIntro && !completed && (
        <div className="studio">
          <div className="studio__grid" />
          <TopNav
            activeRole={formData.role || 'student'}
            currentUser={currentUser}
            onOpenLogin={() => setShowLoginModal(true)}
            onLogoutUser={handleUserLogout}
            onReplayIntro={() => setShowIntro(true)}
            onAdmin={() => {
              setAdminActive(true)
              setAdminView(true)
            }}
            onOpenVerify={() => setShowVerifyModal(true)}
          />

          <main className="studio__layout">
            <StudioForm
              activeTab={activeTab}
              onTabChange={setActiveTab}
              formData={formData}
              onFieldChange={handleFieldChange}
              onClear={handleClear}
              photo={photo}
              onPhotoChange={setPhoto}
              photoSettings={photoSettings}
              onPhotoSettingsChange={setPhotoSettings}
              verified={verified}
              verificationReason={verificationReason}
              glassTheme={glassTheme}
              onGlassThemeChange={setGlassTheme}
              onComplete={async () => {
                const saved = await saveCredential()
                if (!saved) return
                setCompleted(true)
              }}
            />
            {saveError && (
              <div className="save-error" role="alert">
                {saveError}
              </div>
            )}

            <PreviewPanel
              data={formData}
              photo={photo}
              photoSettings={photoSettings}
              glassTheme={glassTheme}
              onGlassThemeChange={setGlassTheme}
              verified={verified}
              onToggleVerified={() => {}}
            />
          </main>
        </div>
      )}

      {showLoginModal && (
        <UserLoginModal
          onClose={() => setShowLoginModal(false)}
          onLoginSuccess={handleUserLoginSuccess}
        />
      )}

      {showVerifyModal && (
        <PublicVerifyModal
          initialId={verifyModalId}
          onClose={() => {
            setShowVerifyModal(false)
            setVerifyModalId('')
          }}
        />
      )}
    </div>
  )
}