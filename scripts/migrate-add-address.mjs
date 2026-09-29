import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const IDS_FILE = path.join(DATA_DIR, 'ids.json')
const REGISTRY_FILE = path.join(DATA_DIR, 'admin_reference_registry.json')

console.log('🔄 Running AuraID Data Migration: Address & Role Verification Alignment...')

let migratedIdsCount = 0
let migratedRegistryCount = 0

// 1. Migrate ids.json
if (fs.existsSync(IDS_FILE)) {
  try {
    const rawIds = fs.readFileSync(IDS_FILE, 'utf8')
    const ids = JSON.parse(rawIds || '[]')
    
    for (const record of ids) {
      if (!record.data) record.data = {}
      
      // Ensure address is present
      if (typeof record.data.address !== 'string' || !record.data.address.trim()) {
        const role = record.data.role || 'student'
        if (role === 'student') {
          record.data.address = record.data.studentType === 'Hosteler'
            ? 'Hostel Block C, Room 204, Aura Campus'
            : 'Suite 104, West Hall, University Ave, Cambridge, MA'
        } else if (role === 'faculty') {
          record.data.address = 'Faculty Quarters 12A, North Ridge, Cambridge, MA'
        } else {
          record.data.address = 'Campus Operations Base, Building 7, Aura Academy'
        }
        migratedIdsCount++
      }

      // Ensure explicit verificationStatus
      if (!record.verificationStatus) {
        record.verificationStatus = record.verified ? 'verified' : 'pending'
      }

        // Ensure default glassTheme by role if missing
        if (!record.glassTheme) {
          const role = record.data.role || 'student'
          record.glassTheme = role === 'faculty' ? 'faculty-pastel-mint' : role === 'staff' ? 'staff-pastel-azure' : 'lavender'
        }
      }

      const tmp = `${IDS_FILE}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(ids, null, 2), { mode: 0o600 })
      fs.renameSync(tmp, IDS_FILE)
      console.log(`✓ Checked ${ids.length} issued credentials in ids.json (migrated ${migratedIdsCount})`)
    } catch (err) {
      console.error('Migration error on ids.json:', err)
    }
  }

  // 2. Migrate admin_reference_registry.json
  if (fs.existsSync(REGISTRY_FILE)) {
    try {
      const rawReg = fs.readFileSync(REGISTRY_FILE, 'utf8')
      const registry = JSON.parse(rawReg || '[]')

      const defaultAddresses = {
        'CR80-NFC-ED25519': 'Apt 104, West Hall, 280 University Ave, Cambridge, MA',
        'CSE2027041': '742 Evergreen Terrace, Springfield, MA 01105',
        'AURA-STU-8821': '48 Crescent Grove, Design District, Boston, MA',
        'FAC-CS-101': '15 Highland Ave, Apt 4B, Somerville, MA 02143',
        'FAC-MATH-202': '88 Elmwood Road, Newton, MA 02459',
        'STF-ADM-301': '214 Meadowbrook Lane, Belmont, MA 02478',
        'STF-OPS-402': '37 Oakwood Terrace, Medford, MA 02155',
      }

    for (const entry of registry) {
      if (typeof entry.address !== 'string' || !entry.address.trim()) {
        entry.address = defaultAddresses[entry.rollNumber] || 'Campus Residence, Aura Academy'
        migratedRegistryCount++
      }
    }

    const tmp = `${REGISTRY_FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(registry, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, REGISTRY_FILE)
    console.log(`✓ Checked ${registry.length} registry entries (migrated ${migratedRegistryCount})`)
  } catch (err) {
    console.error('Migration error on admin_reference_registry.json:', err)
  }
}

console.log('🎉 Migration completed successfully!')
