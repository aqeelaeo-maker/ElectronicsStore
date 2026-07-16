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

// Mock empty pages for the rest of the routes
const Placeholder = ({ title }: { title: string }) => (
  <div className="flex items-center justify-center h-full">
    <h2 className="text-2xl font-semibold text-gray-500">{title} Component (WIP)</h2>
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, role, logout } = useAuth();
  const [status, setStatus] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    if (user) {
      import('firebase/firestore').then(({ doc, getDoc }) => {
        import('./lib/firebase').then(({ db }) => {
          getDoc(doc(db, 'users', user.uid)).then(docSnap => {
            if (docSnap.exists()) {
              setStatus(docSnap.data().status);
            }
            setChecking(false);
          });
        });
      });
    } else {
      setChecking(false);
    }
  }, [user]);

  if (loading || checking) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (status === 'Pending' && role !== 'Super Admin') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-lg shadow-sm max-w-md text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Pending</h2>
          <p className="text-gray-600 mb-6">Your account is pending authorization by the Super Admin. Please wait for approval to access your store.</p>
          <button 
            onClick={logout}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Sign Out
          </button>
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
            <Route path="serials" element={<Placeholder title="Serial Numbers" />} />
            <Route path="sales" element={<Sales />} />
            <Route path="purchases" element={<Placeholder title="Purchases" />} />
            <Route path="customers" element={<Customers />} />
            <Route path="vendors" element={<Vendors />} />
            <Route path="inventory" element={<Placeholder title="Inventory" />} />
            <Route path="reports" element={<Placeholder title="Reports" />} />
            <Route path="settings" element={<Placeholder title="Settings" />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <ToastContainer position="top-right" autoClose={3000} />
    </AuthProvider>
  );
}
