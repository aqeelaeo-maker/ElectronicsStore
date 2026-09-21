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
import Quotations from './pages/Quotations';
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
  const { user, sessionUser, loading, role, status, logout, isSuperAdmin, isPackageExpired, packageExpiryDate } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
        {/* Aero Glassmorphism Glowing Spheres - Gray / White monochrome */}
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-slate-500/5 blur-[130px] pointer-events-none" />
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-300 relative z-10"></div>
      </div>
    );
  }
  
  if (!sessionUser) {
    return <Navigate to="/login" replace />;
  }

  if (status === 'Pending' && !isSuperAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
        {/* Aero Glassmorphism Glowing Spheres - Gray / White monochrome */}
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-slate-500/5 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-slate-600/5 blur-[130px] pointer-events-none" />

        <div className="glass-panel p-8 rounded-2xl shadow-2xl max-w-md text-center relative z-10 border border-white/10">
          <h2 className="text-2xl font-extrabold text-white mb-3">Store Approval Pending</h2>
          <p className="text-slate-300 text-sm mb-6 leading-relaxed">Your account is pending authorization by the Super Admin (<strong>aqeelaeo@gmail.com</strong>). Please wait for approval to open your store.</p>
          <div className="flex justify-center gap-4">
            <button 
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-950 font-bold rounded-xl shadow-md shadow-white/5 transition-all text-sm cursor-pointer"
            >
              Check Status
            </button>
            <button 
              onClick={logout}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl border border-slate-700 transition-all text-sm cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isPackageExpired && !isSuperAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-rose-500/10 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-rose-600/10 blur-[130px] pointer-events-none" />

        <div className="glass-panel p-8 rounded-2xl shadow-2xl max-w-md text-center relative z-10 border border-rose-500/30">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mx-auto mb-4 text-rose-400">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-extrabold text-white mb-2">Store Package Expired</h2>
          <p className="text-slate-300 text-sm mb-3 leading-relaxed">
            Your store subscription package expired on <strong className="text-rose-300">{packageExpiryDate}</strong>.
          </p>
          <p className="text-slate-400 text-xs mb-6 leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-white/5">
            Only the Super Admin (<strong>aqeelaeo@gmail.com</strong>) has authority to renew or extend package expiry dates.
          </p>
          <div className="flex justify-center gap-4">
            <button 
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-950 font-bold rounded-xl shadow-md transition-all text-sm cursor-pointer"
            >
              Check Status
            </button>
            <button 
              onClick={logout}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl border border-slate-700 transition-all text-sm cursor-pointer"
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

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isUser } = useAuth();
  if (isUser) {
    return <Navigate to="/" replace />;
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
            <Route path="sales" element={<Sales />} />
            <Route path="quotations" element={<Quotations />} />
            <Route path="products" element={<Products />} />
            <Route path="customers" element={<Customers />} />

            {/* Admin-only routes */}
            <Route path="serials" element={<AdminRoute><SerialNumbers /></AdminRoute>} />
            <Route path="purchases" element={<AdminRoute><Placeholder title="Purchases" /></AdminRoute>} />
            <Route path="vendors" element={<AdminRoute><Vendors /></AdminRoute>} />
            <Route path="inventory" element={<AdminRoute><Inventory /></AdminRoute>} />
            <Route path="inventory/add" element={<AdminRoute><Inventory initialAddStock={true} /></AdminRoute>} />
            <Route path="reports" element={<AdminRoute><Placeholder title="Reports" /></AdminRoute>} />
            <Route path="settings" element={<AdminRoute><Settings /></AdminRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <ToastContainer position="top-right" autoClose={3000} aria-label="Notifications" />
    </AuthProvider>
  );
}
