export default function FormField({
  label,
  name,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder = '',
  options = null,
  span = 1,
}) {
  const fieldId = `field-${name}`

  return (
    <label
      className="field"
      htmlFor={fieldId}
      style={span === 2 ? { gridColumn: 'span 2' } : undefined}
    >
      <span className="field__label">
        {label}
        {required && <span className="field__required">*</span>}
      </span>

      {options ? (
        <select
          id={fieldId}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          className="field__control field__control--select"
        >
          <option value="" disabled>
            {placeholder || `Select ${label.toLowerCase()}`}
          </option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={fieldId}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          required={required}
          placeholder={placeholder}
          className="field__control"
          autoComplete="off"
        />
      )}
    </label>
  )
}