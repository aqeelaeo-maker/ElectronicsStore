import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Plus, Search, Edit2, Trash2, Building2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';

interface Vendor {
  id: string;
  companyName: string;
  contactPerson: string;
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

    const q = query(collection(db, 'vendors'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Vendor[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Vendor);
      });
      setVendors(data);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching vendors:', error);
      toast.error('Failed to load vendors');
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
    const newVendor = {
      companyName: formData.get('companyName'),
      contactPerson: formData.get('contactPerson'),
      phone: formData.get('phone'),
      email: formData.get('email'),
      city: formData.get('city'),
      balance: Number(formData.get('balance')) || 0,
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
    const updatedVendor = {
      companyName: formData.get('companyName'),
      contactPerson: formData.get('contactPerson'),
      phone: formData.get('phone'),
      email: formData.get('email'),
      city: formData.get('city'),
      balance: Number(formData.get('balance')) || 0,
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

  const filteredVendors = vendors.filter(v => 
    v.companyName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    v.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.contactPerson.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isFormOpen = showAddForm || !!editingVendor;

  if (isFormOpen) {
    const isEditing = !!editingVendor;
    const initialData = editingVendor || {} as Partial<Vendor>;

    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              {isEditing ? 'Edit Vendor Details' : 'Register New Vendor'}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {isEditing ? 'Update vendor profile, contacts, and account balance' : 'Enter the supplier details to add them to your vendor register'}
            </p>
          </div>
          <button 
            onClick={() => {
              setShowAddForm(false);
              setEditingVendor(null);
            }}
            className="flex items-center px-4 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 hover:text-white transition-all text-sm font-semibold border border-slate-700/50"
          >
            Back to Directory
          </button>
        </div>

        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <form onSubmit={isEditing ? handleUpdateVendor : handleAddVendor}>
            <div className="p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="companyName" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Company Name</label>
                  <input 
                    type="text" 
                    name="companyName" 
                    id="companyName" 
                    defaultValue={initialData.companyName} 
                    required 
                    className="block w-full bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/10 py-2.5 px-4 text-sm" 
                    placeholder="e.g. ElectroParts Inc."
                  />
                </div>
                <div>
                  <label htmlFor="contactPerson" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Contact Person</label>
                  <input 
                    type="text" 
                    name="contactPerson" 
                    id="contactPerson" 
                    defaultValue={initialData.contactPerson} 
                    required 
                    className="block w-full bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/10 py-2.5 px-4 text-sm" 
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Phone Number</label>
                  <input 
                    type="text" 
                    name="phone" 
                    id="phone" 
                    defaultValue={initialData.phone} 
                    required 
                    className="block w-full bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/10 py-2.5 px-4 text-sm" 
                    placeholder="e.g. +1 (555) 019-2834"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Email Address</label>
                  <input 
                    type="email" 
                    name="email" 
                    id="email" 
                    defaultValue={initialData.email} 
                    className="block w-full bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/10 py-2.5 px-4 text-sm" 
                    placeholder="e.g. contact@electroparts.com"
                  />
                </div>
                <div>
                  <label htmlFor="city" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">City</label>
                  <input 
                    type="text" 
                    name="city" 
                    id="city" 
                    defaultValue={initialData.city} 
                    className="block w-full bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/10 py-2.5 px-4 text-sm" 
                    placeholder="e.g. Chicago"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="balance" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Opening / Current Balance ($)</label>
                  <input 
                    type="number" 
                    name="balance" 
                    id="balance" 
                    defaultValue={initialData.balance ?? 0} 
                    step="0.01" 
                    className="block w-full bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/10 py-2.5 px-4 text-sm" 
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
            <div className="bg-slate-950/40 border-t border-slate-800 px-6 py-4 flex justify-end gap-3">
              <button 
                type="button" 
                onClick={() => {
                  setShowAddForm(false);
                  setEditingVendor(null);
                }} 
                className="px-5 py-2.5 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 hover:text-white transition-all text-sm font-semibold border border-slate-700/50"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="px-5 py-2.5 bg-slate-100 text-slate-950 rounded-xl hover:bg-slate-200 transition-all text-sm font-bold shadow-md shadow-white/5"
              >
                {isEditing ? 'Update Vendor' : 'Register Vendor'}
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
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Vendors</h1>
          <p className="text-sm text-slate-400 mt-1">Manage and track your supplier directories and accounts</p>
        </div>
        <button 
          onClick={() => setShowAddForm(true)}
          className="flex items-center px-4 py-2.5 bg-slate-100 text-slate-950 rounded-xl hover:bg-slate-200 transition-all text-sm font-bold shadow-md shadow-white/5"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Vendor
        </button>
      </div>

      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 bg-slate-950/20">
          <div className="relative max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-500" />
            </div>
            <input
              type="text"
              placeholder="Search vendors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/10 text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-950/40">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Company</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Contact</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">City</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Balance</th>
                <th scope="col" className="relative px-6 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-slate-900 divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-300 mx-auto"></div>
                  </td>
                </tr>
              ) : filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 text-sm">
                    No vendors found. Add a new vendor to get started.
                  </td>
                </tr>
              ) : (
                filteredVendors.map((vendor) => (
                  <tr key={vendor.id} className="hover:bg-slate-850/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-slate-300" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-bold text-white">{vendor.companyName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-slate-200">{vendor.contactPerson}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{vendor.phone}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                      {vendor.city || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-200">
                      ${vendor.balance?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-1">
                      <button 
                        onClick={() => setEditingVendor(vendor)}
                        className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-all inline-flex"
                        title="Edit Vendor"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteVendor(vendor.id)}
                        className="text-red-400 hover:text-red-300 p-1.5 rounded-lg hover:bg-slate-800 transition-all inline-flex"
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
