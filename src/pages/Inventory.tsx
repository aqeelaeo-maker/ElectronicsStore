import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Plus, Search, Package, History, TrendingUp, User, FileText, Edit2, Trash2, X } from 'lucide-react';
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
  purchasePrice?: number;
  salePrice?: number;
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
  const [purchasePriceInput, setPurchasePriceInput] = useState<number>(0);
  const [salePriceInput, setSalePriceInput] = useState<number>(0);
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [viewMode, setViewMode] = useState<'cards' | 'bulk'>('cards');
  const [bulkQuantities, setBulkQuantities] = useState<Record<string, number>>({});
  const [bulkPurchasePrices, setBulkPurchasePrices] = useState<Record<string, number>>({});
  const [bulkSalePrices, setBulkSalePrices] = useState<Record<string, number>>({});

  // Edit Log State
  const [editingLog, setEditingLog] = useState<InventoryLog | null>(null);
  const [editQty, setEditQty] = useState<number>(0);
  const [editPurchasePrice, setEditPurchasePrice] = useState<number>(0);
  const [editSalePrice, setEditSalePrice] = useState<number>(0);
  const [editVendorId, setEditVendorId] = useState<string>('');
  const [editRefNumber, setEditRefNumber] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  // Searchable dropdown states
  const [productSearchInput, setProductSearchInput] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [vendorSearchInput, setVendorSearchInput] = useState('');
  const [isVendorDropdownOpen, setIsVendorDropdownOpen] = useState(false);

  const productRef = React.useRef<HTMLDivElement>(null);
  const vendorRef = React.useRef<HTMLDivElement>(null);

  // Sync search inputs with selection
  useEffect(() => {
    if (selectedProduct) {
      setProductSearchInput(`${selectedProduct.brand} ${selectedProduct.modelNumber} - ${selectedProduct.name}`);
    } else {
      setProductSearchInput('');
    }
  }, [selectedProduct]);

  useEffect(() => {
    if (selectedVendorId) {
      const vendor = vendors.find(v => v.id === selectedVendorId);
      if (vendor) {
        setVendorSearchInput(vendor.companyName);
      }
    } else {
      setVendorSearchInput('');
    }
  }, [selectedVendorId, vendors]);

  // Handle clicking outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (productRef.current && !productRef.current.contains(event.target as Node)) {
        setIsProductDropdownOpen(false);
      }
      if (vendorRef.current && !vendorRef.current.contains(event.target as Node)) {
        setIsVendorDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleProductSearchChange = (val: string) => {
    setProductSearchInput(val);
    setIsProductDropdownOpen(true);
    if (!val) {
      setSelectedProduct(null);
    }
  };

  const handleVendorSearchChange = (val: string) => {
    setVendorSearchInput(val);
    setIsVendorDropdownOpen(true);
    if (!val) {
      setSelectedVendorId('');
    }
  };

  const productSuggestions = products.filter(p => {
    const searchStr = productSearchInput.toLowerCase();
    return (
      p.name.toLowerCase().includes(searchStr) ||
      p.brand.toLowerCase().includes(searchStr) ||
      p.modelNumber.toLowerCase().includes(searchStr) ||
      p.category.toLowerCase().includes(searchStr)
    );
  });

  const vendorSuggestions = vendors.filter(v => {
    const searchStr = vendorSearchInput.toLowerCase();
    return v.companyName.toLowerCase().includes(searchStr);
  });

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
      // 1. Update product's stock count and prices
      await updateDoc(doc(db, 'products', selectedProduct.id), {
        stock: newStock,
        purchasePrice: purchasePriceInput,
        salePrice: salePriceInput,
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
        purchasePrice: purchasePriceInput,
        salePrice: salePriceInput,
        vendorId: selectedVendorId || null,
        vendorName: selectedVendor?.companyName || null,
        referenceNumber: referenceNumber.trim() || null,
        createdAt: serverTimestamp()
      });

      toast.success(`Successfully added ${quantityToAdd} units to ${selectedProduct.name}`);
      
      // Reset form states
      setSelectedProduct(null);
      setQuantityToAdd(0);
      setPurchasePriceInput(0);
      setSalePriceInput(0);
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
        
        const purchasePrice = pId in bulkPurchasePrices ? bulkPurchasePrices[pId] : (prod.purchasePrice || 0);
        const salePrice = pId in bulkSalePrices ? bulkSalePrices[pId] : (prod.salePrice || 0);

        // 1. Update product stock and prices
        await updateDoc(doc(db, 'products', pId), {
          stock: newStock,
          purchasePrice,
          salePrice,
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
          purchasePrice,
          salePrice,
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
      setBulkPurchasePrices({});
      setBulkSalePrices({});
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

  const handleDeleteLog = async (log: InventoryLog) => {
    if (!window.confirm(`Are you sure you want to delete this stock transaction? This will also revert ${log.quantityAdded} units from the product's current stock.`)) {
      return;
    }

    try {
      const product = products.find(p => p.id === log.productId);
      if (product) {
        const updatedStock = Math.max(0, (product.stock || 0) - log.quantityAdded);
        await updateDoc(doc(db, 'products', log.productId), {
          stock: updatedStock,
          updatedAt: serverTimestamp()
        });
      }

      await deleteDoc(doc(db, 'inventoryLogs', log.id));
      toast.success('Transaction log deleted and product stock reverted');
    } catch (error: any) {
      console.error('Error deleting transaction log:', error);
      toast.error(`Failed to delete transaction log: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleOpenEditLog = (log: InventoryLog) => {
    setEditingLog(log);
    setEditQty(log.quantityAdded);
    setEditPurchasePrice(log.purchasePrice || 0);
    setEditSalePrice(log.salePrice || 0);
    setEditVendorId(log.vendorId || '');
    setEditRefNumber(log.referenceNumber || '');
  };

  const handleSaveEditLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLog) return;

    setSavingEdit(true);
    try {
      const product = products.find(p => p.id === editingLog.productId);
      const qtyDifference = editQty - editingLog.quantityAdded;

      if (product) {
        const newStock = Math.max(0, (product.stock || 0) + qtyDifference);
        await updateDoc(doc(db, 'products', editingLog.productId), {
          stock: newStock,
          purchasePrice: editPurchasePrice,
          salePrice: editSalePrice,
          updatedAt: serverTimestamp()
        });
      }

      const selectedVendor = vendors.find(v => v.id === editVendorId);

      await updateDoc(doc(db, 'inventoryLogs', editingLog.id), {
        quantityAdded: editQty,
        newStock: editingLog.previousStock + editQty,
        purchasePrice: editPurchasePrice,
        salePrice: editSalePrice,
        vendorId: editVendorId || null,
        vendorName: selectedVendor ? selectedVendor.companyName : null,
        referenceNumber: editRefNumber.trim() || null,
        updatedAt: serverTimestamp()
      });

      toast.success('Transaction log and product stock updated successfully');
      setEditingLog(null);
    } catch (error: any) {
      console.error('Error updating transaction log:', error);
      toast.error(`Failed to update transaction: ${error?.message || 'Unknown error'}`);
    } finally {
      setSavingEdit(false);
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
          <div className="w-full flex flex-col glass-panel rounded-2xl shadow-sm border border-slate-200 overflow-hidden bg-white">
            <div className="flex flex-col h-full bg-white">
              <div className="p-3.5 border-b border-slate-150 bg-slate-50/50">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-sm font-black text-slate-900">Add Stock</h2>
                    <p className="text-[11px] text-slate-500">Manage inventory additions & update pricing in one place</p>
                  </div>
                  {selectedProduct && (
                    <button
                      onClick={() => {
                        setSelectedProduct(null);
                        setQuantityToAdd(0);
                        setPurchasePriceInput(0);
                        setSalePriceInput(0);
                      }}
                      className="text-slate-500 hover:text-slate-850 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md transition-colors border border-slate-200 cursor-pointer"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>
              </div>

              <form onSubmit={handleAddStockSubmit} className="p-4 space-y-4 flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column: Product Selection and Supplier/Vendor Details */}
                  <div className="space-y-3">
                    <div className="relative" ref={productRef}>
                      <label htmlFor="productSearch" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Select Product <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          id="productSearch"
                          required={!selectedProduct}
                          autoComplete="off"
                          placeholder="Type to search product (name, brand, model)..."
                          className="glass-input block w-full rounded-xl py-1.5 pl-2.5 pr-8 text-xs text-slate-800 font-medium bg-white border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                          value={productSearchInput}
                          onChange={(e) => handleProductSearchChange(e.target.value)}
                          onFocus={() => setIsProductDropdownOpen(true)}
                        />
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          {productSearchInput && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProduct(null);
                                setProductSearchInput('');
                              }}
                              className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                          <Search className="w-3 h-3 text-slate-450 pointer-events-none" />
                        </div>
                      </div>

                      {isProductDropdownOpen && (
                        <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg divide-y divide-slate-100 animate-in fade-in duration-100">
                          {productSuggestions.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-400">
                              No matching products found
                            </div>
                          ) : (
                            productSuggestions.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setSelectedProduct(p);
                                  setQuantityToAdd(10);
                                  setPurchasePriceInput(p.purchasePrice || 0);
                                  setSalePriceInput(p.salePrice || 0);
                                  setIsProductDropdownOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors flex flex-col gap-0.5 cursor-pointer ${
                                  selectedProduct?.id === p.id ? 'bg-emerald-50/50' : ''
                                }`}
                              >
                                <div className="flex justify-between items-center w-full">
                                  <span className="font-bold text-slate-900 truncate">
                                    {p.brand} {p.modelNumber}
                                  </span>
                                  <span className="shrink-0 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-medium text-slate-600">
                                    Stock: {p.stock || 0}
                                  </span>
                                </div>
                                <span className="text-slate-500 truncate">{p.name}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {selectedProduct && (
                      <div className="bg-emerald-50/30 px-2.5 py-1.5 rounded-lg border border-emerald-100 text-[11px] font-semibold text-slate-700 flex items-center justify-between gap-1 overflow-hidden">
                        <span className="truncate">
                          Product: <strong className="text-slate-900">{selectedProduct.brand} {selectedProduct.modelNumber} - {selectedProduct.name}</strong>
                        </span>
                        <span className="shrink-0 bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
                          Stock: {selectedProduct.stock || 0}
                        </span>
                      </div>
                    )}

                    <div className="relative" ref={vendorRef}>
                      <label htmlFor="vendorSearch" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Select Vendor / Supplier (Optional)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          id="vendorSearch"
                          autoComplete="off"
                          placeholder="Type to search vendor/supplier..."
                          className="glass-input block w-full rounded-xl py-1.5 pl-2.5 pr-8 text-xs text-slate-800 font-medium bg-white border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                          value={vendorSearchInput}
                          onChange={(e) => handleVendorSearchChange(e.target.value)}
                          onFocus={() => setIsVendorDropdownOpen(true)}
                        />
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          {vendorSearchInput && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedVendorId('');
                                setVendorSearchInput('');
                              }}
                              className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                          <Search className="w-3 h-3 text-slate-450 pointer-events-none" />
                        </div>
                      </div>

                      {isVendorDropdownOpen && (
                        <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg divide-y divide-slate-100 animate-in fade-in duration-100">
                          {vendorSuggestions.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-400">
                              No matching vendors found
                            </div>
                          ) : (
                            vendorSuggestions.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => {
                                  setSelectedVendorId(v.id);
                                  setIsVendorDropdownOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors cursor-pointer ${
                                  selectedVendorId === v.id ? 'bg-emerald-50/50' : ''
                                }`}
                              >
                                <span className="font-semibold text-slate-800">{v.companyName}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label htmlFor="refNumber" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Reference / Invoice Number (Optional)
                      </label>
                      <input
                        type="text"
                        id="refNumber"
                        disabled={!selectedProduct}
                        placeholder="e.g. INV-2026-001"
                        className="glass-input block w-full rounded-xl py-1.5 px-2.5 text-xs text-slate-800 placeholder-slate-400 disabled:opacity-50"
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Right Column: Quantity, Prices and Projection Details */}
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label htmlFor="quantityToAdd" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Quantity to Add <span className="text-rose-500">*</span>
                        </label>
                        <div className="flex gap-1">
                          {[10, 25, 50, 100].map(val => (
                            <button
                              key={val}
                              type="button"
                              disabled={!selectedProduct}
                              onClick={() => setQuantityToAdd(val)}
                              className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 font-bold rounded text-[9px] transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              +{val}
                            </button>
                          ))}
                        </div>
                      </div>
                      <input
                        type="number"
                        id="quantityToAdd"
                        required
                        min="1"
                        disabled={!selectedProduct}
                        placeholder={selectedProduct ? "Enter quantity" : "First select a product"}
                        className="glass-input block w-full rounded-xl py-1.5 px-2.5 text-xs text-slate-800 font-bold disabled:opacity-50"
                        value={quantityToAdd || ''}
                        onChange={(e) => setQuantityToAdd(Math.max(1, parseInt(e.target.value) || 0))}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="purchasePrice" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Purchase Price ($) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          id="purchasePrice"
                          required
                          min="0"
                          step="0.01"
                          disabled={!selectedProduct}
                          placeholder="0.00"
                          className="glass-input block w-full rounded-xl py-1.5 px-2.5 text-xs text-slate-800 font-bold disabled:opacity-50"
                          value={purchasePriceInput || ''}
                          onChange={(e) => setPurchasePriceInput(Math.max(0, parseFloat(e.target.value) || 0))}
                        />
                      </div>
                      <div>
                        <label htmlFor="salePrice" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Sale Price ($) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          id="salePrice"
                          required
                          min="0"
                          step="0.01"
                          disabled={!selectedProduct}
                          placeholder="0.00"
                          className="glass-input block w-full rounded-xl py-1.5 px-2.5 text-xs text-slate-800 font-bold disabled:opacity-50"
                          value={salePriceInput || ''}
                          onChange={(e) => setSalePriceInput(Math.max(0, parseFloat(e.target.value) || 0))}
                        />
                      </div>
                    </div>

                    {selectedProduct && quantityToAdd > 0 ? (
                      <div className="bg-emerald-50/50 p-2 py-1.5 rounded-lg border border-emerald-100 space-y-0.5 text-[10px] animate-in slide-in-from-top-2 duration-150">
                        <div className="flex justify-between">
                          <span className="text-slate-650">Previous Stock:</span>
                          <span className="font-bold text-slate-800">{selectedProduct.stock || 0} units</span>
                        </div>
                        <div className="flex justify-between text-emerald-800 font-black border-t border-emerald-100 pt-0.5">
                          <span>New Projected Stock:</span>
                          <span>{(selectedProduct.stock || 0) + quantityToAdd} units</span>
                        </div>
                      </div>
                    ) : (
                      <div className="h-[34px] hidden md:block" />
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving || !selectedProduct || quantityToAdd <= 0}
                  className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-xl shadow-md text-xs font-black text-white bg-[#0a382c] hover:bg-[#0d4a3b] focus:outline-none transition-colors disabled:opacity-50 shadow-emerald-950/10 cursor-pointer"
                >
                  {saving ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-1" />
                      Save Inventory Addition
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* Bulk Entry Mode Layout */
          <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
            {/* Left Column: List of All Products with Qty Input */}
            <div className="w-full lg:w-2/3 flex flex-col glass-panel rounded-2xl shadow-sm border border-slate-200 overflow-hidden bg-white">
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
                          <th scope="col" className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-24">Purchase Price</th>
                          <th scope="col" className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-24">Sale Price</th>
                          <th scope="col" className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider w-36">Add Stock</th>
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
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder={String(product.purchasePrice || 0)}
                                  className="w-20 px-2 py-1.5 glass-input text-slate-800 text-xs text-center font-bold"
                                  value={product.id in bulkPurchasePrices ? bulkPurchasePrices[product.id] : ''}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseFloat(e.target.value) || 0);
                                    setBulkPurchasePrices(prev => ({
                                      ...prev,
                                      [product.id]: val
                                    }));
                                  }}
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder={String(product.salePrice || 0)}
                                  className="w-20 px-2 py-1.5 glass-input text-slate-800 text-xs text-center font-bold"
                                  value={product.id in bulkSalePrices ? bulkSalePrices[product.id] : ''}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseFloat(e.target.value) || 0);
                                    setBulkSalePrices(prev => ({
                                      ...prev,
                                      [product.id]: val
                                    }));
                                  }}
                                />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="+0"
                                    className="w-16 px-1.5 py-1.5 glass-input text-slate-800 text-xs text-center font-bold"
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
            <div className="w-full lg:w-1/3 flex flex-col glass-panel rounded-2xl border border-slate-200 overflow-hidden bg-white">
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
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[24%]">Product</th>
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[12%]">Qty Added</th>
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[12%]">Stock Path</th>
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[22%]">Supplier & Ref</th>
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[15%]">Date</th>
                    <th scope="col" className="px-6 py-4 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[15%]">Actions</th>
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
                          {(log.purchasePrice !== undefined || log.salePrice !== undefined) && (
                            <div className="text-[10px] font-mono mt-1.5 flex gap-2">
                              {log.purchasePrice !== undefined && (
                                <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                  Buy: <strong>${log.purchasePrice.toFixed(2)}</strong>
                                </span>
                              )}
                              {log.salePrice !== undefined && (
                                <span className="bg-[#e8f5e9] text-emerald-800 px-1.5 py-0.5 rounded border border-[#c8e6c9]">
                                  Sell: <strong>${log.salePrice.toFixed(2)}</strong>
                                </span>
                              )}
                            </div>
                          )}
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
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleOpenEditLog(log)}
                              className="p-1.5 text-slate-500 hover:text-[#0a382c] hover:bg-emerald-50 rounded-lg transition-colors border border-transparent hover:border-emerald-150 cursor-pointer"
                              title="Edit Stock Entry"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteLog(log)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-150 cursor-pointer"
                              title="Delete Stock Entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
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

      {/* Edit Overlay Modal */}
      {editingLog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in duration-200">
            <div className="p-4 bg-slate-50 border-b border-slate-150 flex justify-between items-center">
              <div>
                <h3 className="text-base font-black text-slate-900">Edit Stock Transaction</h3>
                <p className="text-xs text-slate-500 mt-0.5">{editingLog.productName}</p>
              </div>
              <button
                onClick={() => setEditingLog(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-150 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveEditLog} className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span>Model: <strong>{editingLog.productModelNumber}</strong></span>
                <span>Original Added: <strong>{editingLog.quantityAdded} units</strong></span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Quantity Added <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  className="glass-input block w-full rounded-xl py-2 px-3 text-slate-800 font-bold"
                  value={editQty}
                  onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value) || 0))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Purchase Price ($) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    className="glass-input block w-full rounded-xl py-2 px-3 text-slate-800 font-bold"
                    value={editPurchasePrice}
                    onChange={(e) => setEditPurchasePrice(Math.max(0, parseFloat(e.target.value) || 0))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Sale Price ($) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    className="glass-input block w-full rounded-xl py-2 px-3 text-slate-800 font-bold"
                    value={editSalePrice}
                    onChange={(e) => setEditSalePrice(Math.max(0, parseFloat(e.target.value) || 0))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Supplier / Vendor
                </label>
                <select
                  className="glass-input block w-full rounded-xl py-2.5 px-3 text-slate-800 font-medium"
                  value={editVendorId}
                  onChange={(e) => setEditVendorId(e.target.value)}
                >
                  <option value="">No Supplier</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.companyName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Reference / Invoice Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-2026-001"
                  className="glass-input block w-full rounded-xl py-2 px-3 text-slate-800"
                  value={editRefNumber}
                  onChange={(e) => setEditRefNumber(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={() => setEditingLog(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex-1 flex justify-center items-center py-2.5 px-4 border border-transparent rounded-xl shadow-md text-xs font-black text-white bg-[#0a382c] hover:bg-[#0d4a3b] focus:outline-none transition-colors disabled:opacity-50 shadow-emerald-950/10 cursor-pointer"
                >
                  {savingEdit ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
