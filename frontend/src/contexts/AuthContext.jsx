/**
 * AuthContext — JWT authentication state management
 *
 * Provides: user, token, isAuthenticated, login(), logout()
 * Persists token + user info in localStorage across page reloads.
 */

import { createContext, useContext, useState, useCallback } from 'react';
import { loginUser as apiLogin } from '../utils/api';

const AuthContext = createContext(null);

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

  /**
   * login — calls /login API, stores JWT + user in localStorage
   * Returns the raw API result so LoginPage can handle errors.
   */
  const login = useCallback(async (username, password) => {
    const result = await apiLogin(username, password);
    if (result.success) {
      const userData = { username: result.user_id, role: result.role };
      setUser(userData);
      setToken(result.token);
      localStorage.setItem('auth_token', result.token);
      localStorage.setItem('auth_user', JSON.stringify(userData));
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

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
