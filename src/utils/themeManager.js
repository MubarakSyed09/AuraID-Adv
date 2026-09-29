/**
 * Centralized Role-Based Theme Manager
 * Supports: Student, Faculty, Staff
 */

export const ROLES = {
  student: {
    id: 'student',
    name: 'Student',
    badge: '🎓 Student Theme',
    accentColor: '#7c3aed',
    description: 'Frosted Lavender & Violet glass theme tailored for student scholars.',
  },
  faculty: {
    id: 'faculty',
    name: 'Faculty',
    badge: '🏛️ Faculty Theme',
    accentColor: '#8c6e80',
    description: 'Soft, dim pastel cherry blossom, mauve glow & scholarly muted glass themes tailored for academic faculty.',
  },
  staff: {
    id: 'staff',
    name: 'Staff',
    badge: '💼 Staff Theme',
    accentColor: '#475569',
    description: 'Executive muted dusty blue, soft sage, pale aqua & peach bisque glass themes built for institutional staff.',
  },
}

export const ROLE_THEMES = {
  student: [
    { id: 'lavender', label: 'Lavender Dream', color: '#c4b5fd' },
    { id: 'peach', label: 'Peach Blush', color: '#ffd9c8' },
    { id: 'mint', label: 'Mint Cloud', color: '#d7f3e7' },
    { id: 'sky', label: 'Baby Sky', color: '#dcefff' },
  ],
  faculty: [
    { id: 'faculty-cherry-blossom', label: 'Pastel Cherry Blossom', color: '#fbcfe8' },
    { id: 'faculty-mauve-glow', label: 'Mauve Glow', color: '#e9d5ff' },
    { id: 'faculty-sage-mist', label: 'Dusty Sage Mist', color: '#d1fae5' },
    { id: 'faculty-wisteria-frost', label: 'Dusty Peach / Rose Beige', color: '#fed7aa' },
  ],
  staff: [
    { id: 'staff-powder-azure', label: 'Dusty Slate Blue', color: '#bfdbfe' },
    { id: 'staff-warm-linen', label: 'Soft Lavender Blue', color: '#c7d2fe' },
    { id: 'staff-seafoam-aqua', label: 'Muted Aqua', color: '#a5f3fc' },
    { id: 'staff-spun-apricot', label: 'Muted Olive Linen', color: '#e2e8f0' },
  ],
}

// Backward compatibility mappings
const LEGACY_ALIASES = {
  // Faculty
  'faculty-pastel-mint': 'faculty-sage-mist',
  'faculty-pastel-sage': 'faculty-sage-mist',
  'faculty-pastel-emerald': 'faculty-wisteria-frost',
  'faculty-pastel-tea': 'faculty-cherry-blossom',
  'emerald': 'faculty-sage-mist',
  'sage': 'faculty-sage-mist',
  'forest': 'faculty-wisteria-frost',
  'teal': 'faculty-cherry-blossom',
  // Staff
  'staff-pastel-azure': 'staff-powder-azure',
  'staff-pastel-rose': 'staff-spun-apricot',
  'staff-pastel-yellow': 'staff-warm-linen',
  'staff-pastel-aqua': 'staff-seafoam-aqua',
  'corporate-navy': 'staff-powder-azure',
  'slate-steel': 'staff-powder-azure',
  'amber-executive': 'staff-warm-linen',
  'cobalt-cyan': 'staff-seafoam-aqua',
}

export function resolveThemeId(themeId, role) {
  if (!themeId) return getDefaultThemeForRole(role)
  const normalized = themeId.toLowerCase()
  if (LEGACY_ALIASES[normalized]) return LEGACY_ALIASES[normalized]
  return themeId
}

export function getThemesForRole(role) {
  const normalized = String(role || 'student').toLowerCase()
  return ROLE_THEMES[normalized] || ROLE_THEMES.student
}

export function getDefaultThemeForRole(role) {
  const themes = getThemesForRole(role)
  return themes[0].id
}

export function isThemeValidForRole(theme, role) {
  const themes = getThemesForRole(role)
  if (themes.some((t) => t.id === theme)) return true
  const resolved = resolveThemeId(theme, role)
  return themes.some((t) => t.id === resolved)
}

const STORAGE_KEY = 'aura_role_theme'
const AUTH_LOCK_KEY = 'aura_role_theme_locked'

export function getStoredRole() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && ROLES[saved]) return saved
  } catch {}
  return 'student'
}

export function isRoleLocked() {
  try {
    return localStorage.getItem(AUTH_LOCK_KEY) === 'true'
  } catch {
    return false
  }
}

export function applyRoleTheme(role) {
  const validRole = ROLES[role] ? role : 'student'
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-role-theme', validRole)
    const appEl = document.querySelector('.app')
    if (appEl) appEl.setAttribute('data-role-theme', validRole)
  }
  return validRole
}

export function setRoleTheme(role, { isLocked = false } = {}) {
  const validRole = ROLES[role] ? role : 'student'

  // If locked to an authenticated role and user tries to switch to another role's theme, ignore
  if (isRoleLocked() && !isLocked) {
    const lockedRole = getStoredRole()
    applyRoleTheme(lockedRole)
    return lockedRole
  }

  try {
    localStorage.setItem(STORAGE_KEY, validRole)
    if (isLocked) {
      localStorage.setItem(AUTH_LOCK_KEY, 'true')
    }
  } catch {}

  applyRoleTheme(validRole)
  return validRole
}

export function clearRoleLock() {
  try {
    localStorage.removeItem(AUTH_LOCK_KEY)
  } catch {}
}
