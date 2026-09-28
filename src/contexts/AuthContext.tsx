import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { StoreUser, DEFAULT_STORE_USERS, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  sessionUser: StoreUser | null;
  role: string | null;
  storeId: string | null;
  status: string | null;
  loading: boolean;
  logout: () => Promise<void>;
  signOutGoogle: () => Promise<void>;
  clearSessionUser: () => void;
  activeRole: UserRole;
  activeUser: StoreUser | null;
  storeUsers: StoreUser[];
  switchActiveRole: (role: UserRole, profile?: StoreUser) => void;
  updateStoreUsers: (users: StoreUser[]) => Promise<void>;
  loginWithCredentials: (usernameOrEmail: string, password: string) => Promise<{ success: boolean; error?: string; user?: StoreUser }>;
  setStoreUserCredentials: (userId: string, newUsername: string, newPassword?: string) => Promise<void>;
  isAdmin: boolean;
  isUser: boolean;
  isSuperAdmin: boolean;
  superAdminEmail: string;
  packageExpiryDate: string | null;
  packageName: string | null;
  isPackageExpired: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  sessionUser: null,
  role: null,
  storeId: null,
  status: null,
  loading: true,
  logout: async () => {},
  signOutGoogle: async () => {},
  clearSessionUser: () => {},
  activeRole: 'Admin',
  activeUser: null,
  storeUsers: DEFAULT_STORE_USERS,
  switchActiveRole: () => {},
  updateStoreUsers: async () => {},
  loginWithCredentials: async () => ({ success: false }),
  setStoreUserCredentials: async () => {},
  isAdmin: true,
  isUser: false,
  isSuperAdmin: false,
  superAdminEmail: 'aqeelaeo@gmail.com',
  packageExpiryDate: 'Lifetime',
  packageName: 'Super Admin Access',
  isPackageExpired: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [sessionUser, setSessionUser] = useState<StoreUser | null>(() => {
    try {
      const saved = localStorage.getItem('app_session_user');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });
  const [rawRole, setRawRole] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole>(() => {
    const saved = localStorage.getItem('app_active_role');
    return saved === 'User' ? 'User' : 'Admin';
  });
  const [activeUser, setActiveUser] = useState<StoreUser | null>(null);
  const [storeUsers, setStoreUsers] = useState<StoreUser[]>(() => {
    try {
      const cached = localStorage.getItem('app_store_users');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_STORE_USERS;
  });
  const [storeId, setStoreId] = useState<string | null>(() => {
    return localStorage.getItem('app_store_id') || 'electronicsstore-main';
  });
  const [status, setStatus] = useState<string | null>(null);
  const [packageExpiryDate, setPackageExpiryDate] = useState<string | null>(() => {
    return localStorage.getItem('app_package_expiry') || null;
  });
  const [packageName, setPackageName] = useState<string | null>(() => {
    return localStorage.getItem('app_package_name') || null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const isSuperAdmin = currentUser.email === 'aqeelaeo@gmail.com';
        const cachedRole = (localStorage.getItem('app_user_role') as UserRole) || (isSuperAdmin ? 'Super Admin' : null);
        const cachedStatus = localStorage.getItem('app_user_status') || (isSuperAdmin ? 'Active' : null);
        const cachedStore = localStorage.getItem('app_store_id') || currentUser.uid;

        // Immediately apply known credentials so offline startup is seamless
        if (isSuperAdmin) {
          setRawRole('Super Admin');
          setStatus('Active');
          setPackageExpiryDate('Lifetime');
          setPackageName('Super Admin Lifetime');
          setStoreId(cachedStore);
        } else if (cachedRole) {
          setRawRole(cachedRole);
          if (cachedStatus) setStatus(cachedStatus);
          setStoreId(cachedStore);
        }

        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const data = userDoc.data();
            let currentStatus = data.status || 'Active';

            // If the user is the super admin, ensure they have the correct role
            if (isSuperAdmin && data.role !== 'Super Admin') {
              try {
                await setDoc(userDocRef, { ...data, role: 'Super Admin', status: 'Active', packageExpiryDate: 'Lifetime', packageName: 'Super Admin Lifetime' }, { merge: true });
              } catch {}
              setRawRole('Super Admin');
              currentStatus = 'Active';
              setPackageExpiryDate('Lifetime');
              setPackageName('Super Admin Lifetime');
              localStorage.setItem('app_package_expiry', 'Lifetime');
              localStorage.setItem('app_package_name', 'Super Admin Lifetime');
              localStorage.setItem('app_user_role', 'Super Admin');
              localStorage.setItem('app_user_status', 'Active');
            } else {
              const determinedRole = (data.role || (isSuperAdmin ? 'Super Admin' : 'Store Admin')) as UserRole;
              setRawRole(determinedRole);
              localStorage.setItem('app_user_role', determinedRole);
              
              // Resolve package expiry date from settings/general or user doc
              let resolvedExpiry = data.packageExpiryDate || null;
              let resolvedPackageName = data.packageName || 'Annual Plan';

              // Check if user is in authorizedEmails or authorizedEmailDetails
              try {
                const settingsDoc = await getDoc(doc(db, 'settings', 'general'));
                if (settingsDoc.exists()) {
                  const sData = settingsDoc.data();
                  const authDetails = Array.isArray(sData.authorizedEmailDetails) ? sData.authorizedEmailDetails : [];
                  const authEmails = Array.isArray(sData.authorizedEmails) ? sData.authorizedEmails : [];
                  
                  const matchedDetail = authDetails.find((d: any) => d?.email?.toLowerCase() === currentUser.email?.toLowerCase());
                  if (matchedDetail) {
                    resolvedExpiry = matchedDetail.packageExpiryDate || resolvedExpiry;
                    resolvedPackageName = matchedDetail.packageName || resolvedPackageName;
                  }

                  const isAuthorized = authEmails.some((e: string) => e?.toLowerCase() === currentUser.email?.toLowerCase());
                  if (isAuthorized && currentStatus === 'Pending') {
                    currentStatus = 'Active';
                    await setDoc(userDocRef, { 
                      status: 'Active',
                      packageExpiryDate: resolvedExpiry,
                      packageName: resolvedPackageName
                    }, { merge: true });
                  }
                }
              } catch (err) {
                console.warn("Unable to fetch settings/general for package expiry (offline mode):", err);
              }

              if (isSuperAdmin) {
                resolvedExpiry = 'Lifetime';
                resolvedPackageName = 'Super Admin Lifetime';
              }

              setPackageExpiryDate(resolvedExpiry);
              setPackageName(resolvedPackageName);
              if (resolvedExpiry) {
                localStorage.setItem('app_package_expiry', resolvedExpiry);
                localStorage.setItem('app_package_name', resolvedPackageName);
              }
            }
            const activeStoreId = data.storeId || currentUser.uid;
            setStoreId(activeStoreId);
            localStorage.setItem('app_store_id', activeStoreId);
            setStatus(currentStatus);
            localStorage.setItem('app_user_status', currentStatus);
          } else {
            // Create new user profile if online
            const newUserRole = isSuperAdmin ? 'Super Admin' : 'Store Admin';
            const newStoreId = currentUser.uid; // Each user gets their own store by default

            // Check if email is authorized and get package expiry date
            let isAuthorized = false;
            let resolvedExpiry = isSuperAdmin ? 'Lifetime' : null;
            let resolvedPackageName = isSuperAdmin ? 'Super Admin Lifetime' : 'Annual Plan';

            try {
              const settingsDoc = await getDoc(doc(db, 'settings', 'general'));
              if (settingsDoc.exists()) {
                const sData = settingsDoc.data();
                const authEmails = Array.isArray(sData.authorizedEmails) ? sData.authorizedEmails : [];
                isAuthorized = authEmails.some((e: string) => e?.toLowerCase() === currentUser.email?.toLowerCase());

                const authDetails = Array.isArray(sData.authorizedEmailDetails) ? sData.authorizedEmailDetails : [];
                const matchedDetail = authDetails.find((d: any) => d?.email?.toLowerCase() === currentUser.email?.toLowerCase());
                if (matchedDetail) {
                  resolvedExpiry = matchedDetail.packageExpiryDate;
                  resolvedPackageName = matchedDetail.packageName || resolvedPackageName;
                }
              }
            } catch (err) {
              console.warn("Unable to check authorized emails on user creation:", err);
            }

            const newStatus = isSuperAdmin || isAuthorized ? 'Active' : 'Active';

            try {
              await setDoc(userDocRef, {
                email: currentUser.email,
                name: currentUser.displayName || '',
                role: newUserRole,
                storeId: newStoreId,
                status: newStatus,
                packageExpiryDate: resolvedExpiry,
                packageName: resolvedPackageName,
                createdAt: serverTimestamp()
              });
            } catch (saveErr) {
              console.warn("Could not save initial user doc (client might be offline):", saveErr);
            }

            setRawRole(newUserRole);
            setStoreId(newStoreId);
            setPackageExpiryDate(resolvedExpiry);
            setPackageName(resolvedPackageName);
            localStorage.setItem('app_user_role', newUserRole);
            localStorage.setItem('app_user_status', newStatus);
            localStorage.setItem('app_store_id', newStoreId);
            if (resolvedExpiry) {
              localStorage.setItem('app_package_expiry', resolvedExpiry);
              localStorage.setItem('app_package_name', resolvedPackageName);
            }
            setStatus(newStatus);
          }
        } catch (error: any) {
          const isOffline = error?.message?.includes('offline') || error?.code === 'unavailable' || error?.message?.includes('network-request-failed');
          if (isOffline) {
            console.warn("Operating in offline mode for user role:", error?.message || error);
          } else {
            console.error("Error fetching user role:", error);
          }

          if (isSuperAdmin) {
            setRawRole('Super Admin');
            setStatus('Active');
            setPackageExpiryDate('Lifetime');
            setPackageName('Super Admin Lifetime');
            setStoreId(prev => prev || currentUser.uid);
            localStorage.setItem('app_user_role', 'Super Admin');
            localStorage.setItem('app_user_status', 'Active');
          } else {
            const fallbackRole = (localStorage.getItem('app_user_role') as UserRole) || 'Store Admin';
            const fallbackStatus = localStorage.getItem('app_user_status') || 'Active';
            setRawRole(fallbackRole);
            setStatus(fallbackStatus);
            setStoreId(prev => prev || currentUser.uid);
          }
        }
      } else {
        setRawRole(null);
        setStatus(null);
        // Retain saved storeId for store terminal/offline sessions
        setStoreId(prev => prev || localStorage.getItem('app_store_id') || 'electronicsstore-main');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Listen to store settings to load configured store users
  useEffect(() => {
    if (!storeId) return;

    const storeRef = doc(db, 'stores', storeId);
    const unsubscribe = onSnapshot(storeRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();

        // Real-time package expiry sync from store document
        if (data.packageExpiryDate && user?.email !== 'aqeelaeo@gmail.com') {
          setPackageExpiryDate(data.packageExpiryDate);
          localStorage.setItem('app_package_expiry', data.packageExpiryDate);
          if (data.packageName) {
            setPackageName(data.packageName);
            localStorage.setItem('app_package_name', data.packageName);
          }
        }

        if (Array.isArray(data.storeUsers) && data.storeUsers.length > 0) {
          const sanitized: StoreUser[] = data.storeUsers.map((u: any) => ({
            ...u,
            username: u.username || (u.role === 'Admin' ? 'admin' : 'user'),
            password: u.password || (u.role === 'Admin' ? 'admin123' : 'user123'),
          }));
          setStoreUsers(sanitized);
          localStorage.setItem('app_store_users', JSON.stringify(sanitized));
          
          // Match active user profile if saved
          const savedUserId = localStorage.getItem('app_active_user_id');
          const matched = sanitized.find((u: StoreUser) => u.id === savedUserId) 
            || sanitized.find((u: StoreUser) => u.role === activeRole)
            || sanitized[0];
          
          if (matched) {
            setActiveUser(matched);
          }

          if (sessionUser) {
            const updatedSession = sanitized.find((u: StoreUser) => u.id === sessionUser.id || u.username === sessionUser.username);
            if (updatedSession) {
              setSessionUser(updatedSession);
              localStorage.setItem('app_session_user', JSON.stringify(updatedSession));
            }
          }
        } else {
          // Initialize store with default 2 users (Admin & User)
          setStoreUsers(DEFAULT_STORE_USERS);
          localStorage.setItem('app_store_users', JSON.stringify(DEFAULT_STORE_USERS));
          const matched = DEFAULT_STORE_USERS.find(u => u.role === activeRole) || DEFAULT_STORE_USERS[0];
          setActiveUser(matched);
        }
      }
    }, (err) => {
      console.error('Error listening to store users:', err);
    });

    return () => unsubscribe();
  }, [storeId, activeRole, sessionUser]);

  const switchActiveRole = (newRole: UserRole, profile?: StoreUser) => {
    setActiveRole(newRole);
    localStorage.setItem('app_active_role', newRole);
    if (profile) {
      setActiveUser(profile);
      setSessionUser(profile);
      localStorage.setItem('app_active_user_id', profile.id);
      localStorage.setItem('app_session_user', JSON.stringify(profile));
    } else {
      const found = storeUsers.find(u => u.role === newRole);
      if (found) {
        setActiveUser(found);
        setSessionUser(found);
        localStorage.setItem('app_active_user_id', found.id);
        localStorage.setItem('app_session_user', JSON.stringify(found));
      }
    }
  };

  const updateStoreUsers = async (newUsers: StoreUser[]) => {
    setStoreUsers(newUsers);
    localStorage.setItem('app_store_users', JSON.stringify(newUsers));

    // Update active sessionUser if modified
    if (sessionUser) {
      const foundSession = newUsers.find(u => u.id === sessionUser.id);
      if (foundSession) {
        setSessionUser(foundSession);
        setActiveUser(foundSession);
        setActiveRole(foundSession.role);
        localStorage.setItem('app_session_user', JSON.stringify(foundSession));
        localStorage.setItem('app_active_role', foundSession.role);
      }
    }

    if (storeId) {
      try {
        await setDoc(doc(db, 'stores', storeId), {
          storeUsers: newUsers,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.error('Error updating store users:', err);
        throw err;
      }
    }
  };

  const loginWithCredentials = async (
    usernameOrEmail: string, 
    password: string
  ): Promise<{ success: boolean; error?: string; user?: StoreUser }> => {
    const cleanId = usernameOrEmail.trim().toLowerCase();
    const cleanPass = password.trim();

    // Check against store users
    let candidates = storeUsers && storeUsers.length > 0 ? storeUsers : DEFAULT_STORE_USERS;
    try {
      const cached = localStorage.getItem('app_store_users');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          candidates = parsed;
        }
      }
    } catch {}

    const matched = candidates.find(u => 
      (u.username && u.username.toLowerCase() === cleanId) || 
      (u.email && u.email.toLowerCase() === cleanId)
    );

    if (!matched) {
      return { 
        success: false, 
        error: `Invalid username or email. Please check your credentials.` 
      };
    }

    if (matched.status === 'Inactive') {
      return { 
        success: false, 
        error: `Account "${matched.name}" is currently inactive. Please contact your store Admin.` 
      };
    }

    const expectedPassword = matched.password || (matched.role === 'Admin' ? 'admin123' : 'user123');
    if (cleanPass !== expectedPassword) {
      return { 
        success: false, 
        error: 'Incorrect password. Please try again.' 
      };
    }

    // Success: Establish session
    const currentStoreId = storeId || localStorage.getItem('app_store_id') || 'electronicsstore-main';
    setStoreId(currentStoreId);
    localStorage.setItem('app_store_id', currentStoreId);

    setSessionUser(matched);
    setActiveUser(matched);
    setActiveRole(matched.role);
    localStorage.setItem('app_session_user', JSON.stringify(matched));
    localStorage.setItem('app_active_role', matched.role);
    localStorage.setItem('app_active_user_id', matched.id);

    return { success: true, user: matched };
  };

  const setStoreUserCredentials = async (userId: string, newUsername: string, newPassword?: string) => {
    const cleanUsername = newUsername.trim();
    const cleanPassword = newPassword?.trim();

    const conflict = storeUsers.find(
      u => u.id !== userId && u.username.toLowerCase() === cleanUsername.toLowerCase()
    );
    if (conflict) {
      throw new Error(`The username "${cleanUsername}" is already taken by ${conflict.name}. Please select a different username.`);
    }

    const updated = storeUsers.map(u => {
      if (u.id === userId) {
        return {
          ...u,
          username: cleanUsername,
          ...(cleanPassword ? { password: cleanPassword } : {})
        };
      }
      return u;
    });

    await updateStoreUsers(updated);
  };

  const clearSessionUser = () => {
    setSessionUser(null);
    localStorage.removeItem('app_session_user');
    localStorage.removeItem('app_active_role');
    localStorage.removeItem('app_active_user_id');
  };

  const signOutGoogle = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Sign out of Google error:', err);
    }
  };

  const logout = async () => {
    clearSessionUser();
    await signOutGoogle();
  };

  // Effective role is determined by sessionUser or activeRole
  const effectiveRole: UserRole = sessionUser ? sessionUser.role : (activeRole === 'User' ? 'User' : (rawRole === 'Super Admin' ? 'Admin' : activeRole));
  const isAdmin = effectiveRole === 'Admin';
  const isUser = effectiveRole === 'User';

  const SUPER_ADMIN_EMAIL = 'aqeelaeo@gmail.com';
  // Super Admin settings should strictly be shown ONLY to aqeelaeo@gmail.com
  const currentEmail = (user?.email || sessionUser?.email || '').trim().toLowerCase();
  const isSuperAdmin = currentEmail === SUPER_ADMIN_EMAIL;

  // Check if store package has expired (Super Admin never expires)
  const isPackageExpired = Boolean(
    !isSuperAdmin &&
    packageExpiryDate &&
    packageExpiryDate !== 'Lifetime' &&
    new Date(packageExpiryDate + 'T23:59:59').getTime() < Date.now()
  );

  return (
    <AuthContext.Provider value={{ 
      user, 
      sessionUser,
      role: effectiveRole, 
      storeId, 
      status, 
      loading, 
      logout,
      signOutGoogle,
      clearSessionUser,
      activeRole,
      activeUser,
      storeUsers,
      switchActiveRole,
      updateStoreUsers,
      loginWithCredentials,
      setStoreUserCredentials,
      isAdmin,
      isUser,
      isSuperAdmin,
      superAdminEmail: SUPER_ADMIN_EMAIL,
      packageExpiryDate: isSuperAdmin ? 'Lifetime' : packageExpiryDate,
      packageName: isSuperAdmin ? 'Super Admin Lifetime' : packageName,
      isPackageExpired
    }}>
      {children}
    </AuthContext.Provider>
  );
};
