/**
 * LandingFooter — Clean footer with EchoScore branding and nav links
 */

import { useNavigate } from 'react-router-dom';
import styles from '../../styles/LandingPage.module.css';

export default function LandingFooter() {
  const navigate = useNavigate();

  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <span className={styles.footerBrandIcon}>🎙️</span>
          <span className={styles.footerBrandName}>EchoScore</span>
        </div>

        <div className={styles.footerLinks}>
          <button className={styles.footerLink} onClick={() => navigate('/login')}>
            Login
          </button>
          <button className={styles.footerLink} onClick={() => navigate('/dashboard')}>
            Dashboard
          </button>
          <button className={styles.footerLink} onClick={() => navigate('/compare')}>
            Compare
          </button>
          <button className={styles.footerLink} onClick={() => navigate('/reports')}>
            Reports
          </button>
        </div>
      </div>

      <p className={styles.footerCopy}>
        © {new Date().getFullYear()} EchoScore. AI-powered call intelligence platform.
      </p>
    </footer>
  );
}
