import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import tls from 'node:tls'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const EMAIL_LOG_FILE = path.join(DATA_DIR, 'email_logs.json')

fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(EMAIL_LOG_FILE)) fs.writeFileSync(EMAIL_LOG_FILE, '[]\n', { mode: 0o600 })

export function getEmailLogs() {
  try {
    const raw = fs.readFileSync(EMAIL_LOG_FILE, 'utf8')
    const list = JSON.parse(raw)
    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  } catch {
    return []
  }
}

export function logEmailDelivery(entry) {
  try {
    const logs = getEmailLogs()
    logs.unshift(entry)
    const trimmed = logs.slice(0, 500)
    const tmp = `${EMAIL_LOG_FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(trimmed, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, EMAIL_LOG_FILE)
  } catch (err) {
    console.error('Failed to write email delivery log:', err)
  }
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false
  const trimmed = email.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
}

/**
 * Creates HTML and plain-text birthday message.
 */
export function buildBirthdayEmailContent({ name, institution = 'Aura Academy', role = 'student' }) {
  const safeName = String(name || 'Valued Member').trim()
  const safeInst = String(institution || 'Aura Academy').trim()

  const subject = `🎉 Happy Birthday, ${safeName}! Wishing you a wonderful day from ${safeInst}`

  const plainText = `Happy Birthday, ${safeName}! 🎉

On behalf of everyone at ${safeInst}, wishing you a wonderful birthday and a year filled with happiness, success, and great moments.

Thank you for being an inspiring part of our campus community.

Warm regards,
${safeInst} Administration & Community`

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f6f4ff; margin: 0; padding: 24px; color: #241f38; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 16px 36px rgba(124, 58, 237, 0.12); border: 1px solid rgba(124, 58, 237, 0.15); }
    .header { background: linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #38bdf8 100%); padding: 36px 32px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0 0 8px; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
    .header p { margin: 0; font-size: 14px; opacity: 0.92; letter-spacing: 0.05em; text-transform: uppercase; }
    .body { padding: 36px 32px; font-size: 15px; line-height: 1.65; color: #3b3150; }
    .greeting { font-size: 20px; font-weight: 700; color: #241f38; margin-bottom: 16px; }
    .quote-box { background: #f5f3ff; border-left: 4px solid #7c3aed; padding: 16px 20px; border-radius: 8px; margin: 24px 0; font-style: italic; color: #55516c; }
    .badge { display: inline-block; padding: 4px 12px; background: rgba(124, 58, 237, 0.12); color: #6d28d9; border-radius: 999px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 12px; }
    .footer { padding: 20px 32px; background: #faf9ff; border-top: 1px solid #ede9fe; font-size: 12px; color: #8f8aa8; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <p>✦ ${safeInst} Celebrates You</p>
      <h1>Happy Birthday! 🎂</h1>
    </div>
    <div class="body">
      <span class="badge">${role} Recognition</span>
      <div class="greeting">Happy Birthday, ${safeName}! 🎉</div>
      <p>Wishing you a wonderful birthday and a year filled with happiness, success, and great moments.</p>
      <div class="quote-box">
        "May this new chapter bring exciting discoveries, rewarding challenges, and continued growth in everything you do."
      </div>
      <p>We are proud to have you as part of our institution's community. Have an exceptional day celebrating with family, friends, and peers!</p>
    </div>
    <div class="footer">
      Sent with warmth by <strong>${safeInst}</strong> · Automated Credential &amp; Community Notifications
    </div>
  </div>
</body>
</html>`

  return { subject, plainText, html }
}

/**
 * Basic SMTP client over socket for standard SMTP credentials.
 */
function sendSmtpSocket({ host, port, secure, user, pass, from, to, subject, html, plainText }) {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect(port, host, { rejectUnauthorized: false })
      : net.connect(port, host)

    let step = 0
    let buffer = ''

    function write(cmd) {
      socket.write(`${cmd}\r\n`)
    }

    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\r\n')
      buffer = lines.pop()

      for (const line of lines) {
        const code = line.slice(0, 3)
        if (code === '220' && step === 0) {
          step++
          write(`EHLO localhost`)
        } else if (code === '250' && step === 1) {
          if (user && pass) {
            step++
            write('AUTH LOGIN')
          } else {
            step = 4
            write(`MAIL FROM:<${from}>`)
          }
        } else if (code === '334' && step === 2) {
          step++
          write(Buffer.from(user).toString('base64'))
        } else if (code === '334' && step === 3) {
          step++
          write(Buffer.from(pass).toString('base64'))
        } else if (code === '235' && step === 4) {
          step++
          write(`MAIL FROM:<${from}>`)
        } else if (code === '250' && (step === 4 || step === 5)) {
          step = 6
          write(`RCPT TO:<${to}>`)
        } else if (code === '250' && step === 6) {
          step++
          write('DATA')
        } else if (code === '354' && step === 7) {
          step++
          const message = [
            `From: ${from}`,
            `To: ${to}`,
            `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
            `MIME-Version: 1.0`,
            `Content-Type: text/html; charset=UTF-8`,
            '',
            html,
            '.',
          ].join('\r\n')
          write(message)
        } else if (code === '250' && step === 8) {
          socket.end()
          resolve({ ok: true })
        } else if (Number(code) >= 400) {
          socket.destroy()
          reject(new Error(`SMTP Error: ${line}`))
        }
      }
    })

    socket.on('error', (err) => reject(err))
    socket.setTimeout(10000, () => {
      socket.destroy()
      reject(new Error('SMTP Connection timeout'))
    })
  })
}

export function getSmtpStatus() {
  const missing = []
  if (!process.env.SMTP_HOST) missing.push('SMTP_HOST')
  if (!process.env.SMTP_USER) missing.push('SMTP_USER')
  if (!process.env.SMTP_PASS) missing.push('SMTP_PASS')
  return {
    configured: missing.length === 0,
    missingConfig: missing,
    host: process.env.SMTP_HOST || null,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
    user: process.env.SMTP_USER ? `${process.env.SMTP_USER.slice(0, 3)}***` : null,
  }
}

/**
 * Sends a birthday email or logs simulated delivery in development.
 */
export async function sendBirthdayEmail({ to, name, institution, role = 'student' }) {
  const logId = crypto.randomUUID()
  const timestamp = new Date().toISOString()

  if (!isValidEmail(to)) {
    const record = {
      id: logId,
      timestamp,
      recipient: to || 'none',
      name,
      status: 'FAILED',
      mode: 'VALIDATION',
      subject: 'Birthday Wishes',
      error: 'Invalid or missing email address.',
    }
    logEmailDelivery(record)
    return { ok: false, error: record.error }
  }

  const { subject, plainText, html } = buildBirthdayEmailContent({ name, institution, role })

  const smtpStatus = getSmtpStatus()

  if (smtpStatus.configured) {
    const smtpHost = process.env.SMTP_HOST
    const smtpPort = Number(process.env.SMTP_PORT || 587)
    const smtpUser = process.env.SMTP_USER
    const smtpPass = process.env.SMTP_PASS
    const smtpFrom = process.env.SMTP_FROM || `AuraID Celebrations <noreply@${smtpHost || 'auraid.edu'}>`
    const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465

    try {
      await sendSmtpSocket({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        user: smtpUser,
        pass: smtpPass,
        from: smtpFrom,
        to,
        subject,
        html,
        plainText,
      })
      const record = {
        id: logId,
        timestamp,
        recipient: to,
        name,
        status: 'DELIVERED',
        mode: 'SMTP',
        configured: true,
        subject,
        error: null,
      }
      logEmailDelivery(record)
      return { ok: true, delivered: true, configured: true, mode: 'SMTP', id: logId }
    } catch (err) {
      console.error(`SMTP delivery failed for ${to}:`, err.message)
      const record = {
        id: logId,
        timestamp,
        recipient: to,
        name,
        status: 'FAILED',
        mode: 'SMTP',
        configured: true,
        subject,
        error: err.message,
      }
      logEmailDelivery(record)
      return { ok: false, delivered: false, configured: true, mode: 'SMTP', error: err.message }
    }
  }

  // Simulated delivery mode when SMTP credentials are not configured
  const record = {
    id: logId,
    timestamp,
    recipient: to,
    name,
    status: 'SIMULATED (NO SMTP)',
    mode: 'SIMULATED_LOCAL',
    subject,
    previewText: plainText.slice(0, 160) + '...',
    configured: false,
    missingConfig: smtpStatus.missingConfig,
    note: 'External SMTP server is not configured. Email wish simulated and recorded locally for inspection.',
    error: null,
  }
  logEmailDelivery(record)
  console.log(`[EmailService:Simulated] (SMTP NOT CONFIGURED) Birthday email logged for ${name} <${to}>: "${subject}"`)
  return {
    ok: true,
    delivered: false,
    mode: 'SIMULATED_LOCAL',
    configured: false,
    missingConfig: smtpStatus.missingConfig,
    id: logId,
    message: 'SMTP not configured; simulated email logged locally.',
  }
}
