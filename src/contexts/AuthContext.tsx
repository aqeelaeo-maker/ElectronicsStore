import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { StoreUser, DEFAULT_STORE_USERS, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
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
  isAdmin: boolean;
  isUser: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
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
  isAdmin: true,
  isUser: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [rawRole, setRawRole] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole>(() => {
    const saved = localStorage.getItem('app_active_role');
    return saved === 'User' ? 'User' : 'Admin';
  });
  const [activeUser, setActiveUser] = useState<StoreUser | null>(null);
  const [storeUsers, setStoreUsers] = useState<StoreUser[]>(DEFAULT_STORE_USERS);
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
          setStoreUsers(data.storeUsers);
          
          // Match active user profile if saved
          const savedUserId = localStorage.getItem('app_active_user_id');
          const matched = data.storeUsers.find((u: StoreUser) => u.id === savedUserId) 
            || data.storeUsers.find((u: StoreUser) => u.role === activeRole)
            || data.storeUsers[0];
          
          if (matched) {
            setActiveUser(matched);
          }
        } else {
          // Initialize store with default 2 users (Admin & User)
          setStoreUsers(DEFAULT_STORE_USERS);
          const matched = DEFAULT_STORE_USERS.find(u => u.role === activeRole) || DEFAULT_STORE_USERS[0];
          setActiveUser(matched);
        }
      }
    }, (err) => {
      console.error('Error listening to store users:', err);
    });

    return () => unsubscribe();
  }, [storeId, activeRole]);

  const switchActiveRole = (newRole: UserRole, profile?: StoreUser) => {
    setActiveRole(newRole);
    localStorage.setItem('app_active_role', newRole);
    if (profile) {
      setActiveUser(profile);
      localStorage.setItem('app_active_user_id', profile.id);
    } else {
      const found = storeUsers.find(u => u.role === newRole);
      if (found) {
        setActiveUser(found);
        localStorage.setItem('app_active_user_id', found.id);
      }
    }
  };

  const updateStoreUsers = async (newUsers: StoreUser[]) => {
    setStoreUsers(newUsers);
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

  const logout = async () => {
    localStorage.removeItem('app_active_role');
    localStorage.removeItem('app_active_user_id');
    await signOut(auth);
  };

  // Effective role is determined by activeRole (which can be Admin or User)
  // If user is raw 'User', they are always User.
  const effectiveRole = activeRole === 'User' ? 'User' : (rawRole || 'Admin');
  const isAdmin = effectiveRole !== 'User';
  const isUser = effectiveRole === 'User';

  return (
    <AuthContext.Provider value={{ 
      user, 
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
      isAdmin,
      isUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};
