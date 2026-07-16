import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  role: string | null;
  storeId: string | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  storeId: null,
  loading: true,
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
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
            // If the user is the super admin, ensure they have the correct role
            if (currentUser.email === 'aqeelaeo@gmail.com' && data.role !== 'Super Admin') {
              await setDoc(userDocRef, { ...data, role: 'Super Admin' }, { merge: true });
              setRole('Super Admin');
            } else {
              setRole(data.role || 'Viewer');
            }
            setStoreId(data.storeId || currentUser.uid);
          } else {
            // Create new user profile
            const isSuperAdmin = currentUser.email === 'aqeelaeo@gmail.com';
            const newUserRole = isSuperAdmin ? 'Super Admin' : 'Store Admin';
            const newStoreId = currentUser.uid; // Each user gets their own store by default

            await setDoc(userDocRef, {
              email: currentUser.email,
              name: currentUser.displayName || '',
              role: newUserRole,
              storeId: newStoreId,
              status: isSuperAdmin ? 'Active' : 'Pending', // Pending authorization if needed
              createdAt: serverTimestamp()
            });

            setRole(newUserRole);
            setStoreId(newStoreId);
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
          setRole('Viewer');
          setStoreId(currentUser.uid);
        }
      } else {
        setRole(null);
        setStoreId(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, role, storeId, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
