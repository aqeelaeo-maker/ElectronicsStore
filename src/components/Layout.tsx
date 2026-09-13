import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShoppingCart,
  Package, 
  Users, 
  Building2, 
  Archive, 
  Settings,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  User as UserIcon
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { toast } from 'react-toastify';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import OfflineSyncBanner from './OfflineSyncBanner';

const allNavigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Sales', href: '/sales', icon: ShoppingCart },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Vendors', href: '/vendors', icon: Building2 },
  { name: 'Inventory', href: '/inventory', icon: Archive },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Layout() {
  const { user, storeId, logout, activeRole, activeUser, switchActiveRole, isUser } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [storeDetails, setStoreDetails] = useState<{ name: string; logoUrl: string }>({ name: '', logoUrl: '' });

  // User role can ONLY view: Dashboard, Sales, Products, Customers
  // Admin role can view everything in the application
  const visibleNavigation = isUser
    ? allNavigation.filter(item => ['Dashboard', 'Sales', 'Products', 'Customers'].includes(item.name))
    : allNavigation;

  useEffect(() => {
    if (!storeId) return;

    const storeRef = doc(db, 'stores', storeId);
    const unsubscribe = onSnapshot(storeRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStoreDetails({
          name: data.name || '',
          logoUrl: data.logoUrl || ''
        });
      }
    }, (error) => {
      console.error('Error listening to store details:', error);
    });

    return () => unsubscribe();
  }, [storeId]);

  const getInitials = (name: string) => {
    if (!name) return 'EM';
    return name
      .split(' ')
      .filter(Boolean)
      .map(word => word[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <div className="min-h-screen bg-[#f3f6f5] flex text-slate-800 relative overflow-hidden font-sans">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-[#0a382c] transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:flex-shrink-0 flex flex-col shadow-xl",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-emerald-900/40 bg-[#072d23]">
          <span className="text-sm font-extrabold tracking-tight text-white flex items-center gap-2.5 min-w-0 flex-1">
            {storeDetails.logoUrl ? (
              <img src={storeDetails.logoUrl} alt="Store Logo" className="h-8 w-8 rounded-lg object-cover flex-shrink-0" referrerPolicy="no-referrer" />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-[#f0b90b] text-slate-950 flex items-center justify-center font-black text-xs shadow flex-shrink-0">
                {getInitials(storeDetails.name || 'ElectroManage')}
              </div>
            )}
            <span className="truncate">{storeDetails.name || 'ElectroManage'}</span>
          </span>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-300 hover:text-white transition-colors ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="px-3 space-y-1">
            {visibleNavigation.map((item) => {
              const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center px-4 py-2 text-sm font-semibold rounded-xl group transition-all duration-150 border",
                    isActive 
                      ? "bg-[#195d4e] text-white border-[#227261] shadow-md shadow-emerald-950/20" 
                      : "text-emerald-100/80 hover:bg-[#124d3f]/40 border-transparent hover:text-white"
                  )}
                >
                  <item.icon 
                    className={cn(
                      "flex-shrink-0 -ml-1 mr-3 h-4.5 w-4.5 transition-colors duration-150",
                      isActive ? "text-emerald-300" : "text-emerald-300/60 group-hover:text-emerald-200"
                    )} 
                  />
                  <span className="truncate">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Support Section */}
        <div className="mx-4 mb-3 p-3 rounded-xl bg-[#092f25] border border-emerald-900/40">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#125d4c] rounded-lg text-emerald-400 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.965C16.528 2.01 14.069.986 11.44.986c-5.442 0-9.866 4.372-9.87 9.802 0 1.73.463 3.42 1.34 4.947l-.997 3.641 3.734-.978zm11.567-7.619c-.302-.15-1.788-.876-2.057-.973-.269-.099-.465-.15-.659.15-.195.299-.752.973-.922 1.17-.17.195-.34.22-.641.07-1.125-.565-1.899-1.025-2.656-2.316-.2-.34.2-.315.572-1.055.062-.125.031-.235-.015-.33-.047-.095-.465-1.11-.637-1.524-.167-.402-.351-.347-.481-.353-.125-.004-.268-.005-.412-.005-.144 0-.379.054-.577.269-.198.215-.756.734-.756 1.792s.772 2.08 1.055 2.457c.284.377 1.543 2.338 3.723 3.269.519.222.923.355 1.238.455.52.164.993.14 1.368.085.418-.06 1.788-.726 2.042-1.427.254-.7.254-1.3.178-1.427-.076-.125-.284-.199-.586-.349z"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-white">Need Support?</p>
              <p className="text-[10px] text-emerald-300">Fast customer service</p>
            </div>
          </div>
        </div>

        <div className="p-3.5 border-t border-emerald-900/60 bg-[#072d23]">
          <div className="flex items-center p-2 rounded-xl bg-[#0d3c30] border border-emerald-900/50">
            <div className="flex-shrink-0">
              <div className={cn(
                "h-9 w-9 rounded-full flex items-center justify-center text-white font-extrabold shadow-sm text-xs",
                activeRole === 'Admin' ? "bg-emerald-600" : "bg-blue-600"
              )}>
                {activeRole === 'Admin' ? (
                  <ShieldCheck className="w-5 h-5 text-white" />
                ) : (
                  <UserIcon className="w-5 h-5 text-white" />
                )}
              </div>
            </div>
            <div className="ml-3 min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">
                {activeUser?.name || (activeRole === 'Admin' ? 'Admin' : 'User')}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={cn(
                  "px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider",
                  activeRole === 'Admin' ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-blue-500/20 text-blue-200 border border-blue-500/30"
                )}>
                  {activeRole}
                </span>
                <span className="text-[10px] text-emerald-200/60 truncate">
                  {activeRole === 'Admin' ? 'Full Access' : 'Restricted'}
                </span>
              </div>
            </div>
          </div>
          <button 
            onClick={() => logout()}
            className="mt-2.5 flex w-full items-center justify-center px-4 py-1.5 text-xs font-bold text-red-300 bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 rounded-xl transition-all"
          >
            <LogOut className="w-3.5 h-3.5 mr-2" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        <OfflineSyncBanner />
        <header className="h-16 bg-white border-b border-slate-200/80 flex items-center justify-between px-4 lg:px-8 shrink-0 shadow-sm z-20">
          <button 
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-slate-500 hover:text-slate-800 lg:hidden transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
          
          <div className="flex items-center space-x-3 sm:space-x-4 ml-auto">
             {/* Active Role Quick Switcher */}
             <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
               <button
                 type="button"
                 onClick={() => {
                   if (activeRole !== 'Admin') {
                     switchActiveRole('Admin');
                     toast.success('Switched to Admin role: Full access restored');
                   }
                 }}
                 className={cn(
                   "px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                   activeRole === 'Admin'
                     ? "bg-[#0a382c] text-white shadow-xs"
                     : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                 )}
                 title="Switch to Admin mode (Full access to all modules and financials)"
               >
                 <ShieldCheck className="w-3.5 h-3.5" />
                 <span>Admin</span>
               </button>
               <button
                 type="button"
                 onClick={() => {
                   if (activeRole !== 'User') {
                     switchActiveRole('User');
                     toast.info('Switched to User role: Only Dashboard, Sales, Products, and Customers accessible. Sensitive metrics hidden.');
                   }
                 }}
                 className={cn(
                   "px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                   activeRole === 'User'
                     ? "bg-blue-700 text-white shadow-xs"
                     : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                 )}
                 title="Switch to User mode (Restricted: Dashboard, Sales, Products, Customers only)"
               >
                 <UserIcon className="w-3.5 h-3.5" />
                 <span>User</span>
               </button>
             </div>

             {/* Profile selection with dynamic store name and logo */}
             <div className="flex items-center gap-2.5 bg-slate-50 hover:bg-slate-100 px-3.5 py-1.5 rounded-full border border-slate-200 transition-all cursor-pointer">
               {storeDetails.logoUrl && (
                 <img src={storeDetails.logoUrl} alt="Store Logo" className="h-5 w-5 rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" />
               )}
               <span className="text-xs font-bold text-slate-700 max-w-[150px] truncate">
                 {storeDetails.name || 'ElectroManage'}
               </span>
               {!storeDetails.logoUrl && (
                 <div className="h-6 w-6 rounded-full bg-[#0a382c] flex items-center justify-center text-emerald-300 text-[10px] font-black flex-shrink-0">
                   {getInitials(storeDetails.name || 'ElectroManage')}
                 </div>
               )}
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
