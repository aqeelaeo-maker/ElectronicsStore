import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { Building2, CreditCard, FileText, Layers, Plus, Save, ShieldAlert, Store, Tag, Trash2 } from 'lucide-react';
import UserManagementSettings from '../components/UserManagementSettings';

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountTitle?: string;
  openingBalance?: number;
  balance?: number;
}

export interface ProductUnit {
  name: string;
  abbreviation: string;
}

export const DEFAULT_PRODUCT_UNITS: ProductUnit[] = [
  { name: 'Piece', abbreviation: 'Pcs' },
  { name: 'Box', abbreviation: 'Box' },
  { name: 'Packet', abbreviation: 'Pk' },
  { name: 'Set', abbreviation: 'Set' },
  { name: 'Kilogram', abbreviation: 'Kg' },
  { name: 'Meter', abbreviation: 'Mtr' },
  { name: 'Liter', abbreviation: 'Ltr' },
  { name: 'Dozen', abbreviation: 'Dzn' },
  { name: 'Carton', abbreviation: 'Ctn' }
];

export const DEFAULT_PRODUCT_CATEGORIES: string[] = [
  'Television',
  'Refrigerator',
  'Air Conditioner',
  'Mobile Phone',
  'Laptop',
  'Camera',
  'DVR',
  'Security System',
  'Accessories'
];

interface StoreSettings {
  name: string;
  logoUrl: string;
  phone: string;
  address: string;
  email: string;
  bankAccounts: BankAccount[];
  termsAndConditions?: string;
  units?: ProductUnit[];
  categories?: string[];
}

const compressImage = (base64Str: string, maxWidth = 250, maxHeight = 250): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const format = base64Str.includes('image/png') ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(format, 0.85));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};

