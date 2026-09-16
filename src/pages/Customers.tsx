import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Plus, Search, Edit2, Trash2, Users, Receipt, Wallet, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import CustomerLedgerView from '../components/CustomerLedgerView';

interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string;
  city: string;
  balance: number;
  openingBalance?: number;
  initialBalance?: number;
  storeId?: string;
  createdAt?: any;
  updatedAt?: any;
}

export default function Customers() {
  const { storeId, role } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    if (!storeId) return;

    const q = query(collection(db, 'customers'), where('storeId', '==', storeId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Customer[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Customer);
      });

      data.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      setCustomers(data);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching customers:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [storeId]);

  // Real-time sales subscription to accurately compute Pending on Invoices for every customer
  useEffect(() => {
    if (!storeId) return;

    const qSales = query(collection(db, 'sales'), where('storeId', '==', storeId));
    const unsubscribeSales = onSnapshot(qSales, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setSales(list);
    }, (error) => {
      console.error('Error fetching sales for customer ledger balances:', error);
    });

    return () => unsubscribeSales();
  }, [storeId]);

  // 1. Initial / Opening balance for a customer
  const getCustomerInitialBalance = (customer: Customer): number => {
    if (customer.openingBalance !== undefined && customer.openingBalance !== null && !isNaN(Number(customer.openingBalance))) {
      return Number(customer.openingBalance);
    }
    if (customer.initialBalance !== undefined && customer.initialBalance !== null && !isNaN(Number(customer.initialBalance))) {
      return Number(customer.initialBalance);
    }
    // If no sales exist for this customer, balance is their initial balance
    const custSales = sales.filter(s => s.customerId === customer.id);
    if (custSales.length === 0 && customer.balance !== undefined && !isNaN(Number(customer.balance))) {
      return Number(customer.balance);
    }
    return 0;
  };

  // 2. Pending on Invoices for a customer
  const getCustomerPendingInvoices = (customerId: string): number => {
    return sales
      .filter(s => s.customerId === customerId)
      .reduce((sum, sale) => {
        const pending = sale.pendingAmount !== undefined 
          ? sale.pendingAmount 
          : (sale.status === 'Pending' ? (sale.total || 0) : (sale.status === 'Paid' ? 0 : Math.max(0, (sale.total || 0) - (sale.paidAmount || 0))));
        return sum + pending;
      }, 0);
  };

  // 3. Return value for a customer across sales returns / refunded invoices
  const getCustomerReturnValue = (customerId: string): number => {
    const custSales = sales.filter(s => s.customerId === customerId);
    let totalReturns = 0;
    custSales.forEach(s => {
      if (Array.isArray(s.returns) && s.returns.length > 0) {
        s.returns.forEach((r: any) => {
          totalReturns += Number(r.totalRefund) || 0;
        });
      } else if (typeof s.totalRefunded === 'number' && s.totalRefunded > 0) {
        totalReturns += s.totalRefunded;
      }
    });
    return Number(totalReturns.toFixed(2));
  };

  // 4. In Customer ledger, Net Account Balance = Initial Balance + Pending on Invoices - Return Value
  const getCustomerNetAccountBalance = (customer: Customer): number => {
    const initial = getCustomerInitialBalance(customer);
    const pending = getCustomerPendingInvoices(customer.id);
    const returnVal = getCustomerReturnValue(customer.id);
    return Number((initial + pending - returnVal).toFixed(2));
  };

  // Automatically reconcile and sync customer.balance in Firestore to match Ledger Net Account Balance
  useEffect(() => {
    if (loading || sales.length === 0 || customers.length === 0) return;

    customers.forEach(async (c) => {
      const netBal = getCustomerNetAccountBalance(c);
      const currentStored = typeof c.balance === 'number' ? c.balance : (parseFloat(c.balance as any) || 0);
      if (Math.abs(currentStored - netBal) > 0.01) {
        try {
          const custRef = doc(db, 'customers', c.id);
          await updateDoc(custRef, {
            balance: netBal,
            updatedAt: serverTimestamp()
          });
        } catch (syncErr) {
          console.warn(`Could not auto-sync balance for customer ${c.name}:`, syncErr);
        }
      }
    });
  }, [customers, sales, loading]);

  // Overall financial summary metrics
  const { totalNetReceivables, pendingAccountsCount, settledAccountsCount } = useMemo(() => {
    let total = 0;
    let pendingCount = 0;
    let settledCount = 0;

    customers.forEach(c => {
      const net = getCustomerNetAccountBalance(c);
      total += net;
      if (net > 0) {
        pendingCount++;
      } else {
        settledCount++;
      }
    });

    return {
      totalNetReceivables: Number(total.toFixed(2)),
      pendingAccountsCount: pendingCount,
      settledAccountsCount: settledCount
    };
  }, [customers, sales]);

  const handleAddCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!storeId) {
      toast.error('Store ID not found');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const balanceVal = Number(formData.get('balance')) || 0;
    const newCustomer = {
      name: formData.get('name'),
      mobile: formData.get('mobile'),
      email: formData.get('email'),
      city: formData.get('city'),
      balance: balanceVal,
      openingBalance: balanceVal,
      initialBalance: balanceVal,
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
    const openingBalVal = Number(formData.get('balance')) || 0;
    const pendingInvoices = getCustomerPendingInvoices(editingCustomer.id);
    const calculatedNetBalance = Number((openingBalVal + pendingInvoices).toFixed(2));

    const updatedCustomer = {
      name: formData.get('name'),
      mobile: formData.get('mobile'),
      email: formData.get('email'),
      city: formData.get('city'),
      balance: calculatedNetBalance,
      openingBalance: openingBalVal,
      initialBalance: openingBalVal,
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
                  <label htmlFor="balance" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Opening / Initial Balance (PKR)
                  </label>
                  <input 
                    type="number" 
                    name="balance" 
                    id="balance" 
                    defaultValue={initialData.openingBalance ?? initialData.initialBalance ?? initialData.balance ?? 0} 
                    step="0.01" 
                    className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm font-mono font-bold" 
                  />
                  {isEditing && editingCustomer && (
                    <p className="text-[11px] text-slate-500 mt-1.5 font-medium">
                      Current Ledger Net Account Balance: <span className="font-mono font-bold text-amber-800">PKR {getCustomerNetAccountBalance(editingCustomer).toFixed(2)}</span>
                    </p>
                  )}
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
          <p className="text-sm text-slate-500 mt-1">Manage customers and monitor ledger account balances</p>
        </div>
        <button 
          onClick={() => setShowAddForm(true)}
          className="flex items-center px-4 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl shadow-md shadow-emerald-950/10 transition-colors text-sm font-bold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Customer
        </button>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Customers</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1.5 font-mono">{customers.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Active customer base</div>
        </div>

        <div className="glass-panel p-4 rounded-2xl border-amber-200/60 bg-amber-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Net Receivables</span>
            <Wallet className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-900 mt-1.5 font-mono">
            PKR {totalNetReceivables.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-amber-700/80 mt-0.5">Total ledger balance due</div>
        </div>

        <div className="glass-panel p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Accounts Due</span>
            <Clock className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-800 mt-1.5 font-mono">{pendingAccountsCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Pending ledger balances</div>
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
              placeholder="Search customers by name or mobile..."
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
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider" title="Net Account Balance = Initial Balance + Pending on Invoices">
                  Net Balance
                </th>
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
                filteredCustomers.map((customer) => {
                  const initialBal = getCustomerInitialBalance(customer);
                  const pendingBal = getCustomerPendingInvoices(customer.id);
                  const returnVal = getCustomerReturnValue(customer.id);
                  const netBal = getCustomerNetAccountBalance(customer);

                  return (
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
                        <div className="text-xs text-slate-500 mt-0.5">{customer.email || '—'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-semibold">
                        {customer.city || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-extrabold text-slate-900">
                        <div className="font-mono text-sm font-black">
                          PKR {netBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {netBal > 0 ? (
                            <span className="inline-block text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                              Pending
                            </span>
                          ) : (
                            <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                              Cleared
                            </span>
                          )}
                          {(initialBal > 0 || pendingBal > 0 || returnVal > 0) && (
                            <span 
                              className="text-[10px] text-slate-400 font-medium font-mono hidden sm:inline" 
                              title={`Initial Balance: PKR ${initialBal.toFixed(2)} | Invoices Pending: PKR ${pendingBal.toFixed(2)} | Returns: PKR ${returnVal.toFixed(2)}`}
                            >
                              (Init: {initialBal.toLocaleString('en-US', { maximumFractionDigits: 0 })} + Pend: {pendingBal.toLocaleString('en-US', { maximumFractionDigits: 0 })}{returnVal > 0 ? ` - Ret: ${returnVal.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : ''})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold">
                        <button 
                          onClick={() => setLedgerCustomer(customer)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#0a382c] text-xs font-bold transition-colors mr-2.5 border border-emerald-200 shadow-sm"
                          title="View Customer Invoices & Payment Ledger"
                        >
                          <Receipt className="w-3.5 h-3.5 text-emerald-700" />
                          Ledger
                        </button>
                        <button 
                          onClick={() => setEditingCustomer(customer)}
                          className="text-slate-400 hover:text-slate-800 mr-3 transition-colors p-1.5"
                          title="Edit Customer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteCustomer(customer.id)}
                          className="text-red-400 hover:text-red-600 transition-colors p-1.5"
                          title="Delete Customer"
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

      {/* Customer Ledger Modal Dialog (Replaces Full Page Mode) */}
      {ledgerCustomer && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-2 sm:p-4 md:p-6 text-center">
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" 
              onClick={() => setLedgerCustomer(null)} 
            />
            {/* Modal Dialog Content Container */}
            <div className="relative z-10 w-full max-w-6xl bg-slate-100 rounded-3xl text-left shadow-2xl border border-slate-200 my-4 max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-3 sm:p-5 md:p-6 overflow-y-auto flex-1">
                <CustomerLedgerView
                  customer={customers.find(c => c.id === ledgerCustomer.id) || ledgerCustomer}
                  storeId={storeId || ledgerCustomer.storeId || ''}
                  onBack={() => setLedgerCustomer(null)}
                  isModal={true}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
