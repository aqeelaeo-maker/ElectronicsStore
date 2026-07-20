import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, serverTimestamp, query, orderBy, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Plus, Search, Package, History, TrendingUp, User, FileText, ArrowUpRight } from 'lucide-react';
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
        <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
          Out of Stock
        </span>
      );
    } else if (stock < 5) {
      return (
        <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
          Low Stock ({stock})
        </span>
      );
    } else {
      return (
        <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          In Stock ({stock})
        </span>
      );
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Inventory</h1>
          <p className="text-sm text-slate-400 mt-1">Track current stock levels and add incoming stock</p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-3">
          {activeTab === 'current' && (
            <div className="bg-slate-900 p-1.5 rounded-xl flex border border-slate-800 text-xs shadow-md">
              <button
                onClick={() => {
                  setViewMode('cards');
                  setBulkQuantities({});
                }}
                className={`px-3 py-1.5 font-bold rounded-lg transition-all ${
                  viewMode === 'cards'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
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
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Bulk Entry Mode
              </button>
            </div>
          )}

          <div className="bg-slate-900 p-1.5 rounded-xl flex shadow-md border border-slate-800">
            <button
              onClick={() => setActiveTab('current')}
              className={`flex items-center px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                activeTab === 'current'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Package className="w-4 h-4 mr-2" />
              Current Stock
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                activeTab === 'history'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="w-4 h-4 mr-2" />
              Stock History
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'current' ? (
        viewMode === 'cards' ? (
          <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
            {/* Left Column: Products List with search */}
            <div className="w-full lg:w-3/5 flex flex-col bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
              <div className="p-4 border-b border-slate-800">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search products by name, brand, category, or model..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <Search className="w-5 h-5 text-slate-500 absolute left-3 top-3" />
                </div>
              </div>

              <div className="overflow-y-auto flex-1 p-4">
                {loading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                    <p className="text-base font-bold text-slate-300">No Products Found</p>
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
                              ? 'border-blue-500 bg-blue-500/5 shadow-md shadow-blue-500/5 ring-1 ring-blue-500/20'
                              : 'border-slate-800 hover:border-slate-700 hover:bg-slate-850/20 shadow-sm'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                                {product.category}
                              </span>
                              <h3 className="font-bold text-white mt-2 line-clamp-1">{product.name}</h3>
                              <p className="text-xs text-slate-400 mt-0.5">{product.brand} | Model: {product.modelNumber}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800">
                            <div>
                              <span className="text-[10px] text-slate-500 block uppercase tracking-wider font-bold">Current Stock</span>
                              <div className="mt-1">{getStockBadge(product.stock || 0)}</div>
                            </div>
                            
                            <button
                              onClick={() => {
                                setSelectedProduct(product);
                                setQuantityToAdd(10); // Default placeholder suggestion
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center shadow-sm ${
                                isSelected
                                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-750 border border-slate-700/50'
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
            <div className="w-full lg:w-2/5 flex flex-col bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
              {!selectedProduct ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500 min-h-[300px]">
                  <TrendingUp className="w-16 h-16 text-slate-700 mb-4" />
                  <p className="text-base font-bold text-slate-300 mb-1">Select a Product</p>
                  <p className="text-xs max-w-xs mx-auto text-slate-500 leading-relaxed">
                    Click the "Add Stock" button on any product card on the left to add incoming inventory.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  <div className="p-4 border-b border-slate-800 bg-slate-950/40">
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-base font-bold text-white">Add Stock</h2>
                        <p className="text-xs text-slate-400 mt-0.5">{selectedProduct.name}</p>
                      </div>
                      <button
                        onClick={() => setSelectedProduct(null)}
                        className="text-slate-400 hover:text-white text-xs font-semibold"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-4 text-xs pt-3 border-t border-slate-800">
                      <div>
                        <span className="text-slate-500 block">Model</span>
                        <span className="font-bold text-slate-300">{selectedProduct.modelNumber}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Current Stock</span>
                        <span className="font-bold text-slate-300">{selectedProduct.stock || 0} units</span>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleAddStockSubmit} className="p-6 space-y-5 flex-1 overflow-y-auto">
                    <div>
                      <label htmlFor="quantityToAdd" className="block text-sm font-semibold text-slate-300">
                        Quantity to Add <span className="text-red-400">*</span>
                      </label>
                      <div className="mt-1.5 flex items-center gap-3">
                        <input
                          type="number"
                          id="quantityToAdd"
                          required
                          min="1"
                          className="block w-full bg-slate-950 border border-slate-800 rounded-xl shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 sm:text-sm text-slate-100 font-bold"
                          value={quantityToAdd}
                          onChange={(e) => setQuantityToAdd(Math.max(1, parseInt(e.target.value) || 0))}
                        />
                        <div className="flex gap-1">
                          {[10, 25, 50, 100].map(val => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setQuantityToAdd(val)}
                              className="px-2 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-extrabold rounded-lg text-xs transition-colors border border-slate-700/50"
                            >
                              +{val}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="vendor" className="block text-sm font-semibold text-slate-300">
                        Supplier / Vendor (Optional)
                      </label>
                      <select
                        id="vendor"
                        className="mt-1.5 block w-full bg-slate-950 border border-slate-800 rounded-xl shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 sm:text-sm text-slate-100 font-medium"
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
                      <label htmlFor="refNumber" className="block text-sm font-semibold text-slate-300">
                        Reference / Invoice Number (Optional)
                      </label>
                      <input
                        type="text"
                        id="refNumber"
                        placeholder="e.g. INV-2026-001"
                        className="mt-1.5 block w-full bg-slate-950 border border-slate-800 rounded-xl shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 sm:text-sm text-slate-100 placeholder-slate-600"
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value)}
                      />
                    </div>

                    <div className="bg-blue-500/5 p-4 rounded-xl border border-blue-500/10 space-y-2 text-xs mt-6">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Previous Stock:</span>
                        <span className="font-semibold text-slate-200">{selectedProduct.stock || 0} units</span>
                      </div>
                      <div className="flex justify-between text-blue-400 font-bold border-t border-slate-800/80 pt-2">
                        <span>New Projected Stock:</span>
                        <span>{(selectedProduct.stock || 0) + quantityToAdd} units</span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={saving || quantityToAdd <= 0}
                      className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 focus:outline-none transition-colors disabled:opacity-50 mt-6 shadow-blue-500/10"
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
            <div className="w-full lg:w-3/5 flex flex-col bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
              <div className="p-4 border-b border-slate-800 bg-slate-950/20">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search products to add inventory..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <Search className="w-5 h-5 text-slate-500 absolute left-3 top-3" />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                    <p className="text-base font-bold text-slate-300">No Products Found</p>
                    <p className="text-xs text-slate-500 mt-1">Add products in the Products section first.</p>
                  </div>
                ) : (
                  <div className="border border-slate-800 rounded-xl overflow-hidden shadow-inner">
                    <table className="min-w-full divide-y divide-slate-800">
                      <thead className="bg-slate-950/40">
                        <tr>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Product Info</th>
                          <th scope="col" className="px-4 py-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">Current Stock</th>
                          <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider w-40">Add Stock</th>
                        </tr>
                      </thead>
                      <tbody className="bg-slate-900 divide-y divide-slate-800">
                        {filteredProducts.map((product) => {
                          return (
                            <tr key={product.id} className="hover:bg-slate-850/20 transition-colors">
                              <td className="px-4 py-3">
                                <div className="text-sm font-bold text-white">{product.name}</div>
                                <div className="text-xs text-slate-400 mt-0.5">
                                  {product.brand} • {product.modelNumber} • <span className="text-slate-500 font-mono text-[10px]">{product.category}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="text-sm font-bold text-slate-300">{product.stock || 0}</div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="+0"
                                    className="w-20 px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-sm text-center font-bold"
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
                                      className="px-1 text-[9px] font-bold bg-slate-800 hover:bg-slate-750 text-slate-400 rounded border border-slate-700/50"
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
                                      className="px-1 text-[9px] font-bold bg-slate-800 hover:bg-slate-750 text-slate-400 rounded border border-slate-700/50"
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
            <div className="w-full lg:w-2/5 flex flex-col bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
              <div className="p-4 border-b border-slate-800 bg-slate-950/40">
                <h2 className="text-base font-bold text-white">Bulk Stock Settings</h2>
                <p className="text-xs text-slate-400 mt-0.5">Define supplier and reference details for this batch</p>
              </div>

              <form onSubmit={handleBulkSubmit} className="p-6 space-y-5 flex-1 overflow-y-auto">
                <div>
                  <label htmlFor="bulkVendor" className="block text-sm font-semibold text-slate-300">
                    Supplier / Vendor (Optional)
                  </label>
                  <select
                    id="bulkVendor"
                    className="mt-1.5 block w-full bg-slate-950 border border-slate-800 rounded-xl shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 sm:text-sm text-slate-100 font-medium"
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
                  <label htmlFor="bulkRefNumber" className="block text-sm font-semibold text-slate-300">
                    Reference / Invoice Number (Optional)
                  </label>
                  <input
                    type="text"
                    id="bulkRefNumber"
                    placeholder="e.g. INV-2026-BATCH"
                    className="mt-1.5 block w-full bg-slate-950 border border-slate-800 rounded-xl shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 sm:text-sm text-slate-100 placeholder-slate-600"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                  />
                </div>

                <div className="bg-blue-500/5 p-4 rounded-xl border border-blue-500/10 space-y-3 mt-6">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Stock Addition Summary</h3>
                  <div className="space-y-2 text-xs divide-y divide-slate-800/60">
                    {(Object.entries(bulkQuantities) as [string, number][]).filter(([_, qty]) => qty > 0).length === 0 ? (
                      <div className="text-slate-500 italic py-2">No quantities entered yet. Enter stock amounts on the left table.</div>
                    ) : (
                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 pt-1">
                        {(Object.entries(bulkQuantities) as [string, number][]).map(([pId, qty]) => {
                          if (qty <= 0) return null;
                          const prod = products.find(p => p.id === pId);
                          return (
                            <div key={pId} className="flex justify-between py-1 text-slate-300">
                              <span className="line-clamp-1 flex-1 pr-2">{prod?.name}</span>
                              <span className="font-bold text-blue-400 font-mono">+{qty}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between text-blue-400 font-bold border-t border-slate-800/80 pt-3 text-sm">
                    <span>Products to Update:</span>
                    <span>{(Object.values(bulkQuantities) as number[]).filter(qty => qty > 0).length} items</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setBulkQuantities({});
                      setViewMode('cards');
                    }}
                    className="flex-1 py-3 px-4 rounded-xl border border-slate-800 text-slate-300 bg-slate-950/40 hover:bg-slate-850 hover:text-white text-sm font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || (Object.values(bulkQuantities) as number[]).filter(qty => qty > 0).length === 0}
                    className="flex-1 flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 focus:outline-none transition-colors disabled:opacity-50 shadow-blue-500/10"
                  >
                    {saving ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    ) : (
                      <>
                        <Plus className="w-5 h-5 mr-2" />
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
        <div className="bg-slate-900 rounded-2xl border border-slate-800 flex-1 flex flex-col overflow-hidden shadow-lg">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/40 flex justify-between items-center">
            <h2 className="text-lg font-bold text-white">Inventory Transaction Log</h2>
            <span className="text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full">
              {logs.length} Transactions
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            {logs.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <History className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                <p className="text-base font-bold text-slate-300">No Logged Additions Yet</p>
                <p className="text-xs text-slate-500 mt-1">Added stock entries will show up here as an audit trail.</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-slate-800 table-fixed">
                <thead className="bg-slate-950/40 sticky top-0">
                  <tr>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-1/4">Product</th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-1/6">Qty Added</th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-1/6">Stock Path</th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-1/4">Supplier & Ref</th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-1/6">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-slate-900 divide-y divide-slate-800">
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
                      <tr key={log.id} className="hover:bg-slate-850/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-white line-clamp-1 text-sm">{log.productName}</div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {log.productBrand} | Model: {log.productModelNumber}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                            <Plus className="w-3 h-3 mr-0.5" />
                            {log.quantityAdded} units
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-1.5 font-bold font-mono text-xs">
                            <span className="text-slate-500">{log.previousStock}</span>
                            <span className="text-slate-600">→</span>
                            <span className="text-blue-400 font-bold">{log.newStock}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs font-bold text-slate-300 line-clamp-1">
                            {log.vendorName ? (
                              <span className="flex items-center">
                                <User className="w-3.5 h-3.5 mr-1 text-purple-400" />
                                {log.vendorName}
                              </span>
                            ) : (
                              <span className="text-slate-500 font-normal italic">Direct stock addition</span>
                            )}
                          </div>
                          {log.referenceNumber && (
                            <div className="text-[11px] text-slate-400 flex items-center mt-1">
                              <FileText className="w-3 h-3 mr-1 text-slate-500" />
                              Ref: {log.referenceNumber}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400 font-medium">
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
