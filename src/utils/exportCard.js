import { toPng } from 'html-to-image'

/**
 * Loads an image src into an HTMLImageElement
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = (err) => reject(new Error('Failed to load image for card export: ' + err))
    img.src = src
  })
}

/**
 * Renders a single DOM node (e.g. card face) to a PNG and triggers download.
 */
export async function exportNodeAsPng(node, filename = 'auraid-credential.png') {
  if (!node) return
  const dataUrl = await toPng(node, {
    pixelRatio: 2.5,
    cacheBust: true,
    backgroundColor: 'transparent',
    style: {
      transform: 'none',
      backfaceVisibility: 'visible',
    },
  })
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}

/**
 * Renders BOTH Front and Back sides of the ID card side-by-side onto a unified,
 * high-resolution (300 DPI ready) composite image and triggers download.
 * Ensures the scannable barcode on the back is crystal clear and optical-scanner-ready.
 */
export async function exportBothSidesAsPng(
  frontNode,
  backNode,
  filename = 'auraid-credential-complete.png',
  meta = {}
) {
  // Fallbacks if one side is missing
  if (!frontNode && backNode) return exportNodeAsPng(backNode, filename)
  if (frontNode && !backNode) return exportNodeAsPng(frontNode, filename)
  if (!frontNode && !backNode) return

  const captureOpts = {
    pixelRatio: 2.5,
    cacheBust: true,
    backgroundColor: 'transparent',
    style: {
      transform: 'none',
      backfaceVisibility: 'visible',
      position: 'relative',
      margin: '0',
    },
  }

  // Capture both faces in parallel with upright un-tilted styles
  const [frontDataUrl, backDataUrl] = await Promise.all([
    toPng(frontNode, captureOpts),
    toPng(backNode, captureOpts),
  ])

  const [frontImg, backImg] = await Promise.all([
    loadImage(frontDataUrl),
    loadImage(backDataUrl),
  ])

  const cardW = frontImg.width
  const cardH = frontImg.height
  const gap = 48
  const padX = 48
  const padTop = 96
  const padBottom = 64

  const canvasW = padX * 2 + cardW * 2 + gap
  const canvasH = padTop + cardH + padBottom

  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')

  // Smooth subtle background
  const bgGrad = ctx.createLinearGradient(0, 0, canvasW, canvasH)
  bgGrad.addColorStop(0, '#f8fafc')
  bgGrad.addColorStop(0.5, '#f1f5f9')
  bgGrad.addColorStop(1, '#e2e8f0')
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, canvasW, canvasH)

  // Decorative border
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 2
  ctx.strokeRect(12, 12, canvasW - 24, canvasH - 24)

  // Header Typography
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif'
  ctx.fillText('AURA ID DIGITAL CREDENTIAL', padX, 44)

  ctx.fillStyle = '#64748b'
  ctx.font = '13px system-ui, -apple-system, sans-serif'
  const subtext = meta.title || 'Official CR80 Identity Card • Front & Back Dual-Side View'
  ctx.fillText(subtext, padX, 68)

  // Side Labels
  ctx.fillStyle = '#475569'
  ctx.font = 'bold 12px ui-monospace, SFMono-Regular, monospace'
  ctx.fillText('FRONT SIDE', padX, padTop - 14)
  ctx.fillText('BACK SIDE (WITH SCANNABLE BARCODE)', padX + cardW + gap, padTop - 14)

  // Subtle realistic card drop shadow
  ctx.save()
  ctx.shadowColor = 'rgba(15, 23, 42, 0.16)'
  ctx.shadowBlur = 28
  ctx.shadowOffsetY = 12

  // Draw Front Card
  ctx.drawImage(frontImg, padX, padTop, cardW, cardH)

  // Draw Back Card (with barcode)
  ctx.drawImage(backImg, padX + cardW + gap, padTop, cardW, cardH)
  ctx.restore()

  // Footer Metadata
  ctx.fillStyle = '#94a3b8'
  ctx.font = '12px system-ui, -apple-system, sans-serif'
  const memberId = meta.memberId ? `ID: ${meta.memberId} • ` : ''
  ctx.fillText(
    `${memberId}AuraID Authoritative Credential • Scannable Code 128 Barcode on Back Side`,
    padX,
    canvasH - 26
  )

  const finalDataUrl = canvas.toDataURL('image/png')
  const link = document.createElement('a')
  link.download = filename
  link.href = finalDataUrl
  link.click()
}