import FormField from './FormField'
import PhotoCapture from './PhotoCapture'

const COURSES = [
  'Computer Science',
  'Electronics & Comm.',
  'Mechanical Engineering',
  'Civil Engineering',
  'Business Administration',
  'Design',
  'Biotechnology',
]

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Postgraduate']

export default function IDForm({ formData, onFieldChange, photo, onPhotoChange, onSubmit }) {
  function handleChange(e) {
    onFieldChange(e.target.name, e.target.value)
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit()
  }

  return (
    <form className="id-form" onSubmit={handleSubmit}>
      <div className="id-form__header">
        <h2>Student details</h2>
        <p>Fill this in once — your card updates as you type.</p>
      </div>

      <PhotoCapture photo={photo} onPhotoChange={onPhotoChange} />

      <div className="id-form__grid">
        <FormField
          label="Full name"
          name="fullName"
          value={formData.fullName}
          onChange={handleChange}
          required
          placeholder="Ariana Cole"
        />
        <FormField
          label="Roll / ID number"
          name="rollNumber"
          value={formData.rollNumber}
          onChange={handleChange}
          required
          placeholder="CSE2027041"
        />
        <FormField
          label="Course / Department"
          name="course"
          value={formData.course}
          onChange={handleChange}
          options={COURSES}
          required
        />
        <FormField
          label="Year"
          name="year"
          value={formData.year}
          onChange={handleChange}
          options={YEARS}
          required
        />
        <FormField
          label="Date of birth"
          name="dob"
          type="date"
          value={formData.dob}
          onChange={handleChange}
          required
        />
        <FormField
          label="Blood group"
          name="bloodGroup"
          value={formData.bloodGroup}
          onChange={handleChange}
          options={BLOOD_GROUPS}
        />
        <FormField
          label="Email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          placeholder="ariana.cole@campus.edu"
          required
        />
        <FormField
          label="Phone"
          name="phone"
          type="tel"
          value={formData.phone}
          onChange={handleChange}
          placeholder="+91 98765 43210"
        />
        <FormField
          label="Valid until"
          name="validUntil"
          type="date"
          value={formData.validUntil}
          onChange={handleChange}
          required
        />
      </div>

      <button type="submit" className="btn btn--generate">
        <span>Generate ID card</span>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </form>
  )
}