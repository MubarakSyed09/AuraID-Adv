import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  verifyCredentials,
  datesMatch,
  getReferenceRegistry,
  saveReferenceRegistry,
  getAuditLogs,
  recordAuditLog,
} from './verificationService.mjs'
import { getEmailLogs, getSmtpStatus } from './emailService.mjs'
import { initBirthdayScheduler, runBirthdayCheck } from './birthdayScheduler.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const DATA_FILE = path.join(DATA_DIR, 'ids.json')
const PHOTO_DIR = path.join(DATA_DIR, 'photos')
const PORT = Number(process.env.API_PORT || 8787)
const HOST = process.env.API_HOST || '127.0.0.1'
const isProd = process.env.NODE_ENV === 'production'
const distDir = path.join(ROOT, 'dist')

fs.mkdirSync(PHOTO_DIR, { recursive: true })
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]\n', { mode: 0o600 })

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'abcdefghijklmnopqrstuvuwyz'
if (ADMIN_PASSWORD.length < 16) {
  console.error('ADMIN_PASSWORD must contain at least 16 characters.')
  process.exit(1)
}

const passwordSalt = crypto.randomBytes(16)
const passwordHash = crypto.scryptSync(ADMIN_PASSWORD, passwordSalt, 64)
const sessions = new Map()
const userSessions = new Map()
const loginAttempts = new Map()

function safeEqual(a, b) {
  const aa = Buffer.from(a)
  const bb = Buffer.from(b)
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb)
}

function checkPassword(password) {
  const candidate = crypto.scryptSync(password, passwordSalt, 64)
  return safeEqual(candidate, passwordHash)
}

function deduplicateRecords(records = []) {
  if (!Array.isArray(records)) return []
  const map = new Map()

  for (const r of records) {
    if (!r) continue
    const roll = String(r.data?.rollNumber || r.rollNumber || '').trim().toLowerCase()
    const email = String(r.data?.email || r.email || '').trim().toLowerCase()
    const key = roll || email || r.id
    if (!key) continue

    if (!map.has(key)) {
      map.set(key, r)
    } else {
      const existing = map.get(key)
      const isVerified = Boolean(
        existing.verified || r.verified || existing.verificationStatus === 'verified' || r.verificationStatus === 'verified'
      )
      const newestCreatedAt = [existing.createdAt, r.createdAt].filter(Boolean).sort().reverse()[0] || new Date().toISOString()
      const newestUpdatedAt = [existing.updatedAt, r.updatedAt].filter(Boolean).sort().reverse()[0] || newestCreatedAt
      const verifiedAt = existing.verifiedAt || r.verifiedAt || (isVerified ? newestUpdatedAt : null)
      const photoStored = Boolean(existing.photoStored || r.photoStored)
      const mergedData = { ...(existing.data || {}), ...(r.data || {}) }

      map.set(key, {
        id: existing.id || r.id,
        createdAt: newestCreatedAt,
        updatedAt: newestUpdatedAt,
        data: mergedData,
        photoStored,
        verified: isVerified,
        verificationStatus: isVerified ? 'verified' : 'pending',
        verificationMethod: isVerified
          ? (existing.verificationMethod || r.verificationMethod || 'ADMIN_MANUAL_APPROVAL')
          : 'REGISTRATION_PENDING_APPROVAL',
        verificationReason: isVerified
          ? (existing.verificationReason || r.verificationReason || 'Registration approved by institutional administrator.')
          : 'Registration submitted. Awaiting administrative verification.',
        verifiedAt,
        glassTheme: r.glassTheme || existing.glassTheme || 'lavender',
      })
    }
  }

  return Array.from(map.values())
}

function getRecords() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    return deduplicateRecords(raw)
  } catch {
    return []
  }
}

