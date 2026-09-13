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
  activeRole: UserRole;
  activeUser: StoreUser | null;
  storeUsers: StoreUser[];
  switchActiveRole: (role: UserRole, profile?: StoreUser) => void;
  updateStoreUsers: (users: StoreUser[]) => Promise<void>;
  loginWithCredentials: (usernameOrEmail: string, password: string) => Promise<{ success: boolean; error?: string; user?: StoreUser }>;
  setStoreUserCredentials: (userId: string, newUsername: string, newPassword?: string) => Promise<void>;
  isAdmin: boolean;
  isUser: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  sessionUser: null,
  role: null,
  storeId: null,
  status: null,
  loading: true,
  logout: async () => {},
  activeRole: 'Admin',
  activeUser: null,
  storeUsers: DEFAULT_STORE_USERS,
  switchActiveRole: () => {},
  updateStoreUsers: async () => {},
  loginWithCredentials: async () => ({ success: false }),
  setStoreUserCredentials: async () => {},
  isAdmin: true,
  isUser: false,
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
  const [storeId, setStoreId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const data = userDoc.data();
            let currentStatus = data.status;

            // If the user is the super admin, ensure they have the correct role
            if (currentUser.email === 'aqeelaeo@gmail.com' && data.role !== 'Super Admin') {
              await setDoc(userDocRef, { ...data, role: 'Super Admin', status: 'Active' }, { merge: true });
              setRawRole('Super Admin');
              currentStatus = 'Active';
            } else {
              setRawRole(data.role || 'Viewer');
              
              // Check if pending user is now authorized
              if (currentStatus === 'Pending') {
                try {
                  const settingsDoc = await getDoc(doc(db, 'settings', 'general'));
                  if (settingsDoc.exists() && settingsDoc.data().authorizedEmails) {
                    const authorizedEmails = settingsDoc.data().authorizedEmails || [];
                    if (authorizedEmails.includes(currentUser.email)) {
                      currentStatus = 'Active';
                      await setDoc(userDocRef, { status: 'Active' }, { merge: true });
                    }
                  }
                } catch (err) {
                  console.error("Error checking authorization for pending user", err);
                }
              }
            }
            setStoreId(data.storeId || currentUser.uid);
            setStatus(currentStatus);
          } else {
            // Create new user profile
            const isSuperAdmin = currentUser.email === 'aqeelaeo@gmail.com';
            const newUserRole = isSuperAdmin ? 'Super Admin' : 'Store Admin';
            const newStoreId = currentUser.uid; // Each user gets their own store by default

            // Check if email is authorized
            let isAuthorized = false;
            try {
              const settingsDoc = await getDoc(doc(db, 'settings', 'general'));
              if (settingsDoc.exists() && settingsDoc.data().authorizedEmails) {
                const authorizedEmails = settingsDoc.data().authorizedEmails || [];
                isAuthorized = authorizedEmails.includes(currentUser.email);
              }
            } catch (err) {
              console.error("Error fetching authorized emails", err);
            }

            const newStatus = isSuperAdmin || isAuthorized ? 'Active' : 'Pending';

            await setDoc(userDocRef, {
              email: currentUser.email,
              name: currentUser.displayName || '',
              role: newUserRole,
              storeId: newStoreId,
              status: newStatus,
              createdAt: serverTimestamp()
            });

            setRawRole(newUserRole);
            setStoreId(newStoreId);
            setStatus(newStatus);
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
          setRawRole('Viewer');
          setStoreId(currentUser.uid);
          setStatus('Pending');
        }
      } else {
        setRawRole(null);
        setStoreId(null);
        setStatus(null);
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

  // Synchronize initial sessionUser if Firebase user is logged in
  useEffect(() => {
    if (user && !sessionUser && storeUsers && storeUsers.length > 0) {
      const defaultUser = storeUsers.find(u => u.role === (activeRole || 'Admin')) || storeUsers[0];
      setSessionUser(defaultUser);
      setActiveUser(defaultUser);
      localStorage.setItem('app_session_user', JSON.stringify(defaultUser));
    }
  }, [user, sessionUser, storeUsers, activeRole]);

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

  const logout = async () => {
    setSessionUser(null);
    localStorage.removeItem('app_session_user');
    localStorage.removeItem('app_active_role');
    localStorage.removeItem('app_active_user_id');
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Sign out error:', err);
    }
  };

  // Effective role is determined by sessionUser or activeRole
  const effectiveRole: UserRole = sessionUser ? sessionUser.role : (activeRole === 'User' ? 'User' : (rawRole === 'Super Admin' ? 'Admin' : activeRole));
  const isAdmin = effectiveRole === 'Admin';
  const isUser = effectiveRole === 'User';

  return (
    <AuthContext.Provider value={{ 
      user, 
      sessionUser,
      role: effectiveRole, 
      storeId, 
      status, 
      loading, 
      logout,
      activeRole,
      activeUser,
      storeUsers,
      switchActiveRole,
      updateStoreUsers,
      loginWithCredentials,
      setStoreUserCredentials,
      isAdmin,
      isUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};
