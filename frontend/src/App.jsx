/**
 * App.jsx — Root router with auth guards and dashboard layout
 *
 * Public routes:  /, /login, /intro
 * Protected routes (require JWT): all others — rendered inside DashboardLayout
 *   /dashboard    → UploadPage
 *   /results      → ResultsPage
 *   /history      → HistoryPage
 *   /history/:id  → HistoryDetailPage
 *   /compare      → ComparePage
 *   /reports      → ReportsPage
 *   /admin/*      → Admin pages
 *   /live-transcription → LiveTranscriptionPage
 */

import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from './contexts/AuthContext';
import PageWrapper from './components/PageWrapper';
import Sidebar from './components/Sidebar';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import IntroPage from './pages/IntroPage';
import UploadPage from './pages/UploadPage';
import ResultsPage from './pages/ResultsPage';
import HistoryPage from './pages/HistoryPage';
import HistoryDetailPage from './pages/HistoryDetailPage';
import ComparePage from './pages/ComparePage';
import ReportsPage from './pages/ReportsPage';
import AdminPage from './pages/AdminPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminPolicyPage from './pages/AdminPolicyPage';
import AdminLogsPage from './pages/AdminLogsPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import LiveTranscriptionPage from './pages/LiveTranscriptionPage';
import ProfilePage from './pages/ProfilePage';
import appStyles from './styles/App.module.css';
import BottomNav from './components/BottomNav';

// Dashboard shell — sidebar + scrollable main area
function DashboardLayout({ children }) {
  return (
    <div className={appStyles.appContainer}>
      <Sidebar />
      <main className={appStyles.mainContent}>
        <div className={appStyles.content}>
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

// Redirect unauthenticated users to /login
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* ── Public ── */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/intro" element={<IntroPage />} />

        {/* ── Protected (wrapped in dashboard layout + page transition) ── */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PageWrapper><UploadPage /></PageWrapper>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/results"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PageWrapper><ResultsPage /></PageWrapper>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PageWrapper><HistoryPage /></PageWrapper>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/history/:id"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PageWrapper><HistoryDetailPage /></PageWrapper>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/compare"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PageWrapper><ComparePage /></PageWrapper>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PageWrapper><ReportsPage /></PageWrapper>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PageWrapper><ProfilePage /></PageWrapper>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/policy"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PageWrapper>
                  <div style={{ padding: '32px', color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
                    <p style={{ fontSize: 48, margin: '0 0 16px' }}>📄</p>
                    <h2 style={{ color: '#fff', margin: '0 0 8px' }}>Policy Management</h2>
                    <p>Upload and manage your organization's compliance policies. Coming soon.</p>
                  </div>
                </PageWrapper>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <DashboardLayout>
                <PageWrapper><AdminPage /></PageWrapper>
              </DashboardLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminRoute>
              <DashboardLayout>
                <PageWrapper><AdminUsersPage /></PageWrapper>
              </DashboardLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/policy"
          element={
            <AdminRoute>
              <DashboardLayout>
                <PageWrapper><AdminPolicyPage /></PageWrapper>
              </DashboardLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/logs"
          element={
            <AdminRoute>
              <DashboardLayout>
                <PageWrapper><AdminLogsPage /></PageWrapper>
              </DashboardLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <AdminRoute>
              <DashboardLayout>
                <PageWrapper><AdminSettingsPage /></PageWrapper>
              </DashboardLayout>
            </AdminRoute>
          }
        />

        <Route
          path="/live-transcription"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PageWrapper><LiveTranscriptionPage /></PageWrapper>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}
