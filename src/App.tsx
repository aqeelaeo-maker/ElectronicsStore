import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Vendors from './pages/Vendors';
import Sales from './pages/Sales';
import Settings from './pages/Settings';

import SerialNumbers from './pages/SerialNumbers';
import Inventory from './pages/Inventory';

// Mock empty pages for the rest of the routes
const Placeholder = ({ title }: { title: string }) => (
  <div className="flex items-center justify-center h-full">
    <h2 className="text-2xl font-semibold text-gray-500">{title} Component (WIP)</h2>
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, role, status, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
        {/* Aero Glassmorphism Glowing Spheres - Gray / White monochrome */}
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-slate-500/5 blur-[130px] pointer-events-none" />
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-300 relative z-10"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (status === 'Pending' && role !== 'Super Admin') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
        {/* Aero Glassmorphism Glowing Spheres - Gray / White monochrome */}
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-slate-500/5 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-slate-600/5 blur-[130px] pointer-events-none" />

        <div className="glass-panel p-8 rounded-2xl shadow-2xl max-w-md text-center relative z-10 border border-white/10">
          <h2 className="text-2xl font-extrabold text-white mb-3">Account Pending</h2>
          <p className="text-slate-300 text-sm mb-6 leading-relaxed">Your account is pending authorization by the Super Admin. Please wait for approval to access your store.</p>
          <div className="flex justify-center gap-4">
            <button 
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-950 font-bold rounded-xl shadow-md shadow-white/5 transition-all text-sm"
            >
              Check Status
            </button>
            <button 
              onClick={logout}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl border border-slate-700 transition-all text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="products" element={<Products />} />
            <Route path="serials" element={<SerialNumbers />} />
            <Route path="sales" element={<Sales />} />
            <Route path="purchases" element={<Placeholder title="Purchases" />} />
            <Route path="customers" element={<Customers />} />
            <Route path="vendors" element={<Vendors />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="reports" element={<Placeholder title="Reports" />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <ToastContainer position="top-right" autoClose={3000} aria-label="Notifications" />
    </AuthProvider>
  );
}
