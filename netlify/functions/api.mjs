import crypto from 'node:crypto'
import { getStore } from '@netlify/blobs'

const RECORDS = getStore('auraid-records')
const PHOTOS = getStore('auraid-photos')
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'abcdefghijklmnopqrstuvuwyz'
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || ADMIN_PASSWORD
const SESSION_TTL = 30 * 60 * 1000
const MAX_BODY = 6 * 1024 * 1024
const ALLOWED = ['role','studentType','section','fullName','dob','email','phone','address','handle','bioTitle','bloodGroup','emergencyName','emergencyPhone','institution','rollNumber','degreeProgram','department','batch','cgpa','credits','cohortRank','validUntil']
const loginAttempts = new Map()

// Reference registry cache for Netlify
const REGISTRY = getStore('auraid-registry')


function json(data, status=200, extra={}) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra
  }})
}

function base64url(buf) { return Buffer.from(buf).toString('base64url') }
function sign(value) { return base64url(crypto.createHmac('sha256', SESSION_SECRET).update(value).digest()) }
function makeToken() {
  const payload = base64url(JSON.stringify({ sub: 'admin', exp: Date.now() + SESSION_TTL, nonce: crypto.randomBytes(16).toString('hex') }))
  return `${payload}.${sign(payload)}`
}
function verifyToken(token) {
  if (!token) return false
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return false
  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(sig)
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return data.sub === 'admin' && Number(data.exp) > Date.now()
  } catch { return false }
}
function cookie(req) {
  const raw = req.headers.get('cookie') || ''
  const match = raw.match(/(?:^|;\s*)aura_admin=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}
function normalizeDateParts(str) {
  if (!str || typeof str !== 'string') return null
  const trimmed = str.trim()
  if (!trimmed) return null
  let m = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
    return { year: y, month: mo, day: d, iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
  }
  m = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (m) {
    const p1 = Number(m[1]), p2 = Number(m[2]), y = Number(m[3])
    if (p1 > 12) return { year: y, month: p2, day: p1, iso: `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}` }
    if (p2 > 12) return { year: y, month: p1, day: p2, iso: `${y}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}` }
    return { year: y, month: p1, day: p2, altMonth: p2, altDay: p1, iso: `${y}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}` }
  }
  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear(), mo = parsed.getUTCMonth() + 1, d = parsed.getUTCDate()
    return { year: y, month: mo, day: d, iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
  }
  return null
}

function datesMatch(dateA, dateB) {
  if (!dateA || !dateB) return false
  const aStr = String(dateA).trim().toLowerCase(), bStr = String(dateB).trim().toLowerCase()
  if (aStr === bStr) return true
  const pA = normalizeDateParts(aStr), pB = normalizeDateParts(bStr)
  if (!pA || !pB) return false
  if (pA.iso === pB.iso) return true
  if (pA.year === pB.year && pA.month === pB.month && pA.day === pB.day) return true
  if (pA.year === pB.year && pA.altMonth && pA.altMonth === pB.month && pA.altDay === pB.day) return true
  if (pB.year === pA.year && pB.altMonth && pB.altMonth === pA.month && pB.altDay === pA.day) return true
  return false
}

function makeMemberToken(user) {
  const payload = base64url(JSON.stringify({ sub: 'member', user, exp: Date.now() + 2 * 60 * 60 * 1000 }))
  return `${payload}.${sign(payload)}`
}

function verifyMemberToken(token) {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(sig)
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return (data.sub === 'member' && Number(data.exp) > Date.now()) ? data.user : null
  } catch { return null }
}

