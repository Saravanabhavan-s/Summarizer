import { useState } from 'react';
import pageStyles from '../styles/PageLayout.module.css';
import styles from '../styles/SettingsPage.module.css';

const DEFAULT_SETTINGS = {
  compactMode: false,
  reducedMotion: false,
  glassIntensity: 'high',
  notifications: true,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem('echoscore_settings');
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      return DEFAULT_SETTINGS;
    }

    return DEFAULT_SETTINGS;
  });

  const update = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    localStorage.setItem('echoscore_settings', JSON.stringify(next));
  };

  return (
    <main className={pageStyles.page}>
      <div className={pageStyles.panel}>
        <div className={pageStyles.headerRow}>
          <div>
            <h1 className={pageStyles.title}>Settings</h1>
            <p className={pageStyles.tagline}>Personalization</p>
            <p className={pageStyles.subtitle}>Control visual intensity, motion, and dashboard preferences.</p>
          </div>
        </div>

        <div className={styles.grid}>
          <div className={styles.card}>
            <p className={styles.cardTitle}>Display</p>
            <label className={styles.row}>
              <span>Compact mode</span>
              <input type="checkbox" checked={settings.compactMode} onChange={(e) => update({ compactMode: e.target.checked })} />
            </label>
            <label className={styles.row}>
              <span>Reduced motion</span>
              <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => update({ reducedMotion: e.target.checked })} />
            </label>
            <label className={styles.row}>
              <span>Glass intensity</span>
              <select value={settings.glassIntensity} onChange={(e) => update({ glassIntensity: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>

          <div className={styles.card}>
            <p className={styles.cardTitle}>Notifications</p>
            <label className={styles.row}>
              <span>Processing alerts</span>
              <input type="checkbox" checked={settings.notifications} onChange={(e) => update({ notifications: e.target.checked })} />
            </label>
            <p className={styles.helper}>These settings are stored in your browser and can be updated anytime.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
