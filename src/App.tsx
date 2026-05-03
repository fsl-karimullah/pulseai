import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import KnowledgePage from './pages/KnowledgePage';
import BotSettingsPage from './pages/BotSettingsPage';
import LeadsPage from './pages/LeadsPage';
import PricingPage from './pages/PricingPage';
import WidgetIntegrationPage from './pages/WidgetIntegrationPage';
import PublicChatWidget from './pages/PublicChatWidget';

import './index.css';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/widget" element={<PublicChatWidget />} />

          {/* Protected Routes inside Dashboard Layout */}
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="knowledge" element={<KnowledgePage />} />
            <Route path="bot-settings" element={<BotSettingsPage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="billing" element={<PricingPage />} />
            <Route path="integration/widget" element={<WidgetIntegrationPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;
