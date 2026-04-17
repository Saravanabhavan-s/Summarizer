/**
 * AuthContext — JWT authentication state management
 *
 * Provides: user, token, isAuthenticated, login(), logout(), updateProfile(), refreshProfile()
 * Persists token + user info in localStorage across page reloads.
 * Extended to carry: display_name, organization, avatar_url, totp_enabled, created_at, last_login
 */

import { createContext, useContext, useState, useCallback } from 'react';
import { loginUser as apiLogin } from '../utils/api';
import { API_BASE } from '../utils/constants';
import axios from 'axios';

const AuthContext = createContext(null);

const client = axios.create({ baseURL: API_BASE, timeout: 30000 });
const getAuthHeader = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export function AuthProvider({ children }) {
  // Rehydrate from localStorage on mount
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('auth_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(
    () => localStorage.getItem('auth_token') || null
  );

  const _persistUser = (userData) => {
    setUser(userData);
    localStorage.setItem('auth_user', JSON.stringify(userData));
  };

  /**
   * login — calls /login API, stores JWT + full user profile in localStorage
   */
  const login = useCallback(async (username, password) => {
    const result = await apiLogin(username, password);
    if (result.success) {
      const userData = {
        username: result.username || result.user_id,
        user_id: result.user_id,
        role: result.role,
        display_name: result.display_name || null,
        organization: result.organization || null,
        avatar_url: result.avatar_url || null,
        totp_enabled: result.totp_enabled || false,
        created_at: result.created_at || null,
        last_login: result.last_login || null,
      };
      _persistUser(userData);
      setToken(result.token);
      localStorage.setItem('auth_token', result.token);
    }
    return result;
  }, []);

  /**
   * logout — clears all authentication state
   */
  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  }, []);

  /**
   * updateProfile — merge partial profile fields into user state without re-login
   */
  const updateProfile = useCallback((fields) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...fields };
      localStorage.setItem('auth_user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  /**
   * refreshProfile — refetch full profile from /profile and sync state
   */
  const refreshProfile = useCallback(async () => {
    try {
      const resp = await client.get('/profile', { headers: getAuthHeader() });
      const data = resp.data;
      setUser((prev) => {
        if (!prev) return prev;
        const updated = {
          ...prev,
          display_name: data.display_name ?? prev.display_name,
          organization: data.organization ?? prev.organization,
          avatar_url: data.avatar_url ?? prev.avatar_url,
          totp_enabled: data.totp_enabled ?? prev.totp_enabled,
          created_at: data.created_at ?? prev.created_at,
          last_login: data.last_login ?? prev.last_login,
          last_activity: data.last_activity ?? prev.last_activity,
          role: data.role ?? prev.role,
        };
        localStorage.setItem('auth_user', JSON.stringify(updated));
        return updated;
      });
    } catch {
      // Silent fail — profile fetch is best-effort
    }
  }, []);

  /**
   * loginWithGoogle — exchange Google auth result for EchoScore JWT
   */
  const loginWithGoogle = useCallback(async (googleData) => {
    const userData = {
      username: googleData.username || googleData.user_id,
      user_id: googleData.user_id,
      role: googleData.role || 'user',
      display_name: googleData.display_name || null,
      organization: null,
      avatar_url: googleData.avatar_url || null,
      totp_enabled: false,
      created_at: null,
      last_login: new Date().toISOString(),
    };
    _persistUser(userData);
    setToken(googleData.token);
    localStorage.setItem('auth_token', googleData.token);
    return { success: true };
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      login,
      logout,
      updateProfile,
      refreshProfile,
      loginWithGoogle,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
