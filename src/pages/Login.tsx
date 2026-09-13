import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { 
  Package, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  ArrowRight,
  ShieldCheck,
  User as UserIcon,
  CheckCircle2,
  KeyRound,
  LogOut,
  Sparkles
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import { cn } from '../lib/utils';

export default function Login() {
  const navigate = useNavigate();
  const { 
    user, 
    sessionUser, 
    loginWithCredentials, 
    storeUsers, 
    signOutGoogle,
    loading: authLoading 
  } = useAuth();

  const [selectedRole, setSelectedRole] = useState<UserRole>('Admin');
  const [usernameOrEmail, setUsernameOrEmail] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bypassGoogle, setBypassGoogle] = useState(false);

  // If already logged in to an active store session, redirect to dashboard
  useEffect(() => {
    if (sessionUser) {
      navigate('/', { replace: true });
    }
  }, [sessionUser, navigate]);

  // When store users load or role changes, set default username for that role
  useEffect(() => {
    if (storeUsers && storeUsers.length > 0) {
      const match = storeUsers.find(u => u.role === selectedRole);
      if (match && match.username) {
        setUsernameOrEmail(match.username);
      } else {
        setUsernameOrEmail(selectedRole === 'Admin' ? 'admin' : 'user');
      }
    }
  }, [selectedRole, storeUsers]);

  const handleSelectRole = (newRole: UserRole) => {
    setSelectedRole(newRole);
    setErrorMessage(null);
    setPassword('');
    const match = storeUsers.find(u => u.role === newRole);
    if (match && match.username) {
      setUsernameOrEmail(match.username);
    } else {
      setUsernameOrEmail(newRole === 'Admin' ? 'admin' : 'user');
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      toast.success(`Google Account authenticated (${result.user.email || 'Verified'}). Please choose your login role.`);
      // Note: We do NOT auto-login as admin or redirect!
      // The user is now given the option for Admin and User login.
    } catch (error: any) {
      console.error('Google Sign-in error:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        setErrorMessage('Google Sign-In popup was closed before completion. Please try again.');
      } else {
        setErrorMessage(error.message || 'Failed to authenticate with Google.');
      }
      toast.error('Google authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOutGoogle = async () => {
    setLoading(true);
    try {
      await signOutGoogle();
      setBypassGoogle(false);
      toast.info('Signed out of Google account');
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanUsername = usernameOrEmail.trim();
    const cleanPassword = password.trim();

    if (!cleanUsername) {
      setErrorMessage(`Please enter your ${selectedRole} username.`);
      return;
    }
    if (!cleanPassword) {
      setErrorMessage(`Please enter your ${selectedRole} password.`);
      return;
    }

    setLoading(true);
    try {
      const result = await loginWithCredentials(cleanUsername, cleanPassword);
      if (result.success && result.user) {
        if (result.user.role !== selectedRole) {
          toast.info(`Note: Signed in as ${result.user.role} (${result.user.name}) based on account credentials.`);
        } else {
          toast.success(`Welcome, ${result.user.name}! Signed in as ${result.user.role}.`);
        }
        navigate('/', { replace: true });
      } else {
        setErrorMessage(result.error || `Invalid credentials for ${selectedRole}. Please check your username and password.`);
        toast.error(result.error || 'Login failed');
      }
    } catch (error: any) {
      setErrorMessage(error.message || 'An unexpected error occurred during login.');
      toast.error('Failed to log in');
    } finally {
      setLoading(false);
    }
  };

  const isGoogleAuthenticated = Boolean(user) || bypassGoogle;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f3f6f5] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0a382c]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f6f5] flex flex-col justify-center py-10 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Decorative Brand Accent Spheres */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-emerald-500/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-[#0a382c]/10 blur-[130px] pointer-events-none" />

      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10 px-4">
        <div className="mx-auto h-14 w-14 bg-emerald-50 border border-emerald-150 text-[#0a382c] rounded-2xl flex items-center justify-center shadow-sm">
          <Package className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-center text-3xl font-black text-slate-900 tracking-tight">
          ElectroManage
        </h2>
        <p className="mt-1 text-center text-xs text-slate-500 font-semibold tracking-wide uppercase">
          Electronics Store Management System
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-lg relative z-10 px-4 sm:px-0">
        <div className="glass-panel py-7 px-5 shadow-xl rounded-2xl sm:px-8 bg-white border border-slate-200">

          {/* STEP 1: If NOT signed in with Google */}
          {!isGoogleAuthenticated ? (
            <div className="space-y-5">
              <div className="text-center pb-3 border-b border-slate-100">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-extrabold uppercase tracking-wider mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Step 1: Store Terminal Authentication</span>
                </div>
                <h3 className="text-lg font-black text-slate-900">
                  Sign in with Google First
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Authenticate your store account with Google. After sign-in, you will be given the option to log in as Admin or User.
                </p>
              </div>

              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <div className="flex-1 font-medium">{errorMessage}</div>
                </div>
              )}

              {/* Primary Google Sign In Button */}
              <div>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full inline-flex justify-center items-center gap-3 py-3 px-4 border border-slate-300 rounded-xl shadow-xs bg-white text-sm font-bold text-slate-800 hover:bg-slate-50 hover:border-slate-400 transition-all disabled:opacity-50 cursor-pointer group"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span>{loading ? 'Authenticating...' : 'Sign in with Google'}</span>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>

              {/* Direct Bypass Fallback */}
              <div className="pt-2 border-t border-slate-100 text-center">
                <button
                  type="button"
                  onClick={() => setBypassGoogle(true)}
                  className="text-xs font-semibold text-slate-500 hover:text-[#0a382c] transition-colors cursor-pointer"
                >
                  Or enter Store Credentials directly (Bypass Google) &rarr;
                </button>
              </div>
            </div>
          ) : (
            /* STEP 2: AFTER SIGN IN WITH GOOGLE - GIVE SIGN IN OPTION FOR ADMIN AND USER LOGIN */
            <div className="space-y-5">
              
              {/* Google Verified Banner */}
              <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                        Google Authenticated
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {user?.email || user?.displayName || 'Authorized Google Account'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSignOutGoogle}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-all shrink-0 cursor-pointer shadow-2xs"
                  title="Switch or sign out of Google account"
                >
                  <LogOut className="w-3 h-3 text-slate-400" />
                  <span>Switch</span>
                </button>
              </div>

              {/* Header */}
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Select Login Option
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Choose your role below and enter your credentials to access the store system.
                </p>
              </div>

              {/* TWO ROLE SIGN-IN OPTIONS: ADMIN & USER */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Option 1: Admin Login Card */}
                <button
                  type="button"
                  onClick={() => handleSelectRole('Admin')}
                  className={cn(
                    "p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer",
                    selectedRole === 'Admin'
                      ? "bg-emerald-50/80 border-emerald-700 ring-2 ring-emerald-600/30 shadow-xs"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shadow-2xs",
                        selectedRole === 'Admin' ? "bg-[#0a382c]" : "bg-slate-700"
                      )}>
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                        selectedRole === 'Admin' 
                          ? "bg-emerald-200/80 text-emerald-900 border border-emerald-300" 
                          : "bg-slate-100 text-slate-600"
                      )}>
                        Full Access
                      </span>
                    </div>
                    <h4 className="text-sm font-black text-slate-900">1. Admin Login</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      Inventory, Reports, Financials & Settings
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Role:</span>
                    <span className="font-mono text-xs font-bold text-emerald-800">Admin</span>
                  </div>
                </button>

                {/* Option 2: User Login Card */}
                <button
                  type="button"
                  onClick={() => handleSelectRole('User')}
                  className={cn(
                    "p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer",
                    selectedRole === 'User'
                      ? "bg-blue-50/80 border-blue-600 ring-2 ring-blue-500/30 shadow-xs"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shadow-2xs",
                        selectedRole === 'User' ? "bg-blue-600" : "bg-slate-700"
                      )}>
                        <UserIcon className="w-4 h-4" />
                      </div>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                        selectedRole === 'User' 
                          ? "bg-blue-200/80 text-blue-900 border border-blue-300" 
                          : "bg-slate-100 text-slate-600"
                      )}>
                        Restricted
                      </span>
                    </div>
                    <h4 className="text-sm font-black text-slate-900">2. User Login</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      POS Sales, Product Catalog & Customers
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Role:</span>
                    <span className="font-mono text-xs font-bold text-blue-800">User</span>
                  </div>
                </button>
              </div>

              {/* Error Message Alert */}
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <div className="flex-1 font-medium">{errorMessage}</div>
                </div>
              )}

              {/* Credential Login Form for the Chosen Role */}
              <form onSubmit={handleLogin} className="space-y-4 pt-1">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs font-bold text-slate-700">
                    Sign in with your <span className="text-slate-950 font-black">{selectedRole}</span> credentials:
                  </span>
                </div>

                <div>
                  <label 
                    className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5" 
                    htmlFor="username"
                  >
                    {selectedRole} Username
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold text-xs">
                      @
                    </div>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      required
                      value={usernameOrEmail}
                      onChange={(e) => setUsernameOrEmail(e.target.value)}
                      className="glass-input block w-full pl-8 pr-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                      placeholder={selectedRole === 'Admin' ? 'admin' : 'user'}
                    />
                  </div>
                </div>

                <div>
                  <label 
                    className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5" 
                    htmlFor="password"
                  >
                    {selectedRole} Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="glass-input block w-full pl-9 pr-10 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      id="remember-me"
                      name="remember-me"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 bg-white border-slate-300 rounded text-[#0a382c] focus:ring-emerald-500"
                    />
                    <span className="text-slate-600 font-semibold">Remember me</span>
                  </label>

                  <span className="text-[11px] text-slate-400 font-medium">
                    Admin sets credentials in Settings
                  </span>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl shadow-md text-sm font-bold text-white transition-all disabled:opacity-50 cursor-pointer",
                      selectedRole === 'Admin'
                        ? "bg-[#0a382c] hover:bg-[#0d4a3b] shadow-emerald-950/10"
                        : "bg-blue-700 hover:bg-blue-800 shadow-blue-900/10"
                    )}
                  >
                    {loading ? (
                      <span>Signing in...</span>
                    ) : (
                      <>
                        {selectedRole === 'Admin' ? (
                          <ShieldCheck className="w-4 h-4" />
                        ) : (
                          <UserIcon className="w-4 h-4" />
                        )}
                        <span>Sign In as {selectedRole}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
