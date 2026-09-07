import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Plus, Search, Edit2, Trash2, Building2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';

interface Vendor {
  id: string;
  name?: string;
  companyName: string;
  contactPerson?: string;
  mobile?: string;
  phone: string;
  email: string;
  city: string;
  balance: number;
}

export default function Vendors() {
  const { storeId, role } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

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
    const balanceVal = Number(formData.get('balance')) || 0;

    const newVendor = {
      name: nameVal,
      companyName: nameVal,
      contactPerson: nameVal,
      mobile: mobileVal,
      phone: mobileVal,
      email: emailVal,
      city: cityVal,
      balance: balanceVal,
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
    const balanceVal = Number(formData.get('balance')) || 0;

    const updatedVendor = {
      name: nameVal,
      companyName: nameVal,
      contactPerson: editingVendor.contactPerson || nameVal,
      mobile: mobileVal,
      phone: mobileVal,
      email: emailVal,
      city: cityVal,
      balance: balanceVal,
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
    const search = searchTerm.toLowerCase();
    return name.includes(search) || phone.includes(search) || contact.includes(search);
  });

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
          className="flex items-center px-4 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl shadow-md shadow-emerald-950/10 transition-colors text-sm font-bold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Vendor
        </button>
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
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-[#f8faf9]">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendor</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Contact</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">City</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Balance</th>
                <th scope="col" className="relative px-6 py-4"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a382c] mx-auto"></div>
                  </td>
                </tr>
              ) : filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                    No vendors found. Add a new vendor to get started.
                  </td>
                </tr>
              ) : (
                filteredVendors.map((vendor) => (
                  <tr key={vendor.id} className="hover:bg-[#f8faf9] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0 bg-emerald-50 border border-emerald-100 text-[#0a382c] rounded-full flex items-center justify-center">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-bold text-slate-900">{vendor.companyName || vendor.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-slate-800">{vendor.mobile || vendor.phone}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{vendor.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-semibold">
                      {vendor.city || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-extrabold text-slate-900">
                      ${(vendor.balance ?? 0).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold">
                      <button 
                        onClick={() => setEditingVendor(vendor)}
                        className="text-slate-400 hover:text-slate-800 mr-4 transition-colors"
                        title="Edit Vendor"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteVendor(vendor.id)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                        title="Delete Vendor"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
