import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { Save, ShieldAlert, Store, Trash2 } from 'lucide-react';

interface StoreSettings {
  name: string;
  logoUrl: string;
  phone: string;
  address: string;
  email: string;
}

export default function Settings() {
  const { role, storeId } = useAuth();
  const [authorizedEmails, setAuthorizedEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({
    name: '',
    logoUrl: '',
    phone: '',
    address: '',
    email: ''
  });

  const [loading, setLoading] = useState(true);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingStore, setSavingStore] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        if (role === 'Super Admin') {
          const generalRef = doc(db, 'settings', 'general');
          const generalSnap = await getDoc(generalRef);
          
          if (generalSnap.exists() && generalSnap.data().authorizedEmails) {
            setAuthorizedEmails(generalSnap.data().authorizedEmails);
          }
        }

        if (storeId) {
          const storeRef = doc(db, 'stores', storeId);
          const storeSnap = await getDoc(storeRef);
          
          if (storeSnap.exists()) {
            setStoreSettings({
              name: storeSnap.data().name || '',
              logoUrl: storeSnap.data().logoUrl || '',
              phone: storeSnap.data().phone || '',
              address: storeSnap.data().address || '',
              email: storeSnap.data().email || ''
            });
          }
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [role, storeId]);

  const handleSaveGeneral = async () => {
    setSavingGeneral(true);
    try {
      await setDoc(doc(db, 'settings', 'general'), {
        authorizedEmails: authorizedEmails
      }, { merge: true });
      
      toast.success('General settings saved successfully');
    } catch (error) {
      console.error('Error saving general settings:', error);
      toast.error('Failed to save general settings');
    } finally {
      setSavingGeneral(false);
    }
  };

  const handleAddEmail = () => {
    const email = newEmail.trim();
    if (email && !authorizedEmails.includes(email)) {
      setAuthorizedEmails([...authorizedEmails, email]);
      setNewEmail('');
    } else if (authorizedEmails.includes(email)) {
      toast.warning('Email already in list');
    }
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setAuthorizedEmails(authorizedEmails.filter(e => e !== emailToRemove));
  };

  const handleSaveStore = async () => {
    if (!storeId) return;
    setSavingStore(true);
    try {
      await setDoc(doc(db, 'stores', storeId), {
        ...storeSettings,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      toast.success('Store settings saved successfully');
    } catch (error) {
      console.error('Error saving store settings:', error);
      toast.error('Failed to save store settings');
    } finally {
      setSavingStore(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Manage system configurations and store details</p>
      </div>

      <div className="glass-panel shadow-xl rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <Store className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-bold text-white">Store Profile</h2>
        </div>
        
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="storeName" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Store Name
              </label>
              <input
                type="text"
                id="storeName"
                className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm"
                value={storeSettings.name}
                onChange={(e) => setStoreSettings({...storeSettings, name: e.target.value})}
              />
            </div>
            
            <div>
              <label htmlFor="storeEmail" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Store Email Address
              </label>
              <input
                type="email"
                id="storeEmail"
                className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm"
                value={storeSettings.email}
                onChange={(e) => setStoreSettings({...storeSettings, email: e.target.value})}
              />
            </div>
            
            <div>
              <label htmlFor="storePhone" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Phone Number
              </label>
              <input
                type="text"
                id="storePhone"
                className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm"
                value={storeSettings.phone}
                onChange={(e) => setStoreSettings({...storeSettings, phone: e.target.value})}
              />
            </div>
            
            <div>
              <label htmlFor="storeLogo" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Store Logo
              </label>
              <div className="mt-1 flex items-center gap-4">
                {storeSettings.logoUrl && (
                  <div className="h-12 w-12 rounded-xl overflow-hidden bg-slate-900 border border-white/10 flex-shrink-0">
                    <img src={storeSettings.logoUrl} alt="Store logo" className="h-full w-full object-cover" />
                  </div>
                )}
                <input
                  type="file"
                  id="storeLogo"
                  accept="image/*"
                  className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-white/5 file:text-slate-300 hover:file:bg-white/10 transition-colors cursor-pointer"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setStoreSettings({...storeSettings, logoUrl: reader.result as string});
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </div>
            </div>
          </div>
          
          <div>
            <label htmlFor="storeAddress" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Store Address
            </label>
            <textarea
              id="storeAddress"
              rows={3}
              className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm"
              value={storeSettings.address}
              onChange={(e) => setStoreSettings({...storeSettings, address: e.target.value})}
            />
          </div>
          
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveStore}
              disabled={savingStore}
              className="flex items-center px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-950 rounded-xl shadow-md shadow-white/5 transition-colors text-sm font-bold disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {savingStore ? 'Saving...' : 'Save Store Details'}
            </button>
          </div>
        </div>
      </div>

      {role === 'Super Admin' && (
        <div className="glass-panel shadow-xl rounded-2xl p-6 sm:p-8 mt-6">
          <div className="flex items-center gap-3 mb-6">
            <ShieldAlert className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-bold text-white">Store Authorization (Super Admin Only)</h2>
          </div>
          
          <div className="space-y-6">
            <div>
              <label htmlFor="newEmail" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                Authorized Emails
              </label>
              <p className="text-xs text-slate-400 mb-4">
                Users with these emails will be automatically approved to create and open their stores.
              </p>
              
              <div className="flex items-center gap-3 mb-4">
                <input
                  type="email"
                  id="newEmail"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="glass-input flex-1 block w-full rounded-xl py-2.5 px-4 sm:text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddEmail();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddEmail}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-950 rounded-xl shadow-md shadow-white/5 transition-colors text-sm font-bold"
                >
                  Add
                </button>
              </div>

              {authorizedEmails.length > 0 ? (
                <ul className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-slate-950/20">
                  {authorizedEmails.map((email, index) => (
                    <li key={index} className="flex justify-between items-center py-3 px-4 hover:bg-white/5 transition-colors">
                      <span className="text-sm font-semibold text-slate-200">{email}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveEmail(email)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                        title="Remove email"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500 italic py-2">No authorized emails added yet.</p>
              )}
            </div>
            
            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveGeneral}
                disabled={savingGeneral}
                className="flex items-center px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors text-sm font-semibold disabled:opacity-50"
              >
                <Save className="w-4 h-4 mr-2" />
                {savingGeneral ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
