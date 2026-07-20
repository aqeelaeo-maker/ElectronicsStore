import React, { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  Hash, 
  ShoppingCart, 
  ShoppingBag, 
  Users, 
  Building2, 
  Archive, 
  FileText,
  Settings,
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'Serial Numbers', href: '/serials', icon: Hash },
  { name: 'Sales', href: '/sales', icon: ShoppingCart },
  { name: 'Purchases', href: '/purchases', icon: ShoppingBag },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Vendors', href: '/vendors', icon: Building2 },
  { name: 'Inventory', href: '/inventory', icon: Archive },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Layout() {
  const { user, role, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-gray-900/80 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-850 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:flex-shrink-0 flex flex-col shadow-xl lg:shadow-none",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800/80 bg-slate-950/20">
          <span className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <span className="bg-blue-600 px-2 py-1 rounded-lg text-white font-black leading-none text-xs shadow-md shadow-blue-500/20">EM</span>
            <span>Electro<span className="text-blue-500">Manage</span></span>
          </span>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto py-6">
          <nav className="px-4 space-y-1.5">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center px-4 py-2.5 text-sm font-semibold rounded-lg group transition-all duration-150",
                    isActive 
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30" 
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"
                  )}
                >
                  <item.icon 
                    className={cn(
                      "flex-shrink-0 -ml-1 mr-3 h-5 w-5 transition-colors duration-150",
                      isActive ? "text-white" : "text-slate-400 group-hover:text-slate-300"
                    )} 
                  />
                  <span className="truncate">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800/80 bg-slate-950/10">
          <div className="flex items-center p-2 rounded-xl bg-slate-800/30 border border-slate-800/20">
            <div className="flex-shrink-0">
              <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-500/10">
                {user?.email?.[0].toUpperCase()}
              </div>
            </div>
            <div className="ml-3 min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-200 truncate">
                {user?.email}
              </p>
              <p className="text-xs font-semibold text-slate-500 capitalize">{role?.toLowerCase() || 'member'}</p>
            </div>
          </div>
          <button 
            onClick={() => logout()}
            className="mt-4 flex w-full items-center justify-center px-4 py-2.5 text-sm font-semibold text-red-400 bg-red-950/20 hover:bg-red-950/40 border border-red-900/20 hover:border-red-900/40 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between px-4 lg:px-8 shrink-0">
          <button 
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-slate-400 hover:text-white lg:hidden transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
          
          <div className="flex items-center space-x-4 ml-auto">
             {/* Global Search */}
             <div className="hidden md:flex relative">
                <input 
                  type="text"
                  placeholder="Global Search (Invoice, Serial...)"
                  className="w-72 pl-4 pr-10 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/80 focus:bg-slate-900 rounded-full text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                />
             </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
