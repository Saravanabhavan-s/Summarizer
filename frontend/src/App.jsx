import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import PageWrapper from './components/PageWrapper';
import UploadPage from './pages/UploadPage';
import ResultsPage from './pages/ResultsPage';
import HistoryPage from './pages/HistoryPage';
import HistoryDetailPage from './pages/HistoryDetailPage';

export default function App() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageWrapper><UploadPage /></PageWrapper>} />
        <Route path="/results" element={<PageWrapper><ResultsPage /></PageWrapper>} />
        <Route path="/history" element={<PageWrapper><HistoryPage /></PageWrapper>} />
        <Route path="/history/:id" element={<PageWrapper><HistoryDetailPage /></PageWrapper>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}
