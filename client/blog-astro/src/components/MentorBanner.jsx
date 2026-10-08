import { useEffect, useState } from 'react';

export default function MentorBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setVisible(
      params.get('hiring') === 'system_security_mentor'
    );
  }, []);

  if (!visible) return null;

  return (
    <aside
      className="mentor-banner"
      aria-labelledby="mentor-banner-title"
    >
      <div className="mentor-banner__icon" aria-hidden="true">
        💌
      </div>

      <div className="mentor-banner__content">
        <p className="mentor-banner__label">
          HIRING MODE / SYSTEM SECURITY MENTOR
        </p>

        <h2 id="mentor-banner-title">
          mentorship zone 🌷
        </h2>

        <p>
          i don't gatekeep security concepts. i like
          explaining the <strong>why</strong>, documenting
          the <strong>how</strong>, and giving people space
          to experiment without feeling silly for asking
          questions.
        </p>

        <div className="mentor-banner__values">
          <span>📖 clear documentation</span>
          <span>🧠 patient explanations</span>
          <span>🛠️ hands-on learning</span>
          <span>♡ beginner-friendly</span>
        </div>

        <div className="mentor-banner__actions">
          <a
            href="/port_resume/?hiring=system_security_mentor"
            className="mentor-banner__button"
          >
            mentor profile ↗
          </a>

          <a href="#explore" className="mentor-banner__link">
            see what i've built
          </a>
        </div>
      </div>
    </aside>
  );
}
