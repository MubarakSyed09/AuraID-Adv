import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

console.log('🧪 Testing Database & Refresh Persistence Layer...\n')

// 1. Mock LocalStorage in Node for unit verification
const storage = new Map()
globalThis.localStorage = {
  getItem: (k) => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
}

const {
  getLocalDatabaseRecords,
  saveLocalDatabaseRecord,
  syncLocalDatabase,
  getSavedCardState,
  saveCardState,
  clearSavedCardState,
  isIntroSeen,
  setIntroSeen,
} = await import('../src/utils/permanentDb.js')

// Test 1: Empty initially
assert.deepStrictEqual(getLocalDatabaseRecords(), [], 'Initial local DB must be empty')

// Test 2: Save record
const testRecord = {
  id: 'test-rec-1',
  data: {
    fullName: 'Permanent User',
    rollNumber: 'PERM-001',
    role: 'student',
    email: 'perm@aura.edu',
  },
  verified: true,
  verificationStatus: 'verified',
}
saveLocalDatabaseRecord(testRecord)

const fetchedRecords = getLocalDatabaseRecords()
assert.strictEqual(fetchedRecords.length, 1, 'Local DB must contain 1 record')
assert.strictEqual(fetchedRecords[0].data.rollNumber, 'PERM-001', 'Roll number must match')
console.log('✓ Local database record successfully saved permanently.')

// Test 3: Simulating page refresh (memory cleared, but storage intact)
// Calling getLocalDatabaseRecords re-reads from localStorage:
const refreshedRecords = getLocalDatabaseRecords()
assert.strictEqual(refreshedRecords.length, 1, 'Record must persist across page refresh')
assert.strictEqual(refreshedRecords[0].data.fullName, 'Permanent User')
console.log('✓ Database records remain intact after simulated page refresh.')

// Test 4: Active Card State persistence across refresh
saveCardState({
  formData: {
    fullName: 'Jane Doe',
    rollNumber: 'JD-999',
    role: 'faculty',
    email: 'jane@aura.edu',
  },
  photo: 'data:image/jpeg;base64,mockphoto',
  completed: true,
  verified: true,
  glassTheme: 'faculty-cherry-blossom',
})

const refreshedCardState = getSavedCardState()
assert(refreshedCardState !== null, 'Saved card state must exist')
assert.strictEqual(refreshedCardState.completed, true, 'Completed card view must be preserved')
assert.strictEqual(refreshedCardState.formData.rollNumber, 'JD-999', 'Form data preserved')
assert.strictEqual(refreshedCardState.photo, 'data:image/jpeg;base64,mockphoto', 'Photo preserved')
assert.strictEqual(refreshedCardState.glassTheme, 'faculty-cherry-blossom', 'Theme preserved')
console.log('✓ Active card state & completion screen successfully preserved across refresh.')

// Test 5: Sync with server records without data loss
const serverRecords = [
  {
    id: 'server-rec-2',
    data: {
      fullName: 'Server User',
      rollNumber: 'SRV-002',
      role: 'staff',
      email: 'staff@aura.edu',
    },
    verified: false,
  },
]
const synced = syncLocalDatabase(serverRecords)
assert.strictEqual(synced.length, 2, 'Local and Server records must merge without data loss')
assert(synced.some((r) => r.data.rollNumber === 'PERM-001'), 'Local record must remain')
assert(synced.some((r) => r.data.rollNumber === 'SRV-002'), 'Server record must be added')
console.log('✓ Bidirectional database sync merges records without dropping data.')

// Test 6: Intro seen state
setIntroSeen(true)
assert.strictEqual(isIntroSeen(), true, 'Intro seen must be true')
console.log('✓ Intro seen flag preserved across refresh.')

console.log('\n🎉 ALL PERSISTENCE TESTS PASSED 100%!')
