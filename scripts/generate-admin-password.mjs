import crypto from 'node:crypto'
const password = crypto.randomBytes(24).toString('base64url')
console.log('\nAuraID administrator password (copy this somewhere safe):\n')
console.log(password)
console.log('\nSet it before starting the server:')
console.log(`PowerShell: $env:ADMIN_PASSWORD="${password}"`)
console.log(`CMD:        set ADMIN_PASSWORD=${password}`)
console.log(`macOS/Linux: export ADMIN_PASSWORD='${password}'\n`)