function saveRecords(records) {
  const deduped = deduplicateRecords(records)
  const jsonStr = JSON.stringify(deduped, null, 2)
  try {
    fs.writeFileSync(DATA_FILE, jsonStr, { mode: 0o600, encoding: 'utf8' })
  } catch (err) {
    try {
      const tmp = `${DATA_FILE}.tmp`
      fs.writeFileSync(tmp, jsonStr, { mode: 0o600, encoding: 'utf8' })
      try { if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE) } catch {}
      fs.renameSync(tmp, DATA_FILE)
    } catch (e2) {
      console.error('Failed to write DATA_FILE:', e2)
    }
  }
}

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  })
  res.end(body)
}

function cookieToken(req, name = 'aura_admin') {
  const raw = req.headers.cookie || ''
  const regex = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)
  const match = raw.match(regex)
  return match ? decodeURIComponent(match[1]) : null
}

function authenticated(req) {
  const token = cookieToken(req, 'aura_admin')
  if (!token) return false
  const session = sessions.get(token)
  if (!session) return false
  if (Date.now() > session.expiresAt) {
    sessions.delete(token)
    return false
  }
  session.expiresAt = Date.now() + 30 * 60 * 1000
  return true
}

function getMemberSession(req) {
  const token = cookieToken(req, 'aura_member')
  if (!token) return null
  const session = userSessions.get(token)
  if (!session) return null
  if (Date.now() > session.expiresAt) {
    userSessions.delete(token)
    return null
  }
  session.expiresAt = Date.now() + 2 * 60 * 60 * 1000
  return session.user
}

