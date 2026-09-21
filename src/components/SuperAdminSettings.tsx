import React, { useState, useEffect } from 'react';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  onSnapshot, 
  updateDoc 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { 
  ShieldCheck, 
  Crown, 
  Mail, 
  Plus, 
  Trash2, 
  Save, 
  Clock, 
  AlertTriangle, 
  UserCheck, 
  UserX, 
  Search, 
  Copy, 
  Check, 
  Store, 
  Users,
  RefreshCw,
  Calendar,
  CalendarClock,
  Sparkles,
  Edit3,
  X,
  CheckCircle2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { AuthorizedStoreEmail } from '../types';

interface RegisteredUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
  storeId?: string;
  status: 'Active' | 'Pending' | string;
  packageExpiryDate?: string;
  packageName?: string;
  createdAt?: any;
}

// Date helpers
const formatDateOffset = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

const getTodayString = (): string => {
  return new Date().toISOString().split('T')[0];
};

const getDefaultOneYearDate = (): string => {
  return formatDateOffset(365);
};

const getExpiryStatusInfo = (expiryDate?: string) => {
  if (!expiryDate || expiryDate === 'Lifetime') {
    return {
      label: 'Lifetime Unlimited',
      daysLeft: Infinity,
      isExpired: false,
      isLifetime: true,
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      textClass: 'text-amber-800'
    };
  }

  const targetDate = new Date(expiryDate + 'T23:59:59');
  const now = new Date();
  const diffTime = targetDate.getTime() - now.getTime();
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return {
      label: `Expired (${Math.abs(daysLeft)}d ago)`,
      daysLeft,
      isExpired: true,
      isLifetime: false,
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
      textClass: 'text-rose-700'
    };
  } else if (daysLeft <= 15) {
    return {
      label: `Expiring Soon (${daysLeft}d left)`,
      daysLeft,
      isExpired: false,
      isLifetime: false,
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      textClass: 'text-amber-800'
    };
  } else {
    return {
      label: `Active (${daysLeft}d left)`,
      daysLeft,
      isExpired: false,
      isLifetime: false,
      badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      textClass: 'text-emerald-800'
    };
  }
};

