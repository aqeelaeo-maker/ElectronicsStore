import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Plus, Search, FileText, ShoppingCart, Eye } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';

interface Sale {
  id: string;
  invoiceNo: string;
  customerName: string;
  total: number;
  date: any;
  status: string;
}

export default function Sales() {
  const { storeId, role } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!storeId) return;

    const q = role === 'Super Admin'
      ? query(collection(db, 'sales'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'sales'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Sale[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Sale);
      });
      setSales(data);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching sales:', error);
      toast.error('Failed to load sales');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [storeId, role]);

  const handleAddSale = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!storeId) {
      toast.error('Store ID not found');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const invoiceNo = `INV-${Math.floor(1000 + Math.random() * 9000)}`;
    const newSale = {
      invoiceNo,
      customerName: formData.get('customerName'),
      total: Number(formData.get('total')) || 0,
      status: 'Paid',
      date: new Date().toISOString(),
      storeId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, 'sales'), newSale);
      toast.success('Sale recorded successfully');
      setShowModal(false);
    } catch (error) {
      console.error('Error recording sale:', error);
      toast.error('Failed to record sale');
    }
  };

  const filteredSales = sales.filter(s => 
    s.invoiceNo?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Sales Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your sales, view details, and track performance</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center px-4 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl shadow-md shadow-emerald-950/10 transition-colors text-sm font-bold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Invoice
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
              placeholder="Search invoices..."
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
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Invoice</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Customer</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="relative px-6 py-4"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a382c] mx-auto"></div>
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic text-sm bg-white">
                    No sales invoices found. Create a new invoice to get started.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-[#f8faf9] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0 bg-emerald-50 border border-emerald-100 text-[#0a382c] rounded-lg flex items-center justify-center">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-bold text-slate-900">{sale.invoiceNo}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800 font-bold">
                      {sale.customerName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-semibold">
                      {sale.date ? new Date(sale.date).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-extrabold text-slate-950">
                      ${sale.total?.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2.5 py-1 inline-flex text-[10px] leading-5 font-black rounded-full bg-emerald-50 border border-emerald-150 text-emerald-800 uppercase tracking-wider">
                        {sale.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold">
                      <button className="text-slate-400 hover:text-slate-800 transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setShowModal(false)} />
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
            <div className="inline-block align-bottom glass-panel rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-slate-200">
              <form onSubmit={handleAddSale}>
                <div className="bg-white px-6 pt-6 pb-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-6">Create Sale Invoice (Quick Add)</h3>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label htmlFor="customerName" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Customer Name</label>
                      <input type="text" name="customerName" id="customerName" required className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" />
                    </div>
                    <div>
                      <label htmlFor="total" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Total Amount</label>
                      <input type="number" name="total" id="total" required min="0" step="0.01" className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" />
                    </div>
                  </div>
                </div>
                <div className="bg-[#f8faf9] px-6 py-4 sm:px-6 sm:flex sm:flex-row-reverse gap-3 border-t border-slate-200">
                  <button type="submit" className="w-full inline-flex justify-center rounded-xl px-5 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-sm font-bold text-white shadow-md shadow-emerald-950/10 focus:outline-none transition-colors sm:w-auto">
                    Create Invoice
                  </button>
                  <button type="button" onClick={() => setShowModal(false)} className="mt-3 w-full inline-flex justify-center rounded-xl border border-slate-200 px-5 py-2.5 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none transition-colors sm:mt-0 sm:w-auto">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
