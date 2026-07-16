import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  role: string | null;
  storeId: string | null;
  status: string | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  storeId: null,
  status: null,
  loading: true,
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
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
              setRole('Super Admin');
              currentStatus = 'Active';
            } else {
              setRole(data.role || 'Viewer');
              
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

            setRole(newUserRole);
            setStoreId(newStoreId);
            setStatus(newStatus);
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
          setRole('Viewer');
          setStoreId(currentUser.uid);
          setStatus('Pending');
        }
      } else {
        setRole(null);
        setStoreId(null);
        setStatus(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, role, storeId, status, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
