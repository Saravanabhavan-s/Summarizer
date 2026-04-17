/**
 * LoginPage — Apple iOS 17 liquid glass login screen
 *
 * Left panel:  Dark premium background with animated voice waveform,
 *              microphone glow rings, and audio visualization bars.
 * Right panel: Frosted glass card with username/password form.
 * Supports both Sign In and Sign Up modes.
 * On success:  Fade-out → /intro → dashboard
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { registerUser, getGoogleAuthUrl } from '../utils/api';
import styles from '../styles/LoginPage.module.css';

// Number of waveform bars for the audio visualization
const BAR_COUNT = 52;

// Sine-wave-based heights for a natural waveform look
const barHeights = Array.from({ length: BAR_COUNT }, (_, i) =>
  20 + Math.abs(Math.sin(i * 0.38) * 55 + Math.sin(i * 0.21) * 25)
);

export default function LoginPage() {
  const [isSignup, setIsSignup] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError('');
    setIsLoading(true);

    try {
      if (isSignup) {
        // Signup mode
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setIsLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          setIsLoading(false);
          return;
        }
        if (username.trim().length < 3) {
          setError('Username must be at least 3 characters');
          setIsLoading(false);
          return;
        }

        const signupResult = await registerUser(username.trim(), password);
        if (!signupResult.success) {
          setError(signupResult.message || 'Signup failed');
          setIsLoading(false);
          return;
        }

        // Auto-login after successful signup
        const loginResult = await login(username.trim(), password);
        if (loginResult.success) {
          setLoginSuccess(true);
          setTimeout(() => navigate('/intro'), 750);
        } else {
          setError('Account created! Please sign in.');
          setIsSignup(false);
          setIsLoading(false);
        }
      } else {
        // Login mode
        const result = await login(username.trim(), password);
        if (result.success) {
          setLoginSuccess(true);
          setTimeout(() => navigate('/intro'), 750);
        } else {
          setError(result.message || 'Invalid username or password');
          setIsLoading(false);
        }
      }
    } catch (err) {
      setError(err.message || (isSignup ? 'Signup failed. Please try again.' : 'Login failed. Please try again.'));
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignup(!isSignup);
    setError('');
    setConfirmPassword('');
  };

  return (
    <motion.div
      className={styles.page}
      animate={{ opacity: loginSuccess ? 0 : 1, scale: loginSuccess ? 1.04 : 1 }}
      transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* ── Left panel: voice / waveform visualization ── */}
      <div className={styles.leftPanel}>
        {/* Ambient glow orbs */}
        <div className={styles.glowOrbBlue} />
        <div className={styles.glowOrbPurple} />

        {/* Microphone with expanding rings */}
        <div className={styles.micWrapper}>
          <div className={styles.ring} style={{ '--delay': '0s', '--size': '88px' }} />
          <div className={styles.ring} style={{ '--delay': '0.5s', '--size': '116px' }} />
          <div className={styles.ring} style={{ '--delay': '1s', '--size': '148px' }} />
          <motion.div
            className={styles.micEmoji}
            animate={{ scale: [1, 1.06, 1], filter: [
              'drop-shadow(0 0 18px rgba(74,158,255,0.6))',
              'drop-shadow(0 0 42px rgba(124,58,237,0.9))',
              'drop-shadow(0 0 18px rgba(74,158,255,0.6))',
            ]}}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            🎙️
          </motion.div>
        </div>

        {/* Audio waveform bars */}
        <div className={styles.waveform} aria-hidden="true">
          {barHeights.map((h, i) => (
            <div
              key={i}
              className={styles.bar}
              style={{
                '--bar-h': `${h}%`,
                animationDelay: `${(i / BAR_COUNT) * 1.8}s`,
              }}
            />
          ))}
        </div>

        {/* Branding */}
        <div className={styles.branding}>
          <h2 className={styles.brandName}>EchoScore</h2>
          <p className={styles.brandLine}>AI-Powered Call Intelligence</p>
        </div>
      </div>

      {/* ── Right panel: glass login/signup form ── */}
      <div className={styles.rightPanel}>
        <motion.div
          className={styles.glassCard}
          initial={{ opacity: 0, y: 36, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Card header */}
          <div className={styles.cardHead}>
            <span className={styles.logoMark}>⚡</span>
            <h1 className={styles.title}>{isSignup ? 'Create account' : 'Welcome back'}</h1>
            <p className={styles.subtitle}>
              {isSignup ? 'Sign up to get started' : 'Sign in to your account'}
            </p>
          </div>

          {/* Form */}
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-username">Username</label>
              <input
                id="login-username"
                className={styles.input}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
                required
                disabled={isLoading}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-password">Password</label>
              <input
                id="login-password"
                className={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                required
                disabled={isLoading}
              />
            </div>

            <AnimatePresence>
              {isSignup && (
                <motion.div
                  className={styles.field}
                  key="confirm-pw"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <label className={styles.label} htmlFor="login-confirm-password">Confirm Password</label>
                  <input
                    id="login-confirm-password"
                    className={styles.input}
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                    disabled={isLoading}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {error && (
                <motion.p
                  className={styles.errorMsg}
                  key="error"
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              className={styles.submitBtn}
              disabled={isLoading || !username.trim() || !password || (isSignup && !confirmPassword)}
              whileHover={{ scale: isLoading ? 1 : 1.025 }}
              whileTap={{ scale: isLoading ? 1 : 0.975 }}
            >
              {isLoading
                ? <span className={styles.spinner} />
                : isSignup
                  ? 'Create Account →'
                  : 'Sign In →'
              }
            </motion.button>

            {/* ── Divider ── */}
            {!isSignup && (
              <>
                <div className={styles.divider}>
                  <span className={styles.dividerText}>or</span>
                </div>
                <motion.button
                  type="button"
                  className={styles.googleBtn}
                  whileHover={{ scale: 1.025 }}
                  whileTap={{ scale: 0.975 }}
                  onClick={async () => {
                    const res = await getGoogleAuthUrl();
                    if (res?.auth_url) window.location.href = res.auth_url;
                    else setError('Google OAuth not configured on server');
                  }}
                  disabled={isLoading}
                >
                  <span className={styles.googleG}>G</span>
                  Continue with Google
                </motion.button>
              </>
            )}
          </form>

          <p className={styles.switchText}>
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              className={styles.switchLink}
              onClick={toggleMode}
              disabled={isLoading}
            >
              {isSignup ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}
