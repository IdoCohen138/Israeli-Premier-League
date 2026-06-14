import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SeasonProvider, useSeason } from './contexts/SeasonContext';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import PreSeasonBetsPage from './pages/PreSeasonBetsPage';
import RoundBetsPage from './pages/RoundBetsPage';
import LeaderboardPage from './pages/LeaderboardPage';
import AdminPage from './pages/AdminPage';
import AllUsersBetsPage from './pages/AllUsersBetsPage';
import SeasonClosedPage from './pages/SeasonClosedPage';
import LoadingScreen from './components/layout/LoadingScreen';
import ThemeProvider from './providers/theme-provider';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}

function SeasonGate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { seasonOpen, loading: seasonLoading } = useSeason();
  const location = useLocation();

  if (location.pathname === '/login') {
    return <>{children}</>;
  }

  if (!authLoading && !user) {
    return <>{children}</>;
  }

  if (authLoading || seasonLoading) {
    return <LoadingScreen />;
  }

  if (!seasonOpen) {
    const isAdminOnAdminPage = user?.role === 'admin' && location.pathname === '/admin';
    if (!isAdminOnAdminPage) {
      return <SeasonClosedPage />;
    }
  }

  return <>{children}</>;
}

function AppRoutesContent() {
  return (
    <SeasonGate>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/pre-season-bets" element={<ProtectedRoute><PreSeasonBetsPage /></ProtectedRoute>} />
        <Route path="/round-bets" element={<ProtectedRoute><RoundBetsPage /></ProtectedRoute>} />
        <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
        <Route path="/all-users-bets" element={<ProtectedRoute><AllUsersBetsPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SeasonGate>
  );
}

function AppRoutes() {
  return (
    <Router>
      <AppRoutesContent />
    </Router>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <AuthProvider>
        <SeasonProvider>
          <AppRoutes />
        </SeasonProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
