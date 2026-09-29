import { stringToBars, checksumDigits } from '../utils/generateBarcode'

export default function Barcode({ value }) {
  const bars = stringToBars(value)
  const digits = checksumDigits(value)

  return (
    <div className="barcode">
      <div className="barcode__bars" aria-hidden="true">
        {bars.map((w, i) => (
          <span
            key={i}
            className="barcode__bar"
            style={{ width: `${w}px`, marginRight: i % 3 === 0 ? '2px' : '1px' }}
          />
        ))}
      </div>
      <span className="barcode__digits">{digits}</span>
    </div>
  )
}