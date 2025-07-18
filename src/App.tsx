import { BrowserRouter as Router, Routes, Route, Navigate} from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import PreSeasonBetsPage from './pages/PreSeasonBetsPage';
import RoundBetsPage from './pages/RoundBetsPage';
import LeaderboardPage from './pages/LeaderboardPage';
import AdminPage from './pages/AdminPage';
import AllUsersBetsPage from './pages/AllUsersBetsPage';
import './App.css';

// Component to protect routes that require authentication
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">טוען...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutesContent() {
  
  
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route 
        path="/" 
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/pre-season-bets" 
        element={
          <ProtectedRoute>
            <PreSeasonBetsPage />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/round-bets" 
        element={
          <ProtectedRoute>
            <RoundBetsPage />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/leaderboard" 
        element={
          <ProtectedRoute>
            <LeaderboardPage />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/admin" 
        element={
          <ProtectedRoute>
            <AdminPage />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/all-users-bets" 
        element={
          <ProtectedRoute>
            <AllUsersBetsPage />
          </ProtectedRoute>
        } 
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