export default function SuperAdminSettings() {
  const { user, sessionUser, isSuperAdmin, superAdminEmail } = useAuth();

  const currentEmail = (user?.email || sessionUser?.email || '').trim().toLowerCase();
  const isAuthorizedSuperAdmin = Boolean(isSuperAdmin && currentEmail === 'aqeelaeo@gmail.com');

  if (!isAuthorizedSuperAdmin) {
    return null;
  }

  // State for authorized email details with package expiry
  const [authorizedEntries, setAuthorizedEntries] = useState<AuthorizedStoreEmail[]>(() => {
    try {
      const cached = localStorage.getItem('app_authorized_entries');
      if (cached) return JSON.parse(cached);
    } catch {}
    return [{
      email: 'aqeelaeo@gmail.com',
      packageExpiryDate: 'Lifetime',
      packageName: 'Super Admin Lifetime Access',
      updatedAt: new Date().toISOString(),
      updatedBy: 'aqeelaeo@gmail.com'
    }];
  });

  const [authorizedEmails, setAuthorizedEmails] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem('app_authorized_emails');
      if (cached) return JSON.parse(cached);
    } catch {}
    return ['aqeelaeo@gmail.com'];
  });

  // State for adding a new email + package expiry
  const [newEmail, setNewEmail] = useState('');
  const [newExpiryDate, setNewExpiryDate] = useState(getDefaultOneYearDate());
  const [newPackageName, setNewPackageName] = useState('Annual Plan (1 Year)');
  const [isLifetimeNew, setIsLifetimeNew] = useState(false);

  // Individual Email Expiry inline editor
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editExpiryDate, setEditExpiryDate] = useState<string>('');
  const [editPackageName, setEditPackageName] = useState<string>('');
  const [isEditLifetime, setIsEditLifetime] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Quick user registry expiry editor
  const [quickEditUserId, setQuickEditUserId] = useState<string | null>(null);
  const [quickExpiryDate, setQuickExpiryDate] = useState<string>(getDefaultOneYearDate());
  const [quickPackageName, setQuickPackageName] = useState<string>('Annual Plan (1 Year)');
  const [isQuickLifetime, setIsQuickLifetime] = useState(false);
  const [savingQuickUser, setSavingQuickUser] = useState(false);

  const [savingEmails, setSavingEmails] = useState(false);
  const [loading, setLoading] = useState(true);
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'pending' | 'active'>('all');
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // 1. Fetch Authorized Emails & Package Details from Firestore
  useEffect(() => {
    const generalRef = doc(db, 'settings', 'general');
    
    const fetchGeneral = async () => {
      try {
        const snap = await getDoc(generalRef);
        if (snap.exists()) {
          const data = snap.data();
          const rawEmails: string[] = Array.isArray(data.authorizedEmails) ? data.authorizedEmails : [];
          const rawDetails: AuthorizedStoreEmail[] = Array.isArray(data.authorizedEmailDetails) ? data.authorizedEmailDetails : [];

          // Merge so every authorized email has an entry
          const mergedEntries: AuthorizedStoreEmail[] = [];
          const allEmails = Array.from(new Set([superAdminEmail, ...rawEmails, ...rawDetails.map(d => d.email)]));

          for (const email of allEmails) {
            const isSuper = email.toLowerCase() === superAdminEmail.toLowerCase();
            const existing = rawDetails.find(d => d.email.toLowerCase() === email.toLowerCase());
            if (isSuper) {
              mergedEntries.push({
                email,
                packageExpiryDate: 'Lifetime',
                packageName: 'Super Admin Lifetime Access',
                updatedAt: existing?.updatedAt || new Date().toISOString(),
                updatedBy: superAdminEmail
              });
            } else if (existing) {
              mergedEntries.push({
                ...existing,
                packageExpiryDate: existing.packageExpiryDate || getDefaultOneYearDate(),
                packageName: existing.packageName || 'Annual Plan'
              });
            } else {
              mergedEntries.push({
                email,
                packageExpiryDate: getDefaultOneYearDate(),
                packageName: 'Annual Plan (1 Year)',
                updatedAt: new Date().toISOString(),
                updatedBy: superAdminEmail
              });
            }
          }

          setAuthorizedEntries(mergedEntries);
          setAuthorizedEmails(mergedEntries.map(e => e.email));
          localStorage.setItem('app_authorized_entries', JSON.stringify(mergedEntries));
          localStorage.setItem('app_authorized_emails', JSON.stringify(mergedEntries.map(e => e.email)));
        } else {
          // If document doesn't exist, ensure super admin is present
          const defaultSuperEntry: AuthorizedStoreEmail = {
            email: superAdminEmail,
            packageExpiryDate: 'Lifetime',
            packageName: 'Super Admin Lifetime Access',
            updatedAt: new Date().toISOString(),
            updatedBy: superAdminEmail
          };
          setAuthorizedEntries([defaultSuperEntry]);
          setAuthorizedEmails([superAdminEmail]);
          localStorage.setItem('app_authorized_entries', JSON.stringify([defaultSuperEntry]));
          localStorage.setItem('app_authorized_emails', JSON.stringify([superAdminEmail]));
        }
      } catch (error) {
        console.warn('Notice loading authorized emails from Firestore:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGeneral();

    // Listen in real-time
    const unsubscribe = onSnapshot(generalRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const rawEmails: string[] = Array.isArray(data.authorizedEmails) ? data.authorizedEmails : [];
        const rawDetails: AuthorizedStoreEmail[] = Array.isArray(data.authorizedEmailDetails) ? data.authorizedEmailDetails : [];

        const mergedEntries: AuthorizedStoreEmail[] = [];
        const allEmails = Array.from(new Set([superAdminEmail, ...rawEmails, ...rawDetails.map(d => d.email)]));

        for (const email of allEmails) {
          const isSuper = email.toLowerCase() === superAdminEmail.toLowerCase();
          const existing = rawDetails.find(d => d.email.toLowerCase() === email.toLowerCase());
          if (isSuper) {
            mergedEntries.push({
              email,
              packageExpiryDate: 'Lifetime',
              packageName: 'Super Admin Lifetime Access',
              updatedAt: existing?.updatedAt || new Date().toISOString(),
              updatedBy: superAdminEmail
            });
          } else if (existing) {
            mergedEntries.push({
              ...existing,
              packageExpiryDate: existing.packageExpiryDate || getDefaultOneYearDate(),
              packageName: existing.packageName || 'Annual Plan'
            });
          } else {
            mergedEntries.push({
              email,
              packageExpiryDate: getDefaultOneYearDate(),
              packageName: 'Annual Plan (1 Year)',
              updatedAt: new Date().toISOString(),
              updatedBy: superAdminEmail
            });
          }
        }

        setAuthorizedEntries(mergedEntries);
        setAuthorizedEmails(mergedEntries.map(e => e.email));
        localStorage.setItem('app_authorized_entries', JSON.stringify(mergedEntries));
        localStorage.setItem('app_authorized_emails', JSON.stringify(mergedEntries.map(e => e.email)));
      }
    }, (err) => {
      console.warn('Real-time listener notice for settings/general:', err);
    });

    return () => unsubscribe();
  }, [superAdminEmail]);

  // 2. Listen to Registered Users in the system
  useEffect(() => {
    const usersQuery = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const list: RegisteredUser[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as RegisteredUser);
      });

      // Sort: Pending users first, then by creation date
      list.sort((a, b) => {
        if (a.status === 'Pending' && b.status !== 'Pending') return -1;
        if (b.status === 'Pending' && a.status !== 'Pending') return 1;
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0;
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0;
        return timeB - timeA;
      });

      setRegisteredUsers(list);
    }, (err) => {
      console.warn('Real-time listener notice for users collection:', err);
    });

    return () => unsubscribeUsers();
  }, []);

  // Copy email helper
  const handleCopyEmail = async (emailToCopy: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(emailToCopy);
      } else {
        const el = document.createElement('textarea');
        el.value = emailToCopy;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopiedEmail(emailToCopy);
      toast.success(`Copied "${emailToCopy}"`);
      setTimeout(() => setCopiedEmail(null), 2000);
    } catch {
      toast.info(emailToCopy);
    }
  };

  // Add Email to Authorized List with Package Expiry Date
  const handleAddEmail = async () => {
    const emailToAdd = newEmail.trim().toLowerCase();

    if (!emailToAdd) {
      toast.warning('Please enter an email address to authorize.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailToAdd)) {
      toast.warning('Please enter a valid email address (e.g. user@example.com).');
      return;
    }

    if (authorizedEntries.some(e => e.email.toLowerCase() === emailToAdd)) {
      toast.info(`Email "${emailToAdd}" is already in the authorized list.`);
      setNewEmail('');
      return;
    }

    const finalExpiry = isLifetimeNew ? 'Lifetime' : (newExpiryDate || getDefaultOneYearDate());
    const finalPackageName = isLifetimeNew ? 'Lifetime Access' : (newPackageName.trim() || 'Annual Plan');

    const newEntry: AuthorizedStoreEmail = {
      email: emailToAdd,
      packageExpiryDate: finalExpiry,
      packageName: finalPackageName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: superAdminEmail
    };

    const updatedEntries = [...authorizedEntries, newEntry];
    const updatedEmails = updatedEntries.map(e => e.email);

    setAuthorizedEntries(updatedEntries);
    setAuthorizedEmails(updatedEmails);
    setNewEmail('');
    setNewExpiryDate(getDefaultOneYearDate());
    setIsLifetimeNew(false);
    localStorage.setItem('app_authorized_entries', JSON.stringify(updatedEntries));
    localStorage.setItem('app_authorized_emails', JSON.stringify(updatedEmails));

    // Save directly to Firestore settings/general
    setSavingEmails(true);
    try {
      await setDoc(doc(db, 'settings', 'general'), {
        authorizedEmails: updatedEmails,
        authorizedEmailDetails: updatedEntries,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || superAdminEmail
      }, { merge: true });

      // If user document already exists, sync expiry date and activate if pending
      const matchingUser = registeredUsers.find(u => u.email?.toLowerCase() === emailToAdd);
      if (matchingUser) {
        try {
          await updateDoc(doc(db, 'users', matchingUser.id), {
            status: 'Active',
            packageExpiryDate: finalExpiry,
            packageName: finalPackageName,
            authorizedAt: new Date().toISOString()
          });
          toast.success(`Email "${emailToAdd}" authorized with package expiry: ${finalExpiry}! User store activated.`);
        } catch {}
      } else {
        toast.success(`Email "${emailToAdd}" authorized with package expiry: ${finalExpiry}!`);
      }
    } catch (error) {
      console.error('Error updating authorized emails in Firestore:', error);
      toast.info(`"${emailToAdd}" added locally with expiry ${finalExpiry}. Click "Save to Cloud" to sync with Firestore.`);
    } finally {
      setSavingEmails(false);
    }
  };

  // Open inline editor for an authorized email's expiry date
  const handleStartEditExpiry = (entry: AuthorizedStoreEmail) => {
    setEditingEmail(entry.email);
    setIsEditLifetime(entry.packageExpiryDate === 'Lifetime');
    setEditExpiryDate(entry.packageExpiryDate === 'Lifetime' ? getDefaultOneYearDate() : (entry.packageExpiryDate || getDefaultOneYearDate()));
    setEditPackageName(entry.packageName || 'Annual Plan');
  };

  // Save updated package expiry date for an authorized email
  const handleSaveEditExpiry = async (emailToUpdate: string) => {
    setSavingEdit(true);
    try {
      const finalExpiry = isEditLifetime ? 'Lifetime' : (editExpiryDate || getDefaultOneYearDate());
      const finalPackageName = isEditLifetime ? 'Lifetime Access' : (editPackageName.trim() || 'Annual Plan');

      const updatedEntries = authorizedEntries.map(entry => {
        if (entry.email.toLowerCase() === emailToUpdate.toLowerCase()) {
          return {
            ...entry,
            packageExpiryDate: finalExpiry,
            packageName: finalPackageName,
            updatedAt: new Date().toISOString(),
            updatedBy: superAdminEmail
          };
        }
        return entry;
      });

      setAuthorizedEntries(updatedEntries);
      localStorage.setItem('app_authorized_entries', JSON.stringify(updatedEntries));

      await setDoc(doc(db, 'settings', 'general'), {
        authorizedEmails: updatedEntries.map(e => e.email),
        authorizedEmailDetails: updatedEntries,
        updatedAt: new Date().toISOString(),
        updatedBy: superAdminEmail
      }, { merge: true });

      // If user document exists, sync expiry
      const matchingUser = registeredUsers.find(u => u.email?.toLowerCase() === emailToUpdate.toLowerCase());
      if (matchingUser) {
        const isExpired = finalExpiry !== 'Lifetime' && new Date(finalExpiry + 'T23:59:59').getTime() < Date.now();
        await updateDoc(doc(db, 'users', matchingUser.id), {
          packageExpiryDate: finalExpiry,
          packageName: finalPackageName,
          status: isExpired ? 'Pending' : 'Active',
          packageUpdatedAt: new Date().toISOString()
        });

        const targetStoreId = matchingUser.storeId || matchingUser.id;
        if (targetStoreId) {
          try {
            await setDoc(doc(db, 'stores', targetStoreId), {
              packageExpiryDate: finalExpiry,
              packageName: finalPackageName,
              packageUpdatedAt: new Date().toISOString()
            }, { merge: true });
          } catch (storeErr) {
            console.warn('Notice: Could not sync package expiry to store doc', storeErr);
          }
        }
      }

      toast.success(`Package expiry date for "${emailToUpdate}" updated to ${finalExpiry}!`);
      setEditingEmail(null);
    } catch (error) {
      console.error('Error saving expiry date edit:', error);
      toast.error('Failed to update expiry in cloud. Changes cached locally.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Remove Email from Authorized List
  const handleRemoveEmail = async (emailToRemove: string) => {
    if (emailToRemove.toLowerCase() === superAdminEmail.toLowerCase()) {
      toast.error('Cannot remove Super Admin (aqeelaeo@gmail.com) from authorized list.');
      return;
    }

    if (!window.confirm(`Are you sure you want to revoke store authorization for ${emailToRemove}?`)) {
      return;
    }

    const updatedEntries = authorizedEntries.filter(e => e.email.toLowerCase() !== emailToRemove.toLowerCase());
    const updatedEmails = updatedEntries.map(e => e.email);

    setAuthorizedEntries(updatedEntries);
    setAuthorizedEmails(updatedEmails);
    localStorage.setItem('app_authorized_entries', JSON.stringify(updatedEntries));
    localStorage.setItem('app_authorized_emails', JSON.stringify(updatedEmails));

    setSavingEmails(true);
    try {
      await setDoc(doc(db, 'settings', 'general'), {
        authorizedEmails: updatedEmails,
        authorizedEmailDetails: updatedEntries,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || superAdminEmail
      }, { merge: true });

      // If matching registered user exists, set their status to Pending
      const matchingUser = registeredUsers.find(u => u.email?.toLowerCase() === emailToRemove.toLowerCase());
      if (matchingUser && matchingUser.status === 'Active') {
        try {
          await updateDoc(doc(db, 'users', matchingUser.id), {
            status: 'Pending',
            revokedAt: new Date().toISOString()
          });
        } catch {}
      }

      toast.success(`Authorization revoked for ${emailToRemove}`);
    } catch (error) {
      console.error('Error updating authorized emails in Firestore:', error);
      toast.info(`Revoked locally. Click "Save to Cloud" to sync.`);
    } finally {
      setSavingEmails(false);
    }
  };

  // Explicit Save to Cloud button
  const handleSaveToCloud = async () => {
    setSavingEmails(true);
    try {
      const entriesToSave = [...authorizedEntries];
      if (!entriesToSave.some(e => e.email.toLowerCase() === superAdminEmail.toLowerCase())) {
        entriesToSave.unshift({
          email: superAdminEmail,
          packageExpiryDate: 'Lifetime',
          packageName: 'Super Admin Lifetime Access',
          updatedAt: new Date().toISOString(),
          updatedBy: superAdminEmail
        });
      }

      const emailsToSave = entriesToSave.map(e => e.email);

      await setDoc(doc(db, 'settings', 'general'), {
        authorizedEmails: emailsToSave,
        authorizedEmailDetails: entriesToSave,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || superAdminEmail
      }, { merge: true });

      localStorage.setItem('app_authorized_entries', JSON.stringify(entriesToSave));
      localStorage.setItem('app_authorized_emails', JSON.stringify(emailsToSave));
      toast.success('Authorized emails and package expiry dates saved to Firebase Cloud!');
    } catch (error: any) {
      console.error('Error saving general settings:', error);
      if (error.code === 'permission-denied') {
        toast.error('Permission denied: Firestore requires Google Sign-In as Super Admin (aqeelaeo@gmail.com) to save system rules.');
      } else {
        toast.error('Failed to save to cloud. Changes are cached locally.');
      }
    } finally {
      setSavingEmails(false);
    }
  };

  // Approve a pending user from the user registry with package expiry
  const handleApproveUserStore = async (regUser: RegisteredUser) => {
    setActionLoadingId(regUser.id);
    try {
      const email = (regUser.email || '').toLowerCase().trim();
      const initialExpiry = getDefaultOneYearDate();
      const initialPackage = 'Annual Plan (1 Year)';

      let updatedEntries = [...authorizedEntries];
      let updatedEmails = [...authorizedEmails];

      if (email && !updatedEmails.some(e => e.toLowerCase() === email)) {
        updatedEmails.push(email);
        updatedEntries.push({
          email,
          packageExpiryDate: initialExpiry,
          packageName: initialPackage,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: superAdminEmail
        });

        setAuthorizedEmails(updatedEmails);
        setAuthorizedEntries(updatedEntries);
        localStorage.setItem('app_authorized_emails', JSON.stringify(updatedEmails));
        localStorage.setItem('app_authorized_entries', JSON.stringify(updatedEntries));

        await setDoc(doc(db, 'settings', 'general'), {
          authorizedEmails: updatedEmails,
          authorizedEmailDetails: updatedEntries,
          updatedAt: new Date().toISOString(),
          updatedBy: superAdminEmail
        }, { merge: true });
      }

      // Update user doc in Firestore
      await updateDoc(doc(db, 'users', regUser.id), {
        status: 'Active',
        role: regUser.role || 'Store Admin',
        packageExpiryDate: initialExpiry,
        packageName: initialPackage,
        authorizedAt: new Date().toISOString()
      });

      toast.success(`User store for ${regUser.email} approved! Package valid until: ${initialExpiry}`);
    } catch (err: any) {
      console.error('Error approving user store:', err);
      toast.error('Failed to approve user store. Check console for details.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Quick edit package expiry directly from user registry
  const handleSaveQuickUserExpiry = async (regUser: RegisteredUser) => {
    setSavingQuickUser(true);
    try {
      const finalExpiry = isQuickLifetime ? 'Lifetime' : (quickExpiryDate || getDefaultOneYearDate());
      const finalPkg = isQuickLifetime ? 'Lifetime Access' : (quickPackageName.trim() || 'Annual Plan');
      const email = (regUser.email || '').toLowerCase().trim();

      // 1. Update user doc
      const isExpired = finalExpiry !== 'Lifetime' && new Date(finalExpiry + 'T23:59:59').getTime() < Date.now();
      await updateDoc(doc(db, 'users', regUser.id), {
        packageExpiryDate: finalExpiry,
        packageName: finalPkg,
        status: isExpired ? 'Pending' : 'Active',
        packageUpdatedAt: new Date().toISOString()
      });

      // Also sync store doc directly
      const targetStoreId = regUser.storeId || regUser.id;
      if (targetStoreId) {
        try {
          await setDoc(doc(db, 'stores', targetStoreId), {
            packageExpiryDate: finalExpiry,
            packageName: finalPkg,
            packageUpdatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (storeErr) {
          console.warn('Notice: Could not sync package expiry to store doc', storeErr);
        }
      }

      // 2. Also ensure settings/general is kept in sync
      if (email) {
        let updatedEntries = [...authorizedEntries];
        const existingIdx = updatedEntries.findIndex(e => e.email.toLowerCase() === email);
        if (existingIdx >= 0) {
          updatedEntries[existingIdx] = {
            ...updatedEntries[existingIdx],
            packageExpiryDate: finalExpiry,
            packageName: finalPkg,
            updatedAt: new Date().toISOString(),
            updatedBy: superAdminEmail
          };
        } else {
          updatedEntries.push({
            email,
            packageExpiryDate: finalExpiry,
            packageName: finalPkg,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            updatedBy: superAdminEmail
          });
        }

        const updatedEmails = Array.from(new Set([...authorizedEmails, email]));
        setAuthorizedEntries(updatedEntries);
        setAuthorizedEmails(updatedEmails);
        localStorage.setItem('app_authorized_entries', JSON.stringify(updatedEntries));
        localStorage.setItem('app_authorized_emails', JSON.stringify(updatedEmails));

        await setDoc(doc(db, 'settings', 'general'), {
          authorizedEmails: updatedEmails,
          authorizedEmailDetails: updatedEntries,
          updatedAt: new Date().toISOString(),
          updatedBy: superAdminEmail
        }, { merge: true });
      }

      toast.success(`Package expiry for ${regUser.email} set to ${finalExpiry}!`);
      setQuickEditUserId(null);
    } catch (err) {
      console.error('Error saving user package expiry:', err);
      toast.error('Failed to update package expiry date.');
    } finally {
      setSavingQuickUser(false);
    }
  };

  // Revoke user store
  const handleRevokeUserStore = async (regUser: RegisteredUser) => {
    if (regUser.email?.toLowerCase() === superAdminEmail.toLowerCase()) {
      toast.error('Cannot revoke Super Admin account.');
      return;
    }

    if (!window.confirm(`Revoke store access for ${regUser.email}? User will be blocked until re-approved.`)) {
      return;
    }

    setActionLoadingId(regUser.id);
    try {
      const email = (regUser.email || '').toLowerCase().trim();
      const updatedEntries = authorizedEntries.filter(e => e.email.toLowerCase() !== email);
      const updatedEmails = updatedEntries.map(e => e.email);

      setAuthorizedEntries(updatedEntries);
      setAuthorizedEmails(updatedEmails);
      localStorage.setItem('app_authorized_entries', JSON.stringify(updatedEntries));
      localStorage.setItem('app_authorized_emails', JSON.stringify(updatedEmails));

      await setDoc(doc(db, 'settings', 'general'), {
        authorizedEmails: updatedEmails,
        authorizedEmailDetails: updatedEntries,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      await updateDoc(doc(db, 'users', regUser.id), {
        status: 'Pending',
        revokedAt: new Date().toISOString()
      });

      toast.success(`Store access revoked for ${regUser.email}`);
    } catch (err: any) {
      console.error('Error revoking user store:', err);
      toast.error('Failed to revoke access');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filter registered users
  const filteredUsers = registeredUsers.filter(u => {
    const matchesSearch = 
      (u.email || '').toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      (u.name || '').toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      (u.storeId || '').toLowerCase().includes(userSearchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (userStatusFilter === 'pending') return u.status === 'Pending';
    if (userStatusFilter === 'active') return u.status === 'Active';
    return true;
  });

  const pendingUsersCount = registeredUsers.filter(u => u.status === 'Pending').length;

  return (
    <div className="space-y-6">
      
      {/* 1. SUPER ADMIN AUTHORITY BANNER */}
      <div className="relative overflow-hidden rounded-2xl bg-linear-to-r from-[#0a382c] via-[#0d4a3b] to-slate-900 p-6 text-white shadow-xl">
        <div className="absolute -right-8 -bottom-8 w-44 h-44 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shadow-inner">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black tracking-tight text-white">
                  Super Admin Settings
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] uppercase tracking-wider shadow-xs">
                  Master Authority
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 font-bold text-[10px] uppercase">
                  Role: Admin
                </span>
              </div>
              <p className="text-xs text-emerald-150/90 mt-1">
                Sole authority: <strong className="text-white font-bold">{superAdminEmail}</strong> as Admin
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/15 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-emerald-100 font-semibold">Store & Package Expiry Authority Active</span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white/10 text-xs text-slate-200/90 leading-relaxed max-w-3xl">
          Super Admin is the <strong>sole authority</strong> who can authorize users to open and manage their own stores, and <strong>the only authority who can set or extend package expiry dates</strong>. When a package expires, store access is paused until renewed.
        </div>
      </div>

      {/* 2. FIELD OF AUTHORIZED EMAILS & PACKAGE EXPIRY DATES */}
      <div className="glass-panel shadow-sm rounded-2xl p-6 sm:p-8 bg-white border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#0a382c]">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Authorized Emails & Package Expiry Dates</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Set and control store authorization and subscription package expiry dates for each store owner.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-[#0a382c] border border-emerald-200 font-black text-xs">
              {authorizedEntries.length} {authorizedEntries.length === 1 ? 'Store Authorized' : 'Stores Authorized'}
            </span>
          </div>
        </div>

        {/* INPUT FORM: ADD AUTHORIZED EMAIL + PACKAGE EXPIRY DATE */}
        <div className="space-y-4 bg-slate-50/70 p-5 rounded-2xl border border-slate-200/80 mb-6">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-700 font-black" />
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Authorize New Store Owner & Set Package Expiry Date
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
            {/* 1. Email Field */}
            <div className="md:col-span-5">
              <label 
                htmlFor="authorizedEmailInput" 
                className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1"
              >
                Store Owner Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="authorizedEmailInput"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. storeowner@company.com"
                  className="glass-input block w-full pl-9 pr-3 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all bg-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddEmail();
                    }
                  }}
                />
              </div>
            </div>

            {/* 2. Expiry Date Field */}
            <div className="md:col-span-4">
              <div className="flex items-center justify-between mb-1">
                <label 
                  htmlFor="packageExpiryInput" 
                  className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider"
                >
                  Package Expiry Date
                </label>
                <button
                  type="button"
                  onClick={() => setIsLifetimeNew(!isLifetimeNew)}
                  className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition-colors",
                    isLifetimeNew ? "bg-amber-100 text-amber-900 border border-amber-300" : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  {isLifetimeNew ? '✨ Lifetime Active' : 'Set Lifetime'}
                </button>
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Calendar className="w-4 h-4" />
                </div>
                {isLifetimeNew ? (
                  <div className="w-full pl-9 pr-3 py-2 rounded-xl text-xs sm:text-sm font-bold bg-amber-50 text-amber-900 border border-amber-300 flex items-center">
                    ✨ Lifetime Unlimited Access
                  </div>
                ) : (
                  <input
                    id="packageExpiryInput"
                    type="date"
                    min={getTodayString()}
                    value={newExpiryDate}
                    onChange={(e) => setNewExpiryDate(e.target.value)}
                    className="glass-input block w-full pl-9 pr-3 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all bg-white"
                  />
                )}
              </div>
            </div>

            {/* 3. Package Plan Type */}
            <div className="md:col-span-3">
              <label 
                htmlFor="packagePlanSelect" 
                className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1"
              >
                Package Tier
              </label>
              <select
                id="packagePlanSelect"
                value={newPackageName}
                onChange={(e) => {
                  setNewPackageName(e.target.value);
                  if (e.target.value === 'Lifetime Access') {
                    setIsLifetimeNew(true);
                  } else if (e.target.value === 'Annual Plan (1 Year)') {
                    setIsLifetimeNew(false);
                    setNewExpiryDate(formatDateOffset(365));
                  } else if (e.target.value === '6 Months Plan') {
                    setIsLifetimeNew(false);
                    setNewExpiryDate(formatDateOffset(180));
                  } else if (e.target.value === '3 Months Plan') {
                    setIsLifetimeNew(false);
                    setNewExpiryDate(formatDateOffset(90));
                  } else if (e.target.value === '1 Month Plan') {
                    setIsLifetimeNew(false);
                    setNewExpiryDate(formatDateOffset(30));
                  }
                }}
                className="glass-input block w-full px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 border border-slate-200 bg-white"
              >
                <option value="Annual Plan (1 Year)">Annual Plan (1 Year)</option>
                <option value="6 Months Plan">6 Months Plan</option>
                <option value="3 Months Plan">3 Months Plan</option>
                <option value="1 Month Plan">1 Month Plan</option>
                <option value="Trial Plan (30 Days)">Trial Plan (30 Days)</option>
                <option value="Enterprise Plan">Enterprise Plan</option>
                <option value="Lifetime Access">✨ Lifetime Access</option>
              </select>
            </div>
          </div>

          {/* Quick preset duration buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] font-semibold text-slate-500 mr-1">Quick Presets:</span>
              <button
                type="button"
                onClick={() => {
                  setIsLifetimeNew(false);
                  setNewExpiryDate(formatDateOffset(30));
                  setNewPackageName('1 Month Plan');
                }}
                className="px-2 py-0.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold cursor-pointer transition-colors"
              >
                +1 Month
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLifetimeNew(false);
                  setNewExpiryDate(formatDateOffset(90));
                  setNewPackageName('3 Months Plan');
                }}
                className="px-2 py-0.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold cursor-pointer transition-colors"
              >
                +3 Months
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLifetimeNew(false);
                  setNewExpiryDate(formatDateOffset(180));
                  setNewPackageName('6 Months Plan');
                }}
                className="px-2 py-0.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold cursor-pointer transition-colors"
              >
                +6 Months
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLifetimeNew(false);
                  setNewExpiryDate(formatDateOffset(365));
                  setNewPackageName('Annual Plan (1 Year)');
                }}
                className="px-2 py-0.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-black cursor-pointer transition-colors"
              >
                +1 Year (Default)
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLifetimeNew(true);
                  setNewPackageName('Lifetime Access');
                }}
                className="px-2 py-0.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold cursor-pointer transition-colors"
              >
                ✨ Lifetime
              </button>
            </div>

            <button
              type="button"
              onClick={handleAddEmail}
              disabled={savingEmails || !newEmail.trim()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl shadow-md text-xs font-black transition-all disabled:opacity-50 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Authorize & Set Expiry</span>
            </button>
          </div>
        </div>

        {/* LIST OF CURRENTLY AUTHORIZED EMAILS WITH PACKAGE EXPIRY STATUS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Currently Authorized Store Owners & Package Expiries ({authorizedEntries.length})
            </span>
            <button
              type="button"
              onClick={handleSaveToCloud}
              disabled={savingEmails}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
            >
              <Save className={cn("w-3.5 h-3.5", savingEmails && "animate-spin")} />
              <span>{savingEmails ? 'Saving...' : 'Save to Cloud'}</span>
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-emerald-700 mb-2" />
              <span>Loading authorized emails and package expiry dates...</span>
            </div>
          ) : authorizedEntries.length > 0 ? (
            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-[#fbfdfc]">
              {authorizedEntries.map((entry, index) => {
                const isMasterSuperAdmin = entry.email.toLowerCase() === superAdminEmail.toLowerCase();
                const expiryInfo = getExpiryStatusInfo(entry.packageExpiryDate);
                const isEditingThis = editingEmail === entry.email;

                return (
                  <div key={`${entry.email}-${index}`} className="transition-colors hover:bg-white">
                    <div className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Left: Email and Authority */}
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <div className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white shadow-2xs mt-0.5 sm:mt-0",
                          isMasterSuperAdmin ? "bg-amber-500" : "bg-[#0a382c]"
                        )}>
                          {isMasterSuperAdmin ? <Crown className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs sm:text-sm font-black text-slate-900 truncate">
                              {entry.email}
                            </span>
                            {isMasterSuperAdmin ? (
                              <span className="px-2 py-0.2 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300">
                                Super Admin (Admin)
                              </span>
                            ) : (
                              <span className="px-2 py-0.2 rounded text-[9px] font-bold uppercase bg-emerald-100 text-emerald-900 border border-emerald-300">
                                Authorized Store Owner
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                            <span>Package: <strong className="text-slate-700 font-semibold">{entry.packageName || 'Annual Plan'}</strong></span>
                            <span>•</span>
                            <span className="font-mono text-[10px]">
                              {entry.packageExpiryDate === 'Lifetime' 
                                ? 'No expiration' 
                                : `Expires: ${entry.packageExpiryDate || 'Unset'}`}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Expiry badge & Action buttons */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {/* Status badge */}
                        <div className={cn(
                          "px-2.5 py-1 rounded-lg border text-[11px] font-black flex items-center gap-1.5 shadow-2xs",
                          expiryInfo.badgeClass
                        )}>
                          {expiryInfo.isLifetime ? (
                            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                          ) : (
                            <Clock className="w-3.5 h-3.5" />
                          )}
                          <span>{expiryInfo.label}</span>
                        </div>

                        {/* Edit Expiry Button (Only Super Admin can do this) */}
                        {!isMasterSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditingThis) {
                                setEditingEmail(null);
                              } else {
                                handleStartEditExpiry(entry);
                              }
                            }}
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer shadow-2xs",
                              isEditingThis 
                                ? "bg-slate-200 text-slate-800 border-slate-300"
                                : "bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-200"
                            )}
                            title="Set or extend package expiry date"
                          >
                            <CalendarClock className="w-3.5 h-3.5 text-emerald-700" />
                            <span>{isEditingThis ? 'Cancel' : 'Set Expiry'}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCopyEmail(entry.email)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Copy email"
                        >
                          {copiedEmail === entry.email ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>

                        {!isMasterSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => handleRemoveEmail(entry.email)}
                            className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Revoke store authorization"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* INLINE EXPIRY DATE EDITOR FOR THIS AUTHORIZED EMAIL */}
                    {isEditingThis && (
                      <div className="bg-emerald-50/60 p-4 border-t border-emerald-100/80 animate-in fade-in duration-150">
                        <div className="max-w-2xl space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                              <CalendarClock className="w-4 h-4 text-emerald-700" />
                              Update Package Expiry Date for {entry.email}
                            </span>
                            <span className="text-[11px] text-emerald-800 font-semibold">
                              (Only Super Admin can set this)
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                                New Expiry Date
                              </label>
                              {isEditLifetime ? (
                                <div className="w-full px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300">
                                  ✨ Lifetime Unlimited Access
                                </div>
                              ) : (
                                <input
                                  type="date"
                                  min={getTodayString()}
                                  value={editExpiryDate}
                                  onChange={(e) => setEditExpiryDate(e.target.value)}
                                  className="w-full px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-800 border border-slate-300 bg-white"
                                />
                              )}
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                                Package Plan Name
                              </label>
                              <input
                                type="text"
                                value={editPackageName}
                                onChange={(e) => setEditPackageName(e.target.value)}
                                placeholder="e.g. Annual Plan, Custom 6-Months"
                                className="w-full px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-800 border border-slate-300 bg-white"
                              />
                            </div>
                          </div>

                          {/* Quick extension buttons */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-[10px] font-semibold text-slate-500 mr-1">Extend:</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsEditLifetime(false);
                                  setEditExpiryDate(formatDateOffset(2));
                                  setEditPackageName('Expiring in 2 Days (Test)');
                                }}
                                className="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 text-[10px] font-bold cursor-pointer"
                                title="Set expiry to 2 days from now to test blinking dashboard warning"
                              >
                                +2 Days (Warning Test)
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsEditLifetime(false);
                                  setEditExpiryDate(formatDateOffset(30));
                                  setEditPackageName('1 Month Plan');
                                }}
                                className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold cursor-pointer"
                              >
                                +30 Days
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsEditLifetime(false);
                                  setEditExpiryDate(formatDateOffset(90));
                                  setEditPackageName('3 Months Plan');
                                }}
                                className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold cursor-pointer"
                              >
                                +90 Days
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsEditLifetime(false);
                                  setEditExpiryDate(formatDateOffset(365));
                                  setEditPackageName('Annual Plan (1 Year)');
                                }}
                                className="px-2 py-0.5 rounded bg-emerald-100/80 hover:bg-emerald-200 text-emerald-950 border border-emerald-300 text-[10px] font-black cursor-pointer"
                              >
                                +1 Year
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsEditLifetime(!isEditLifetime);
                                  if (!isEditLifetime) {
                                    setEditPackageName('Lifetime Access');
                                  }
                                }}
                                className={cn(
                                  "px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer border",
                                  isEditLifetime 
                                    ? "bg-amber-200 text-amber-950 border-amber-400 font-black"
                                    : "bg-white text-amber-900 border-amber-300 hover:bg-amber-50"
                                )}
                              >
                                ✨ Lifetime
                              </button>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingEmail(null)}
                                className="px-3 py-1 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200/60 cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEditExpiry(entry.email)}
                                disabled={savingEdit}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black bg-[#0a382c] hover:bg-[#0d4a3b] text-white shadow-xs cursor-pointer disabled:opacity-50"
                              >
                                <Save className={cn("w-3.5 h-3.5", savingEdit && "animate-spin")} />
                                <span>{savingEdit ? 'Saving...' : 'Save Expiry Date'}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
              No authorized emails added yet. Add an email above to authorize a store owner and set their package expiry date.
            </div>
          )}
        </div>
      </div>

      {/* 3. STORE REQUESTS & REGISTERED USERS MANAGEMENT */}
      <div className="glass-panel shadow-sm rounded-2xl p-6 sm:p-8 bg-white border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Store Approval & User Registry</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Review users who have registered. Super Admin can authorize store creation and set individual package expiry dates.
              </p>
            </div>
          </div>

          {pendingUsersCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>{pendingUsersCount} Store Approval Pending</span>
            </div>
          )}
        </div>

        {/* Filters and search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
              placeholder="Search by email, name, or store ID..."
              className="glass-input block w-full pl-8 pr-3 py-2 rounded-xl text-xs font-semibold text-slate-800 border border-slate-200"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setUserStatusFilter('all')}
              className={cn(
                "px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer",
                userStatusFilter === 'all' ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              )}
            >
              All ({registeredUsers.length})
            </button>
            <button
              type="button"
              onClick={() => setUserStatusFilter('pending')}
              className={cn(
                "px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer",
                userStatusFilter === 'pending' ? "bg-white text-amber-900 shadow-xs font-black" : "text-slate-600 hover:text-slate-900"
              )}
            >
              Pending ({pendingUsersCount})
            </button>
            <button
              type="button"
              onClick={() => setUserStatusFilter('active')}
              className={cn(
                "px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer",
                userStatusFilter === 'active' ? "bg-white text-emerald-900 shadow-xs font-black" : "text-slate-600 hover:text-slate-900"
              )}
            >
              Active ({registeredUsers.filter(u => u.status === 'Active').length})
            </button>
          </div>
        </div>

        {/* Registered Users Table / Cards */}
        {filteredUsers.length > 0 ? (
          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            {filteredUsers.map((regUser) => {
              const isSuper = regUser.email?.toLowerCase() === superAdminEmail.toLowerCase();
              const isPending = regUser.status === 'Pending';
              const isActionLoading = actionLoadingId === regUser.id;
              
              // Find matching authorized entry to get the exact package expiry
              const matchedEntry = authorizedEntries.find(e => e.email.toLowerCase() === regUser.email?.toLowerCase());
              const effectiveExpiry = isSuper ? 'Lifetime' : (matchedEntry?.packageExpiryDate || regUser.packageExpiryDate);
              const effectivePackageName = isSuper ? 'Super Admin Lifetime Access' : (matchedEntry?.packageName || regUser.packageName || 'Annual Plan');
              const expiryInfo = getExpiryStatusInfo(effectiveExpiry);
              const isQuickEditing = quickEditUserId === regUser.id;

              return (
                <div key={regUser.id} className="transition-colors">
                  <div 
                    className={cn(
                      "p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3",
                      isPending ? "bg-amber-50/50 hover:bg-amber-50" : "bg-white hover:bg-slate-50/60"
                    )}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shrink-0 shadow-2xs mt-0.5",
                        isSuper ? "bg-amber-500" : isPending ? "bg-amber-600" : "bg-[#0a382c]"
                      )}>
                        {isSuper ? <Crown className="w-4 h-4" /> : isPending ? <Clock className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs sm:text-sm font-black text-slate-900">
                            {regUser.name || regUser.email?.split('@')[0] || 'Store User'}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">
                            ({regUser.email})
                          </span>
                          <span className={cn(
                            "px-2 py-0.2 rounded text-[9px] font-black uppercase tracking-wider",
                            isPending 
                              ? "bg-amber-100 text-amber-900 border border-amber-300"
                              : "bg-emerald-100 text-emerald-900 border border-emerald-300"
                          )}>
                            {regUser.status || 'Active'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                          <span>Role: <strong className="text-slate-700 font-semibold">{regUser.role || 'Store Admin'}</strong></span>
                          <span>•</span>
                          <span>Package: <strong className="text-slate-700 font-semibold">{effectivePackageName}</strong></span>
                          <span>•</span>
                          <span className={cn("px-1.5 py-0.2 rounded text-[10px] font-bold border", expiryInfo.badgeClass)}>
                            {effectiveExpiry === 'Lifetime' ? '✨ Lifetime' : `Expires: ${effectiveExpiry || 'Unset'}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {!isSuper && (
                        <button
                          type="button"
                          onClick={() => {
                            if (isQuickEditing) {
                              setQuickEditUserId(null);
                            } else {
                              setQuickEditUserId(regUser.id);
                              setIsQuickLifetime(effectiveExpiry === 'Lifetime');
                              setQuickExpiryDate(effectiveExpiry === 'Lifetime' ? getDefaultOneYearDate() : (effectiveExpiry || getDefaultOneYearDate()));
                              setQuickPackageName(effectivePackageName);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer"
                          title="Set package expiry date"
                        >
                          <CalendarClock className="w-3.5 h-3.5 text-emerald-700" />
                          <span>{isQuickEditing ? 'Close' : 'Set Expiry'}</span>
                        </button>
                      )}

                      {isPending ? (
                        <button
                          type="button"
                          onClick={() => handleApproveUserStore(regUser)}
                          disabled={isActionLoading}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-black transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>{isActionLoading ? 'Approving...' : 'Authorize & Open Store'}</span>
                        </button>
                      ) : !isSuper ? (
                        <button
                          type="button"
                          onClick={() => handleRevokeUserStore(regUser)}
                          disabled={isActionLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>{isActionLoading ? 'Revoking...' : 'Revoke Access'}</span>
                        </button>
                      ) : (
                        <span className="px-2.5 py-1 text-[11px] font-black text-amber-800 bg-amber-100/60 rounded-lg">
                          Super Admin
                        </span>
                      )}
                    </div>
                  </div>

                  {/* QUICK INLINE EXPIRY EDITOR FOR REGISTRY ROW */}
                  {isQuickEditing && (
                    <div className="bg-slate-50 p-4 border-t border-slate-200 text-xs animate-in fade-in duration-150">
                      <div className="max-w-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 flex items-center gap-1.5">
                            <CalendarClock className="w-4 h-4 text-emerald-700" />
                            Set Package Expiry Date for {regUser.email}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Only Super Admin can set package expiry
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                              Expiry Date
                            </label>
                            {isQuickLifetime ? (
                              <div className="px-3 py-1.5 rounded-lg font-bold bg-amber-50 text-amber-900 border border-amber-300">
                                ✨ Lifetime Unlimited
                              </div>
                            ) : (
                              <input
                                type="date"
                                min={getTodayString()}
                                value={quickExpiryDate}
                                onChange={(e) => setQuickExpiryDate(e.target.value)}
                                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                              />
                            )}
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                              Package Plan
                            </label>
                            <input
                              type="text"
                              value={quickPackageName}
                              onChange={(e) => setQuickPackageName(e.target.value)}
                              placeholder="e.g. Annual Plan"
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setIsQuickLifetime(false);
                                setQuickExpiryDate(formatDateOffset(2));
                                setQuickPackageName('Expiring in 2 Days (Test)');
                              }}
                              className="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 text-[10px] font-bold cursor-pointer"
                              title="Set expiry to 2 days from now to test blinking warning on dashboard"
                            >
                              +2d (Warning Test)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsQuickLifetime(false);
                                setQuickExpiryDate(formatDateOffset(30));
                              }}
                              className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold cursor-pointer"
                            >
                              +30d
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsQuickLifetime(false);
                                setQuickExpiryDate(formatDateOffset(90));
                              }}
                              className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold cursor-pointer"
                            >
                              +90d
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsQuickLifetime(false);
                                setQuickExpiryDate(formatDateOffset(365));
                              }}
                              className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-300 text-[10px] font-bold cursor-pointer"
                            >
                              +1 Year
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsQuickLifetime(!isQuickLifetime)}
                              className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-300 text-[10px] font-bold cursor-pointer"
                            >
                              ✨ Lifetime
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setQuickEditUserId(null)}
                              className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveQuickUserExpiry(regUser)}
                              disabled={savingQuickUser}
                              className="px-3 py-1 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-lg font-bold text-xs shadow-xs cursor-pointer disabled:opacity-50"
                            >
                              {savingQuickUser ? 'Saving...' : 'Save Expiry Date'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
            {registeredUsers.length === 0 ? (
              <div className="space-y-1">
                <p className="font-semibold text-slate-700">No registered store users recorded yet.</p>
                <p className="text-[11px] text-slate-400">When users sign in to open a store, they will appear here for Super Admin approval and package expiry setting.</p>
              </div>
            ) : (
              <p>No registered users match your search criteria.</p>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
