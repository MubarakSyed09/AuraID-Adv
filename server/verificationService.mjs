import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const REGISTRY_FILE = path.join(DATA_DIR, 'admin_reference_registry.json')
const AUDIT_FILE = path.join(DATA_DIR, 'audit_logs.json')

fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(AUDIT_FILE)) fs.writeFileSync(AUDIT_FILE, '[]\n', { mode: 0o600 })

function normalizeStr(val) {
  return String(val || '').trim().toLowerCase()
}

export function normalizeDateParts(str) {
  if (!str || typeof str !== 'string') return null
  const trimmed = str.trim()
  if (!trimmed) return null

  // 1. YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  let m = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    return {
      year: y,
      month: mo,
      day: d,
      iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    }
  }

  // 2. DD-MM-YYYY, MM-DD-YYYY, DD/MM/YYYY, MM/DD/YYYY
  m = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (m) {
    const p1 = Number(m[1])
    const p2 = Number(m[2])
    const y = Number(m[3])

    if (p1 > 12) {
      // Must be DD-MM-YYYY
      return {
        year: y,
        month: p2,
        day: p1,
        iso: `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`,
      }
    }
    if (p2 > 12) {
      // Must be MM-DD-YYYY
      return {
        year: y,
        month: p1,
        day: p2,
        iso: `${y}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`,
      }
    }
    // Ambiguous: default month=p1, day=p2, altMonth=p2, altDay=p1
    return {
      year: y,
      month: p1,
      day: p2,
      altMonth: p2,
      altDay: p1,
      iso: `${y}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`,
    }
  }

  // 3. Fallback to Date parser
  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear()
    const mo = parsed.getUTCMonth() + 1
    const d = parsed.getUTCDate()
    return {
      year: y,
      month: mo,
      day: d,
      iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    }
  }

  return null
}

export function datesMatch(dateA, dateB) {
  if (!dateA || !dateB) return false
  const aStr = String(dateA).trim().toLowerCase()
  const bStr = String(dateB).trim().toLowerCase()
  if (aStr === bStr) return true

  const pA = normalizeDateParts(aStr)
  const pB = normalizeDateParts(bStr)
  if (!pA || !pB) return false

  if (pA.iso === pB.iso) return true
  if (pA.year === pB.year && pA.month === pB.month && pA.day === pB.day) return true
  if (pA.year === pB.year && pA.altMonth && pA.altMonth === pB.month && pA.altDay === pB.day) return true
  if (pB.year === pA.year && pB.altMonth && pB.altMonth === pA.month && pB.altDay === pA.day) return true

  return false
}

export function parseBirthMonthAndDay(dobStr) {
  const parts = normalizeDateParts(dobStr)
  if (parts) {
    return { month: parts.month, day: parts.day }
  }
  return null
}

export function getReferenceRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'))
  } catch {
    return []
  }
}

export function saveReferenceRegistry(records) {
  const jsonStr = JSON.stringify(records, null, 2)
  try {
    fs.writeFileSync(REGISTRY_FILE, jsonStr, { mode: 0o600, encoding: 'utf8' })
  } catch (err) {
    try {
      const tmp = `${REGISTRY_FILE}.tmp`
      fs.writeFileSync(tmp, jsonStr, { mode: 0o600, encoding: 'utf8' })
      try { if (fs.existsSync(REGISTRY_FILE)) fs.unlinkSync(REGISTRY_FILE) } catch {}
      fs.renameSync(tmp, REGISTRY_FILE)
    } catch (e2) {
      console.error('Failed to write REGISTRY_FILE:', e2)
    }
  }
}

export function getAuditLogs() {
  try {
    const raw = fs.readFileSync(AUDIT_FILE, 'utf8')
    const list = JSON.parse(raw)
    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  } catch {
    return []
  }
}

export function recordAuditLog({ action, details = {}, actor = 'SYSTEM', ip = 'unknown' }) {
  try {
    const list = getAuditLogs()
    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      details,
      actor,
      ip,
    }
    list.unshift(entry)
    const trimmed = list.slice(0, 500)
    const jsonStr = JSON.stringify(trimmed, null, 2)
    try {
      fs.writeFileSync(AUDIT_FILE, jsonStr, { mode: 0o600, encoding: 'utf8' })
    } catch (err) {
      try {
        const tmp = `${AUDIT_FILE}.tmp`
        fs.writeFileSync(tmp, jsonStr, { mode: 0o600, encoding: 'utf8' })
        try { if (fs.existsSync(AUDIT_FILE)) fs.unlinkSync(AUDIT_FILE) } catch {}
        fs.renameSync(tmp, AUDIT_FILE)
      } catch (e2) {
        console.error('Audit log write failure:', e2)
      }
    }
    return entry
  } catch (err) {
    console.error('Audit log failure:', err)
  }
}

/**
 * Verifies submitted user details against the authoritative registrar reference dataset.
 * Primary matching criteria: rollNumber + dob (Date of Birth / Birthday).
 */
export function verifyCredentials(submittedData, { actor = 'SYSTEM', ip = 'unknown' } = {}) {
  const registry = getReferenceRegistry()
  const targetRoll = normalizeStr(submittedData.rollNumber)
  const targetDob = String(submittedData.dob || '').trim()

  if (!targetRoll || !targetDob) {
    const result = {
      verified: false,
      verificationStatus: 'pending',
      verificationMethod: 'UNVERIFIED_INCOMPLETE',
      verificationReason: 'Missing roll number or date of birth required for authoritative matching.',
      matchedReference: null,
    }
    recordAuditLog({
      action: 'VERIFICATION_CHECK_INCOMPLETE',
      details: { rollNumber: submittedData.rollNumber, reason: result.verificationReason },
      actor,
      ip,
    })
    return result
  }

  const matched = registry.find((entry) => {
    const entryRoll = normalizeStr(entry.rollNumber)
    return entryRoll === targetRoll && datesMatch(entry.dob, targetDob)
  })

  if (matched) {
    const result = {
      verified: true,
      verificationStatus: 'verified',
      verificationMethod: 'REGISTRY_MATCH',
      verificationReason: 'Matched authoritative registrar database by Roll Number and Date of Birth.',
      verifiedAt: new Date().toISOString(),
      matchedReference: {
        rollNumber: matched.rollNumber,
        fullName: matched.fullName,
        role: matched.role,
        department: matched.department,
      },
    }
    recordAuditLog({
      action: 'AUTO_VERIFICATION_SUCCESS',
      details: {
        rollNumber: submittedData.rollNumber,
        fullName: submittedData.fullName,
        matchedRole: matched.role,
        reason: result.verificationReason,
      },
      actor,
      ip,
    })
    return result
  }

  const result = {
    verified: false,
    verificationStatus: 'pending',
    verificationMethod: 'UNVERIFIED_PENDING',
    verificationReason: 'No matching record with Roll Number & Date of Birth found in registrar database.',
    matchedReference: null,
  }

  recordAuditLog({
    action: 'AUTO_VERIFICATION_PENDING',
    details: {
      rollNumber: submittedData.rollNumber,
      fullName: submittedData.fullName,
      reason: result.verificationReason,
    },
    actor,
    ip,
  })

  return result
}