function readJson(req, limit = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('Payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function clientIp(req) {
  return req.socket.remoteAddress || 'unknown'
}

function rateLimited(req) {
  const key = clientIp(req)
  const now = Date.now()
  const entry = loginAttempts.get(key) || { count: 0, reset: now + 15 * 60 * 1000 }
  if (now > entry.reset) {
    entry.count = 0
    entry.reset = now + 15 * 60 * 1000
  }
  entry.count += 1
  loginAttempts.set(key, entry)
  return entry.count > 15
}

/**
 * Sanitizes input data.
 * Validates role-specific fields:
 * - 'student': allows studentType ('Day Scholar' | 'Hosteler') and section.
 * - 'faculty' / 'staff': strips studentType and section so non-students never hold student-only fields.
 */
function sanitizeData(input = {}) {
  const allowed = [
    'role',
    'studentType',
    'section',
    'fullName',
    'dob',
    'email',
    'phone',
    'address',
    'handle',
    'bioTitle',
    'bloodGroup',
    'emergencyName',
    'emergencyPhone',
    'institution',
    'rollNumber',
    'degreeProgram',
    'department',
    'batch',
    'cgpa',
    'credits',
    'cohortRank',
    'validUntil',
  ]

  const out = {}
  for (const key of allowed) {
    out[key] = typeof input[key] === 'string' ? input[key].trim().slice(0, 300) : ''
  }

  // Normalize role
  const rawRole = out.role ? out.role.toLowerCase() : 'student'
  out.role = ['student', 'faculty', 'staff'].includes(rawRole) ? rawRole : 'student'

  // Apply strict student-only field rules
  if (out.role === 'student') {
    if (out.studentType && !['Day Scholar', 'Hosteler'].includes(out.studentType)) {
      out.studentType = ''
    }
    out.section = out.section.slice(0, 50)
  } else {
    // Faculty and staff MUST NOT have student-specific fields
    out.studentType = ''
    out.section = ''
  }

  return out
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  // ---------- ADMIN AUTH ----------
  if (req.method === 'POST' && url.pathname === '/api/admin/login') {
    if (rateLimited(req)) return json(res, 429, { error: 'Too many login attempts. Try again later.' })
    let body
    try {
      body = await readJson(req, 50_000)
    } catch {
      return json(res, 400, { error: 'Invalid request' })
    }
    if (!checkPassword(String(body.password || ''))) return json(res, 401, { error: 'Invalid admin credentials.' })
    const token = crypto.randomBytes(32).toString('hex')
    sessions.set(token, { expiresAt: Date.now() + 30 * 60 * 1000 })
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `aura_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800; ${
        isProd ? 'Secure; ' : ''
      }`,
      'Cache-Control': 'no-store',
    })
    return res.end(JSON.stringify({ ok: true }))
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
    const token = cookieToken(req, 'aura_admin')
    if (token) sessions.delete(token)
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'aura_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0;',
      'Cache-Control': 'no-store',
    })
    return res.end(JSON.stringify({ ok: true }))
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/me') {
    return json(res, 200, { authenticated: authenticated(req) })
  }

  // ---------- MEMBER / USER AUTH (Role-based session) ----------
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    let body
    try {
      body = await readJson(req, 50_000)
    } catch {
      return json(res, 400, { error: 'Invalid request' })
    }
    const rollNumber = String(body.rollNumber || '').trim().toLowerCase()
    const queryDob = String(body.dob || body.email || '').trim()

    if (!rollNumber) {
      return json(res, 400, { error: 'Roll / ID number is required.' })
    }

    const records = getRecords()
    const registry = getReferenceRegistry()

    // 1. Search by Roll / ID number in credential records first, then reference registry
    let targetRecord = null

    const foundRecord = records.find(
      (r) => (r.data?.rollNumber || '').trim().toLowerCase() === rollNumber
    )

    if (foundRecord) {
      targetRecord = foundRecord
    } else {
      const regMatch = registry.find(
        (reg) => (reg.rollNumber || '').trim().toLowerCase() === rollNumber
      )
      if (regMatch) {
        targetRecord = {
          id: regMatch.rollNumber,
          data: { ...regMatch },
          verified: true,
          verificationStatus: 'verified',
          glassTheme: regMatch.role === 'faculty' ? 'faculty-cherry-blossom' : regMatch.role === 'staff' ? 'staff-powder-azure' : 'lavender',
        }
      }
    }

    // Branch 1: Member NOT found by Roll/ID
    if (!targetRecord) {
      return json(res, 404, { error: 'Member not found. Please check your Roll/ID number and Date of Birth.' })
    }

    // Branch 2: Member found, check Date of Birth
    const storedDob = targetRecord.data?.dob || ''
    const storedEmail = targetRecord.data?.email || ''
    const dobMatches = datesMatch(storedDob, queryDob) || (storedEmail && storedEmail.toLowerCase() === queryDob.toLowerCase())

    if (!dobMatches) {
      return json(res, 401, { error: 'Incorrect Date of Birth. Please check your details and try again.' })
    }

    // Branch 3: Check Verification Status
    const isVerified = targetRecord.verified === true && targetRecord.verificationStatus === 'verified'
    if (!isVerified) {
      return json(res, 403, {
        error: 'Your registration is still pending admin approval. You will be able to log in once an administrator approves your account.',
        status: 'pending',
        pending: true,
      })
    }

    // Branch 4: Verified Member -> Login Success!
    const token = crypto.randomBytes(32).toString('hex')
    const sessionUser = {
      id: targetRecord.id,
      rollNumber: targetRecord.data.rollNumber,
      fullName: targetRecord.data.fullName,
      role: targetRecord.data.role || 'student',
      email: targetRecord.data.email,
      dob: targetRecord.data.dob,
      phone: targetRecord.data.phone || '',
      address: targetRecord.data.address || '',
      bloodGroup: targetRecord.data.bloodGroup || '',
      department: targetRecord.data.department || '',
      degreeProgram: targetRecord.data.degreeProgram || '',
      batch: targetRecord.data.batch || '',
      studentType: targetRecord.data.studentType || '',
      section: targetRecord.data.section || '',
      cgpa: targetRecord.data.cgpa || '',
      credits: targetRecord.data.credits || '',
      cohortRank: targetRecord.data.cohortRank || '',
      institution: targetRecord.data.institution || 'Aura Academy',
      verified: true,
      verificationStatus: 'verified',
      glassTheme: targetRecord.glassTheme || (targetRecord.data.role === 'faculty' ? 'faculty-cherry-blossom' : targetRecord.data.role === 'staff' ? 'staff-powder-azure' : 'lavender'),
    }
    userSessions.set(token, { user: sessionUser, expiresAt: Date.now() + 2 * 60 * 60 * 1000 })

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `aura_member=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200; ${
        isProd ? 'Secure; ' : ''
      }`,
      'Cache-Control': 'no-store',
    })
    return res.end(JSON.stringify({ ok: true, user: sessionUser }))
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = getMemberSession(req)
    return json(res, 200, { authenticated: Boolean(user), user: user || null })
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = cookieToken(req, 'aura_member')
    if (token) userSessions.delete(token)
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'aura_member=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0;',
      'Cache-Control': 'no-store',
    })
    return res.end(JSON.stringify({ ok: true }))
  }

  // ---------- ADMIN MANAGEMENT ENDPOINTS ----------
  if (req.method === 'GET' && url.pathname === '/api/admin/records') {
    if (!authenticated(req)) return json(res, 401, { error: 'Unauthorized' })
    const records = getRecords().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return json(res, 200, { total: records.length, records })
  }

  // Admin Approve Registration Action
  if (req.method === 'POST' && (url.pathname === '/api/admin/records/approve' || url.pathname === '/api/admin/approve')) {
    if (!authenticated(req)) return json(res, 401, { error: 'Unauthorized' })
    let body
    try {
      body = await readJson(req)
    } catch {
      return json(res, 400, { error: 'Invalid JSON request' })
    }
    const recordId = body.id || body.recordId || body.rollNumber
    const rollQuery = (body.rollNumber || (body.record?.data?.rollNumber || body.record?.rollNumber) || '').trim().toLowerCase()
    const emailQuery = (body.email || (body.record?.data?.email || body.record?.email) || '').trim().toLowerCase()

    if (!recordId && !rollQuery && !emailQuery) {
      return json(res, 400, { error: 'Record ID or Roll Number is required for approval.' })
    }

    const records = getRecords()
    let targetIndex = records.findIndex(
      (r) =>
        (recordId && r.id === recordId) ||
        (rollQuery && (r.data?.rollNumber || '').trim().toLowerCase() === rollQuery) ||
        (recordId && (r.data?.rollNumber || '').trim().toLowerCase() === String(recordId).trim().toLowerCase()) ||
        (emailQuery && (r.data?.email || '').trim().toLowerCase() === emailQuery)
    )

    const nowIso = new Date().toISOString()
    let target = null

    if (targetIndex >= 0) {
      target = records[targetIndex]
    } else {
      // 1. Check if client provided the full record from its local permanent database
      if (body.record && (body.record.data || body.record.fullName || body.record.rollNumber)) {
        const rawData = body.record.data || body.record
        const cleanData = sanitizeData(rawData)
        target = {
          id: body.record.id || (typeof recordId === 'string' && recordId.length > 5 ? recordId : crypto.randomUUID()),
          createdAt: body.record.createdAt || nowIso,
          updatedAt: nowIso,
          data: cleanData,
          photoStored: Boolean(body.record.photoStored),
          verified: true,
          verificationStatus: 'verified',
          verificationMethod: 'ADMIN_MANUAL_APPROVAL',
          verificationReason: 'Registration approved by institutional administrator.',
          verifiedAt: nowIso,
          glassTheme: body.record.glassTheme || (cleanData.role === 'faculty' ? 'faculty-cherry-blossom' : cleanData.role === 'staff' ? 'staff-powder-azure' : 'lavender'),
        }
        records.unshift(target)
      } else {
        // 2. Check authoritative registrar reference registry
        const registry = getReferenceRegistry()
        const regMatch = registry.find((r) => {
          const rRoll = (r.rollNumber || '').trim().toLowerCase()
          const rEmail = (r.email || '').trim().toLowerCase()
          return (
            (rollQuery && rRoll === rollQuery) ||
            (recordId && rRoll === String(recordId).trim().toLowerCase()) ||
            (emailQuery && rEmail === emailQuery)
          )
        })

        if (regMatch) {
          target = {
            id: crypto.randomUUID(),
            createdAt: nowIso,
            updatedAt: nowIso,
            data: { ...regMatch },
            photoStored: false,
            verified: true,
            verificationStatus: 'verified',
            verificationMethod: 'ADMIN_MANUAL_APPROVAL',
            verificationReason: 'Registration approved by institutional administrator.',
            verifiedAt: nowIso,
            glassTheme: regMatch.role === 'faculty' ? 'faculty-cherry-blossom' : regMatch.role === 'staff' ? 'staff-powder-azure' : 'lavender',
          }
          records.unshift(target)
        }
      }
    }

    if (!target) {
      return json(res, 404, { error: 'Record not found.' })
    }

    // Requirement 5: Prevent Double Verification (Idempotent Backend)
    if (target.verified === true && target.verificationStatus === 'verified' && targetIndex >= 0) {
      return json(res, 200, {
        ok: true,
        alreadyVerified: true,
        message: 'Member is already verified.',
        record: target,
      })
    }

    const targetRoll = (target.data?.rollNumber || '').trim().toLowerCase()
    const targetEmail = (target.data?.email || '').trim().toLowerCase()

    // Update the record and any potential duplicate matching records
    for (let i = 0; i < records.length; i++) {
      const rRoll = (records[i].data?.rollNumber || '').trim().toLowerCase()
      const rEmail = (records[i].data?.email || '').trim().toLowerCase()
      if (records[i].id === target.id || (targetRoll && rRoll === targetRoll) || (targetEmail && rEmail === targetEmail)) {
        records[i].verified = true
        records[i].verificationStatus = 'verified'
        records[i].verificationMethod = 'ADMIN_MANUAL_APPROVAL'
        records[i].verificationReason = 'Registration approved by institutional administrator.'
        records[i].verifiedAt = records[i].verifiedAt || nowIso
        records[i].updatedAt = nowIso
      }
    }

    saveRecords(records)

    recordAuditLog({
      action: 'CREDENTIAL_APPROVED_BY_ADMIN',
      details: {
        id: target.id,
        rollNumber: target.data?.rollNumber,
        fullName: target.data?.fullName,
        role: target.data?.role,
      },
      actor: 'ADMIN',
      ip: clientIp(req),
    })

    return json(res, 200, { ok: true, record: target })
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/reference-registry') {
    if (!authenticated(req)) return json(res, 401, { error: 'Unauthorized' })
    const registry = getReferenceRegistry()
    return json(res, 200, { total: registry.length, registry })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/reference-registry') {
    if (!authenticated(req)) return json(res, 401, { error: 'Unauthorized' })
    let body
    try {
      body = await readJson(req)
    } catch {
      return json(res, 400, { error: 'Invalid JSON request' })
    }
    const entry = sanitizeData(body)
    if (!entry.rollNumber || !entry.fullName || !entry.dob) {
      return json(res, 400, { error: 'Roll number, Full name, and Date of birth are required for registry entry.' })
    }
    const registry = getReferenceRegistry()
    const existingIndex = registry.findIndex((r) => r.rollNumber.toLowerCase() === entry.rollNumber.toLowerCase())
    if (existingIndex >= 0) {
      registry[existingIndex] = { ...registry[existingIndex], ...entry }
    } else {
      registry.push(entry)
    }
    saveReferenceRegistry(registry)
    recordAuditLog({
      action: existingIndex >= 0 ? 'REGISTRY_ENTRY_UPDATED' : 'REGISTRY_ENTRY_CREATED',
      details: { rollNumber: entry.rollNumber, fullName: entry.fullName, role: entry.role },
      actor: 'ADMIN',
      ip: clientIp(req),
    })
    return json(res, 200, { ok: true, total: registry.length })
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/audit-logs') {
    if (!authenticated(req)) return json(res, 401, { error: 'Unauthorized' })
    const logs = getAuditLogs()
    return json(res, 200, { total: logs.length, logs })
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/email-logs') {
    if (!authenticated(req)) return json(res, 401, { error: 'Unauthorized' })
    const logs = getEmailLogs()
    return json(res, 200, { total: logs.length, logs })
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/birthday-config') {
    if (!authenticated(req)) return json(res, 401, { error: 'Unauthorized' })
    const smtpStatus = getSmtpStatus()
    return json(res, 200, { ok: true, smtp: smtpStatus })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/trigger-birthdays') {
    if (!authenticated(req)) return json(res, 401, { error: 'Unauthorized' })
    try {
      const summary = await runBirthdayCheck({ triggeredBy: 'ADMIN_MANUAL' })
      return json(res, 200, { ok: true, summary, smtp: getSmtpStatus() })
    } catch (err) {
      return json(res, 500, { error: 'Failed to run birthday check: ' + err.message })
    }
  }

  // ---------- PHOTO ASSETS ----------
  if (req.method === 'GET' && url.pathname.startsWith('/api/photos/')) {
    const id = path.basename(url.pathname)
    if (!/^[a-f0-9-]{36}$/.test(id)) return json(res, 400, { error: 'Invalid photo id' })
    const file = path.join(PHOTO_DIR, `${id}.jpg`)
    if (!fs.existsSync(file)) return json(res, 404, { error: 'Photo not found' })
    const data = fs.readFileSync(file)
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    return res.end(data)
  }

  // ---------- PUBLIC BARCODE / ID VERIFICATION LOOKUP ----------
  if (req.method === 'GET' && (url.pathname === '/api/verify' || url.pathname.startsWith('/api/verify/'))) {
    const rawId = url.pathname.startsWith('/api/verify/')
      ? decodeURIComponent(url.pathname.slice('/api/verify/'.length))
      : (url.searchParams.get('id') || url.searchParams.get('rollNumber') || '')
    const norm = String(rawId || '').trim().toLowerCase()
    if (!norm) return json(res, 400, { error: 'Roll / ID number is required for verification.' })

    const records = getRecords()
    let match = records.find((r) => {
      const d = r.data || {}
      return (d.rollNumber || '').trim().toLowerCase() === norm || r.id.toLowerCase() === norm
    })

    let memberData = null
    if (match) {
      const d = match.data || {}
      memberData = {
        rollNumber: d.rollNumber || rawId,
        fullName: d.fullName || 'Registered Member',
        role: d.role || 'student',
        institution: d.institution || 'Aura Academy',
        department: d.department || 'Academic Division',
        degreeProgram: d.degreeProgram || '',
        batch: d.batch || '',
        studentType: d.studentType || '',
        section: d.section || '',
        address: d.address || '',
        verified: match.verified === true && match.verificationStatus === 'verified',
        verificationStatus: match.verificationStatus || (match.verified ? 'verified' : 'pending'),
        verificationMethod: match.verificationMethod || (match.verified ? 'ADMIN_MANUAL_APPROVAL' : 'REGISTRATION_PENDING_APPROVAL'),
        verifiedAt: match.verifiedAt || match.createdAt,
        validUntil: d.validUntil || '2028-06-30',
        issuedAt: match.createdAt,
      }
    } else {
      // Check authoritative registrar reference registry
      const registry = getReferenceRegistry()
      const regMatch = registry.find((entry) => (entry.rollNumber || '').trim().toLowerCase() === norm)
      if (regMatch) {
        memberData = {
          rollNumber: regMatch.rollNumber,
          fullName: regMatch.fullName,
          role: regMatch.role || 'student',
          institution: regMatch.institution || 'Aura Academy',
          department: regMatch.department || 'Academic Division',
          degreeProgram: regMatch.degreeProgram || '',
          batch: regMatch.batch || '',
          studentType: regMatch.studentType || '',
          section: regMatch.section || '',
          address: regMatch.address || '',
          verified: true,
          verificationStatus: 'verified',
          verificationMethod: 'REGISTRAR_DATABASE_MATCH',
          verifiedAt: new Date().toISOString(),
          validUntil: regMatch.validUntil || '2028-06-30',
          issuedAt: new Date().toISOString(),
        }
      }
    }

    if (!memberData) {
      return json(res, 404, {
        ok: true,
        found: false,
        error: `No credential record found for identification code: "${rawId}".`,
      })
    }

    return json(res, 200, {
      ok: true,
      found: true,
      member: memberData,
    })
  }

  // ---------- GET /api/ids (Fetch member or all records) ----------
  if (req.method === 'GET' && url.pathname === '/api/ids') {
    const rollQuery = url.searchParams.get('rollNumber') || url.searchParams.get('id') || ''
    const records = getRecords()
    if (rollQuery) {
      const norm = rollQuery.trim().toLowerCase()
      const match = records.find(
        (r) => (r.data?.rollNumber || '').trim().toLowerCase() === norm || r.id.toLowerCase() === norm
      )
      if (match) return json(res, 200, { ok: true, found: true, record: match })
      return json(res, 404, { ok: true, found: false, error: 'Record not found' })
    }
    return json(res, 200, { ok: true, total: records.length, records })
  }

  // ---------- CREDENTIAL CREATION / VERIFICATION ----------
  if (req.method === 'POST' && url.pathname === '/api/ids') {
    let body
    try {
      body = await readJson(req)
    } catch {
      return json(res, 400, { error: 'Invalid or oversized request' })
    }

    const data = sanitizeData(body.data || body || {})
    if (!data.fullName || !data.rollNumber) {
      return json(res, 400, { error: 'Full name and Roll / ID number are required.' })
    }
    if (!data.email) {
      data.email = `${data.rollNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}@aura.edu`
    }

    // Role-specific validation checks
    if (data.role === 'student' && data.studentType && !['Day Scholar', 'Hosteler'].includes(data.studentType)) {
      return json(res, 400, { error: 'Student type must be either Day Scholar or Hosteler.' })
    }

    // AUTOMATIC SERVER-SIDE VERIFICATION against reference registry (rollNumber + dob)
    const isAdmin = authenticated(req)
    const verification = verifyCredentials(data, {
      actor: isAdmin ? 'ADMIN' : 'STUDENT_USER',
      ip: clientIp(req),
    })

    const records = getRecords()
    const normalizedRoll = data.rollNumber.trim().toLowerCase()
    const normalizedEmail = (data.email || '').trim().toLowerCase()
    const clientProvidedId = typeof body.id === 'string' && body.id.length > 5 ? body.id : null

    // Safe duplicate handling: Check if record with this roll number, email, or client ID already exists
    const existingIndex = records.findIndex(
      (r) =>
        (clientProvidedId && r.id === clientProvidedId) ||
        (r.data?.rollNumber || '').trim().toLowerCase() === normalizedRoll ||
        (normalizedEmail && (r.data?.email || '').trim().toLowerCase() === normalizedEmail)
    )

    let recordId = clientProvidedId || (existingIndex >= 0 ? records[existingIndex].id : crypto.randomUUID())
    let photoStored = existingIndex >= 0 ? records[existingIndex].photoStored : false

    // Handle photo storage
    if (typeof body.photo === 'string' && body.photo.startsWith('data:image/')) {
      const m = body.photo.match(/^data:image\/(jpeg|jpg|png);base64,(.+)$/)
      if (m && Buffer.byteLength(m[2], 'base64') <= 5 * 1024 * 1024) {
        fs.writeFileSync(path.join(PHOTO_DIR, `${recordId}.jpg`), Buffer.from(m[2], 'base64'), { mode: 0o600 })
        photoStored = true
      }
    }

    const nowIso = new Date().toISOString()

    // REQUIREMENT 1: Newly registered users must remain Pending until Admin Approval.
    // Do not automatically verify newly registered users unless admin action or pre-verified.
    let verified = false
    let verificationStatus = 'pending'
    let verificationMethod = 'REGISTRATION_PENDING_APPROVAL'
    let verificationReason = 'Registration submitted. Awaiting administrative verification.'
    let verifiedAt = null

    if (isAdmin) {
      // If admin is creating or managing, respect verification registry check
      verified = verification.verified
      verificationStatus = verification.verificationStatus
      verificationMethod = verification.verificationMethod
      verificationReason = verification.verificationReason
      verifiedAt = verification.verifiedAt || (verified ? nowIso : null)
    } else if (existingIndex >= 0 && (records[existingIndex].verified || records[existingIndex].verificationStatus === 'verified')) {
      // Preserve prior admin approval when existing user updates profile
      verified = true
      verificationStatus = 'verified'
      verificationMethod = records[existingIndex].verificationMethod || 'ADMIN_MANUAL_APPROVAL'
      verificationReason = records[existingIndex].verificationReason || 'Approved by institutional administrator.'
      verifiedAt = records[existingIndex].verifiedAt || nowIso
    } else if (body.verified === true || body.verificationStatus === 'verified') {
      verified = true
      verificationStatus = 'verified'
      verificationMethod = body.verificationMethod || 'ADMIN_MANUAL_APPROVAL'
      verificationReason = body.verificationReason || 'Registration approved by institutional administrator.'
      verifiedAt = body.verifiedAt || nowIso
    }

    const defaultTheme = data.role === 'faculty' ? 'faculty-cherry-blossom' : data.role === 'staff' ? 'staff-powder-azure' : 'lavender'

    const record = {
      id: recordId,
      createdAt: existingIndex >= 0 ? records[existingIndex].createdAt : nowIso,
      updatedAt: nowIso,
      data,
      photoStored,
      verified,
      verificationStatus,
      verificationMethod,
      verificationReason,
      verifiedAt,
      glassTheme: typeof body.glassTheme === 'string' && body.glassTheme ? body.glassTheme.slice(0, 40) : defaultTheme,
    }

    if (existingIndex >= 0) {
      records[existingIndex] = record
    } else {
      records.unshift(record)
    }

    saveRecords(records)

    recordAuditLog({
      action: existingIndex >= 0 ? 'CREDENTIAL_UPDATED' : 'CREDENTIAL_CREATED',
      details: {
        id: record.id,
        rollNumber: data.rollNumber,
        role: data.role,
        verificationStatus: record.verificationStatus,
      },
      actor: isAdmin ? 'ADMIN' : 'STUDENT_USER',
      ip: clientIp(req),
    })

    return json(res, existingIndex >= 0 ? 200 : 201, {
      ok: true,
      id: record.id,
      createdAt: record.createdAt,
      verified: record.verified,
      verificationStatus: record.verificationStatus,
      verificationReason: record.verificationReason,
      updated: existingIndex >= 0,
    })
  }

  // ---------- STATIC ASSET SERVING (Production) ----------
  if (isProd && req.method === 'GET') {
    let filePath = path.join(distDir, url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, ''))
    if (!filePath.startsWith(distDir)) return json(res, 404, { error: 'Not found' })
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html')
    }
    const ext = path.extname(filePath)
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.ico': 'image/x-icon',
    }
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    })
    return fs.createReadStream(filePath).pipe(res)
  }

  return json(res, 404, { error: 'Not found' })
}

const server = http.createServer((req, res) =>
  handle(req, res).catch((err) => {
    console.error(err)
    if (!res.headersSent) json(res, 500, { error: 'Server error' })
  })
)

server.listen(PORT, HOST, () => {
  console.log(`AuraID API running at http://${HOST}:${PORT}`)
  // Initialize automated background birthday scheduler
  initBirthdayScheduler()
})
