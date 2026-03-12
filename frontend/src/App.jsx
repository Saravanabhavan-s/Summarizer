/**
 * App.jsx — Root router with auth guards and dashboard layout
 *
 * Public routes:  /login, /intro
 * Protected routes (require JWT): all others — rendered inside DashboardLayout
 *   /          → UploadPage
 *   /results   → ResultsPage
 *   /history   → HistoryPage
 *   /history/:id → HistoryDetailPage
 *   /compare   → ComparePage
 */

import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from './contexts/AuthContext';
import PageWrapper from './components/PageWrapper';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import IntroPage from './pages/IntroPage';
import UploadPage from './pages/UploadPage';
import ResultsPage from './pages/ResultsPage';
import HistoryPage from './pages/HistoryPage';
import HistoryDetailPage from './pages/HistoryDetailPage';
import ComparePage from './pages/ComparePage';
import appStyles from './styles/App.module.css';

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
    </div>
  );
}

// Redirect unauthenticated users to /login
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* ── Public ── */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/intro" element={<IntroPage />} />

        {/* ── Protected (wrapped in dashboard layout + page transition) ── */}
        <Route
          path="/"
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

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}
