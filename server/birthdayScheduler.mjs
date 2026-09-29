import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sendBirthdayEmail, getSmtpStatus } from './emailService.mjs'
import { getReferenceRegistry, parseBirthMonthAndDay } from './verificationService.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const IDS_FILE = path.join(DATA_DIR, 'ids.json')
const DISPATCH_FILE = path.join(DATA_DIR, 'birthday_dispatches.json')

fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(DISPATCH_FILE)) fs.writeFileSync(DISPATCH_FILE, '{}\n', { mode: 0o600 })

function getDispatches() {
  try {
    return JSON.parse(fs.readFileSync(DISPATCH_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function recordDispatch(key) {
  try {
    const data = getDispatches()
    data[key] = new Date().toISOString()
    const tmp = `${DISPATCH_FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, DISPATCH_FILE)
  } catch (err) {
    console.error('Failed to record birthday dispatch:', err)
  }
}

function getStoredUsers() {
  try {
    const raw = fs.readFileSync(IDS_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

/**
 * Returns today's { year, month, day } in the application's timezone.
 */
function getTodayDateInTimezone() {
  const tz = process.env.APP_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(new Date())
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    dateStr: `${year}-${month}-${day}`,
    tz,
  }
}

/**
 * Runs the daily birthday verification & dispatch job.
 */
export async function runBirthdayCheck({ triggeredBy = 'SCHEDULER' } = {}) {
  const today = getTodayDateInTimezone()
  const dispatches = getDispatches()
  const records = getStoredUsers()
  const registry = getReferenceRegistry()
  const smtpStatus = getSmtpStatus()

  // Collect candidate users from both active credential records and registrar registry
  const candidatesMap = new Map()

  for (const rec of records) {
    const d = rec.data || {}
    const email = d.email?.trim()?.toLowerCase()
    if (email && d.dob) {
      candidatesMap.set(email, {
        id: rec.id || email,
        fullName: d.fullName || 'Campus Member',
        email,
        dob: d.dob,
        institution: d.institution || 'Aura Academy',
        role: d.role || 'student',
      })
    }
  }

  for (const reg of registry) {
    const email = reg.email?.trim()?.toLowerCase()
    if (email && reg.dob && !candidatesMap.has(email)) {
      candidatesMap.set(email, {
        id: reg.rollNumber || email,
        fullName: reg.fullName,
        email,
        dob: reg.dob,
        institution: reg.institution || 'Aura Academy',
        role: reg.role || 'student',
      })
    }
  }

  const results = {
    date: today.dateStr,
    timezone: today.tz,
    triggeredBy,
    checkedCount: candidatesMap.size,
    matchedBirthdays: 0,
    sentCount: 0,
    skippedDuplicates: 0,
    smtpConfigured: smtpStatus.configured,
    missingConfig: smtpStatus.missingConfig,
    errors: [],
    details: [],
  }

  for (const user of candidatesMap.values()) {
    const parsed = parseBirthMonthAndDay(user.dob)
    if (!parsed) continue

    if (parsed.month === today.month && parsed.day === today.day) {
      results.matchedBirthdays++
      const dispatchKey = `${user.email}_${today.year}_${today.month}-${today.day}`

      if (dispatches[dispatchKey]) {
        results.skippedDuplicates++
        results.details.push({
          email: user.email,
          name: user.fullName,
          status: 'SKIPPED_DUPLICATE',
          message: 'Birthday email was already sent today for this user.',
        })
        continue
      }

      try {
        const sendResult = await sendBirthdayEmail({
          to: user.email,
          name: user.fullName,
          institution: user.institution,
          role: user.role,
        })

        if (sendResult.ok) {
          recordDispatch(dispatchKey)
          results.sentCount++
          results.details.push({
            email: user.email,
            name: user.fullName,
            status: 'SENT',
            mode: sendResult.mode,
          })
        } else {
          results.errors.push({ email: user.email, error: sendResult.error })
          results.details.push({
            email: user.email,
            name: user.fullName,
            status: 'FAILED',
            error: sendResult.error,
          })
        }
      } catch (err) {
        console.error(`Birthday email error for ${user.email}:`, err)
        results.errors.push({ email: user.email, error: err.message })
      }
    }
  }

  console.log(`[BirthdayScheduler] Job complete: ${results.sentCount} sent, ${results.skippedDuplicates} skipped, ${results.matchedBirthdays} matched today (${today.dateStr}).`)
  return results
}

/**
 * Initializes recurring automated scheduler.
 */
let schedulerTimer = null

export function initBirthdayScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer)

  // Run initial check upon server launch
  runBirthdayCheck({ triggeredBy: 'STARTUP' }).catch((err) => {
    console.error('Startup birthday check error:', err)
  })

  // Check periodically (every 4 hours, deduplication ensures only 1 email per user per day)
  const INTERVAL_MS = 4 * 60 * 60 * 1000
  schedulerTimer = setInterval(() => {
    runBirthdayCheck({ triggeredBy: 'INTERVAL_JOB' }).catch((err) => {
      console.error('Recurring birthday check error:', err)
    })
  }, INTERVAL_MS)

  // Unref timer so node process can cleanly exit if needed
  if (schedulerTimer.unref) schedulerTimer.unref()
}
