import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, serverTimestamp, query, orderBy, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Plus, Search, Package, History, TrendingUp, User, FileText } from 'lucide-react';
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

interface Vendor {
  id: string;
  companyName: string;
}

interface InventoryLog {
  id: string;
  productId: string;
  productName: string;
  productBrand: string;
  productModelNumber: string;
  quantityAdded: number;
  previousStock: number;
  newStock: number;
  vendorId?: string;
  vendorName?: string;
  referenceNumber?: string;
  createdAt: any;
}

export default function Inventory() {
  const { storeId, role } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantityToAdd, setQuantityToAdd] = useState<number>(0);
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [viewMode, setViewMode] = useState<'cards' | 'bulk'>('cards');
  const [bulkQuantities, setBulkQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!storeId) return;

    // 1. Fetch Products
    const productsQuery = role === 'Super Admin'
      ? query(collection(db, 'products'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'products'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'));

    const unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
      const data: Product[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Product);
      });
      setProducts(data);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching products:', error);
      toast.error('Failed to load products');
    });

    // 2. Fetch Vendors
    const vendorsQuery = role === 'Super Admin'
      ? query(collection(db, 'vendors'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'vendors'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'));

    const unsubscribeVendors = onSnapshot(vendorsQuery, (snapshot) => {
      const data: Vendor[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Vendor);
      });
      setVendors(data);
    }, (error) => {
      console.error('Error fetching vendors:', error);
    });

    // 3. Fetch Inventory Logs
    const logsQuery = role === 'Super Admin'
      ? query(collection(db, 'inventoryLogs'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'inventoryLogs'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'));

    const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
      const data: InventoryLog[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as InventoryLog);
      });
      setLogs(data);
    }, (error) => {
      console.error('Error fetching inventory logs:', error);
    });

    return () => {
      unsubscribeProducts();
      unsubscribeVendors();
      unsubscribeLogs();
    };
  }, [storeId, role]);

  const handleAddStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !storeId || quantityToAdd <= 0) {
      toast.error('Please select a product and enter a valid quantity');
      return;
    }

    setSaving(true);
    const selectedVendor = vendors.find(v => v.id === selectedVendorId);
    const previousStock = selectedProduct.stock || 0;
    const newStock = previousStock + quantityToAdd;

    try {
      // 1. Update product's stock count
      await updateDoc(doc(db, 'products', selectedProduct.id), {
        stock: newStock,
        updatedAt: serverTimestamp()
      });

      // 2. Add entry to inventoryLogs
      await addDoc(collection(db, 'inventoryLogs'), {
        storeId,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        productBrand: selectedProduct.brand,
        productModelNumber: selectedProduct.modelNumber,
        quantityAdded: quantityToAdd,
        previousStock,
        newStock,
        vendorId: selectedVendorId || null,
        vendorName: selectedVendor?.companyName || null,
        referenceNumber: referenceNumber.trim() || null,
        createdAt: serverTimestamp()
      });

      toast.success(`Successfully added ${quantityToAdd} units to ${selectedProduct.name}`);
      
      // Reset form states
      setSelectedProduct(null);
      setQuantityToAdd(0);
      setSelectedVendorId('');
      setReferenceNumber('');
    } catch (error) {
      console.error('Error updating inventory:', error);
      toast.error('Failed to update inventory');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const itemsToUpdate = (Object.entries(bulkQuantities) as [string, number][]).filter(([_, qty]) => qty > 0);
    if (itemsToUpdate.length === 0) {
      toast.warning('Please enter an added quantity for at least one product');
      return;
    }

    setSaving(true);
    try {
      const selectedVendor = vendors.find(v => v.id === selectedVendorId);
      
      const promises = itemsToUpdate.map(async ([pId, qty]) => {
        const prod = products.find(p => p.id === pId);
        if (!prod) return;
        
        const previousStock = prod.stock || 0;
        const newStock = previousStock + qty;
        
        // 1. Update product stock
        await updateDoc(doc(db, 'products', pId), {
          stock: newStock,
          updatedAt: serverTimestamp()
        });
        
        // 2. Add entry to inventoryLogs
        await addDoc(collection(db, 'inventoryLogs'), {
          storeId,
          productId: pId,
          productName: prod.name,
          productBrand: prod.brand,
          productModelNumber: prod.modelNumber,
          quantityAdded: qty,
          previousStock,
          newStock,
          vendorId: selectedVendorId || null,
          vendorName: selectedVendor?.companyName || null,
          referenceNumber: referenceNumber.trim() || null,
          createdAt: serverTimestamp()
        });
      });
      
      await Promise.all(promises);
      toast.success(`Successfully updated stock for ${itemsToUpdate.length} products`);
      
      // Reset form states
      setBulkQuantities({});
      setSelectedVendorId('');
      setReferenceNumber('');
      setViewMode('cards');
    } catch (error) {
      console.error('Error applying bulk inventory updates:', error);
      toast.error('Failed to update bulk inventory');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.brand.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.modelNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStockBadge = (stock: number) => {
    if (stock === 0) {
      return (
        <span className="px-2.5 py-1 text-[10px] leading-5 font-black rounded-full bg-rose-50 border border-rose-150 text-rose-800 uppercase tracking-wider">
          Out of Stock
        </span>
      );
    } else if (stock < 5) {
      return (
        <span className="px-2.5 py-1 text-[10px] leading-5 font-black rounded-full bg-amber-50 border border-amber-150 text-amber-800 uppercase tracking-wider">
          Low Stock ({stock})
        </span>
      );
    } else {
      return (
        <span className="px-2.5 py-1 text-[10px] leading-5 font-black rounded-full bg-emerald-50 border border-emerald-150 text-emerald-800 uppercase tracking-wider">
          In Stock ({stock})
        </span>
      );
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500 mt-1">Track current stock levels and add incoming stock</p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-3">
          {activeTab === 'current' && (
            <div className="bg-slate-100 p-1 rounded-xl flex border border-slate-200 text-xs shadow-sm">
              <button
                onClick={() => {
                  setViewMode('cards');
                  setBulkQuantities({});
                }}
                className={`px-3 py-1.5 font-bold rounded-lg transition-all ${
                  viewMode === 'cards'
                    ? 'bg-[#0a382c] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Single Item Mode
              </button>
              <button
                onClick={() => {
                  setViewMode('bulk');
                  setSelectedProduct(null);
                }}
                className={`px-3 py-1.5 font-bold rounded-lg transition-all ${
                  viewMode === 'bulk'
                    ? 'bg-[#0a382c] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bulk Entry Mode
              </button>
            </div>
          )}

          <div className="bg-slate-100 p-1 rounded-xl flex border border-slate-200">
            <button
              onClick={() => setActiveTab('current')}
              className={`flex items-center px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'current'
                  ? 'bg-[#0a382c] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Package className="w-3.5 h-3.5 mr-2" />
              Current Stock
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'history'
                  ? 'bg-[#0a382c] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5 mr-2" />
              Stock History
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'current' ? (
        viewMode === 'cards' ? (
          <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
            {/* Left Column: Products List with search */}
            <div className="w-full lg:w-3/5 flex flex-col glass-panel rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-150 bg-slate-50/50">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search products by name, brand, category, or model..."
                    className="glass-input block w-full pl-10 pr-3 py-2.5 rounded-xl text-xs"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <Search className="w-4 h-4 text-slate-450 absolute left-3.5 top-3.5" />
                </div>
              </div>

              <div className="overflow-y-auto flex-1 p-4 bg-white">
                {loading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a382c]"></div>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Package className="w-12 h-12 text-slate-350 mx-auto mb-3" />
                    <p className="text-base font-bold text-slate-700">No Products Found</p>
                    <p className="text-xs text-slate-500 mt-1">Add products in the Products section first.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {filteredProducts.map((product) => {
                      const isSelected = selectedProduct?.id === product.id;
                      return (
                        <div
                          key={product.id}
                          className={`p-4 rounded-xl border transition-all ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50/40 shadow-sm shadow-emerald-500/5 ring-1 ring-emerald-500/20'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-[#f8faf9]'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded border border-emerald-150">
                                {product.category}
                              </span>
                              <h3 className="font-bold text-slate-900 mt-2 line-clamp-1">{product.name}</h3>
                              <p className="text-xs text-slate-500 mt-0.5">{product.brand} | Model: {product.modelNumber}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                            <div>
                              <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-extrabold">Current Stock</span>
                              <div className="mt-1">{getStockBadge(product.stock || 0)}</div>
                            </div>
                            
                            <button
                              onClick={() => {
                                setSelectedProduct(product);
                                setQuantityToAdd(10);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center shadow-sm ${
                                isSelected
                                  ? 'bg-[#0a382c] text-white shadow-md shadow-emerald-950/10'
                                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5 mr-1" />
                              Add Stock
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Add Stock Form */}
            <div className="w-full lg:w-2/5 flex flex-col glass-panel rounded-2xl shadow-sm border border-slate-200 overflow-hidden bg-white">
              {!selectedProduct ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500 min-h-[300px]">
                  <TrendingUp className="w-16 h-16 text-slate-300 mb-4" />
                  <p className="text-base font-bold text-slate-700 mb-1">Select a Product</p>
                  <p className="text-xs max-w-xs mx-auto text-slate-500 leading-relaxed">
                    Click the "Add Stock" button on any product card on the left to add incoming inventory.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col h-full bg-white">
                  <div className="p-4 border-b border-slate-150 bg-slate-50/50">
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">Add Stock</h2>
                        <p className="text-xs text-slate-500 mt-0.5">{selectedProduct.name}</p>
                      </div>
                      <button
                        onClick={() => setSelectedProduct(null)}
                        className="text-slate-500 hover:text-slate-800 text-xs font-semibold"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-4 text-xs pt-3 border-t border-slate-200">
                      <div>
                        <span className="text-slate-400 block">Model</span>
                        <span className="font-bold text-slate-800">{selectedProduct.modelNumber}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Current Stock</span>
                        <span className="font-bold text-slate-800">{selectedProduct.stock || 0} units</span>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleAddStockSubmit} className="p-6 space-y-5 flex-1 overflow-y-auto">
                    <div>
                      <label htmlFor="quantityToAdd" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Quantity to Add <span className="text-rose-500">*</span>
                      </label>
                      <div className="mt-1.5 flex items-center gap-3">
                        <input
                          type="number"
                          id="quantityToAdd"
                          required
                          min="1"
                          className="glass-input block w-full rounded-xl py-2 px-3 text-slate-800 font-bold"
                          value={quantityToAdd || ''}
                          onChange={(e) => setQuantityToAdd(Math.max(1, parseInt(e.target.value) || 0))}
                        />
                        <div className="flex gap-1">
                          {[10, 25, 50, 100].map(val => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setQuantityToAdd(val)}
                              className="px-2 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold rounded-lg text-xs transition-colors"
                            >
                              +{val}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="vendor" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Supplier / Vendor (Optional)
                      </label>
                      <select
                        id="vendor"
                        className="glass-input block w-full rounded-xl py-2.5 px-3 text-slate-800 font-medium"
                        value={selectedVendorId}
                        onChange={(e) => setSelectedVendorId(e.target.value)}
                      >
                        <option value="">Select Vendor</option>
                        {vendors.map(v => (
                           <option key={v.id} value={v.id}>{v.companyName}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="refNumber" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Reference / Invoice Number (Optional)
                      </label>
                      <input
                        type="text"
                        id="refNumber"
                        placeholder="e.g. INV-2026-001"
                        className="glass-input block w-full rounded-xl py-2.5 px-3 text-slate-800 placeholder-slate-400"
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value)}
                      />
                    </div>

                    <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 space-y-2 text-xs mt-6">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Previous Stock:</span>
                        <span className="font-bold text-slate-800">{selectedProduct.stock || 0} units</span>
                      </div>
                      <div className="flex justify-between text-emerald-700 font-extrabold border-t border-emerald-100 pt-2">
                        <span>New Projected Stock:</span>
                        <span>{(selectedProduct.stock || 0) + quantityToAdd} units</span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={saving || quantityToAdd <= 0}
                      className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold text-white bg-[#0a382c] hover:bg-[#0d4a3b] focus:outline-none transition-colors disabled:opacity-50 mt-6 shadow-emerald-950/10"
                    >
                      {saving ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      ) : (
                        <>
                          <Plus className="w-5 h-5 mr-2" />
                          Save Inventory Addition
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Bulk Entry Mode Layout */
          <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
            {/* Left Column: List of All Products with Qty Input */}
            <div className="w-full lg:w-3/5 flex flex-col glass-panel rounded-2xl shadow-sm border border-slate-200 overflow-hidden bg-white">
              <div className="p-4 border-b border-slate-150 bg-slate-50/50">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search products to add inventory..."
                    className="glass-input block w-full pl-10 pr-3 py-2.5 rounded-xl text-xs"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <Search className="w-4 h-4 text-slate-450 absolute left-3.5 top-3.5" />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 bg-white">
                {loading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a382c]"></div>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Package className="w-12 h-12 text-slate-350 mx-auto mb-3" />
                    <p className="text-base font-bold text-slate-700">No Products Found</p>
                    <p className="text-xs text-slate-500 mt-1">Add products in the Products section first.</p>
                  </div>
                ) : (
                  <div className="border border-slate-150 rounded-xl overflow-hidden">
                    <table className="min-w-full divide-y divide-slate-100">
                      <thead className="bg-[#f8faf9]">
                        <tr>
                          <th scope="col" className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Product Info</th>
                          <th scope="col" className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current Stock</th>
                          <th scope="col" className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider w-40">Add Stock</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {filteredProducts.map((product) => {
                          return (
                            <tr key={product.id} className="hover:bg-[#f8faf9] transition-colors">
                              <td className="px-4 py-3">
                                <div className="text-sm font-bold text-slate-900">{product.name}</div>
                                <div className="text-xs text-slate-500 mt-0.5">
                                  {product.brand} • {product.modelNumber} • <span className="text-[#0a382c] font-black text-[10px] uppercase tracking-wider bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">{product.category}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="text-sm font-bold text-slate-800">{product.stock || 0}</div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="+0"
                                    className="w-20 px-2 py-1.5 glass-input text-slate-800 text-xs text-center font-bold"
                                    value={bulkQuantities[product.id] || ''}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseInt(e.target.value) || 0);
                                      setBulkQuantities(prev => ({
                                        ...prev,
                                        [product.id]: val
                                      }));
                                    }}
                                  />
                                  <div className="flex flex-col gap-0.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBulkQuantities(prev => ({
                                          ...prev,
                                          [product.id]: (prev[product.id] || 0) + 10
                                        }));
                                      }}
                                      className="px-1 py-0.5 text-[9px] font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded"
                                    >
                                      +10
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBulkQuantities(prev => ({
                                          ...prev,
                                          [product.id]: (prev[product.id] || 0) + 50
                                        }));
                                      }}
                                      className="px-1 py-0.5 text-[9px] font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded"
                                    >
                                      +50
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Bulk Entry Form Summary & Shared Details */}
            <div className="w-full lg:w-2/5 flex flex-col glass-panel rounded-2xl border border-slate-200 overflow-hidden bg-white">
              <div className="p-4 border-b border-slate-150 bg-slate-50/50">
                <h2 className="text-base font-bold text-slate-900">Bulk Stock Settings</h2>
                <p className="text-xs text-slate-500 mt-0.5">Define supplier and reference details for this batch</p>
              </div>

              <form onSubmit={handleBulkSubmit} className="p-6 space-y-5 flex-1 overflow-y-auto">
                <div>
                  <label htmlFor="bulkVendor" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Supplier / Vendor (Optional)
                  </label>
                  <select
                    id="bulkVendor"
                    className="glass-input block w-full rounded-xl py-2.5 px-3 text-slate-800 font-medium"
                    value={selectedVendorId}
                    onChange={(e) => setSelectedVendorId(e.target.value)}
                  >
                    <option value="">Select Vendor</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.companyName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="bulkRefNumber" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Reference / Invoice Number (Optional)
                  </label>
                  <input
                    type="text"
                    id="bulkRefNumber"
                    placeholder="e.g. INV-2026-BATCH"
                    className="glass-input block w-full rounded-xl py-2.5 px-3 text-slate-800 placeholder-slate-400"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                  />
                </div>

                <div className="bg-emerald-50/20 p-4 rounded-xl border border-emerald-100 space-y-3 mt-6">
                  <h3 className="text-[10px] font-black text-[#0a382c] uppercase tracking-wider bg-emerald-50/50 px-2.5 py-0.5 rounded border border-emerald-100 inline-block">Stock Addition Summary</h3>
                  <div className="space-y-2 text-xs divide-y divide-slate-100">
                    {(Object.entries(bulkQuantities) as [string, number][]).filter(([_, qty]) => qty > 0).length === 0 ? (
                      <div className="text-slate-400 italic py-2">No quantities entered yet. Enter stock amounts on the left table.</div>
                    ) : (
                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 pt-1">
                        {(Object.entries(bulkQuantities) as [string, number][]).map(([pId, qty]) => {
                          if (qty <= 0) return null;
                          const prod = products.find(p => p.id === pId);
                          return (
                            <div key={pId} className="flex justify-between py-1 text-slate-700">
                              <span className="line-clamp-1 flex-1 pr-2">{prod?.name}</span>
                              <span className="font-extrabold text-slate-900">+{qty}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between text-slate-900 font-bold border-t border-slate-150 pt-3 text-xs">
                    <span>Products to Update:</span>
                    <span className="text-emerald-800">{(Object.values(bulkQuantities) as number[]).filter(qty => qty > 0).length} items</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setBulkQuantities({});
                      setViewMode('cards');
                    }}
                    className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || (Object.values(bulkQuantities) as number[]).filter(qty => qty > 0).length === 0}
                    className="flex-1 flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-md text-xs font-black text-white bg-[#0a382c] hover:bg-[#0d4a3b] focus:outline-none transition-colors disabled:opacity-50 shadow-emerald-950/10"
                  >
                    {saving ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-1.5" />
                        Apply Additions
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      ) : (
        /* History / Audit Log Table */
        <div className="glass-panel rounded-2xl shadow-sm flex-1 flex flex-col overflow-hidden bg-white">
          <div className="px-6 py-4 border-b border-slate-150 bg-slate-50/50 flex justify-between items-center">
            <h2 className="text-lg font-black text-slate-900">Inventory Transaction Log</h2>
            <span className="text-[10px] font-black text-[#0a382c] bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider">
              {logs.length} Transactions
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            {logs.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <History className="w-12 h-12 text-slate-350 mx-auto mb-3" />
                <p className="text-base font-bold text-slate-700">No Logged Additions Yet</p>
                <p className="text-xs text-slate-500 mt-1">Added stock entries will show up here as an audit trail.</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-slate-100 table-fixed">
                <thead className="bg-[#f8faf9] sticky top-0">
                  <tr>
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-1/4">Product</th>
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-1/6">Qty Added</th>
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-1/6">Stock Path</th>
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-1/4">Supplier & Ref</th>
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-1/6">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {logs.map((log) => {
                    const formattedDate = log.createdAt
                      ? new Date(log.createdAt.seconds * 1000).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : 'Just now';

                    return (
                      <tr key={log.id} className="hover:bg-[#f8faf9] transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900 line-clamp-1 text-sm">{log.productName}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {log.productBrand} | Model: {log.productModelNumber}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center text-[10px] font-black text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-150 uppercase tracking-wider">
                            <Plus className="w-3 h-3 mr-0.5" />
                            {log.quantityAdded} units
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-1.5 font-bold font-mono text-xs">
                            <span className="text-slate-400">{log.previousStock}</span>
                            <span className="text-slate-400">→</span>
                            <span className="text-[#0a382c] font-black">{log.newStock}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs font-bold text-slate-800 line-clamp-1">
                            {log.vendorName ? (
                              <span className="flex items-center text-slate-800">
                                <User className="w-3.5 h-3.5 mr-1 text-[#0a382c]" />
                                {log.vendorName}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal italic">Direct stock addition</span>
                            )}
                          </div>
                          {log.referenceNumber && (
                            <div className="text-[10px] font-bold text-slate-500 flex items-center mt-1 uppercase tracking-wide">
                              <FileText className="w-3 h-3 mr-1 text-[#0a382c]" />
                              Ref: {log.referenceNumber}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 font-semibold">
                          {formattedDate}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
