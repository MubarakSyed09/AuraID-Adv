import { useRef, useState } from 'react'
import IDCardPreview from './IDCardPreview'
import { exportBothSidesAsPng, exportNodeAsPng } from '../utils/exportCard'

export default function ResultScreen({ data, photo, photoSettings, glassTheme, verified, onEdit }) {
  const [flipped, setFlipped] = useState(false)
  const [exporting, setExporting] = useState(false)
  const frontRef = useRef(null)
  const backRef = useRef(null)

  async function handleExportComplete() {
    setExporting(true)
    try {
      const id = (data.rollNumber || 'credential').toLowerCase()
      await exportBothSidesAsPng(frontRef.current, backRef.current, `auraid-${id}-complete.png`, {
        title: `${data.fullName || 'Member'} • ${data.institution || 'Aura Academy'}`,
        memberId: data.rollNumber,
      })
    } catch (err) {
      console.error('Dual-side export failed, falling back to active face', err)
      const node = flipped ? backRef.current : frontRef.current
      await exportNodeAsPng(node, `auraid-${(data.rollNumber || 'credential').toLowerCase()}.png`)
    } finally {
      setExporting(false)
    }
  }

  async function handleExportSingleSide(side) {
    setExporting(true)
    try {
      const id = (data.rollNumber || 'credential').toLowerCase()
      const node = side === 'back' ? backRef.current : frontRef.current
      await exportNodeAsPng(node, `auraid-${id}-${side}.png`)
    } catch (err) {
      console.error(`Export ${side} failed`, err)
    } finally {
      setExporting(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="result">
      <div className="result__grid" />
      <div className="result__glow" />

      <div className="result__header">
        <span
          className="result__success"
          style={!verified ? { background: '#fef3c7', color: '#92400e' } : undefined}
        >
          {verified ? '✓ ID verified & complete' : '⏳ Registration submitted · Pending admin approval'}
        </span>
        <h1>{data.fullName || 'Your ID card'} is ready</h1>
        <p className="result__hint">Your completed digital credential is previewed below. Front &amp; Back (with scannable barcode).</p>
      </div>

      <div className="result__card-wrap">
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
      </div>

      <div className="result__actions">
        {/* Primary Download: Includes BOTH Front and Back Side with Barcode */}
        <button
          type="button"
          className="btn btn--generate"
          onClick={handleExportComplete}
          disabled={exporting}
          title="Download high-resolution image containing both Front and Back sides with scannable barcode"
        >
          {exporting ? 'Exporting…' : '⭳ Download ID Card (Front & Back)'}
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ fontSize: '0.74rem', padding: '8px 10px' }}
            onClick={() => handleExportSingleSide('front')}
            disabled={exporting}
            title="Download front face only"
          >
            Front Only
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ fontSize: '0.74rem', padding: '8px 10px' }}
            onClick={() => handleExportSingleSide('back')}
            disabled={exporting}
            title="Download back face with barcode only"
          >
            Back &amp; Barcode
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ fontSize: '0.74rem', padding: '8px 10px' }}
            onClick={handlePrint}
            title="Print ID card directly on paper"
          >
            ⎙ Print Card
          </button>
        </div>

        <button type="button" className="btn btn--ghost" onClick={() => setFlipped((f) => !f)}>
          ⟲ Flip Preview to {flipped ? 'Front' : 'Back'}
        </button>

        <button type="button" className="btn btn--ghost" onClick={onEdit}>
          ← Edit details
        </button>
      </div>
    </div>
  )
}
