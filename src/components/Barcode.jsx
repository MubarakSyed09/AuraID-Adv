import { useMemo } from 'react'
import { generateCode128SvgData } from '../utils/generateBarcode'

export default function Barcode({ value }) {
  const cleanValue = String(value || 'AURA-ID').trim()
  const barcode = useMemo(() => generateCode128SvgData(cleanValue), [cleanValue])

  return (
    <div className="barcode" title={`Scannable Code 128 Barcode: ${barcode.text}`}>
      <svg
        className="barcode__svg"
        viewBox={`0 0 ${barcode.width} ${barcode.height}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`Barcode: ${barcode.text}`}
      >
        {/* High-contrast crisp white background for optical contrast */}
        <rect width="100%" height="100%" fill="#ffffff" rx="4" />
        
        {/* Standard Code 128 dark bars */}
        {barcode.rects.map((r, idx) => (
          <rect
            key={idx}
            x={r.x}
            y={r.y}
            width={r.width}
            height={r.height}
            fill="#090d16"
          />
        ))}

        {/* Human-readable text label */}
        <text
          x={barcode.width / 2}
          y={barcode.height - 3}
          textAnchor="middle"
          fontSize="10"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
          fontWeight="600"
          letterSpacing="0.12em"
          fill="#090d16"
        >
          {barcode.text}
        </text>
      </svg>
    </div>
  )
}