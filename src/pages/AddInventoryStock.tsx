import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  writeBatch, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import { 
  PackagePlus, 
  ArrowLeft, 
  Search, 
  X, 
  Barcode, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Building2, 
  FileText, 
  Hash, 
  Check, 
  Package,
  Layers,
  Info
} from 'lucide-react';

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  modelNumber: string;
  purchasePrice?: number;
  salePrice?: number;
  stock?: number;
}

export interface Vendor {
  id: string;
  companyName: string;
}

export interface StoreSerialNumber {
  id: string;
  productId: string;
  productName?: string;
  serialNumber: string;
  status: 'Available' | 'Sold';
}

interface AddInventoryStockProps {
  onBack: () => void;
  initialProduct?: Product | null;
}

export default function AddInventoryStock({ onBack, initialProduct }: AddInventoryStockProps) {
  const { storeId } = useAuth();

  // Data sources
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [allStoreSerials, setAllStoreSerials] = useState<StoreSerialNumber[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Selected product & batch fields
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(initialProduct || null);
  const [productSearch, setProductSearch] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [purchasePriceInput, setPurchasePriceInput] = useState<number>(0);
  const [salePriceInput, setSalePriceInput] = useState<number>(0);
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [showExistingSerials, setShowExistingSerials] = useState(false);

  // Serial numbers management
  const [serialNumbersList, setSerialNumbersList] = useState<string[]>([]);
  const [inputMode, setInputMode] = useState<'single' | 'bulk' | 'sequence'>('single');
  
  // Single scan mode
  const [singleSerial, setSingleSerial] = useState('');
  const [singleSerialWarning, setSingleSerialWarning] = useState<string | null>(null);
  const singleInputRef = useRef<HTMLInputElement>(null);

  // Bulk mode
  const [bulkInput, setBulkInput] = useState('');

  // Sequence generator mode
  const [seqPrefix, setSeqPrefix] = useState('SN-');
  const [seqStart, setSeqStart] = useState('1001');
  const [seqCount, setSeqCount] = useState('10');

  // Search filter inside added list
  const [listFilter, setListFilter] = useState('');
  const [saving, setSaving] = useState(false);

  const productDropdownRef = useRef<HTMLDivElement>(null);

  // 1. Fetch Products
  useEffect(() => {
    if (!storeId) return;

    const q = query(collection(db, 'products'), where('storeId', '==', storeId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Product[] = [];
      snapshot.forEach((docSnap) => {
        data.push({ id: docSnap.id, ...docSnap.data() } as Product);
      });
      data.sort((a, b) => a.name.localeCompare(b.name));
      setProducts(data);
      setLoadingData(false);

      // If initial product was provided, sync its up-to-date state
      if (initialProduct) {
        const found = data.find(p => p.id === initialProduct.id);
        if (found) {
          setSelectedProduct(found);
          setPurchasePriceInput(found.purchasePrice || 0);
          setSalePriceInput(found.salePrice || 0);
        }
      }
    }, (error) => {
      console.error('Error fetching products:', error);
      setLoadingData(false);
    });

    return () => unsubscribe();
  }, [storeId]);

  // 2. Fetch Vendors
  useEffect(() => {
    if (!storeId) return;

    const q = query(collection(db, 'vendors'), where('storeId', '==', storeId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Vendor[] = [];
      snapshot.forEach((docSnap) => {
        data.push({ id: docSnap.id, ...docSnap.data() } as Vendor);
      });
      data.sort((a, b) => a.companyName.localeCompare(b.companyName));
      setVendors(data);
    }, (error) => {
      console.error('Error fetching vendors:', error);
    });

    return () => unsubscribe();
  }, [storeId]);

  // 3. Fetch Serial Numbers for duplicate detection & verification
  useEffect(() => {
    if (!storeId) return;

    const q = query(collection(db, 'serialNumbers'), where('storeId', '==', storeId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: StoreSerialNumber[] = [];
      snapshot.forEach((docSnap) => {
        data.push({ id: docSnap.id, ...docSnap.data() } as StoreSerialNumber);
      });
      setAllStoreSerials(data);
    }, (error) => {
      console.error('Error fetching serial numbers:', error);
    });

    return () => unsubscribe();
  }, [storeId]);

  // Handle clicking outside product dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setIsProductDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // When a product is selected, initialize pricing
  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setPurchasePriceInput(product.purchasePrice || 0);
    setSalePriceInput(product.salePrice || 0);
    setIsProductDropdownOpen(false);
    setProductSearch('');
    // Automatically focus the serial scan input
    setTimeout(() => {
      singleInputRef.current?.focus();
    }, 150);
  };

  // Check if a serial already exists in current batch or Firestore
  const checkDuplicateSerial = (serial: string): { isDup: boolean; reason?: string } => {
    const trimmed = serial.trim().toLowerCase();
    if (!trimmed) return { isDup: true, reason: 'Empty serial number' };

    // In current addition batch
    if (serialNumbersList.some(s => s.toLowerCase() === trimmed)) {
      return { isDup: true, reason: 'Already in current batch' };
    }

    // In store's Firestore serialNumbers collection
    const existing = allStoreSerials.find(s => s.serialNumber.toLowerCase() === trimmed);
    if (existing) {
      if (existing.productId === selectedProduct?.id) {
        return { isDup: true, reason: `Already registered for this product (${existing.status})` };
      } else {
        return { isDup: true, reason: `Already assigned to another product (${existing.productName || 'Unknown'})` };
      }
    }

    return { isDup: false };
  };

  // Real-time check on single serial input
  const handleSingleSerialChange = (val: string) => {
    setSingleSerial(val);
    if (!val.trim()) {
      setSingleSerialWarning(null);
      return;
    }
    const check = checkDuplicateSerial(val);
    if (check.isDup && check.reason) {
      setSingleSerialWarning(check.reason);
    } else {
      setSingleSerialWarning(null);
    }
  };

  // Add single serial
  const handleAddSingleSerial = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = singleSerial.trim();
    if (!trimmed) return;

    if (!selectedProduct) {
      toast.warning('Please select a product first');
      return;
    }

    const check = checkDuplicateSerial(trimmed);
    if (check.isDup) {
      toast.error(`Cannot add: ${check.reason}`);
      return;
    }

    setSerialNumbersList(prev => [trimmed, ...prev]);
    setSingleSerial('');
    setSingleSerialWarning(null);
    toast.success(`Serial ${trimmed} added`);

    // Keep input focused for continuous scanning
    singleInputRef.current?.focus();
  };

  // Add bulk serials from paste
  const handleAddBulkSerials = () => {
    if (!selectedProduct) {
      toast.warning('Please select a product first');
      return;
    }

    if (!bulkInput.trim()) {
      toast.warning('Please paste serial numbers into the box');
      return;
    }

    // Split by newlines, commas, semicolons, tabs, or spaces
    const candidates = bulkInput
      .split(/[\r\n,;\t]+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (candidates.length === 0) {
      toast.warning('No valid serial numbers found in text');
      return;
    }

    const validSerials: string[] = [];
    let duplicateCount = 0;

    candidates.forEach(candidate => {
      // Check duplicate against currently accumulated list and batch
      const alreadyInPending = validSerials.some(s => s.toLowerCase() === candidate.toLowerCase()) ||
        serialNumbersList.some(s => s.toLowerCase() === candidate.toLowerCase());
      
      const existsInStore = allStoreSerials.some(s => s.serialNumber.toLowerCase() === candidate.toLowerCase());

      if (alreadyInPending || existsInStore) {
        duplicateCount++;
      } else {
        validSerials.push(candidate);
      }
    });

    if (validSerials.length > 0) {
      setSerialNumbersList(prev => [...validSerials, ...prev]);
      setBulkInput('');
      toast.success(
        `Added ${validSerials.length} serial numbers${duplicateCount > 0 ? ` (${duplicateCount} duplicates skipped)` : ''}`
      );
    } else {
      toast.warning(`All ${candidates.length} serial numbers were duplicates and skipped`);
    }
  };

  // Generate sequence serials
  const handleGenerateSequence = () => {
    if (!selectedProduct) {
      toast.warning('Please select a product first');
      return;
    }

    const startNum = parseInt(seqStart, 10);
    const count = parseInt(seqCount, 10);

    if (isNaN(startNum) || isNaN(count) || count <= 0) {
      toast.error('Please enter valid starting number and count');
      return;
    }

    if (count > 200) {
      toast.warning('Maximum 200 sequential serials can be generated at once');
      return;
    }

    const padLength = seqStart.length;
    const generated: string[] = [];
    let duplicateCount = 0;

    for (let i = 0; i < count; i++) {
      const numStr = String(startNum + i).padStart(padLength, '0');
      const serial = `${seqPrefix.trim()}${numStr}`;
      
      const alreadyInPending = generated.some(s => s.toLowerCase() === serial.toLowerCase()) ||
        serialNumbersList.some(s => s.toLowerCase() === serial.toLowerCase());
      
      const existsInStore = allStoreSerials.some(s => s.serialNumber.toLowerCase() === serial.toLowerCase());

      if (alreadyInPending || existsInStore) {
        duplicateCount++;
      } else {
        generated.push(serial);
      }
    }

    if (generated.length > 0) {
      setSerialNumbersList(prev => [...generated, ...prev]);
      toast.success(
        `Generated ${generated.length} serials${duplicateCount > 0 ? ` (${duplicateCount} duplicates skipped)` : ''}`
      );
    } else {
      toast.warning('All generated serials already exist in the store');
    }
  };

  // Remove one serial
  const handleRemoveSerial = (indexToRemove: number) => {
    setSerialNumbersList(prev => prev.filter((_, i) => i !== indexToRemove));
  };

  // Clear all entered serials
  const handleClearAllSerials = () => {
    if (serialNumbersList.length === 0) return;
    if (window.confirm('Clear all entered serial numbers for this batch?')) {
      setSerialNumbersList([]);
      toast.info('Cleared serial numbers list');
    }
  };

  // Final Submit to add inventory stock
  const handleSubmitStock = async () => {
    if (!selectedProduct) {
      toast.error('Please select a product');
      return;
    }

    if (serialNumbersList.length === 0) {
      toast.error('Please add at least one serial number to increment stock');
      return;
    }

    if (!storeId) {
      toast.error('Store ID not found. Please re-login.');
      return;
    }

    setSaving(true);
    const quantityAdded = serialNumbersList.length;
    const previousStock = selectedProduct.stock || 0;
    const newStock = previousStock + quantityAdded;
    const selectedVendor = vendors.find(v => v.id === selectedVendorId);

    try {
      // Execute in batches of 400 to respect Firestore 500 limit
      const chunkSize = 400;
      for (let i = 0; i < serialNumbersList.length; i += chunkSize) {
        const chunk = serialNumbersList.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        chunk.forEach(sn => {
          const serialDocRef = doc(collection(db, 'serialNumbers'));
          batch.set(serialDocRef, {
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            productBrand: selectedProduct.brand,
            productModelNumber: selectedProduct.modelNumber,
            storeId,
            serialNumber: sn,
            status: 'Available',
            purchasePrice: purchasePriceInput,
            salePrice: salePriceInput,
            vendorId: selectedVendorId || null,
            vendorName: selectedVendor?.companyName || null,
            referenceNumber: referenceNumber.trim() || null,
            createdAt: serverTimestamp()
          });
        });

        // In first batch, also update product doc and add inventory log
        if (i === 0) {
          const productRef = doc(db, 'products', selectedProduct.id);
          batch.update(productRef, {
            stock: newStock,
            purchasePrice: purchasePriceInput,
            salePrice: salePriceInput,
            updatedAt: serverTimestamp()
          });

          const logRef = doc(collection(db, 'inventoryLogs'));
          batch.set(logRef, {
            storeId,
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            productBrand: selectedProduct.brand,
            productModelNumber: selectedProduct.modelNumber,
            quantityAdded,
            serialNumbers: serialNumbersList,
            previousStock,
            newStock,
            purchasePrice: purchasePriceInput,
            salePrice: salePriceInput,
            vendorId: selectedVendorId || null,
            vendorName: selectedVendor?.companyName || null,
            referenceNumber: referenceNumber.trim() || null,
            createdAt: serverTimestamp()
          });
        }

        await batch.commit();
      }

      toast.success(`Successfully added ${quantityAdded} serialized units to ${selectedProduct.name}!`);
      onBack();
    } catch (error: any) {
      console.error('Error adding serialized inventory stock:', error);
      toast.error(`Failed to add stock: ${error?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // Filter products for search
  const filteredProducts = products.filter(p => {
    const q = productSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.modelNumber.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  });

  // Filter serials list inside review
  const displayedSerials = serialNumbersList.filter(s => 
    s.toLowerCase().includes(listFilter.toLowerCase())
  );

  // Existing serials for selected product
  const existingProductSerials = selectedProduct 
    ? allStoreSerials.filter(s => s.productId === selectedProduct.id && s.status === 'Available')
    : [];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Full-Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-xl bg-emerald-50 border border-emerald-100 text-[#0a382c] flex items-center justify-center shadow-xs">
            <PackagePlus className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                Add Inventory Stock
              </h1>
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-[#0a382c]">
                Serialized Intake
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Select a product and add incoming stock with unique serial numbers
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-200 transition-colors shadow-xs text-xs font-bold cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Inventory
          </button>
          
          <button
            type="button"
            onClick={handleSubmitStock}
            disabled={saving || !selectedProduct || serialNumbersList.length === 0}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl shadow-md shadow-emerald-950/15 text-xs font-black transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Confirm & Add Stock ({serialNumbersList.length})
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Product Selection, Pricing, Vendor & Batch Overview (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Card 1: Product Selection */}
          <div className="glass-panel p-5 rounded-2xl bg-white space-y-4">
            <div className="flex items-center justify-between border-b border-slate-150 pb-3">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-[#0a382c]" />
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  1. Select Product
                </h2>
              </div>
              {selectedProduct && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProduct(null);
                    setSerialNumbersList([]);
                  }}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                >
                  Change Product
                </button>
              )}
            </div>

            {!selectedProduct ? (
              <div className="relative" ref={productDropdownRef}>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Search Product Catalog <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Type name, brand, model, or category..."
                    className="glass-input block w-full pl-9 pr-3 py-2.5 rounded-xl text-xs font-semibold text-slate-800"
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setIsProductDropdownOpen(true);
                    }}
                    onFocus={() => setIsProductDropdownOpen(true)}
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                </div>

                {isProductDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl divide-y divide-slate-100 z-50 animate-in fade-in duration-100">
                    {loadingData ? (
                      <div className="p-4 text-center text-xs text-slate-400">Loading catalog...</div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No matching products found.
                      </div>
                    ) : (
                      filteredProducts.map((prod) => (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={() => handleSelectProduct(prod)}
                          className="w-full text-left p-3 hover:bg-emerald-50/40 transition-colors flex flex-col gap-1 cursor-pointer"
                        >
                          <div className="flex justify-between items-start">
                            <span className="font-extrabold text-xs text-slate-900">
                              {prod.brand} {prod.modelNumber}
                            </span>
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              Stock: {prod.stock || 0}
                            </span>
                          </div>
                          <span className="text-xs text-slate-600 font-medium truncate">{prod.name}</span>
                          <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono mt-0.5">
                            <span>Cat: {prod.category}</span>
                            <span>•</span>
                            <span>Cost: PKR {(prod.purchasePrice || 0).toLocaleString()}</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Selected Product Highlight Card */
              <div className="p-4 rounded-xl bg-[#f8faf9] border border-emerald-150/80 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#0a382c] bg-emerald-100 px-2 py-0.5 rounded">
                      {selectedProduct.category}
                    </span>
                    <h3 className="text-base font-black text-slate-900 mt-1.5">
                      {selectedProduct.brand} {selectedProduct.modelNumber}
                    </h3>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      {selectedProduct.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Stock</span>
                    <div className="text-lg font-black text-[#0a382c]">
                      {selectedProduct.stock || 0} units
                    </div>
                  </div>
                </div>

                {/* Registered Serials Info Box */}
                <div className="pt-2 border-t border-emerald-100 flex justify-between items-center text-xs">
                  <span className="text-slate-600 font-medium flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-[#0a382c]" />
                    Registered Serials Available: <strong>{existingProductSerials.length}</strong>
                  </span>
                  {existingProductSerials.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowExistingSerials(!showExistingSerials)}
                      className="text-[11px] font-bold text-[#0a382c] hover:underline cursor-pointer"
                    >
                      {showExistingSerials ? 'Hide' : 'View Serials'}
                    </button>
                  )}
                </div>

                {showExistingSerials && existingProductSerials.length > 0 && (
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200 max-h-36 overflow-y-auto space-y-1 animate-in fade-in duration-150">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Existing Available Serials:</p>
                    <div className="flex flex-wrap gap-1">
                      {existingProductSerials.map((s) => (
                        <span key={s.id} className="font-mono text-[11px] bg-slate-100 border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-semibold">
                          {s.serialNumber}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card 2: Batch Pricing & Vendor Reference */}
          <div className="glass-panel p-5 rounded-2xl bg-white space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-150 pb-3">
              <Building2 className="w-4 h-4 text-[#0a382c]" />
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                2. Pricing & Vendor Details
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="purchasePrice" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Purchase Price (PKR) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="purchasePrice"
                    required
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-bold text-slate-800"
                    value={purchasePriceInput || ''}
                    onChange={(e) => setPurchasePriceInput(Math.max(0, parseFloat(e.target.value) || 0))}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Cost per incoming unit</p>
              </div>

              <div>
                <label htmlFor="salePrice" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Sale Price (PKR) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="salePrice"
                    required
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-bold text-slate-800"
                    value={salePriceInput || ''}
                    onChange={(e) => setSalePriceInput(Math.max(0, parseFloat(e.target.value) || 0))}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Retail selling price</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label htmlFor="vendorSelect" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Supplier / Vendor (Optional)
                </label>
                <select
                  id="vendorSelect"
                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800"
                  value={selectedVendorId}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                >
                  <option value="">Direct / No Vendor Specified</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.companyName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="referenceNumber" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Invoice / GRN Ref (Optional)
                </label>
                <input
                  type="text"
                  id="referenceNumber"
                  placeholder="e.g. PO-2026-081"
                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Card 3: Batch Stock Impact Projection */}
          <div className="glass-panel p-5 rounded-2xl bg-white space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-150 pb-3">
              <Layers className="w-4 h-4 text-[#0a382c]" />
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                3. Projected Stock Impact
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Current</span>
                <span className="text-base font-black text-slate-700">
                  {selectedProduct?.stock || 0}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-[10px] font-black text-[#0a382c] uppercase tracking-wider block">+ Adding</span>
                <span className="text-base font-black text-[#0a382c]">
                  +{serialNumbersList.length}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#0a382c] text-white">
                <span className="text-[10px] font-bold text-emerald-200 uppercase tracking-wider block">New Total</span>
                <span className="text-base font-black">
                  {(selectedProduct?.stock || 0) + serialNumbersList.length}
                </span>
              </div>
            </div>

            {serialNumbersList.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Total Batch Intake Cost:</span>
                  <span className="font-bold text-slate-900 font-mono">
                    PKR {(serialNumbersList.length * purchasePriceInput).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Projected Retail Value:</span>
                  <span className="font-bold text-[#0a382c] font-mono">
                    PKR {(serialNumbersList.length * salePriceInput).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Serial Numbers Registration & Review (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          <div className="glass-panel p-5 rounded-2xl bg-white space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-150 pb-3">
              <div className="flex items-center gap-2">
                <Barcode className="w-5 h-5 text-[#0a382c]" />
                <div>
                  <h2 className="text-base font-black text-slate-900">
                    Register Serial Numbers
                  </h2>
                  <p className="text-xs text-slate-500">
                    1 Serial Number = 1 Stock Unit added to physical inventory
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-[#0a382c]">
                  {serialNumbersList.length} Units Ready
                </span>
              </div>
            </div>

            {!selectedProduct ? (
              <div className="p-10 text-center border-2 border-dashed border-slate-200 rounded-2xl space-y-3">
                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-700">No Product Selected</p>
                  <p className="text-xs text-slate-500 mt-0.5 max-w-sm mx-auto">
                    Please choose a product on the left to activate serial number scanning, pasting, or generator modes.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Input Mode Tabs */}
                <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setInputMode('single')}
                    className={`flex-1 py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      inputMode === 'single'
                        ? 'bg-[#0a382c] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Barcode className="w-3.5 h-3.5" />
                    Barcode / Single Scan
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('bulk')}
                    className={`flex-1 py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      inputMode === 'bulk'
                        ? 'bg-[#0a382c] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Bulk / Paste List
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('sequence')}
                    className={`flex-1 py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      inputMode === 'sequence'
                        ? 'bg-[#0a382c] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Range Generator
                  </button>
                </div>

                {/* Mode 1: Barcode / Single Scan */}
                {inputMode === 'single' && (
                  <form onSubmit={handleAddSingleSerial} className="space-y-3">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          ref={singleInputRef}
                          type="text"
                          autoFocus
                          placeholder="Scan barcode or type serial number (Press Enter)..."
                          className="glass-input block w-full pl-9 pr-3 py-2.5 rounded-xl text-xs font-mono font-bold text-slate-900 placeholder:font-sans"
                          value={singleSerial}
                          onChange={(e) => handleSingleSerialChange(e.target.value)}
                        />
                        <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      </div>
                      <button
                        type="submit"
                        disabled={!singleSerial.trim()}
                        className="px-5 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl text-xs font-black transition-all shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        Add Serial
                      </button>
                    </div>

                    {singleSerialWarning && (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span className="font-semibold">Notice: {singleSerialWarning}</span>
                      </div>
                    )}
                    <p className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 text-slate-400" />
                      Tip: Barcode scanners automatically submit and prepare for the next scan.
                    </p>
                  </form>
                )}

                {/* Mode 2: Bulk / Paste List */}
                {inputMode === 'bulk' && (
                  <div className="space-y-3">
                    <textarea
                      rows={4}
                      placeholder="Paste serial numbers here...
Supported separators: new lines, commas, tabs, or spaces.
Example:
SN-4029101
SN-4029102
SN-4029103"
                      className="glass-input block w-full p-3 rounded-xl text-xs font-mono font-semibold text-slate-800 placeholder:font-sans"
                      value={bulkInput}
                      onChange={(e) => setBulkInput(e.target.value)}
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500 font-medium">
                        Candidates detected:{' '}
                        <strong>
                          {bulkInput.split(/[\r\n,;\t]+/).map(s => s.trim()).filter(Boolean).length}
                        </strong>
                      </span>
                      <button
                        type="button"
                        onClick={handleAddBulkSerials}
                        disabled={!bulkInput.trim()}
                        className="px-4 py-2 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl text-xs font-black transition-all shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Parse & Add Serials
                      </button>
                    </div>
                  </div>
                )}

                {/* Mode 3: Sequential Generator */}
                {inputMode === 'sequence' && (
                  <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                          Prefix
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. SN-2026-"
                          className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-mono font-bold"
                          value={seqPrefix}
                          onChange={(e) => setSeqPrefix(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                          Start Number
                        </label>
                        <input
                          type="number"
                          placeholder="1001"
                          className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-mono font-bold"
                          value={seqStart}
                          onChange={(e) => setSeqStart(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                          Quantity
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="200"
                          placeholder="10"
                          className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-mono font-bold"
                          value={seqCount}
                          onChange={(e) => setSeqCount(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                      <span className="text-xs text-slate-500 font-mono">
                        Preview: {seqPrefix}{seqStart} ... {seqPrefix}{Number(seqStart) + Number(seqCount) - 1 || seqStart}
                      </span>
                      <button
                        type="button"
                        onClick={handleGenerateSequence}
                        className="px-4 py-2 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Generate & Add
                      </button>
                    </div>
                  </div>
                )}

                {/* Serial Numbers Table / Review Card */}
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        Entered Serials for this Intake ({serialNumbersList.length})
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      {serialNumbersList.length > 5 && (
                        <div className="relative flex-1 sm:w-48">
                          <input
                            type="text"
                            placeholder="Filter serials..."
                            className="glass-input block w-full pl-7 pr-2 py-1 rounded-lg text-[11px]"
                            value={listFilter}
                            onChange={(e) => setListFilter(e.target.value)}
                          />
                          <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
                        </div>
                      )}

                      {serialNumbersList.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearAllSerials}
                          className="text-[11px] font-bold text-rose-600 hover:text-rose-800 px-2 py-1 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          Clear All
                        </button>
                      )}
                    </div>
                  </div>

                  {serialNumbersList.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl space-y-1">
                      <Barcode className="w-8 h-8 text-slate-300 mx-auto mb-1" />
                      <p className="text-xs font-bold text-slate-600">No serial numbers entered yet</p>
                      <p className="text-[11px] text-slate-400">
                        Scan or type serial numbers above. Each added serial increments the intake stock by 1.
                      </p>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto bg-white divide-y divide-slate-100">
                      <table className="min-w-full divide-y divide-slate-100 table-fixed">
                        <thead className="bg-[#f8faf9] sticky top-0 z-10">
                          <tr>
                            <th scope="col" className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-16">
                              #
                            </th>
                            <th scope="col" className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              Serial Number
                            </th>
                            <th scope="col" className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-32">
                              Status
                            </th>
                            <th scope="col" className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider w-16">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {displayedSerials.map((sn, idx) => (
                            <tr key={`${sn}-${idx}`} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-slate-400 font-bold">
                                {displayedSerials.length - idx}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap font-mono text-xs font-bold text-slate-900 tracking-wider">
                                {sn}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-150">
                                  <Check className="w-2.5 h-2.5 mr-1" />
                                  Ready to Add
                                </span>
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSerial(serialNumbersList.indexOf(sn))}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="Remove Serial"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Bottom Confirmation Bar */}
          {selectedProduct && serialNumbersList.length > 0 && (
            <div className="p-4 rounded-2xl bg-[#0a382c] text-white flex flex-col sm:flex-row justify-between items-center gap-3 shadow-lg shadow-emerald-950/20 animate-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-700/60 border border-emerald-500/30 flex items-center justify-center font-black text-sm">
                  +{serialNumbersList.length}
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-white">
                    Ready to add {serialNumbersList.length} units to {selectedProduct.name}
                  </h4>
                  <p className="text-xs text-emerald-200 mt-0.5">
                    Stock will increase from {selectedProduct.stock || 0} to {(selectedProduct.stock || 0) + serialNumbersList.length} units.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onBack}
                  className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-emerald-900/60 hover:bg-emerald-900 text-emerald-100 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSubmitStock}
                  className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-black shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Processing...' : 'Confirm Intake'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
