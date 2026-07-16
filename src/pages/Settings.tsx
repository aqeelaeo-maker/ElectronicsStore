import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { Save, ShieldAlert } from 'lucide-react';

export default function Settings() {
  const { role } = useAuth();
  const [authorizedEmails, setAuthorizedEmails] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'general');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists() && docSnap.data().authorizedEmails) {
          setAuthorizedEmails(docSnap.data().authorizedEmails.join(', '));
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    };

    if (role === 'Super Admin') {
      fetchSettings();
    } else {
      setLoading(false);
    }
  }, [role]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const emailList = authorizedEmails
        .split(',')
        .map(email => email.trim())
        .filter(email => email.length > 0);
        
      await setDoc(doc(db, 'settings', 'general'), {
        authorizedEmails: emailList
      }, { merge: true });
      
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (role !== 'Super Admin') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <ShieldAlert className="w-16 h-16 text-yellow-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-500 max-w-md">
          Only the Super Admin can access the system settings. Your current role is {role}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage system configurations and authorizations</p>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Store Authorization</h2>
        
        {loading ? (
          <div className="flex justify-center p-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
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
                onClick={handleSave}
                disabled={saving}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium disabled:opacity-50"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
