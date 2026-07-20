import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Plus, Search, Edit2, Trash2, Users } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';

interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string;
  city: string;
  balance: number;
}

export default function Customers() {
  const { storeId, role } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    if (!storeId) return;

    const q = role === 'Super Admin'
      ? query(collection(db, 'customers'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'customers'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Customer[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Customer);
      });
      setCustomers(data);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching customers:', error);
      toast.error('Failed to load customers');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [storeId, role]);

  const handleAddCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!storeId) {
      toast.error('Store ID not found');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const newCustomer = {
      name: formData.get('name'),
      mobile: formData.get('mobile'),
      email: formData.get('email'),
      city: formData.get('city'),
      balance: Number(formData.get('balance')) || 0,
      storeId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, 'customers'), newCustomer);
      toast.success('Customer added successfully');
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding customer:', error);
      toast.error('Failed to add customer');
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingCustomer) return;

    const formData = new FormData(e.currentTarget);
    const updatedCustomer = {
      name: formData.get('name'),
      mobile: formData.get('mobile'),
      email: formData.get('email'),
      city: formData.get('city'),
      balance: Number(formData.get('balance')) || 0,
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(doc(db, 'customers', editingCustomer.id), updatedCustomer);
      toast.success('Customer updated successfully');
      setEditingCustomer(null);
    } catch (error) {
      console.error('Error updating customer:', error);
      toast.error('Failed to update customer');
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      try {
        await deleteDoc(doc(db, 'customers', id));
        toast.success('Customer deleted successfully');
      } catch (error) {
        console.error('Error deleting customer:', error);
        toast.error('Failed to delete customer');
      }
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.mobile.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isFormOpen = showAddForm || !!editingCustomer;

  if (isFormOpen) {
    const isEditing = !!editingCustomer;
    const initialData = editingCustomer || {} as Partial<Customer>;

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">{isEditing ? 'Edit Customer' : 'Add New Customer'}</h1>
            <p className="text-sm text-slate-400 mt-1">{isEditing ? 'Update the customer details' : 'Enter the details for the new customer'}</p>
          </div>
          <button 
            onClick={() => {
              setShowAddForm(false);
              setEditingCustomer(null);
            }}
            className="flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors shadow-sm text-sm font-semibold"
          >
            Cancel
          </button>
        </div>

        <div className="glass-panel rounded-2xl shadow-2xl overflow-hidden">
          <form onSubmit={isEditing ? handleUpdateCustomer : handleAddCustomer}>
            <div className="px-6 py-6 sm:p-8">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="name" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Full Name</label>
                  <input type="text" name="name" id="name" defaultValue={initialData.name} required className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" />
                </div>
                <div>
                  <label htmlFor="mobile" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Mobile Number</label>
                  <input type="text" name="mobile" id="mobile" defaultValue={initialData.mobile} required className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" />
                </div>
                <div>
                  <label htmlFor="email" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Email Address</label>
                  <input type="email" name="email" id="email" defaultValue={initialData.email} className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" />
                </div>
                <div>
                  <label htmlFor="city" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">City</label>
                  <input type="text" name="city" id="city" defaultValue={initialData.city} className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" />
                </div>
                <div>
                  <label htmlFor="balance" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Opening Balance</label>
                  <input type="number" name="balance" id="balance" defaultValue={initialData.balance ?? 0} step="0.01" className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" />
                </div>
              </div>
            </div>
            <div className="bg-slate-950/40 px-6 py-4 sm:px-8 flex justify-end gap-3 border-t border-white/5">
              <button 
                type="button" 
                onClick={() => {
                  setShowAddForm(false);
                  setEditingCustomer(null);
                }} 
                className="inline-flex justify-center rounded-xl border border-slate-700 px-5 py-2.5 bg-slate-800 text-sm font-semibold text-slate-300 hover:bg-slate-700 focus:outline-none transition-colors"
              >
                Cancel
              </button>
              <button type="submit" className="inline-flex justify-center rounded-xl px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white shadow-md shadow-blue-500/10 focus:outline-none transition-colors">
                {isEditing ? 'Update Customer' : 'Save Customer'}
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
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Customers</h1>
          <p className="text-sm text-slate-400 mt-1">Manage and view your customer database</p>
        </div>
        <button 
          onClick={() => setShowAddForm(true)}
          className="flex items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md shadow-blue-500/10 transition-colors text-sm font-semibold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Customer
        </button>
      </div>

      <div className="glass-panel rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-white/5 bg-slate-950/20">
          <div className="relative max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-500" />
            </div>
            <input
              type="text"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="glass-input block w-full pl-10 pr-3 py-2 rounded-xl text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/5">
            <thead className="bg-slate-950/40">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contact</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">City</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Balance</th>
                <th scope="col" className="relative px-6 py-4"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-transparent">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">
                    No customers found. Add a new customer to get started.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center justify-center">
                          <Users className="h-5 w-5" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-semibold text-white">{customer.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-200">{customer.mobile}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{customer.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300 font-medium">
                      {customer.city || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-emerald-400">
                      ${customer.balance?.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold">
                      <button 
                        onClick={() => setEditingCustomer(customer)}
                        className="text-blue-400 hover:text-blue-300 mr-4 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteCustomer(customer.id)}
                        className="text-red-400 hover:text-red-300 transition-colors"
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
