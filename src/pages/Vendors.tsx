import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Plus, Search, Edit2, Trash2, Building2, Receipt, Wallet, Clock, CheckCircle2, Phone, MapPin, Mail } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import VendorLedgerView from '../components/VendorLedgerView';

interface Vendor {
  id: string;
  name?: string;
  companyName: string;
  contactPerson?: string;
  mobile?: string;
  phone: string;
  email: string;
  city: string;
  address?: string;
  balance: number;
  openingBalance?: number;
  initialBalance?: number;
  remainingAmount?: number;
  totalPurchases?: number;
  totalPaid?: number;
  lastPaymentAmount?: number;
  lastPaymentDate?: any;
  storeId?: string;
  createdAt?: any;
  updatedAt?: any;
}

export default function Vendors() {
  const { storeId, role } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [ledgerVendor, setLedgerVendor] = useState<Vendor | null>(null);

  useEffect(() => {
    if (!storeId) return;

    const q = query(collection(db, 'vendors'), where('storeId', '==', storeId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Vendor[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Vendor);
      });

      data.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      setVendors(data);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching vendors:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [storeId]);

  // Real-time stock purchases and payments subscription to compute accurate vendor ledger balances
  useEffect(() => {
    if (!storeId) return;

    const qPurchases = query(collection(db, 'inventory_history'), where('storeId', '==', storeId));
    const unsubPurchases = onSnapshot(qPurchases, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setPurchases(list);
    }, (err) => {
      console.error('Error fetching inventory history for vendors:', err);
    });

    const qPayments = query(collection(db, 'vendorPayments'), where('storeId', '==', storeId));
    const unsubPayments = onSnapshot(qPayments, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setPayments(list);
    }, (err) => {
      console.error('Error fetching vendor payments:', err);
    });

    return () => {
      unsubPurchases();
      unsubPayments();
    };
  }, [storeId]);

  // 1. Initial / Opening balance for a vendor
  const getVendorInitialBalance = (vendor: Vendor): number => {
    if (vendor.openingBalance !== undefined && vendor.openingBalance !== null && !isNaN(Number(vendor.openingBalance))) {
      return Number(vendor.openingBalance);
    }
    if (vendor.initialBalance !== undefined && vendor.initialBalance !== null && !isNaN(Number(vendor.initialBalance))) {
      return Number(vendor.initialBalance);
    }
    // If no purchases exist for this vendor, balance is their initial balance
    const vendPurchases = purchases.filter(p => p.vendorId === vendor.id);
    if (vendPurchases.length === 0 && vendor.balance !== undefined && !isNaN(Number(vendor.balance))) {
      return Number(vendor.balance);
    }
    return 0;
  };

  // 2. Net Payables for a vendor (consistent with VendorLedgerView)
  const getVendorNetPayable = (vendor: Vendor): number => {
    if (vendor.remainingAmount !== undefined && vendor.remainingAmount !== null && !isNaN(Number(vendor.remainingAmount))) {
      return Number(vendor.remainingAmount);
    }
    if (vendor.balance !== undefined && vendor.balance !== null && !isNaN(Number(vendor.balance))) {
      return Number(vendor.balance);
    }

    const initial = getVendorInitialBalance(vendor);
    const vendPurchases = purchases.filter(p => p.vendorId === vendor.id);
    let totalPending = 0;
    vendPurchases.forEach(p => {
      const cost = p.totalCost !== undefined ? p.totalCost : ((p.purchasePrice || 0) * (p.quantityAdded || 1));
      const paid = p.paymentDone !== undefined ? p.paymentDone : (p.paymentStatus === 'Paid' ? cost : 0);
      const pending = p.remainingAmount !== undefined ? p.remainingAmount : Math.max(0, cost - paid);
      totalPending += pending;
    });

    return Number((initial + totalPending).toFixed(2));
  };

  const getVendorPurchasesTotal = (vendor: Vendor): number => {
    if (vendor.totalPurchases !== undefined && vendor.totalPurchases > 0) {
      return vendor.totalPurchases;
    }
    const vendPurchases = purchases.filter(p => p.vendorId === vendor.id);
    return vendPurchases.reduce((sum, p) => {
      const cost = p.totalCost !== undefined ? p.totalCost : ((p.purchasePrice || 0) * (p.quantityAdded || 1));
      return sum + cost;
    }, 0);
  };

  const getVendorPaidTotal = (vendor: Vendor): number => {
    if (vendor.totalPaid !== undefined && vendor.totalPaid > 0) {
      return vendor.totalPaid;
    }
    const vendPayments = payments.filter(p => p.vendorId === vendor.id);
    return vendPayments.reduce((sum, p) => {
      return sum + (p.paidAmount || p.paymentDone || 0);
    }, 0);
  };

  // Financial summary metrics matching Customers module
  const { totalNetPayables, vendorsDueCount, settledAccountsCount } = useMemo(() => {
    let total = 0;
    let dueCount = 0;
    let settledCount = 0;

    vendors.forEach(v => {
      const net = getVendorNetPayable(v);
      total += net;
      if (net > 0) {
        dueCount++;
      } else {
        settledCount++;
      }
    });

    return {
      totalNetPayables: Number(total.toFixed(2)),
      vendorsDueCount: dueCount,
      settledAccountsCount: settledCount
    };
  }, [vendors, purchases, payments]);

  // Automatically keep vendor balance in Firestore reconciled
  useEffect(() => {
    if (loading || vendors.length === 0) return;

    vendors.forEach(async (v) => {
      const netBal = getVendorNetPayable(v);
      const currentStored = typeof v.remainingAmount === 'number' 
        ? v.remainingAmount 
        : (typeof v.balance === 'number' ? v.balance : (parseFloat(v.balance as any) || 0));
      if (Math.abs(currentStored - netBal) > 0.01) {
        try {
          const vendRef = doc(db, 'vendors', v.id);
          await updateDoc(vendRef, {
            balance: netBal,
            remainingAmount: netBal,
            updatedAt: serverTimestamp()
          });
        } catch (syncErr) {
          console.warn(`Could not auto-sync balance for vendor ${v.companyName || v.name}:`, syncErr);
        }
      }
    });
  }, [vendors, purchases, loading]);

  const handleAddVendor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!storeId) {
      toast.error('Store ID not found');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const nameVal = (formData.get('name') || formData.get('companyName') || '').toString();
    const mobileVal = (formData.get('mobile') || formData.get('phone') || '').toString();
    const emailVal = (formData.get('email') || '').toString();
    const cityVal = (formData.get('city') || '').toString();
    const addressVal = (formData.get('address') || '').toString();
    const balanceVal = Number(formData.get('balance')) || 0;

    const newVendor = {
      name: nameVal,
      companyName: nameVal,
      contactPerson: nameVal,
      mobile: mobileVal,
      phone: mobileVal,
      email: emailVal,
      city: cityVal,
      address: addressVal,
      balance: balanceVal,
      openingBalance: balanceVal,
      initialBalance: balanceVal,
      remainingAmount: balanceVal,
      totalPurchases: 0,
      totalPaid: 0,
      storeId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, 'vendors'), newVendor);
      toast.success('Vendor added successfully');
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding vendor:', error);
      toast.error('Failed to add vendor');
    }
  };

  const handleUpdateVendor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingVendor) return;

    const formData = new FormData(e.currentTarget);
    const nameVal = (formData.get('name') || formData.get('companyName') || '').toString();
    const mobileVal = (formData.get('mobile') || formData.get('phone') || '').toString();
    const emailVal = (formData.get('email') || '').toString();
    const cityVal = (formData.get('city') || '').toString();
    const addressVal = (formData.get('address') || '').toString();
    const balanceVal = Number(formData.get('balance')) || 0;

    const updatedVendor = {
      name: nameVal,
      companyName: nameVal,
      contactPerson: editingVendor.contactPerson || nameVal,
      mobile: mobileVal,
      phone: mobileVal,
      email: emailVal,
      city: cityVal,
      address: addressVal,
      balance: balanceVal,
      openingBalance: editingVendor.openingBalance !== undefined ? editingVendor.openingBalance : (editingVendor.initialBalance !== undefined ? editingVendor.initialBalance : balanceVal),
      initialBalance: editingVendor.initialBalance !== undefined ? editingVendor.initialBalance : (editingVendor.openingBalance !== undefined ? editingVendor.openingBalance : balanceVal),
      remainingAmount: editingVendor.remainingAmount !== undefined ? editingVendor.remainingAmount : balanceVal,
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(doc(db, 'vendors', editingVendor.id), updatedVendor);
      toast.success('Vendor updated successfully');
      setEditingVendor(null);
    } catch (error) {
      console.error('Error updating vendor:', error);
      toast.error('Failed to update vendor');
    }
  };

  const handleDeleteVendor = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this vendor?')) {
      try {
        await deleteDoc(doc(db, 'vendors', id));
        toast.success('Vendor deleted successfully');
      } catch (error) {
        console.error('Error deleting vendor:', error);
        toast.error('Failed to delete vendor');
      }
    }
  };

  const filteredVendors = vendors.filter(v => {
    const name = (v.name || v.companyName || '').toLowerCase();
    const phone = (v.mobile || v.phone || '').toLowerCase();
    const contact = (v.contactPerson || '').toLowerCase();
    const city = (v.city || '').toLowerCase();
    const address = (v.address || '').toLowerCase();
    const search = searchTerm.toLowerCase();
    return name.includes(search) || phone.includes(search) || contact.includes(search) || city.includes(search) || address.includes(search);
  });

  if (ledgerVendor) {
    const currentVendor = vendors.find(v => v.id === ledgerVendor.id) || ledgerVendor;
    return (
      <VendorLedgerView
        vendor={currentVendor}
        storeId={storeId || currentVendor.storeId || ''}
        onBack={() => setLedgerVendor(null)}
      />
    );
  }

  const isFormOpen = showAddForm || !!editingVendor;

  if (isFormOpen) {
    const isEditing = !!editingVendor;
    const initialData = editingVendor || {} as Partial<Vendor>;

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">{isEditing ? 'Edit Vendor' : 'Add New Vendor'}</h1>
            <p className="text-sm text-slate-500 mt-1">{isEditing ? 'Update the vendor details' : 'Enter the details for the new vendor'}</p>
          </div>
          <button 
            onClick={() => {
              setShowAddForm(false);
              setEditingVendor(null);
            }}
            className="flex items-center px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-200 transition-colors shadow-sm text-sm font-semibold"
          >
            Cancel
          </button>
        </div>

        <div className="glass-panel rounded-2xl shadow-sm overflow-hidden border border-slate-200">
          <form onSubmit={isEditing ? handleUpdateVendor : handleAddVendor}>
            <div className="bg-white px-6 py-6 sm:p-8">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="name" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Vendor Name</label>
                  <input 
                    type="text" 
                    name="name" 
                    id="name" 
                    defaultValue={initialData.name || initialData.companyName} 
                    required 
                    className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" 
                  />
                </div>
                <div>
                  <label htmlFor="mobile" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Mobile Number</label>
                  <input 
                    type="text" 
                    name="mobile" 
                    id="mobile" 
                    defaultValue={initialData.mobile || initialData.phone} 
                    required 
                    className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" 
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
                  <input 
                    type="email" 
                    name="email" 
                    id="email" 
                    defaultValue={initialData.email} 
                    className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" 
                  />
                </div>
                <div>
                  <label htmlFor="city" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">City</label>
                  <input 
                    type="text" 
                    name="city" 
                    id="city" 
                    defaultValue={initialData.city} 
                    className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" 
                  />
                </div>
                <div>
                  <label htmlFor="address" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Address / Street</label>
                  <input 
                    type="text" 
                    name="address" 
                    id="address" 
                    defaultValue={initialData.address} 
                    placeholder="e.g. Commercial Area, Plaza #3" 
                    className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" 
                  />
                </div>
                <div>
                  <label htmlFor="balance" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Opening Balance</label>
                  <input 
                    type="number" 
                    name="balance" 
                    id="balance" 
                    defaultValue={initialData.balance ?? 0} 
                    step="0.01" 
                    className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" 
                  />
                </div>
              </div>
            </div>
            <div className="bg-[#f8faf9] px-6 py-4 sm:px-8 flex justify-end gap-3 border-t border-slate-200">
              <button 
                type="button" 
                onClick={() => {
                  setShowAddForm(false);
                  setEditingVendor(null);
                }} 
                className="inline-flex justify-center rounded-xl border border-slate-200 px-5 py-2.5 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="inline-flex justify-center rounded-xl px-5 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-sm font-bold text-white shadow-md shadow-emerald-950/10 focus:outline-none transition-colors"
              >
                {isEditing ? 'Update Vendor' : 'Save Vendor'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Vendors</h1>
          <p className="text-sm text-slate-500 mt-1">Manage and view your vendor database</p>
        </div>
        <button 
          onClick={() => setShowAddForm(true)}
          className="flex items-center px-4 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl shadow-md shadow-emerald-950/10 transition-colors text-sm font-bold cursor-pointer"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Vendor
        </button>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Vendors</span>
            <Building2 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1.5 font-mono">{vendors.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Active vendor suppliers</div>
        </div>

        <div className="glass-panel p-4 rounded-2xl border-amber-200/60 bg-amber-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Net Payables</span>
            <Wallet className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-900 mt-1.5 font-mono">
            PKR {totalNetPayables.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-amber-700/80 mt-0.5">Total vendor balance due</div>
        </div>

        <div className="glass-panel p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Vendors Due</span>
            <Clock className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-800 mt-1.5 font-mono">{vendorsDueCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Pending vendor balances</div>
        </div>

        <div className="glass-panel p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Settled Accounts</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-800 mt-1.5 font-mono">{settledAccountsCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Zero or cleared balance</div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-150 bg-slate-50/50">
          <div className="relative max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-450" />
            </div>
            <input
              type="text"
              placeholder="Search vendors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="glass-input block w-full pl-10 pr-3 py-2 rounded-xl text-xs"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-slate-100">
            <thead className="bg-[#f8faf9]">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendor Details</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-48 sm:w-52">Purchases / Paid</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-48 sm:w-52">Remaining / Balance</th>
                <th scope="col" className="px-6 py-4 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider w-36 sm:w-44">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a382c] mx-auto"></div>
                  </td>
                </tr>
              ) : filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                    No vendors found. Add a new vendor to get started.
                  </td>
                </tr>
              ) : (
                filteredVendors.map((vendor) => {
                  const effectiveRemaining = getVendorNetPayable(vendor);
                  const effectivePurchases = getVendorPurchasesTotal(vendor);
                  const effectivePaid = getVendorPaidTotal(vendor);
                  const addressDisplay = [vendor.address, vendor.city].filter(Boolean).join(', ');

                  return (
                    <tr key={vendor.id} className="hover:bg-[#f8faf9] transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-start">
                          <div className="h-9 w-9 flex-shrink-0 bg-emerald-50 border border-emerald-100 text-[#0a382c] rounded-full flex items-center justify-center mt-0.5">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div className="ml-3 min-w-0">
                            <div className="text-sm font-bold text-slate-900 leading-snug">
                              {vendor.companyName || vendor.name}
                            </div>
                            {/* Address and Contact Number displayed under Name with small fonts */}
                            <div className="mt-1 space-y-0.5">
                              <div className="flex items-center flex-wrap gap-x-2 text-xs text-slate-600">
                                <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                                  <Phone className="w-3 h-3 text-[#0a382c] shrink-0" />
                                  {vendor.mobile || vendor.phone || 'No contact'}
                                </span>
                                {vendor.email && (
                                  <>
                                    <span className="text-slate-300">•</span>
                                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                                      <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                      {vendor.email}
                                    </span>
                                  </>
                                )}
                                {vendor.contactPerson && vendor.contactPerson !== (vendor.companyName || vendor.name) && (
                                  <>
                                    <span className="text-slate-300">•</span>
                                    <span className="text-[11px] text-slate-500">
                                      Attn: {vendor.contactPerson}
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">
                                  {addressDisplay || 'Address: N/A'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        <div className="text-xs font-semibold text-slate-700">
                          Purchased: <span className="font-mono font-bold text-slate-900">PKR {effectivePurchases.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
                          Paid: <span className="font-mono font-bold">PKR {effectivePaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        <div className={`font-mono font-extrabold text-sm ${effectiveRemaining > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                          PKR {effectiveRemaining.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Outstanding Balance
                        </div>
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-right text-sm font-semibold">
                        <button 
                          onClick={() => setLedgerVendor(vendor)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#0a382c] text-xs font-bold transition-colors mr-2 border border-emerald-200 cursor-pointer"
                          title="View Vendor Purchases & Payment Ledger"
                        >
                          <Receipt className="w-3.5 h-3.5 text-emerald-700" />
                          Ledger
                        </button>
                        <button 
                          onClick={() => setEditingVendor(vendor)}
                          className="text-slate-400 hover:text-slate-800 mr-2 transition-colors p-1.5 cursor-pointer"
                          title="Edit Vendor"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteVendor(vendor.id)}
                          className="text-red-400 hover:text-red-600 transition-colors p-1.5 cursor-pointer"
                          title="Delete Vendor"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
