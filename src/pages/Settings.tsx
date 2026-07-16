import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { Save, ShieldAlert, Store } from 'lucide-react';

interface StoreSettings {
  name: string;
  logoUrl: string;
  phone: string;
  address: string;
  email: string;
}

export default function Settings() {
  const { role, storeId } = useAuth();
  const [authorizedEmails, setAuthorizedEmails] = useState<string>('');
  
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
            setAuthorizedEmails(generalSnap.data().authorizedEmails.join(', '));
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
      const emailList = authorizedEmails
        .split(',')
        .map(email => email.trim())
        .filter(email => email.length > 0);
        
      await setDoc(doc(db, 'settings', 'general'), {
        authorizedEmails: emailList
      }, { merge: true });
      
      toast.success('General settings saved successfully');
    } catch (error) {
      console.error('Error saving general settings:', error);
      toast.error('Failed to save general settings');
    } finally {
      setSavingGeneral(false);
    }
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
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage system configurations and store details</p>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Store className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-medium text-gray-900">Store Profile</h2>
        </div>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="storeName" className="block text-sm font-medium text-gray-700">
                Store Name
              </label>
              <input
                type="text"
                id="storeName"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={storeSettings.name}
                onChange={(e) => setStoreSettings({...storeSettings, name: e.target.value})}
              />
            </div>
            
            <div>
              <label htmlFor="storeEmail" className="block text-sm font-medium text-gray-700">
                Store Email Address
              </label>
              <input
                type="email"
                id="storeEmail"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={storeSettings.email}
                onChange={(e) => setStoreSettings({...storeSettings, email: e.target.value})}
              />
            </div>
            
            <div>
              <label htmlFor="storePhone" className="block text-sm font-medium text-gray-700">
                Phone Number
              </label>
              <input
                type="text"
                id="storePhone"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={storeSettings.phone}
                onChange={(e) => setStoreSettings({...storeSettings, phone: e.target.value})}
              />
            </div>
            
            <div>
              <label htmlFor="storeLogo" className="block text-sm font-medium text-gray-700">
                Store Logo URL
              </label>
              <input
                type="url"
                id="storeLogo"
                placeholder="https://example.com/logo.png"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={storeSettings.logoUrl}
                onChange={(e) => setStoreSettings({...storeSettings, logoUrl: e.target.value})}
              />
            </div>
          </div>
          
          <div>
            <label htmlFor="storeAddress" className="block text-sm font-medium text-gray-700">
              Store Address
            </label>
            <textarea
              id="storeAddress"
              rows={3}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              value={storeSettings.address}
              onChange={(e) => setStoreSettings({...storeSettings, address: e.target.value})}
            />
          </div>
          
          <div className="flex justify-end">
            <button
              onClick={handleSaveStore}
              disabled={savingStore}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {savingStore ? 'Saving...' : 'Save Store Details'}
            </button>
          </div>
        </div>
      </div>

      {role === 'Super Admin' && (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="w-5 h-5 text-gray-700" />
            <h2 className="text-lg font-medium text-gray-900">Store Authorization (Super Admin Only)</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="authorizedEmails" className="block text-sm font-medium text-gray-700">
                Authorized Emails (comma separated)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Users with these emails will be automatically approved to create and open their stores.
              </p>
              <textarea
                id="authorizedEmails"
                rows={4}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="example1@gmail.com, example2@gmail.com"
                value={authorizedEmails}
                onChange={(e) => setAuthorizedEmails(e.target.value)}
              />
            </div>
            
            <div className="flex justify-end">
              <button
                onClick={handleSaveGeneral}
                disabled={savingGeneral}
                className="flex items-center px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors shadow-sm text-sm font-medium disabled:opacity-50"
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
