/**
 * LandingPage — Premium animated SaaS landing page for EchoScore
 *
 * Composes: Navbar → Hero → Features → Workflow → Dashboard Preview → Privacy → Footer
 * Public route — shown before login as the first experience.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import HeroSection from './landing/HeroSection';
import FeaturesSection from './landing/FeaturesSection';
import WorkflowSection from './landing/WorkflowSection';
import DashboardPreview from './landing/DashboardPreview';
import PrivacySection from './landing/PrivacySection';
import LandingFooter from './landing/LandingFooter';
import styles from '../styles/LandingPage.module.css';

export default function LandingPage() {
  const navigate = useNavigate();

  const handleGetStarted = useCallback(() => {
    navigate('/login');
  }, [navigate]);

  const handleViewDemo = useCallback(() => {
    const el = document.getElementById('dashboard-preview');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const scrollTo = useCallback((id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className={styles.landingPage}>
      {/* ── Fixed navbar ── */}
      <nav className={styles.landingNav}>
        <div className={styles.navLogo} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span className={styles.navLogoIcon}>🎙️</span>
          <span className={styles.navLogoText}>EchoScore</span>
        </div>

        <div className={styles.navLinks}>
          <button className={styles.navLink} onClick={() => scrollTo('features')}>Features</button>
          <button className={styles.navLink} onClick={() => scrollTo('workflow')}>How It Works</button>
          <button className={styles.navLink} onClick={() => scrollTo('dashboard-preview')}>Dashboard</button>
          <button className={styles.navLink} onClick={() => scrollTo('privacy')}>Security</button>
          <button className={styles.navCta} onClick={handleGetStarted}>Sign In</button>
        </div>
      </nav>

      {/* ── Sections ── */}
      <HeroSection onGetStarted={handleGetStarted} onViewDemo={handleViewDemo} />

      <div className={styles.gradientDivider} />
      <FeaturesSection />

      <div className={styles.gradientDivider} />
      <WorkflowSection />

      <div className={styles.gradientDivider} />
      <DashboardPreview />

      <div className={styles.gradientDivider} />
      <PrivacySection />

      <div className={styles.gradientDivider} />
      <LandingFooter />
    </div>
  );
}
