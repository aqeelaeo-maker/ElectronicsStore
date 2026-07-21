import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  writeBatch, 
  serverTimestamp, 
  query, 
  orderBy, 
  where 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  Plus, 
  Search, 
  FileText, 
  Eye, 
  Trash2, 
  X, 
  Calendar, 
  User, 
  DollarSign, 
  Info, 
  Hash, 
  CheckCircle2, 
  Building2 
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';

interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  modelNumber: string;
  purchasePrice: number;
  salePrice: number;
  stock: number;
}

interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string;
  city: string;
  balance: number;
}

interface SerialNumber {
  id: string;
  productId: string;
  serialNumber: string;
  status: 'Available' | 'Sold';
}

interface SaleItem {
  productId: string;
  productName: string;
  brand: string;
  modelNumber: string;
  category: string;
  quantity: number;
  salePrice: number;
  discount: number;
  warranty: string;
  subtotal: number;
  selectedSerials: string[];
}

interface Sale {
  id: string;
  invoiceNo: string;
  customerId?: string | null;
  customerName: string;
  total: number;
  date: string;
  status: string;
  items?: SaleItem[];
}

export default function Sales() {
  const { storeId, role } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allSerials, setAllSerials] = useState<SerialNumber[]>([]);
  const [storeDetails, setStoreDetails] = useState<{
    name: string;
    logoUrl: string;
    phone: string;
    address: string;
    email: string;
  }>({
    name: '',
    logoUrl: '',
    phone: '',
    address: '',
    email: ''
  });
  
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // New Invoice Form States
  const [customerMode, setCustomerMode] = useState<'select' | 'manual'>('select');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [manualCustomerName, setManualCustomerName] = useState('');
  const [invoiceItems, setInvoiceItems] = useState<Array<{
    productId: string;
    quantity: number;
    salePrice: number;
    discount: number;
    warranty: string;
    selectedSerials: string[];
  }>>([{ productId: '', quantity: 1, salePrice: 0, discount: 0, warranty: 'No Warranty', selectedSerials: [] }]);
  const [saving, setSaving] = useState(false);

  // 1. Fetch Sales List
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

  // 2. Fetch Products for Lookup
  useEffect(() => {
    if (!storeId) return;

    const q = role === 'Super Admin'
      ? query(collection(db, 'products'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'products'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Product[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Product);
      });
      setProducts(data);
    }, (error) => {
      console.error('Error fetching products:', error);
    });

    return () => unsubscribe();
  }, [storeId, role]);

  // 3. Fetch Customers for Lookup
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
    }, (error) => {
      console.error('Error fetching customers:', error);
    });

    return () => unsubscribe();
  }, [storeId, role]);

  // 4. Fetch Available Serial Numbers for Verification & Selection
  useEffect(() => {
    if (!storeId) return;

    const q = role === 'Super Admin'
      ? query(collection(db, 'serialNumbers'), where('status', '==', 'Available'))
      : query(collection(db, 'serialNumbers'), where('storeId', '==', storeId), where('status', '==', 'Available'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: SerialNumber[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as SerialNumber);
      });
      setAllSerials(data);
    }, (error) => {
      console.error('Error fetching serial numbers:', error);
    });

    return () => unsubscribe();
  }, [storeId, role]);

  // 5. Fetch Store Details
  useEffect(() => {
    if (!storeId) return;

    const storeRef = doc(db, 'stores', storeId);
    const unsubscribe = onSnapshot(storeRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStoreDetails({
          name: data.name || '',
          logoUrl: data.logoUrl || '',
          phone: data.phone || '',
          address: data.address || '',
          email: data.email || ''
        });
      }
    }, (error) => {
      console.error('Error listening to store details:', error);
    });

    return () => unsubscribe();
  }, [storeId]);

  // Form Management Helpers
  const handleAddItemRow = () => {
    setInvoiceItems([...invoiceItems, { productId: '', quantity: 1, salePrice: 0, discount: 0, warranty: 'No Warranty', selectedSerials: [] }]);
  };

  const handleRemoveItemRow = (index: number) => {
    const updated = invoiceItems.filter((_, i) => i !== index);
    setInvoiceItems(updated.length > 0 ? updated : [{ productId: '', quantity: 1, salePrice: 0, discount: 0, warranty: 'No Warranty', selectedSerials: [] }]);
  };

  const handleItemProductChange = (index: number, pId: string) => {
    const product = products.find(p => p.id === pId);
    const updated = [...invoiceItems];
    updated[index] = {
      productId: pId,
      quantity: 1,
      salePrice: product ? product.salePrice : 0,
      discount: 0,
      warranty: 'No Warranty',
      selectedSerials: []
    };
    setInvoiceItems(updated);
  };

  const handleItemQuantityChange = (index: number, qtyVal: number) => {
    const updated = [...invoiceItems];
    const item = updated[index];
    const product = products.find(p => p.id === item.productId);
    const maxStock = product ? product.stock : 999;
    
    const qty = Math.max(1, Math.min(maxStock, qtyVal || 1));
    // Prune excess serial numbers if quantity is reduced
    const currentSerials = item.selectedSerials.slice(0, qty);
    
    updated[index] = {
      ...item,
      quantity: qty,
      selectedSerials: currentSerials
    };
    setInvoiceItems(updated);
  };

  const handleItemPriceChange = (index: number, price: number) => {
    const updated = [...invoiceItems];
    updated[index] = {
      ...updated[index],
      salePrice: Math.max(0, price)
    };
    setInvoiceItems(updated);
  };

  const handleItemDiscountChange = (index: number, discount: number) => {
    const updated = [...invoiceItems];
    updated[index] = {
      ...updated[index],
      discount: Math.max(0, discount)
    };
    setInvoiceItems(updated);
  };

  const handleItemWarrantyChange = (index: number, warranty: string) => {
    const updated = [...invoiceItems];
    updated[index] = {
      ...updated[index],
      warranty
    };
    setInvoiceItems(updated);
  };

  const calculateInvoiceTotal = () => {
    return invoiceItems.reduce((sum, item) => sum + Math.max(0, (item.quantity * item.salePrice) - (item.discount || 0)), 0);
  };

  // Submit Detailed Invoice Creation using Atomic Batch writes
  const handleCreateInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) {
      toast.error('Store ID not found');
      return;
    }

    let customerName = '';
    let customerId: string | null = null;

    if (customerMode === 'select') {
      if (!selectedCustomerId) {
        toast.error('Please select a customer');
        return;
      }
      const cust = customers.find(c => c.id === selectedCustomerId);
      customerName = cust ? cust.name : '';
      customerId = selectedCustomerId;
    } else {
      if (!manualCustomerName.trim()) {
        toast.error('Please enter customer name');
        return;
      }
      customerName = manualCustomerName.trim();
    }

    // Validation
    for (let i = 0; i < invoiceItems.length; i++) {
      const item = invoiceItems[i];
      if (!item.productId) {
        toast.error(`Please select a product for line ${i + 1}`);
        return;
      }
      const prod = products.find(p => p.id === item.productId);
      if (!prod) {
        toast.error(`Selected product in line ${i + 1} was not found`);
        return;
      }
      if (item.quantity > prod.stock) {
        toast.error(`Not enough stock for "${prod.name}". Available: ${prod.stock}`);
        return;
      }
      
      const productSerials = allSerials.filter(sn => sn.productId === item.productId);
      if (productSerials.length > 0 && item.selectedSerials.length !== item.quantity) {
        toast.error(`Please select exactly ${item.quantity} serial number(s) for "${prod.name}"`);
        return;
      }
    }

    setSaving(true);
    
    // Generate sequential invoice numbers like INV-year-0001
    const currentYear = new Date().getFullYear();
    const yearSales = sales.filter(s => s.invoiceNo && s.invoiceNo.startsWith(`INV-${currentYear}-`));
    const nextSeq = yearSales.length + 1;
    const paddedSeq = String(nextSeq).padStart(4, '0');
    const invoiceNo = `INV-${currentYear}-${paddedSeq}`;

    const batch = writeBatch(db);

    const itemsToSave: SaleItem[] = invoiceItems.map(item => {
      const prod = products.find(p => p.id === item.productId)!;
      return {
        productId: item.productId,
        productName: prod.name,
        brand: prod.brand,
        modelNumber: prod.modelNumber,
        category: prod.category,
        quantity: item.quantity,
        salePrice: item.salePrice,
        discount: item.discount || 0,
        warranty: item.warranty || 'No Warranty',
        subtotal: Math.max(0, (item.quantity * item.salePrice) - (item.discount || 0)),
        selectedSerials: item.selectedSerials.map(sId => {
          const sn = allSerials.find(s => s.id === sId);
          return sn ? sn.serialNumber : sId;
        })
      };
    });

    const totalAmount = itemsToSave.reduce((sum, item) => sum + item.subtotal, 0);
    const saleId = doc(collection(db, 'sales')).id;

    const newSaleDoc = {
      id: saleId,
      invoiceNo,
      customerId,
      customerName,
      items: itemsToSave,
      total: totalAmount,
      status: 'Paid',
      date: new Date().toISOString(),
      storeId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      // 1. Set the Sales document
      const saleRef = doc(db, 'sales', saleId);
      batch.set(saleRef, newSaleDoc);

      // 2. Adjust Product stock, log transactions, and commit serial number flags
      for (const item of invoiceItems) {
        const prod = products.find(p => p.id === item.productId)!;
        const previousStock = prod.stock || 0;
        const newStock = previousStock - item.quantity;

        // Update product stock count
        const productRef = doc(db, 'products', item.productId);
        batch.update(productRef, {
          stock: newStock,
          updatedAt: serverTimestamp()
        });

        // Insert inventory log entry
        const logId = doc(collection(db, 'inventoryLogs')).id;
        const logRef = doc(db, 'inventoryLogs', logId);
        batch.set(logRef, {
          storeId,
          productId: item.productId,
          productName: prod.name,
          productBrand: prod.brand,
          productModelNumber: prod.modelNumber,
          quantityAdded: -item.quantity,
          previousStock,
          newStock,
          referenceNumber: invoiceNo,
          notes: `Sold to ${customerName}`,
          createdAt: serverTimestamp()
        });

        // Toggle selected serial numbers status to "Sold"
        for (const serialId of item.selectedSerials) {
          const serialRef = doc(db, 'serialNumbers', serialId);
          batch.update(serialRef, {
            status: 'Sold',
            updatedAt: serverTimestamp()
          });
        }
      }

      await batch.commit();

      toast.success(`Invoice ${invoiceNo} recorded successfully!`);
      setShowModal(false);
      
      // Reset form states
      setInvoiceItems([{ productId: '', quantity: 1, salePrice: 0, discount: 0, warranty: 'No Warranty', selectedSerials: [] }]);
      setSelectedCustomerId('');
      setManualCustomerName('');
      setCustomerMode('select');
    } catch (error) {
      console.error('Error submitting sales invoice:', error);
      toast.error('Failed to create sales invoice');
    } finally {
      setSaving(false);
    }
  };

  const filteredSales = sales.filter(s => 
    s.invoiceNo?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getInitials = (name: string) => {
    if (!name) return 'EM';
    return name
      .split(' ')
      .filter(Boolean)
      .map(word => word[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Sales Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">Manage sales receipts, view item details, and track performance</p>
        </div>
        <button 
          onClick={() => {
            setInvoiceItems([{ productId: '', quantity: 1, salePrice: 0, selectedSerials: [] }]);
            setShowModal(true);
          }}
          className="flex items-center px-4 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl shadow-md shadow-emerald-950/10 transition-colors text-sm font-bold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Invoice
        </button>
      </div>

      <div className="glass-panel rounded-2xl shadow-sm overflow-hidden bg-white">
        <div className="p-4 border-b border-slate-150 bg-slate-50/50">
          <div className="relative max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-450" />
            </div>
            <input
              type="text"
              placeholder="Search invoices by invoice number or customer..."
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
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Invoice No</th>
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
                          {sale.items && sale.items.length > 0 && (
                            <div className="text-[10px] text-slate-400 mt-0.5">{sale.items.length} item(s)</div>
                          )}
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
                      <button 
                        onClick={() => {
                          setSelectedSale(sale);
                          setShowDetailModal(true);
                        }}
                        className="text-slate-400 hover:text-slate-800 p-2 hover:bg-slate-50 rounded-lg transition-colors flex items-center ml-auto"
                        title="View Receipt"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        <span className="text-xs font-bold text-slate-600">View</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 1. Dynamic Invoice Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setShowModal(false)} />
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full border border-slate-200">
              <form onSubmit={handleCreateInvoiceSubmit}>
                <div className="bg-white px-6 pt-6 pb-6 border-b border-slate-100 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-50 text-[#0a382c] flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Create Sales Invoice</h3>
                      <p className="text-xs text-slate-500">Record a customer sale, select product line items, and deduct serialized stock</p>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setShowModal(false)} 
                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-white px-6 py-6 space-y-6 max-h-[70vh] overflow-y-auto">
                  {/* Two columns: Seller details & Customer details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Seller details */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                          <Building2 className="w-3.5 h-3.5 text-[#0a382c]" /> Seller Info (Company Profile)
                        </span>
                        <div className="flex items-start gap-3">
                          {storeDetails.logoUrl ? (
                            <img src={storeDetails.logoUrl} alt="Seller Logo" className="h-12 w-12 rounded-lg object-cover border border-slate-200 flex-shrink-0" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="h-12 w-12 rounded-lg bg-[#f0b90b] text-slate-950 flex items-center justify-center font-black text-sm flex-shrink-0 border border-slate-200">
                              {getInitials(storeDetails.name || 'ElectroManage')}
                            </div>
                          )}
                          <div className="text-xs space-y-0.5">
                            <span className="font-extrabold text-slate-800 text-xs block leading-snug">{storeDetails.name || 'ElectroManage'}</span>
                            {storeDetails.address && (
                              <span className="text-slate-500 block">{storeDetails.address}</span>
                            )}
                            {storeDetails.phone && (
                              <span className="text-slate-500 block">Tel: {storeDetails.phone}</span>
                            )}
                            {storeDetails.email && (
                              <span className="text-slate-500 block">Email: {storeDetails.email}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Customer Information Panel */}
                    <div className="bg-[#f8faf9] p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-[#0a382c]" /> Customer Details
                          </span>
                          <div className="bg-slate-200/60 p-0.5 rounded-lg flex border border-slate-200 text-[10px] font-bold">
                            <button
                              type="button"
                              onClick={() => setCustomerMode('select')}
                              className={`px-2.5 py-1 rounded ${customerMode === 'select' ? 'bg-[#0a382c] text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                            >
                              Select Existing
                            </button>
                            <button
                              type="button"
                              onClick={() => setCustomerMode('manual')}
                              className={`px-2.5 py-1 rounded ${customerMode === 'manual' ? 'bg-[#0a382c] text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                            >
                              Walk-in / Manual
                            </button>
                          </div>
                        </div>

                        {customerMode === 'select' ? (
                          <div className="mt-2">
                            <label htmlFor="customerId" className="sr-only">Select Customer</label>
                            <select
                              id="customerId"
                              required={customerMode === 'select'}
                              className="glass-input block w-full rounded-xl py-2 px-3 text-xs"
                              value={selectedCustomerId}
                              onChange={(e) => setSelectedCustomerId(e.target.value)}
                            >
                              <option value="">-- Choose Customer --</option>
                              {customers.map(c => (
                                <option key={c.id} value={c.id}>{c.name} ({c.mobile || 'No Mobile'})</option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="mt-2">
                            <label htmlFor="manualName" className="sr-only">Customer Name</label>
                            <input
                              id="manualName"
                              type="text"
                              required={customerMode === 'manual'}
                              placeholder="Enter Customer Full Name..."
                              className="glass-input block w-full rounded-xl py-2 px-4 text-xs"
                              value={manualCustomerName}
                              onChange={(e) => setManualCustomerName(e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div className="space-y-4">
                    <span className="text-xs font-black text-slate-600 uppercase tracking-wider block">
                      Product Line Items
                    </span>

                    <div className="space-y-3.5">
                      {invoiceItems.map((item, index) => {
                        const selectedProduct = products.find(p => p.id === item.productId);
                        const productSerials = allSerials.filter(sn => sn.productId === item.productId);
                        
                        return (
                          <div key={index} className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 shadow-sm hover:border-slate-350 transition-all">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                              {/* Product Selection */}
                              <div className="md:col-span-4">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Product</label>
                                <select
                                  required
                                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs"
                                  value={item.productId}
                                  onChange={(e) => handleItemProductChange(index, e.target.value)}
                                >
                                  <option value="">-- Select Product --</option>
                                  {products.map(p => (
                                    <option key={p.id} value={p.id} disabled={p.stock <= 0}>
                                      {p.name} ({p.brand} - {p.modelNumber}) [In Stock: {p.stock}]
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Unit Price */}
                              <div className="md:col-span-2">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Unit Price ($)</label>
                                <input
                                  type="number"
                                  required
                                  min="0"
                                  step="0.01"
                                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs"
                                  value={item.salePrice || ''}
                                  onChange={(e) => handleItemPriceChange(index, parseFloat(e.target.value) || 0)}
                                />
                              </div>

                              {/* Quantity */}
                              <div className="md:col-span-1">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 text-center">Qty</label>
                                <input
                                  type="number"
                                  required
                                  min="1"
                                  max={selectedProduct ? selectedProduct.stock : 999}
                                  className="glass-input block w-full rounded-xl py-2 px-1 text-xs font-bold text-center"
                                  value={item.quantity || ''}
                                  onChange={(e) => handleItemQuantityChange(index, parseInt(e.target.value) || 1)}
                                />
                              </div>

                              {/* Discount */}
                              <div className="md:col-span-2">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Discount ($)</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="0.00"
                                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs"
                                  value={item.discount || ''}
                                  onChange={(e) => handleItemDiscountChange(index, parseFloat(e.target.value) || 0)}
                                />
                              </div>

                              {/* Warranty */}
                              <div className="md:col-span-2">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Warranty</label>
                                <select
                                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs"
                                  value={item.warranty || 'No Warranty'}
                                  onChange={(e) => handleItemWarrantyChange(index, e.target.value)}
                                >
                                  <option value="No Warranty">No Warranty</option>
                                  <option value="3 Months">3 Months</option>
                                  <option value="6 Months">6 Months</option>
                                  <option value="1 Year">1 Year</option>
                                  <option value="2 Years">2 Years</option>
                                  <option value="3 Years">3 Years</option>
                                </select>
                              </div>

                              {/* Subtotal */}
                              <div className="md:col-span-1 flex items-center justify-between md:justify-end gap-1.5 w-full pb-1 md:pb-0">
                                <div className="text-right">
                                  <span className="block md:hidden text-[10px] font-bold text-slate-400 uppercase">Subtotal</span>
                                  <span className="text-xs font-black text-slate-900">
                                    ${Math.max(0, (item.quantity * item.salePrice) - (item.discount || 0)).toFixed(2)}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItemRow(index)}
                                  className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition-colors ml-2"
                                  title="Delete row"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Serial Number Selector for Electronics */}
                            {selectedProduct && productSerials.length > 0 && (
                              <div className="mt-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                                    Select Sold Serial Numbers (Required: {item.quantity})
                                  </span>
                                  <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                    {productSerials.length} Available
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-24 overflow-y-auto pr-1">
                                  {productSerials.map(sn => {
                                    const isChecked = item.selectedSerials.includes(sn.id);
                                    return (
                                      <label key={sn.id} className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                                        isChecked 
                                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-bold' 
                                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700 font-medium'
                                      }`}>
                                        <input
                                          type="checkbox"
                                          className="rounded border-slate-300 text-[#0a382c] focus:ring-[#0a382c] h-3.5 w-3.5"
                                          checked={isChecked}
                                          disabled={!isChecked && item.selectedSerials.length >= item.quantity}
                                          onChange={(e) => {
                                            const checked = e.target.checked;
                                            let newSerials = [...item.selectedSerials];
                                            if (checked) {
                                              if (newSerials.length < item.quantity) {
                                                newSerials.push(sn.id);
                                              }
                                            } else {
                                              newSerials = newSerials.filter(id => id !== sn.id);
                                            }
                                            const updatedItems = [...invoiceItems];
                                            updatedItems[index] = { ...item, selectedSerials: newSerials };
                                            setInvoiceItems(updatedItems);
                                          }}
                                        />
                                        <span className="font-mono truncate">{sn.serialNumber}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                                {item.selectedSerials.length !== item.quantity && (
                                  <span className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                                    <Info className="w-3 h-3" /> Please check exactly {item.quantity} serial number(s) to verify item delivery. (Selected: {item.selectedSerials.length})
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      className="flex items-center text-xs font-bold text-[#0a382c] hover:text-[#0d4a3b] bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-xl transition-all shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      Add Item Row
                    </button>
                  </div>
                </div>

                <div className="bg-[#f8faf9] px-6 py-4 sm:px-6 flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-slate-200">
                  <div className="text-center sm:text-left">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold block">Invoice Total Amount</span>
                    <span className="text-2xl font-black text-[#0a382c]">${calculateInvoiceTotal().toFixed(2)}</span>
                  </div>

                  <div className="flex gap-3 w-full sm:w-auto">
                    <button 
                      type="button" 
                      onClick={() => setShowModal(false)} 
                      className="flex-1 sm:flex-none inline-flex justify-center rounded-xl border border-slate-200 px-5 py-2.5 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      disabled={saving || calculateInvoiceTotal() <= 0}
                      className="flex-1 sm:flex-none inline-flex justify-center items-center rounded-xl px-5 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-sm font-bold text-white shadow-md shadow-emerald-950/10 focus:outline-none transition-colors disabled:opacity-50"
                    >
                      {saving ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      ) : (
                        'Create Invoice'
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 2. Styled Printable Receipt Detail Modal */}
      {showDetailModal && selectedSale && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setShowDetailModal(false)} />
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full border border-slate-200">
              <div className="bg-[#0a382c] p-6 text-white flex justify-between items-center">
                <div className="flex items-center gap-3">
                  {storeDetails.logoUrl ? (
                    <img src={storeDetails.logoUrl} alt="Logo" className="h-10 w-10 rounded-lg object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-[#f0b90b] text-slate-950 flex items-center justify-center font-black text-sm">
                      {getInitials(storeDetails.name || 'ElectroManage')}
                    </div>
                  )}
                  <div>
                    <h3 className="font-extrabold text-lg leading-tight">{storeDetails.name || 'ElectroManage'}</h3>
                    <p className="text-[10px] text-emerald-300 uppercase tracking-widest font-black">Sales Receipt</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowDetailModal(false)} 
                  className="text-emerald-100 hover:text-white p-1 rounded-lg hover:bg-emerald-900 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-white p-6 space-y-6">
                {/* Meta & Company details */}
                <div className="grid grid-cols-2 gap-6 border-b border-slate-100 pb-5 text-xs">
                  <div>
                    <span className="text-slate-400 uppercase tracking-wider font-extrabold block mb-1.5">Seller (Company Profile)</span>
                    <span className="font-extrabold text-slate-900 text-sm block">{storeDetails.name || 'ElectroManage'}</span>
                    {storeDetails.address && (
                      <span className="text-slate-500 block mt-0.5">{storeDetails.address}</span>
                    )}
                    {storeDetails.phone && (
                      <span className="text-slate-500 block mt-0.5">Tel: {storeDetails.phone}</span>
                    )}
                    {storeDetails.email && (
                      <span className="text-slate-500 block mt-0.5">Email: {storeDetails.email}</span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 uppercase tracking-wider font-extrabold block mb-1.5">Billed To (Customer)</span>
                    <span className="font-extrabold text-slate-900 text-sm block">{selectedSale.customerName}</span>
                    <div className="text-slate-500 mt-2 space-y-0.5">
                      <div>Invoice No: <span className="font-mono font-bold text-slate-800">{selectedSale.invoiceNo}</span></div>
                      <div>Date: <span className="font-semibold">{selectedSale.date ? new Date(selectedSale.date).toLocaleDateString() : 'N/A'}</span></div>
                      <div>Status: <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 border border-emerald-100 rounded text-[10px] uppercase">Paid</span></div>
                    </div>
                  </div>
                </div>

                {/* Items details table */}
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Itemized Bill</h4>
                  {selectedSale.items && selectedSale.items.length > 0 ? (
                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                      <table className="min-w-full divide-y divide-slate-100">
                        <thead className="bg-[#f8faf9]">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Product</th>
                            <th className="px-4 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Price</th>
                            <th className="px-4 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Qty</th>
                            <th className="px-4 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Discount</th>
                            <th className="px-4 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Warranty</th>
                            <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {selectedSale.items.map((item, i) => (
                            <tr key={i} className="align-top">
                              <td className="px-4 py-3">
                                <div className="font-bold text-slate-900">{item.productName}</div>
                                <div className="text-[10px] text-slate-500 mt-0.5">{item.brand} • {item.modelNumber}</div>
                                {item.selectedSerials && item.selectedSerials.length > 0 && (
                                  <div className="mt-2.5 flex flex-wrap gap-1">
                                    <span className="text-[9px] text-slate-400 uppercase font-black block w-full">Serials:</span>
                                    {item.selectedSerials.map((sn, snIdx) => (
                                      <span key={snIdx} className="font-mono text-[9px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-150">
                                        {sn}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center font-semibold text-slate-700">${item.salePrice.toFixed(2)}</td>
                              <td className="px-4 py-3 text-center font-bold text-slate-900">{item.quantity}</td>
                              <td className="px-4 py-3 text-center text-slate-600 font-semibold">
                                {item.discount && item.discount > 0 ? `$${item.discount.toFixed(2)}` : '-'}
                              </td>
                              <td className="px-4 py-3 text-center text-slate-600 font-semibold">
                                {item.warranty || 'No Warranty'}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-slate-900">
                                ${(item.subtotal || (item.quantity * item.salePrice - (item.discount || 0))).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 text-center">
                      <p className="text-xs text-slate-500 italic">No direct line item details recorded. This was entered as a quick-sum invoice.</p>
                      <div className="mt-3 text-sm font-bold text-slate-800">Total Invoice Amount: ${selectedSale.total?.toFixed(2)}</div>
                    </div>
                  )}
                </div>

                {/* Totals panel */}
                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <div className="w-1/2 text-right space-y-1.5 text-xs">
                    <div className="flex justify-between font-semibold text-slate-500">
                      <span>Subtotal (Pre-discount):</span>
                      <span>
                        ${selectedSale.items?.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0).toFixed(2) || selectedSale.total?.toFixed(2)}
                      </span>
                    </div>
                    {selectedSale.items?.some(item => item.discount > 0) && (
                      <div className="flex justify-between font-semibold text-rose-600">
                        <span>Total Discount:</span>
                        <span>
                          -${selectedSale.items?.reduce((sum, item) => sum + (item.discount || 0), 0).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-slate-500">
                      <span>Tax / VAT (0%):</span>
                      <span>$0.00</span>
                    </div>
                    <div className="flex justify-between text-base font-black text-[#0a382c] border-t border-slate-100 pt-2.5">
                      <span>Total Amount Paid:</span>
                      <span>${selectedSale.total?.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[#f8faf9] px-6 py-4 flex justify-between items-center border-t border-slate-150">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Authorized Receipt
                </div>
                <button 
                  onClick={() => setShowDetailModal(false)}
                  className="px-5 py-2.5 bg-slate-950 hover:bg-slate-900 text-white font-bold rounded-xl text-xs shadow-md transition-colors"
                >
                  Close Receipt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
