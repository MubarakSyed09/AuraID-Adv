import JsBarcode from 'jsbarcode'

/**
 * Standard Scannable Code 128 Barcode Engine
 *
 * Encodes unique member identification (Student Roll Number, Faculty ID, Staff ID)
 * into standard, optical-scanner-compliant Code 128 binary patterns and SVG vector rects.
 */

export function encodeCode128(value) {
  const clean = String(value || 'AURA-ID').trim() || 'AURA-ID'
  try {
    const Code128 = JsBarcode.getModule('CODE128')
    const enc = new Code128(clean, {})
    if (enc.valid()) {
      const res = enc.encode()
      return {
        valid: true,
        text: res.text || clean,
        data: res.data, // Binary string where '1' = bar, '0' = space
      }
    }
  } catch (err) {
    console.warn('Code128 encoding warning:', err)
  }

  // Graceful fallback for non-ASCII or exotic strings: sanitize to alphanumeric ASCII
  const asciiClean = clean.replace(/[^ -~]/g, '') || 'AURA-ID'
  try {
    const Code128 = JsBarcode.getModule('CODE128')
    const enc = new Code128(asciiClean, {})
    const res = enc.encode()
    return {
      valid: true,
      text: res.text || asciiClean,
      data: res.data,
    }
  } catch {
    return {
      valid: false,
      text: clean,
      data: '',
    }
  }
}

/**
 * Generates exact vector SVG rect data for scannable Code 128 barcodes.
 * Ensures optimal quiet zones, high contrast, and crisp rendering for
 * on-screen display, high-resolution PNG export, and printing.
 */
export function generateCode128SvgData(value, options = {}) {
  const encoded = encodeCode128(value)
  const moduleWidth = options.moduleWidth || 1.45
  const barHeight = options.barHeight || 36
  const quietZone = options.quietZone || 12 // Quiet zone in modules on left & right

  if (!encoded.valid || !encoded.data) {
    return {
      valid: false,
      width: 260,
      height: barHeight + 16,
      rects: [],
      text: encoded.text,
      data: '',
    }
  }

  const totalModules = encoded.data.length + quietZone * 2
  const width = Math.ceil(totalModules * moduleWidth)
  const height = barHeight + 16

  let currentX = quietZone * moduleWidth
  const rects = []
  const runs = encoded.data.match(/(1+|0+)/g) || []

  for (const run of runs) {
    const runWidth = run.length * moduleWidth
    if (run[0] === '1') {
      rects.push({
        x: Number(currentX.toFixed(2)),
        y: 4,
        width: Number(runWidth.toFixed(2)),
        height: barHeight,
      })
    }
    currentX += runWidth
  }

  return {
    valid: true,
    width,
    height,
    barHeight,
    rects,
    text: encoded.text,
    data: encoded.data,
  }
}

// Backward-compatibility helpers
export function stringToBars(value, count = 46) {
  const enc = encodeCode128(value)
  if (enc.valid && enc.data) {
    const runs = enc.data.match(/(1+|0+)/g) || []
    return runs.slice(0, count).map((r) => r.length)
  }
  return [1, 2, 1, 3, 2, 1]
}

export function checksumDigits(value, length = 12) {
  const str = String(value || 'CAMPUS')
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33 + str.charCodeAt(i)) % 1000000007
  }
  const seedStr = String(hash).padStart(length, '5')
  return seedStr.slice(0, length)
}

export function stringToQrGrid(value, size = 9) {
  const str = String(value || 'AURA-ID')
  const cells = []
  let hash = 0
  for (let i = 0; i < size * size; i++) {
    const char = str.charCodeAt(i % str.length)
    hash = (hash * 31 + char + i * 13) % 233
    cells.push(hash % 5 === 0 || hash % 7 === 0)
  }
  const set = (r, c, on = true) => {
    if (r >= 0 && r < size && c >= 0 && c < size) cells[r * size + c] = on
  }
  ;[0, 1].forEach((corner) => {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const rr = r
        const cc = corner === 0 ? c : size - 3 + c
        set(rr, cc, r === 1 && c === 1 ? true : r === 0 || r === 2 || c === 0 || c === 2)
      }
    }
  })
  return cells
}