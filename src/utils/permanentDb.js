/**
 * Permanent Database & State Persistence Layer
 *
 * Ensures all ID records, registered members, form state, and credentials
 * are permanently stored and preserved across page refreshes and server restarts.
 */

const DB_RECORDS_KEY = 'aura_db_records'
const CARD_STATE_KEY = 'aura_card_state'
const ADMIN_ACTIVE_KEY = 'aura_admin_active'
const INTRO_SEEN_KEY = 'aura_intro_seen'

/**
 * Returns all permanent ID records from local storage.
 */
export function getLocalDatabaseRecords() {
  try {
    const raw = localStorage.getItem(DB_RECORDS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (err) {
    console.warn('Failed to read local database records:', err)
  }
  return []
}

/**
 * Permanently saves or updates a record in the local database.
 */
export function saveLocalDatabaseRecord(record) {
  if (!record) return []
  try {
    const records = getLocalDatabaseRecords()
    const roll = String(record.data?.rollNumber || record.rollNumber || '').trim().toLowerCase()
    const email = String(record.data?.email || record.email || '').trim().toLowerCase()
    const id = record.id

    const idx = records.findIndex((r) => {
      const rRoll = String(r.data?.rollNumber || r.rollNumber || '').trim().toLowerCase()
      const rEmail = String(r.data?.email || r.email || '').trim().toLowerCase()
      return (roll && rRoll === roll) || (email && rEmail === email) || (id && r.id === id)
    })

    const isNowVerified = Boolean(
      record.verified ||
      record.verificationStatus === 'verified' ||
      (idx >= 0 && (records[idx].verified || records[idx].verificationStatus === 'verified'))
    )

    if (idx >= 0) {
      records[idx] = {
        ...records[idx],
        ...record,
        data: { ...(records[idx].data || {}), ...(record.data || {}) },
        verified: isNowVerified,
        verificationStatus: isNowVerified ? 'verified' : (record.verificationStatus || records[idx].verificationStatus || 'pending'),
        verificationMethod: isNowVerified
          ? (record.verificationMethod || records[idx].verificationMethod || 'ADMIN_MANUAL_APPROVAL')
          : (record.verificationMethod || records[idx].verificationMethod || 'REGISTRATION_PENDING_APPROVAL'),
        verificationReason: isNowVerified
          ? (record.verificationReason || records[idx].verificationReason || 'Registration approved by institutional administrator.')
          : (record.verificationReason || records[idx].verificationReason || 'Registration submitted.'),
        verifiedAt: isNowVerified ? (record.verifiedAt || records[idx].verifiedAt || new Date().toISOString()) : null,
        updatedAt: new Date().toISOString(),
      }
    } else {
      records.unshift({
        ...record,
        verified: isNowVerified,
        verificationStatus: isNowVerified ? 'verified' : (record.verificationStatus || 'pending'),
        verificationMethod: isNowVerified
          ? (record.verificationMethod || 'ADMIN_MANUAL_APPROVAL')
          : (record.verificationMethod || 'REGISTRATION_PENDING_APPROVAL'),
        verificationReason: isNowVerified
          ? (record.verificationReason || 'Registration approved by institutional administrator.')
          : (record.verificationReason || 'Registration submitted.'),
        verifiedAt: isNowVerified ? (record.verifiedAt || new Date().toISOString()) : null,
        createdAt: record.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }

    try {
      localStorage.setItem(DB_RECORDS_KEY, JSON.stringify(records))
    } catch {
      // If photo exceeds quota, strip large photo strings and retry
      const lean = records.map((r) => {
        const { photo, ...rest } = r
        return rest
      })
      localStorage.setItem(DB_RECORDS_KEY, JSON.stringify(lean))
    }
    return records
  } catch (err) {
    console.warn('Failed to save record to permanent local database:', err)
    return []
  }
}

/**
 * Merges local database records with server records deduplicated,
 * guaranteeing no records or verified approvals are lost on page refresh.
 */
export function syncLocalDatabase(serverRecords = []) {
  try {
    const local = getLocalDatabaseRecords()
    const map = new Map()

    for (const r of local) {
      const key = String(r.data?.rollNumber || r.rollNumber || r.id || '').trim().toLowerCase()
      if (key) map.set(key, r)
    }

    if (Array.isArray(serverRecords)) {
      for (const s of serverRecords) {
        const key = String(s.data?.rollNumber || s.rollNumber || s.id || '').trim().toLowerCase()
        if (key) {
          const existing = map.get(key)
          if (!existing) {
            map.set(key, s)
          } else {
            const isVerified = Boolean(
              existing.verified || s.verified || existing.verificationStatus === 'verified' || s.verificationStatus === 'verified'
            )
            const newestCreatedAt = [existing.createdAt, s.createdAt].filter(Boolean).sort()[0] || new Date().toISOString()
            const newestUpdatedAt = [existing.updatedAt, s.updatedAt].filter(Boolean).sort().reverse()[0] || newestCreatedAt
            const verifiedAt = existing.verifiedAt || s.verifiedAt || (isVerified ? newestUpdatedAt : null)
            const photoStored = Boolean(existing.photoStored || s.photoStored)
            const mergedData = { ...(existing.data || {}), ...(s.data || {}) }

            map.set(key, {
              ...existing,
              ...s,
              id: existing.id || s.id,
              data: mergedData,
              createdAt: newestCreatedAt,
              updatedAt: newestUpdatedAt,
              photoStored,
              verified: isVerified,
              verificationStatus: isVerified ? 'verified' : (s.verificationStatus || existing.verificationStatus || 'pending'),
              verificationMethod: isVerified
                ? (existing.verificationMethod || s.verificationMethod || 'ADMIN_MANUAL_APPROVAL')
                : (s.verificationMethod || existing.verificationMethod || 'REGISTRATION_PENDING_APPROVAL'),
              verificationReason: isVerified
                ? (existing.verificationReason || s.verificationReason || 'Registration approved by institutional administrator.')
                : (s.verificationReason || existing.verificationReason || 'Registration submitted.'),
              verifiedAt,
              glassTheme: s.glassTheme || existing.glassTheme || 'lavender',
            })
          }
        }
      }
    }

    const merged = Array.from(map.values())
    try {
      localStorage.setItem(DB_RECORDS_KEY, JSON.stringify(merged))
    } catch {
      const lean = merged.map((r) => {
        const { photo, ...rest } = r
        return rest
      })
      localStorage.setItem(DB_RECORDS_KEY, JSON.stringify(lean))
    }
    return merged
  } catch {
    return serverRecords || []
  }
}

/**
 * Retrieves the saved active card & form state (persisted across page refresh).
 */
export function getSavedCardState() {
  try {
    const raw = localStorage.getItem(CARD_STATE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

/**
 * Permanently saves the current active card and form inputs so refreshing
 * the browser does NOT remove the card or reset the user's progress.
 */
export function saveCardState(state) {
  try {
    if (!state) {
      localStorage.removeItem(CARD_STATE_KEY)
      return
    }
    try {
      localStorage.setItem(CARD_STATE_KEY, JSON.stringify(state))
    } catch {
      // If photo data URL exceeds quota, strip photo and preserve form state
      const { photo, ...lean } = state
      localStorage.setItem(CARD_STATE_KEY, JSON.stringify(lean))
    }
  } catch (err) {
    console.warn('Failed to persist active card state:', err)
  }
}

/**
 * Clears the active card state (called when user explicitly resets/clears the form).
 */
export function clearSavedCardState() {
  try {
    localStorage.removeItem(CARD_STATE_KEY)
  } catch {}
}

/**
 * Checks whether intro has been completed/seen.
 */
export function isIntroSeen() {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Sets intro seen status.
 */
export function setIntroSeen(seen = true) {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, seen ? 'true' : 'false')
  } catch {}
}

/**
 * Checks whether admin dashboard view was active before refresh.
 */
export function isAdminActive() {
  try {
    return localStorage.getItem(ADMIN_ACTIVE_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Sets admin view active status so refreshing keeps admin on the dashboard.
 */
export function setAdminActive(active = true) {
  try {
    if (active) localStorage.setItem(ADMIN_ACTIVE_KEY, 'true')
    else localStorage.removeItem(ADMIN_ACTIVE_KEY)
  } catch {}
}
