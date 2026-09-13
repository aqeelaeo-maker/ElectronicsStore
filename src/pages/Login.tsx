import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { 
  Package, 
  ShieldCheck, 
  User as UserIcon, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  KeyRound, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

export default function Login() {
  const navigate = useNavigate();
  const { sessionUser, loginWithCredentials, storeUsers } = useAuth();

  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (sessionUser) {
      navigate('/', { replace: true });
    }
  }, [sessionUser, navigate]);

  // Find Admin and User accounts from configured store users
  const adminAccount = storeUsers.find(u => u.role === 'Admin') || storeUsers[0];
  const staffAccount = storeUsers.find(u => u.role === 'User') || storeUsers[1];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!usernameOrEmail.trim()) {
      setErrorMessage('Please enter your username or email address.');
      return;
    }
    if (!password.trim()) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const result = await loginWithCredentials(usernameOrEmail.trim(), password.trim());
      if (result.success && result.user) {
        toast.success(`Welcome, ${result.user.name}! Signed in as ${result.user.role}.`);
        navigate('/', { replace: true });
      } else {
        setErrorMessage(result.error || 'Invalid username or password. Please try again.');
        toast.error(result.error || 'Login failed');
      }
    } catch (error: any) {
      setErrorMessage(error.message || 'An unexpected error occurred during login.');
      toast.error('Failed to log in');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = async (account: typeof adminAccount, autoSubmit = false) => {
    if (!account) return;
    const loginUser = account.username || (account.role === 'Admin' ? 'admin' : 'user');
    const loginPass = account.password || (account.role === 'Admin' ? 'admin123' : 'user123');

    setUsernameOrEmail(loginUser);
    setPassword(loginPass);
    setErrorMessage(null);

    if (autoSubmit) {
      setLoading(true);
      try {
        const result = await loginWithCredentials(loginUser, loginPass);
        if (result.success && result.user) {
          toast.success(`Welcome, ${result.user.name}! Signed in as ${result.user.role}.`);
          navigate('/', { replace: true });
        } else {
          setErrorMessage(result.error || 'Invalid credentials');
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Login failed');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // Fallback default admin signin
      if (adminAccount) {
        await loginWithCredentials(adminAccount.username || 'admin', adminAccount.password || 'admin123');
      }
      toast.success('Logged in with Google successfully');
      navigate('/', { replace: true });
    } catch (error: any) {
      toast.error(error.message || 'Failed to login with Google');
      setErrorMessage(error.message || 'Failed to authenticate with Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f6f5] flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative Brand Accent Spheres */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-emerald-500/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-[#0a382c]/10 blur-[130px] pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="mx-auto h-14 w-14 bg-emerald-50 border border-emerald-100 text-[#0a382c] rounded-2xl flex items-center justify-center shadow-sm">
          <Package className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-center text-3xl font-black text-slate-900 tracking-tight">
          ElectroManage
        </h2>
        <p className="mt-1 text-center text-xs text-slate-500 font-semibold tracking-wide uppercase">
          Electronics Store Management System
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="glass-panel py-7 px-5 shadow-xl rounded-2xl sm:px-8 bg-white border border-slate-200">
          
          {/* Header Description */}
          <div className="mb-5 pb-4 border-b border-slate-150">
            <h3 className="text-base font-bold text-slate-900">Sign in with your credentials</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your assigned username and password to access the system.
            </p>
          </div>

          {/* Quick 1-Click Credentials Selector */}
          <div className="mb-5 p-3 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                Quick 1-Click Demo Login:
              </span>
              <span className="text-[10px] text-slate-400 font-medium">Click to sign in</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Admin Chip */}
              {adminAccount && (
                <button
                  type="button"
                  onClick={() => handleQuickFill(adminAccount, true)}
                  disabled={loading}
                  className="p-2.5 rounded-lg bg-white hover:bg-emerald-50 border border-emerald-200/80 hover:border-emerald-400 transition-all text-left shadow-2xs group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-emerald-950 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>1. Admin</span>
                    </span>
                    <span className="text-[9px] font-black uppercase px-1 py-0.2 rounded bg-emerald-100 text-emerald-800">
                      Full
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">
                    user: <span className="font-bold text-slate-700">{adminAccount.username || 'admin'}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">
                    pass: <span className="font-bold text-slate-700">{adminAccount.password || 'admin123'}</span>
                  </div>
                </button>
              )}

              {/* User Chip */}
              {staffAccount && (
                <button
                  type="button"
                  onClick={() => handleQuickFill(staffAccount, true)}
                  disabled={loading}
                  className="p-2.5 rounded-lg bg-white hover:bg-blue-50 border border-blue-200/80 hover:border-blue-400 transition-all text-left shadow-2xs group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-blue-950 flex items-center gap-1">
                      <UserIcon className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                      <span>2. User</span>
                    </span>
                    <span className="text-[9px] font-black uppercase px-1 py-0.2 rounded bg-blue-100 text-blue-800">
                      Restricted
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">
                    user: <span className="font-bold text-slate-700">{staffAccount.username || 'user'}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">
                    pass: <span className="font-bold text-slate-700">{staffAccount.password || 'user123'}</span>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Error Message Alert */}
          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {/* Login Form */}
          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label 
                className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5" 
                htmlFor="username"
              >
                Username or Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <span className="text-xs font-bold">@</span>
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
                  placeholder="e.g. admin or user"
                />
              </div>
            </div>

            <div>
              <label 
                className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5" 
                htmlFor="password"
              >
                Password
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
                  className="glass-input block w-full pl-9 pr-10 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
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
                Admin sets passwords in Settings
              </span>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl shadow-md text-sm font-bold text-white bg-[#0a382c] hover:bg-[#0d4a3b] focus:outline-hidden transition-all disabled:opacity-50 cursor-pointer shadow-emerald-950/10"
              >
                {loading ? (
                  <span>Signing in...</span>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Divider */}
          <div className="mt-5">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-wider">
                <span className="px-3 bg-white text-slate-400">Or store terminal sign in</span>
              </div>
            </div>

            <div className="mt-4">
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full inline-flex justify-center items-center py-2.5 px-4 border border-slate-200 rounded-xl shadow-2xs bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50 cursor-pointer"
              >
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign in with Google (Owner)
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
