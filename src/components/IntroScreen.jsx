import { useEffect, useState } from 'react'

const INTRO_SECONDS = 3

export default function IntroScreen({ onFinish }) {
  const [secondsLeft, setSecondsLeft] = useState(INTRO_SECONDS)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (secondsLeft <= 0) {
      setLeaving(true)
      const t = setTimeout(onFinish, 420)
      return () => clearTimeout(t)
    }
    const tick = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(tick)
  }, [secondsLeft, onFinish])

  const progress = ((INTRO_SECONDS - secondsLeft) / INTRO_SECONDS) * 100

  return (
    <div className={`intro ${leaving ? 'intro--leaving' : ''}`}>
      <div className="intro__grid" />
      <div className="intro__glow" />

      <span className="pill pill--eyebrow">
        <span className="pill__icon">✦</span> Decentralized Credential Hub
      </span>

      <h1 className="intro__title">
        Welcome to <span>AuraID</span>
      </h1>
      <p className="intro__subtitle">Initializing sovereign digital credential studio…</p>

      <div className="intro__stage">
        <div className="intro-card">
          <div className="intro-card__face intro-card__face--front">
            <div className="intro-card__sheen" />
            <div className="intro-card__top">
              <div className="intro-card__chip-icon">◎</div>
              <div>
                <p className="intro-card__label">Aura ID Credential</p>
                <p className="intro-card__label-sub">Smart security card</p>
              </div>
              <span className="pill pill--secure">✓ Secure</span>
            </div>

            <div className="intro-card__center">
              <p className="intro-card__wordmark">
                AURA<span>ID</span>
              </p>
              <p className="intro-card__tagline">Next-gen sovereign credential studio</p>
            </div>

            <div className="intro-card__bottom">
              <span>CR80 · NFC · ED25519</span>
              <span className="intro-card__bottom-mid">Digital campus sovereign</span>
              <span>2026</span>
            </div>
          </div>

          <div className="intro-card__face intro-card__face--back">
            <div className="intro-card__sheen" />
            <div className="intro-card__stripe" />
            <p className="intro-card__back-note">auraid.edu · issued credential</p>
          </div>
        </div>
      </div>

      <div className="intro__progress-wrap">
        <div className="intro__progress">
          <div className="intro__progress-bar" style={{ width: `${progress}%` }} />
        </div>
        <div className="intro__progress-row">
          <span>Entering Studio in {secondsLeft}s</span>
          <button type="button" className="pill pill--skip" onClick={onFinish}>
            Skip to Studio →
          </button>
        </div>
      </div>
    </div>
  )
}