export default function Settings() {
  const { role, storeId } = useAuth();
  const [authorizedEmails, setAuthorizedEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');

  const [newBankName, setNewBankName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [newOpeningBalance, setNewOpeningBalance] = useState('');

  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitAbbreviation, setNewUnitAbbreviation] = useState('');

  const [newCategoryName, setNewCategoryName] = useState('');
  
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({
    name: '',
    logoUrl: '',
    phone: '',
    address: '',
    email: '',
    bankAccounts: [],
    termsAndConditions: '',
    units: DEFAULT_PRODUCT_UNITS,
    categories: DEFAULT_PRODUCT_CATEGORIES
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
            const data = storeSnap.data();
            let loadedAccounts: BankAccount[] = [];
            if (Array.isArray(data.bankAccounts)) {
              loadedAccounts = data.bankAccounts.map((item: any) => {
                if (typeof item === 'string') {
                  return { bankName: 'Bank', accountNumber: item, openingBalance: 0, balance: 0 };
                }
                const opBal = typeof item.openingBalance === 'number' ? item.openingBalance : (parseFloat(item.openingBalance) || 0);
                const curBal = typeof item.balance === 'number' ? item.balance : (parseFloat(item.balance) || opBal);
                return {
                  bankName: item.bankName || '',
                  accountNumber: item.accountNumber || '',
                  accountTitle: item.accountTitle || '',
                  openingBalance: opBal,
                  balance: curBal
                };
              });
            }

            let loadedUnits: ProductUnit[] = DEFAULT_PRODUCT_UNITS;
            if (Array.isArray(data.units) && data.units.length > 0) {
              loadedUnits = data.units.map((item: any) => {
                if (typeof item === 'string') {
                  return { name: item, abbreviation: item };
                }
                return {
                  name: item.name || item.abbreviation || 'Unit',
                  abbreviation: item.abbreviation || item.name || 'Unit'
                };
              });
            }

            let loadedCategories: string[] = DEFAULT_PRODUCT_CATEGORIES;
            if (Array.isArray(data.categories) && data.categories.length > 0) {
              loadedCategories = data.categories
                .map((item: any) => typeof item === 'string' ? item.trim() : (item.name || String(item)).trim())
                .filter(Boolean);
            }

            setStoreSettings({
              name: data.name || '',
              logoUrl: data.logoUrl || '',
              phone: data.phone || '',
              address: data.address || '',
              email: data.email || '',
              bankAccounts: loadedAccounts,
              termsAndConditions: data.termsAndConditions || '',
              units: loadedUnits,
              categories: loadedCategories
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

  const handleAddBankAccount = () => {
    const bankName = newBankName.trim();
    const accountNumber = newAccountNumber.trim();
    const openingBalance = parseFloat(newOpeningBalance) || 0;

    if (!bankName && !accountNumber) {
      toast.warning('Please enter Bank Name or Account Number');
      return;
    }

    const newAccount: BankAccount = {
      bankName: bankName || 'Bank Account',
      accountNumber: accountNumber || 'N/A',
      openingBalance: openingBalance,
      balance: openingBalance
    };

    setStoreSettings(prev => ({
      ...prev,
      bankAccounts: [...(prev.bankAccounts || []), newAccount]
    }));

    setNewBankName('');
    setNewAccountNumber('');
    setNewOpeningBalance('');
    toast.info('Bank account added. Click "Save Store Details" to apply changes.');
  };

  const handleRemoveBankAccount = (indexToRemove: number) => {
    setStoreSettings(prev => ({
      ...prev,
      bankAccounts: (prev.bankAccounts || []).filter((_, i) => i !== indexToRemove)
    }));
  };

  const handleAddUnit = async () => {
    const name = newUnitName.trim();
    const abbreviation = newUnitAbbreviation.trim() || name;

    if (!name) {
      toast.warning('Please enter a Unit Name (e.g. Piece, Box, Kilogram)');
      return;
    }

    const currentUnits = storeSettings.units || [];
    const exists = currentUnits.some(
      u => u.name.toLowerCase() === name.toLowerCase() || 
           (abbreviation && u.abbreviation.toLowerCase() === abbreviation.toLowerCase())
    );

    if (exists) {
      toast.warning(`Unit "${name}" (${abbreviation}) already exists in the list`);
      return;
    }

    const updatedUnits = [...currentUnits, { name, abbreviation }];
    setStoreSettings(prev => ({
      ...prev,
      units: updatedUnits
    }));
    setNewUnitName('');
    setNewUnitAbbreviation('');

    if (storeId) {
      try {
        await setDoc(doc(db, 'stores', storeId), {
          units: updatedUnits,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        toast.success(`Unit "${name}" (${abbreviation}) added successfully`);
      } catch (err: any) {
        console.error('Error saving unit:', err);
        toast.info('Unit added locally. Click "Save Store Details" to apply changes.');
      }
    } else {
      toast.info('Unit added. Click "Save Store Details" to apply changes.');
    }
  };

  const handleRemoveUnit = async (indexToRemove: number) => {
    const currentUnits = storeSettings.units || [];
    const unitToRemove = currentUnits[indexToRemove];
    const updatedUnits = currentUnits.filter((_, i) => i !== indexToRemove);

    setStoreSettings(prev => ({
      ...prev,
      units: updatedUnits
    }));

    if (storeId) {
      try {
        await setDoc(doc(db, 'stores', storeId), {
          units: updatedUnits,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        toast.success(`Unit "${unitToRemove?.name || ''}" removed`);
      } catch (err: any) {
        console.error('Error deleting unit:', err);
      }
    }
  };

  const handleResetDefaultUnits = async () => {
    if (!window.confirm('Reset units to standard presets (Piece, Box, Packet, Set, Kilogram, Meter, Liter, Dozen, Carton)?')) {
      return;
    }

    setStoreSettings(prev => ({
      ...prev,
      units: DEFAULT_PRODUCT_UNITS
    }));

    if (storeId) {
      try {
        await setDoc(doc(db, 'stores', storeId), {
          units: DEFAULT_PRODUCT_UNITS,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        toast.success('Units reset to standard defaults successfully');
      } catch (err: any) {
        console.error('Error resetting units:', err);
      }
    }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();

    if (!name) {
      toast.warning('Please enter a Category Name (e.g. Television, Mobile Phone, Accessories)');
      return;
    }

    const currentCategories = storeSettings.categories || [];
    const exists = currentCategories.some(
      c => c.toLowerCase() === name.toLowerCase()
    );

    if (exists) {
      toast.warning(`Category "${name}" already exists in the list`);
      return;
    }

    const updatedCategories = [...currentCategories, name];
    setStoreSettings(prev => ({
      ...prev,
      categories: updatedCategories
    }));
    setNewCategoryName('');

    if (storeId) {
      try {
        await setDoc(doc(db, 'stores', storeId), {
          categories: updatedCategories,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        toast.success(`Category "${name}" added successfully`);
      } catch (err: any) {
        console.error('Error saving category:', err);
        toast.info('Category added locally. Click "Save Store Details" to apply changes.');
      }
    } else {
      toast.info('Category added. Click "Save Store Details" to apply changes.');
    }
  };

  const handleRemoveCategory = async (indexToRemove: number) => {
    const currentCategories = storeSettings.categories || [];
    const categoryToRemove = currentCategories[indexToRemove];
    const updatedCategories = currentCategories.filter((_, i) => i !== indexToRemove);

    setStoreSettings(prev => ({
      ...prev,
      categories: updatedCategories
    }));

    if (storeId) {
      try {
        await setDoc(doc(db, 'stores', storeId), {
          categories: updatedCategories,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        toast.success(`Category "${categoryToRemove || ''}" removed`);
      } catch (err: any) {
        console.error('Error deleting category:', err);
      }
    }
  };

  const handleResetDefaultCategories = async () => {
    if (!window.confirm('Reset categories to standard presets (Television, Refrigerator, Air Conditioner, Mobile Phone, Laptop, Camera, DVR, Security System, Accessories)?')) {
      return;
    }

    setStoreSettings(prev => ({
      ...prev,
      categories: DEFAULT_PRODUCT_CATEGORIES
    }));

    if (storeId) {
      try {
        await setDoc(doc(db, 'stores', storeId), {
          categories: DEFAULT_PRODUCT_CATEGORIES,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        toast.success('Categories reset to standard defaults successfully');
      } catch (err: any) {
        console.error('Error resetting categories:', err);
      }
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
    } catch (error: any) {
      console.error('Error saving store settings:', error);
      toast.error(`Failed to save store settings: ${error?.message || 'Unknown error'}`);
    } finally {
      setSavingStore(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a382c]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage system configurations and store details</p>
      </div>

      {/* User Management Section (Admin & User Roles) */}
      <UserManagementSettings />

      <div className="glass-panel shadow-sm rounded-2xl p-6 sm:p-8 bg-white border border-slate-200">
        <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
          <Store className="w-5 h-5 text-[#0a382c]" />
          <h2 className="text-lg font-bold text-slate-900">Store Profile</h2>
        </div>
        
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="storeName" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Store Name
              </label>
              <input
                type="text"
                id="storeName"
                className="glass-input block w-full rounded-xl py-2.5 px-4 text-xs font-semibold text-slate-800"
                value={storeSettings.name}
                onChange={(e) => setStoreSettings({...storeSettings, name: e.target.value})}
              />
            </div>
            
            <div>
              <label htmlFor="storeEmail" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Store Email Address
              </label>
              <input
                type="email"
                id="storeEmail"
                className="glass-input block w-full rounded-xl py-2.5 px-4 text-xs font-semibold text-slate-800"
                value={storeSettings.email}
                onChange={(e) => setStoreSettings({...storeSettings, email: e.target.value})}
              />
            </div>
            
            <div>
              <label htmlFor="storePhone" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Phone Number
              </label>
              <input
                type="text"
                id="storePhone"
                className="glass-input block w-full rounded-xl py-2.5 px-4 text-xs font-semibold text-slate-800"
                value={storeSettings.phone}
                onChange={(e) => setStoreSettings({...storeSettings, phone: e.target.value})}
              />
            </div>
            
            <div>
              <label htmlFor="storeLogo" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Store Logo
              </label>
              <div className="mt-1 flex items-center gap-4">
                {storeSettings.logoUrl && (
                  <div className="h-12 w-12 rounded-xl overflow-hidden bg-slate-50 border border-slate-200 flex-shrink-0">
                    <img src={storeSettings.logoUrl} alt="Store logo" className="h-full w-full object-cover" />
                  </div>
                )}
                <input
                  type="file"
                  id="storeLogo"
                  accept="image/*"
                  className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border file:border-emerald-150 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-800 hover:file:bg-emerald-100 transition-colors cursor-pointer"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = async () => {
                        const originalBase64 = reader.result as string;
                        try {
                          const compressed = await compressImage(originalBase64);
                          setStoreSettings({...storeSettings, logoUrl: compressed});
                        } catch (err) {
                          console.error('Error compressing logo:', err);
                          setStoreSettings({...storeSettings, logoUrl: originalBase64});
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </div>
            </div>
          </div>
          
          <div>
            <label htmlFor="storeAddress" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Store Address
            </label>
            <textarea
              id="storeAddress"
              rows={3}
              className="glass-input block w-full rounded-xl py-2.5 px-4 text-xs font-semibold text-slate-800"
              value={storeSettings.address}
              onChange={(e) => setStoreSettings({...storeSettings, address: e.target.value})}
            />
          </div>

          {/* Invoice Terms & Conditions Field Section */}
          <div className="pt-4 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <label htmlFor="storeTermsAndConditions" className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0a382c]" />
                Invoice Terms and Conditions
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStoreSettings(prev => ({
                    ...prev,
                    termsAndConditions: "1. Goods once sold will not be returned or refunded. Exchange is allowed within 3 days with original receipt.\n2. Warranty claims are subject to company/manufacturer terms. Physical, liquid, or electrical burn damage voids all warranty.\n3. Original invoice must be presented for any warranty claims or customer support."
                  }))}
                  className="text-[11px] font-bold text-[#0a382c] hover:text-[#0d4a3b] hover:underline"
                >
                  Insert Sample Terms
                </button>
                {storeSettings.termsAndConditions && (
                  <button
                    type="button"
                    onClick={() => setStoreSettings(prev => ({ ...prev, termsAndConditions: '' }))}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-2.5">
              These terms, warranty policies, return rules, or disclaimers will be displayed at the end of every printed sales invoice and receipt.
            </p>
            <textarea
              id="storeTermsAndConditions"
              rows={4}
              placeholder="e.g.&#10;1. Goods once sold will not be refunded. Exchange allowed within 3 days with original receipt.&#10;2. Warranty claims are subject to company policy. Physical or burn damage is not claimable.&#10;3. Please present this invoice for any warranty claims."
              className="glass-input block w-full rounded-xl py-2.5 px-4 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-[#0a382c]/20 leading-relaxed font-sans"
              value={storeSettings.termsAndConditions || ''}
              onChange={(e) => setStoreSettings({...storeSettings, termsAndConditions: e.target.value})}
            />
          </div>

          {/* Bank Accounts Field Section */}
          <div className="pt-4 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#0a382c]" />
              Store Bank Accounts
            </label>
            <p className="text-xs text-slate-500 mb-3">
              Add bank account details for your store. These can be displayed on sales invoices and receipts.
            </p>

            {/* Input Row with "Add" button at the end */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 mb-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div className="flex-1 min-w-0">
                <label htmlFor="newBankName" className="block text-[11px] font-bold text-slate-600 mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  id="newBankName"
                  placeholder="e.g. Chase / Meezan Bank"
                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 bg-white"
                  value={newBankName}
                  onChange={(e) => setNewBankName(e.target.value)}
                />
              </div>

              <div className="flex-1 min-w-0">
                <label htmlFor="newAccountNumber" className="block text-[11px] font-bold text-slate-600 mb-1">
                  Account / IBAN Number
                </label>
                <input
                  type="text"
                  id="newAccountNumber"
                  placeholder="e.g. 01234567890123"
                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 bg-white"
                  value={newAccountNumber}
                  onChange={(e) => setNewAccountNumber(e.target.value)}
                />
              </div>

              <div className="flex-1 min-w-0">
                <label htmlFor="newOpeningBalance" className="block text-[11px] font-bold text-slate-600 mb-1">
                  Opening Balance (PKR)
                </label>
                <input
                  type="number"
                  id="newOpeningBalance"
                  placeholder="0.00"
                  step="0.01"
                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 bg-white"
                  value={newOpeningBalance}
                  onChange={(e) => setNewOpeningBalance(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddBankAccount();
                    }
                  }}
                />
              </div>

              <button
                type="button"
                onClick={handleAddBankAccount}
                className="flex items-center justify-center px-5 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl shadow-sm transition-colors text-xs font-bold shrink-0 gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>

            {/* List of Added Bank Accounts */}
            {storeSettings.bankAccounts && storeSettings.bankAccounts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {storeSettings.bankAccounts.map((account, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs hover:border-slate-300 transition-colors"
                  >
                    <div className="space-y-1 min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-[#0a382c] shrink-0" />
                        <span className="text-xs font-bold text-slate-900 truncate">{account.bankName}</span>
                      </div>
                      <p className="text-xs font-mono font-bold text-slate-700 truncate">
                        Acc: {account.accountNumber}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px]">
                        <span className="text-emerald-700 font-extrabold font-mono">
                          Balance: PKR {(account.balance !== undefined ? account.balance : (account.openingBalance ?? 0)).toFixed(2)}
                        </span>
                        <span className="text-slate-400 font-medium">
                          (Opening: PKR {(account.openingBalance ?? 0).toFixed(2)})
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveBankAccount(index)}
                      className="text-rose-500 hover:text-rose-600 transition-colors p-1.5 rounded-lg hover:bg-rose-50 shrink-0"
                      title="Remove bank account"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center bg-slate-50/50">
                <p className="text-xs text-slate-400 italic">No bank accounts added yet.</p>
              </div>
            )}
          </div>

          {/* Product Categories Section */}
          <div className="pt-6 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#0a382c]" />
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Product Categories
                </label>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {storeSettings.categories?.length || 0} Categories
                </span>
              </div>
              <button
                type="button"
                onClick={handleResetDefaultCategories}
                className="text-[11px] font-bold text-[#0a382c] hover:text-[#0d4a3b] hover:underline self-start sm:self-auto cursor-pointer"
              >
                Reset to Standard Presets
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Define and manage product categories for your store (e.g. Television, Refrigerator, Mobile Phone, Accessories). These categories will be available in the <strong>Category</strong> dropdown when adding or updating products in <strong>Add Product</strong>.
            </p>

            {/* Input Row with "Add Category" button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 mb-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div className="flex-1 min-w-0">
                <label htmlFor="newCategoryName" className="block text-[11px] font-bold text-slate-600 mb-1">
                  Category Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  id="newCategoryName"
                  placeholder="e.g. Television, Laptops, Mobile Phone, Solar Panels, Groceries..."
                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 bg-white"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCategory();
                    }
                  }}
                />
              </div>

              <button
                type="button"
                onClick={handleAddCategory}
                className="flex items-center justify-center px-5 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl shadow-xs transition-colors text-xs font-bold shrink-0 gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Category
              </button>
            </div>

            {/* List of Categories */}
            {storeSettings.categories && storeSettings.categories.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {storeSettings.categories.map((category, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white shadow-2xs hover:border-emerald-300 transition-all group"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-50 text-[#0a382c] flex items-center justify-center shrink-0 border border-emerald-150">
                        <Tag className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-slate-900 truncate" title={category}>
                        {category}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCategory(index)}
                      className="text-slate-400 hover:text-rose-600 transition-colors p-1.5 rounded-lg hover:bg-rose-50 shrink-0 cursor-pointer"
                      title={`Delete category "${category}"`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center bg-slate-50/50">
                <p className="text-xs text-slate-400 italic">No product categories added yet. Enter a category above or click "Reset to Standard Presets".</p>
              </div>
            )}
          </div>

          {/* Product Units of Measurement Section */}
          <div className="pt-6 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#0a382c]" />
                Product Units of Measurement
              </label>
              <button
                type="button"
                onClick={handleResetDefaultUnits}
                className="text-[11px] font-bold text-[#0a382c] hover:text-[#0d4a3b] hover:underline self-start sm:self-auto cursor-pointer"
              >
                Reset to Standard Presets
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Define the units of measurement for your products (e.g. Piece, Box, Kilogram, Meter, Set). These units will be selectable in the <strong>Unit of Measure</strong> dropdown when creating or updating products in <strong>Add Product</strong>.
            </p>

            {/* Input Row with "Add Unit" button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 mb-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div className="flex-1 min-w-0">
                <label htmlFor="newUnitName" className="block text-[11px] font-bold text-slate-600 mb-1">
                  Unit Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  id="newUnitName"
                  placeholder="e.g. Piece, Box, Kilogram, Meter, Roll, Set"
                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 bg-white"
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddUnit();
                    }
                  }}
                />
              </div>

              <div className="w-full sm:w-48">
                <label htmlFor="newUnitAbbreviation" className="block text-[11px] font-bold text-slate-600 mb-1">
                  Abbreviation / Symbol
                </label>
                <input
                  type="text"
                  id="newUnitAbbreviation"
                  placeholder="e.g. Pcs, Box, Kg, Mtr, Rl, Set"
                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 bg-white"
                  value={newUnitAbbreviation}
                  onChange={(e) => setNewUnitAbbreviation(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddUnit();
                    }
                  }}
                />
              </div>

              <button
                type="button"
                onClick={handleAddUnit}
                className="flex items-center justify-center px-5 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl shadow-xs transition-colors text-xs font-bold shrink-0 gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Unit
              </button>
            </div>

            {/* List of Units */}
            {storeSettings.units && storeSettings.units.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {storeSettings.units.map((unit, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white shadow-2xs hover:border-emerald-300 transition-all group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 truncate" title={unit.name}>
                          {unit.name}
                        </span>
                      </div>
                      {unit.abbreviation && (
                        <span className="inline-block mt-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-150">
                          {unit.abbreviation}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveUnit(index)}
                      className="text-slate-400 hover:text-rose-600 transition-colors p-1.5 rounded-lg hover:bg-rose-50 shrink-0 cursor-pointer"
                      title={`Remove unit "${unit.name}"`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center bg-slate-50/50">
                <p className="text-xs text-slate-400 italic">No units configured. Click "Reset to Standard Presets" to add standard defaults.</p>
              </div>
            )}
          </div>
          
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveStore}
              disabled={savingStore}
              className="flex items-center px-5 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl shadow-md transition-colors text-xs font-black disabled:opacity-50 shadow-emerald-950/10"
            >
              <Save className="w-4 h-4 mr-2" />
              {savingStore ? 'Saving...' : 'Save Store Details'}
            </button>
          </div>
        </div>
      </div>

      {role === 'Super Admin' && (
        <div className="glass-panel shadow-sm rounded-2xl p-6 sm:p-8 mt-6 bg-white border border-slate-200">
          <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
            <ShieldAlert className="w-5 h-5 text-rose-500" />
            <h2 className="text-lg font-bold text-slate-900">Store Authorization (Super Admin Only)</h2>
          </div>
          
          <div className="space-y-6">
            <div>
              <label htmlFor="newEmail" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Authorized Emails
              </label>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Users with these emails will be automatically approved to create and open their stores.
              </p>
              
              <div className="flex items-center gap-3 mb-4">
                <input
                  type="email"
                  id="newEmail"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="glass-input flex-1 block w-full rounded-xl py-2.5 px-4 text-xs font-semibold text-slate-800"
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
                  className="px-5 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl shadow-sm transition-colors text-xs font-bold"
                >
                  Add
                </button>
              </div>

              {authorizedEmails.length > 0 ? (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-[#f8faf9]">
                  {authorizedEmails.map((email, index) => (
                    <li key={index} className="flex justify-between items-center py-3 px-4 hover:bg-slate-50 transition-colors">
                      <span className="text-sm font-bold text-slate-850">{email}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveEmail(email)}
                        className="text-red-500 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50"
                        title="Remove email"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500 italic py-2">No authorized emails added yet.</p>
              )}
            </div>
            
            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveGeneral}
                disabled={savingGeneral}
                className="flex items-center px-5 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-xs font-bold disabled:opacity-50 shadow-sm"
              >
                <Save className="w-4 h-4 mr-2" />
                {savingGeneral ? 'Saving...' : 'Save Authorized Emails'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
