import { spawn } from 'node:child_process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const server = spawn(process.execPath, ['server/server.mjs'], { stdio: 'inherit', env: process.env })
const vite = spawn(npm, ['run', 'dev'], { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' })

function stop(code=0) {
  if (!server.killed) server.kill('SIGTERM')
  if (!vite.killed) vite.kill('SIGTERM')
  process.exit(code)
}
server.on('exit', code => { if (code && !vite.killed) vite.kill('SIGTERM') })
vite.on('exit', code => { if (!server.killed) server.kill('SIGTERM'); if (code) process.exit(code) })
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