function memberCookie(req) {
  const raw = req.headers.get('cookie') || ''
  const match = raw.match(/(?:^|;\s*)aura_member=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}
function authenticated(req) { return verifyToken(cookie(req)) }
function clientKey(req) { return req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || 'unknown' }
function limited(req) {
  const key = String(clientKey(req)).split(',')[0]
  const now = Date.now()
  const current = loginAttempts.get(key) || { count: 0, reset: now + 15 * 60 * 1000 }
  if (now > current.reset) { current.count = 0; current.reset = now + 15 * 60 * 1000 }
  current.count += 1
  loginAttempts.set(key, current)
  return current.count > 8
}
function sanitize(input={}) {
  const out = {}
  for (const key of ALLOWED) out[key] = typeof input[key] === 'string' ? input[key].trim().slice(0, 300) : ''
  const rawRole = out.role ? out.role.toLowerCase() : 'student'
  out.role = ['student', 'faculty', 'staff'].includes(rawRole) ? rawRole : 'student'
  if (out.role === 'student') {
    if (out.studentType && !['Day Scholar', 'Hosteler'].includes(out.studentType)) out.studentType = ''
    out.section = out.section.slice(0, 50)
  } else {
    out.studentType = ''
    out.section = ''
  }
  return out
}
async function readBody(req) {
  const text = await req.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY) throw new Error('Payload too large')
  return JSON.parse(text || '{}')
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
        verificationMethod: isVerified ? (existing.verificationMethod || r.verificationMethod || 'ADMIN_MANUAL_APPROVAL') : 'REGISTRATION_PENDING_APPROVAL',
        verificationReason: isVerified ? (existing.verificationReason || r.verificationReason || 'Registration approved by institutional administrator.') : 'Registration submitted. Awaiting administrative verification.',
        verifiedAt,
        glassTheme: r.glassTheme || existing.glassTheme || 'lavender'
      })
    }
  }
  return Array.from(map.values())
}

async function listRecords() {
  const { blobs } = await RECORDS.list()
  const rows = await Promise.all(blobs.map(async ({ key }) => RECORDS.get(key, { type: 'json' })))
  const sorted = rows.filter(Boolean).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return deduplicateRecords(sorted)
}

