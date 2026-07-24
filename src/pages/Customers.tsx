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

    const q = query(collection(db, 'customers'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'));

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
  }, [storeId]);

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
            <h1 className="text-3xl font-black tracking-tight text-slate-900">{isEditing ? 'Edit Customer' : 'Add New Customer'}</h1>
            <p className="text-sm text-slate-500 mt-1">{isEditing ? 'Update the customer details' : 'Enter the details for the new customer'}</p>
          </div>
          <button 
            onClick={() => {
              setShowAddForm(false);
              setEditingCustomer(null);
            }}
            className="flex items-center px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-200 transition-colors shadow-sm text-sm font-semibold"
          >
            Cancel
          </button>
        </div>

        <div className="glass-panel rounded-2xl shadow-sm overflow-hidden border border-slate-200">
          <form onSubmit={isEditing ? handleUpdateCustomer : handleAddCustomer}>
            <div className="bg-white px-6 py-6 sm:p-8">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="name" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Full Name</label>
                  <input type="text" name="name" id="name" defaultValue={initialData.name} required className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" />
                </div>
                <div>
                  <label htmlFor="mobile" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Mobile Number</label>
                  <input type="text" name="mobile" id="mobile" defaultValue={initialData.mobile} required className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" />
                </div>
                <div>
                  <label htmlFor="email" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
                  <input type="email" name="email" id="email" defaultValue={initialData.email} className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" />
                </div>
                <div>
                  <label htmlFor="city" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">City</label>
                  <input type="text" name="city" id="city" defaultValue={initialData.city} className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" />
                </div>
                <div>
                  <label htmlFor="balance" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Opening Balance</label>
                  <input type="number" name="balance" id="balance" defaultValue={initialData.balance ?? 0} step="0.01" className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" />
                </div>
              </div>
            </div>
            <div className="bg-[#f8faf9] px-6 py-4 sm:px-8 flex justify-end gap-3 border-t border-slate-200">
              <button 
                type="button" 
                onClick={() => {
                  setShowAddForm(false);
                  setEditingCustomer(null);
                }} 
                className="inline-flex justify-center rounded-xl border border-slate-200 px-5 py-2.5 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none transition-colors"
              >
                Cancel
              </button>
              <button type="submit" className="inline-flex justify-center rounded-xl px-5 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-sm font-bold text-white shadow-md shadow-emerald-950/10 focus:outline-none transition-colors">
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
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500 mt-1">Manage and view your customer database</p>
        </div>
        <button 
          onClick={() => setShowAddForm(true)}
          className="flex items-center px-4 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl shadow-md shadow-emerald-950/10 transition-colors text-sm font-bold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Customer
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
              placeholder="Search customers..."
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
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Customer</th>
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
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                    No customers found. Add a new customer to get started.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-[#f8faf9] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0 bg-emerald-50 border border-emerald-100 text-[#0a382c] rounded-full flex items-center justify-center">
                          <Users className="h-5 w-5" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-bold text-slate-900">{customer.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-slate-800">{customer.mobile}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{customer.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-semibold">
                      {customer.city || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-extrabold text-slate-900">
                      ${customer.balance?.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold">
                      <button 
                        onClick={() => setEditingCustomer(customer)}
                        className="text-slate-400 hover:text-slate-800 mr-4 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteCustomer(customer.id)}
                        className="text-red-400 hover:text-red-600 transition-colors"
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
