import { useRef, useState } from 'react'
import IDCardPreview from './IDCardPreview'
import { exportBothSidesAsPng, exportNodeAsPng } from '../utils/exportCard'
import { getThemesForRole } from '../utils/themeManager'

export default function PreviewPanel({
  data,
  photo,
  photoSettings,
  glassTheme,
  onGlassThemeChange,
  verified,
  onToggleVerified,
}) {
  const [flipped, setFlipped] = useState(false)
  const [exporting, setExporting] = useState(false)
  const frontRef = useRef(null)
  const backRef = useRef(null)

  async function handleExport() {
    setExporting(true)
    try {
      const id = (data.rollNumber || 'credential').toLowerCase()
      await exportBothSidesAsPng(frontRef.current, backRef.current, `auraid-${id}-complete.png`, {
        title: `${data.fullName || 'Member'} • ${data.institution || 'Aura Academy'}`,
        memberId: data.rollNumber,
      })
    } catch (err) {
      console.error('Dual export failed, falling back to active node', err)
      const node = flipped ? backRef.current : frontRef.current
      await exportNodeAsPng(node, `auraid-${(data.rollNumber || 'credential').toLowerCase()}.png`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <aside className="preview-panel">
      <div className="preview-panel__header">
        <div className="preview-panel__live">
          <span className="live-dot" />
          Live 3D Pastel Credential View
        </div>
        <span className="pill pill--muted">CR80 Standard</span>
      </div>

      <IDCardPreview
        data={data}
        photo={photo}
        photoSettings={photoSettings}
        glassTheme={glassTheme}
        verified={verified}
        flipped={flipped}
        onFlip={() => setFlipped((f) => !f)}
        frontRef={frontRef}
        backRef={backRef}
      />

      <div className="preview-panel__row">
        <button type="button" className="btn btn--ghost" onClick={() => setFlipped((f) => !f)}>
          ⟲ Flip to {flipped ? 'front' : 'back'}
        </button>
        <p className="preview-panel__caption">3D mouse parallax active</p>
      </div>

      <div className="preview-panel__row preview-panel__row--wrap">
        <span className="field__label">
          {data.role === 'faculty' ? 'Faculty' : data.role === 'staff' ? 'Staff' : 'Student'} themes
        </span>
        <div className="glass-swatches glass-swatches--compact">
          {getThemesForRole(data.role || 'student').map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`glass-swatch glass-swatch--${theme.id} ${
                glassTheme === theme.id ? 'is-active' : ''
              }`}
              onClick={() => onGlassThemeChange(theme.id)}
              title={theme.label}
            />
          ))}
        </div>
      </div>

      <div className="preview-panel__actions">
        <button type="button" className="btn btn--generate" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting…' : '⭳ Download / export card'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%' }}>
          <span className={`pill ${verified ? 'pill--secure' : 'pill--muted'}`}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: verified ? '#16a34a' : '#d97706' }} />
            {verified ? '✓ Verified' : '⏳ Pending Approval'}
          </span>
        </div>
      </div>
    </aside>
  )
}