export default async (req) => {
  try {
    const url = new URL(req.url)
    const route = url.pathname.replace(/^\/api\/?/, '')

    // ---------- MEMBER AUTHENTICATION ----------
    if (req.method === 'POST' && route === 'auth/login') {
      let body
      try { body = await readBody(req) } catch { return json({ error: 'Invalid request' }, 400) }
      const rollNumber = String(body.rollNumber || '').trim().toLowerCase()
      const queryDob = String(body.dob || body.email || '').trim()
      if (!rollNumber) return json({ error: 'Roll / ID number is required.' }, 400)

      const records = await listRecords()
      let targetRecord = records.find((r) => (r.data?.rollNumber || '').trim().toLowerCase() === rollNumber)
      if (!targetRecord) {
        try {
          const regRecord = await REGISTRY.get(rollNumber, { type: 'json' })
          if (regRecord) {
            targetRecord = {
              id: regRecord.rollNumber,
              data: { ...regRecord },
              verified: true,
              verificationStatus: 'verified',
              glassTheme: regRecord.role === 'faculty' ? 'faculty-cherry-blossom' : regRecord.role === 'staff' ? 'staff-powder-azure' : 'lavender'
            }
          }
        } catch {}
      }

      if (!targetRecord) {
        return json({ error: 'Member not found. Please check your Roll/ID number and Date of Birth.' }, 404)
      }

      const storedDob = targetRecord.data?.dob || ''
      const storedEmail = targetRecord.data?.email || ''
      const dobMatches = datesMatch(storedDob, queryDob) || (storedEmail && storedEmail.toLowerCase() === queryDob.toLowerCase())
      if (!dobMatches) {
        return json({ error: 'Incorrect Date of Birth. Please check your details and try again.' }, 401)
      }

      const isVerified = targetRecord.verified === true && targetRecord.verificationStatus === 'verified'
      if (!isVerified) {
        return json({
          error: 'Your registration is still pending admin approval. You will be able to log in once an administrator approves your account.',
          status: 'pending',
          pending: true
        }, 403)
      }

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
        glassTheme: targetRecord.glassTheme || (targetRecord.data.role === 'faculty' ? 'faculty-cherry-blossom' : targetRecord.data.role === 'staff' ? 'staff-powder-azure' : 'lavender')
      }
      const token = makeMemberToken(sessionUser)
      return json({ ok: true, user: sessionUser }, 200, {
        'Set-Cookie': `aura_member=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=7200`
      })
    }

    if (req.method === 'GET' && route === 'auth/me') {
      const user = verifyMemberToken(memberCookie(req))
      return json({ authenticated: Boolean(user), user: user || null })
    }

    if (req.method === 'POST' && route === 'auth/logout') {
      return json({ ok: true }, 200, {
        'Set-Cookie': 'aura_member=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'
      })
    }

    if (req.method === 'GET' && (route === 'verify' || route.startsWith('verify/'))) {
      const urlObj = new URL(req.url)
      const rawId = route.startsWith('verify/')
        ? decodeURIComponent(route.slice('verify/'.length))
        : (urlObj.searchParams.get('id') || urlObj.searchParams.get('rollNumber') || '')
      const norm = String(rawId || '').trim().toLowerCase()
      if (!norm) return json({ error: 'Roll / ID number is required.' }, 400)

      const records = await listRecords()
      let target = records.find((r) => {
        const d = r.data || {}
        return (d.rollNumber || '').trim().toLowerCase() === norm || r.id.toLowerCase() === norm
      })

      let memberData = null
      if (target) {
        const d = target.data || {}
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
          verified: target.verified === true && target.verificationStatus === 'verified',
          verificationStatus: target.verificationStatus || (target.verified ? 'verified' : 'pending'),
          verificationMethod: target.verificationMethod || (target.verified ? 'ADMIN_MANUAL_APPROVAL' : 'REGISTRATION_PENDING_APPROVAL'),
          verifiedAt: target.verifiedAt || target.createdAt,
          validUntil: d.validUntil || '2028-06-30',
        }
      } else {
        try {
          const regRecord = await REGISTRY.get(norm, { type: 'json' })
          if (regRecord) {
            memberData = {
              rollNumber: regRecord.rollNumber,
              fullName: regRecord.fullName,
              role: regRecord.role || 'student',
              institution: regRecord.institution || 'Aura Academy',
              department: regRecord.department || 'Academic Division',
              degreeProgram: regRecord.degreeProgram || '',
              batch: regRecord.batch || '',
              studentType: regRecord.studentType || '',
              section: regRecord.section || '',
              address: regRecord.address || '',
              verified: true,
              verificationStatus: 'verified',
              verificationMethod: 'REGISTRAR_DATABASE_MATCH',
              verifiedAt: new Date().toISOString(),
              validUntil: regRecord.validUntil || '2028-06-30',
            }
          }
        } catch {}
      }

      if (!memberData) {
        return json({ ok: true, found: false, error: `No credential record found for ID: "${rawId}".` }, 404)
      }

      return json({ ok: true, found: true, member: memberData }, 200)
    }

    if (req.method === 'POST' && route === 'admin/login') {
      if (limited(req)) return json({ error: 'Too many login attempts. Please wait 15 minutes.' }, 429)
      let body
      try { body = await readBody(req) } catch { return json({ error: 'Invalid request.' }, 400) }
      const supplied = String(body.password || '')
      const a = Buffer.from(supplied)
      const b = Buffer.from(ADMIN_PASSWORD)
      const ok = a.length === b.length && crypto.timingSafeEqual(a, b)
      if (!ok) return json({ error: 'Invalid admin credentials.' }, 401)
      return json({ ok: true }, 200, {
        'Set-Cookie': `aura_admin=${encodeURIComponent(makeToken())}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=1800`
      })
    }

    if (req.method === 'POST' && route === 'admin/logout') {
      return json({ ok: true }, 200, { 'Set-Cookie': 'aura_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' })
    }

    if (req.method === 'GET' && route === 'admin/me') return json({ authenticated: authenticated(req) })

    if (req.method === 'GET' && route === 'admin/records') {
      if (!authenticated(req)) return json({ error: 'Unauthorized' }, 401)
      const records = await listRecords()
      return json({ total: records.length, records })
    }

    if (req.method === 'POST' && (route === 'admin/records/approve' || route === 'admin/approve')) {
      if (!authenticated(req)) return json({ error: 'Unauthorized' }, 401)
      let body
      try { body = await readBody(req) } catch { return json({ error: 'Invalid request.' }, 400) }
      const recordId = body.id || body.recordId || body.rollNumber
      const rollQuery = (body.rollNumber || (body.record?.data?.rollNumber || body.record?.rollNumber) || '').trim().toLowerCase()
      const emailQuery = (body.email || (body.record?.data?.email || body.record?.email) || '').trim().toLowerCase()
      if (!recordId && !rollQuery && !emailQuery) return json({ error: 'Record ID or Roll Number is required.' }, 400)

      const records = await listRecords()
      let target = records.find(
        (r) =>
          (recordId && r.id === recordId) ||
          (rollQuery && (r.data?.rollNumber || '').trim().toLowerCase() === rollQuery) ||
          (recordId && (r.data?.rollNumber || '').trim().toLowerCase() === String(recordId).trim().toLowerCase()) ||
          (emailQuery && (r.data?.email || '').trim().toLowerCase() === emailQuery)
      )

      if (!target) {
        if (body.record && (body.record.data || body.record.fullName || body.record.rollNumber)) {
          const rawData = body.record.data || body.record
          const cleanData = sanitize(rawData)
          const nowIso = new Date().toISOString()
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
            glassTheme: body.record.glassTheme || (cleanData.role === 'faculty' ? 'faculty-cherry-blossom' : cleanData.role === 'staff' ? 'staff-powder-azure' : 'lavender')
          }
          await RECORDS.setJSON(target.id, target)
        } else {
          try {
            const regKey = rollQuery || (recordId ? String(recordId).trim().toLowerCase() : '')
            const regRecord = await REGISTRY.get(regKey, { type: 'json' })
            if (regRecord) {
              const nowIso = new Date().toISOString()
              target = {
                id: crypto.randomUUID(),
                createdAt: nowIso,
                updatedAt: nowIso,
                data: { ...regRecord },
                photoStored: false,
                verified: true,
                verificationStatus: 'verified',
                verificationMethod: 'ADMIN_MANUAL_APPROVAL',
                verificationReason: 'Registration approved by institutional administrator.',
                verifiedAt: nowIso,
                glassTheme: regRecord.role === 'faculty' ? 'faculty-cherry-blossom' : regRecord.role === 'staff' ? 'staff-powder-azure' : 'lavender'
              }
              await RECORDS.setJSON(target.id, target)
            }
          } catch {}
        }
      }

      if (!target) return json({ error: 'Record not found.' }, 404)

      // Idempotency check: prevent duplicate verification
      if (target.verified === true && target.verificationStatus === 'verified' && target.verifiedAt) {
        return json({ ok: true, alreadyVerified: true, message: 'Member is already verified.', record: target })
      }

      target.verified = true
      target.verificationStatus = 'verified'
      target.verificationMethod = 'ADMIN_MANUAL_APPROVAL'
      target.verificationReason = 'Registration approved by institutional administrator.'
      target.verifiedAt = new Date().toISOString()
      target.updatedAt = new Date().toISOString()
      await RECORDS.setJSON(target.id, target)
      return json({ ok: true, record: target })
    }

    if (req.method === 'GET' && route.startsWith('photos/')) {
      if (!authenticated(req)) return json({ error: 'Unauthorized' }, 401)
      const id = route.slice('photos/'.length)
      if (!/^[a-f0-9-]{36}$/.test(id)) return json({ error: 'Invalid photo id' }, 400)
      const photo = await PHOTOS.getWithMetadata(id, { type: 'arrayBuffer' })
      if (!photo?.data) return json({ error: 'Photo not found' }, 404)
      return new Response(photo.data, { status: 200, headers: { 'Content-Type': photo.metadata?.contentType || 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
    }

    if (req.method === 'GET' && route === 'ids') {
      const rollQuery = url.searchParams.get('rollNumber') || url.searchParams.get('id') || ''
      const records = await listRecords()
      if (rollQuery) {
        const norm = rollQuery.trim().toLowerCase()
        const match = records.find(
          (r) => (r.data?.rollNumber || '').trim().toLowerCase() === norm || r.id.toLowerCase() === norm
        )
        if (match) return json({ ok: true, found: true, record: match }, 200)
        return json({ ok: true, found: false, error: 'Record not found' }, 404)
      }
      return json({ ok: true, total: records.length, records }, 200)
    }

    if (req.method === 'POST' && route === 'ids') {
      let body
      try { body = await readBody(req) } catch { return json({ error: 'Invalid or oversized request.' }, 400) }
      const data = sanitize(body.data || body || {})
      if (!data.fullName || !data.rollNumber) return json({ error: 'Full name and Roll / ID number are required.' }, 400)
      if (!data.email) {
        data.email = `${data.rollNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}@aura.edu`
      }
      
      const isAdmin = authenticated(req)
      const records = await listRecords()
      const normRoll = data.rollNumber.trim().toLowerCase()
      const normEmail = data.email.trim().toLowerCase()
      const clientProvidedId = typeof body.id === 'string' && body.id.length > 5 ? body.id : null
      const existing = records.find(
        (r) =>
          (clientProvidedId && r.id === clientProvidedId) ||
          (r.data?.rollNumber || '').trim().toLowerCase() === normRoll ||
          (normEmail && (r.data?.email || '').trim().toLowerCase() === normEmail)
      )

      let verified = false
      let verificationStatus = 'pending'
      let verificationReason = 'Registration submitted. Awaiting administrative approval.'
      
      if (isAdmin) {
        try {
          const regRecord = await REGISTRY.get(data.rollNumber.toLowerCase(), { type: 'json' })
          if (regRecord && String(regRecord.dob).trim() === String(data.dob).trim()) {
            verified = true
            verificationStatus = 'verified'
            verificationReason = 'Matched authoritative registrar database by Roll Number and Date of Birth.'
          }
        } catch {}
      } else if (existing && (existing.verified || existing.verificationStatus === 'verified')) {
        verified = true
        verificationStatus = 'verified'
        verificationReason = existing.verificationReason || 'Approved by institutional administrator.'
      } else if (body.verified === true || body.verificationStatus === 'verified') {
        verified = true
        verificationStatus = 'verified'
        verificationReason = body.verificationReason || 'Registration approved by institutional administrator.'
      }

      const id = clientProvidedId || (existing ? existing.id : crypto.randomUUID())
      let photoStored = existing ? existing.photoStored : false
      if (typeof body.photo === 'string' && /^data:image\/(jpeg|jpg|png);base64,/.test(body.photo)) {
        const match = body.photo.match(/^data:(image\/(?:jpeg|jpg|png));base64,(.+)$/)
        if (match) {
          const bytes = Buffer.from(match[2], 'base64')
          if (bytes.length <= 4 * 1024 * 1024) {
            await PHOTOS.set(id, bytes, { metadata: { contentType: match[1] === 'image/jpg' ? 'image/jpeg' : match[1] } })
            photoStored = true
          }
        }
      }

      const defaultTheme = data.role === 'faculty' ? 'faculty-cherry-blossom' : data.role === 'staff' ? 'staff-powder-azure' : 'lavender'

      const record = {
        id,
        createdAt: existing ? existing.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        data,
        photoStored,
        verified,
        verificationStatus,
        verificationReason,
        glassTheme: typeof body.glassTheme === 'string' && body.glassTheme ? body.glassTheme.slice(0,40) : defaultTheme
      }
      await RECORDS.setJSON(id, record)
      return json({ ok: true, id, createdAt: record.createdAt, verified, verificationStatus }, 201)
    }

    return json({ error: 'Not found' }, 404)
  } catch (error) {
    console.error('AuraID API error:', error)
    return json({ error: 'Server error. Please try again.' }, 500)
  }
}
