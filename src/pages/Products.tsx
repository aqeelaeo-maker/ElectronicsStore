import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Plus, Search, Edit2, Trash2, Package, Barcode, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';

interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  modelNumber: string;
  unit?: string;
  purchasePrice: number;
  salePrice: number;
  stock: number;
}

export default function Products() {
  const { storeId, role } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Store Units of Measurement
  const [units, setUnits] = useState<Array<{ name: string; abbreviation: string }>>([
    { name: 'Piece', abbreviation: 'Pcs' },
    { name: 'Box', abbreviation: 'Box' },
    { name: 'Packet', abbreviation: 'Pk' },
    { name: 'Set', abbreviation: 'Set' },
    { name: 'Kilogram', abbreviation: 'Kg' },
    { name: 'Meter', abbreviation: 'Mtr' },
    { name: 'Liter', abbreviation: 'Ltr' },
    { name: 'Dozen', abbreviation: 'Dzn' },
    { name: 'Carton', abbreviation: 'Ctn' }
  ]);

  // Serial numbers state for edit view
  const [editProductSerials, setEditProductSerials] = useState<Array<{ id: string; serialNumber: string; status: 'Available' | 'Sold' }>>([]);
  const [loadingSerials, setLoadingSerials] = useState(false);
  const [serialSearch, setSerialSearch] = useState('');
  const [copiedAll, setCopiedAll] = useState(false);
  const [showSold, setShowSold] = useState(false);

  // Fetch store units
  useEffect(() => {
    if (!storeId) return;

    const storeRef = doc(db, 'stores', storeId);
    const unsubStore = onSnapshot(storeRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.units) && data.units.length > 0) {
          const parsed = data.units.map((u: any) => {
            if (typeof u === 'string') return { name: u, abbreviation: u };
            return {
              name: u.name || u.abbreviation || 'Unit',
              abbreviation: u.abbreviation || u.name || 'Unit'
            };
          });
          setUnits(parsed);
        }
      }
    }, (err) => {
      console.error('Error fetching store units:', err);
    });

    return () => unsubStore();
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    
    const q = query(collection(db, 'products'), where('storeId', '==', storeId));
      
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Product[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Product);
      });

      // Sort client-side newest first
      data.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      setProducts(data);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching products:', error);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [storeId]);

  // Fetch Serial Numbers for Product being edited
  useEffect(() => {
    if (!editingProduct || !storeId) {
      setEditProductSerials([]);
      setSerialSearch('');
      setShowSold(false);
      setCopiedAll(false);
      return;
    }

    setLoadingSerials(true);
    const q = query(
      collection(db, 'serialNumbers'),
      where('storeId', '==', storeId),
      where('productId', '==', editingProduct.id)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const data: Array<{ id: string; serialNumber: string; status: 'Available' | 'Sold' }> = [];
      snapshot.forEach(docSnap => {
        data.push({ id: docSnap.id, ...docSnap.data() } as any);
      });
      data.sort((a, b) => a.serialNumber.localeCompare(b.serialNumber, undefined, { numeric: true, sensitivity: 'base' }));
      setEditProductSerials(data);
      setLoadingSerials(false);
    }, (err) => {
      console.error('Error fetching serial numbers for product:', err);
      setLoadingSerials(false);
    });

    return () => unsub();
  }, [editingProduct?.id, storeId]);

  const handleCopySerial = (sn: string) => {
    navigator.clipboard.writeText(sn);
    toast.success(`Copied: ${sn}`);
  };

  const handleCopyAllAvailable = (serials: Array<{ serialNumber: string }>) => {
    if (serials.length === 0) return;
    const text = serials.map(s => s.serialNumber).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
    toast.success(`Copied ${serials.length} serial numbers to clipboard`);
  };

  const handleAddProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!storeId) {
      toast.error('Store ID not found');
      return;
    }
    
    const formData = new FormData(e.currentTarget);
    const newProduct = {
      name: formData.get('name'),
      brand: formData.get('brand'),
      category: formData.get('category'),
      modelNumber: formData.get('modelNumber'),
      unit: (formData.get('unit') as string)?.trim() || (units[0]?.abbreviation || units[0]?.name || 'Pcs'),
      purchasePrice: 0,
      salePrice: 0,
      stock: 0,
      storeId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, 'products'), newProduct);
      toast.success('Product added successfully');
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding product:', error);
      toast.error('Failed to add product');
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProduct) return;
    
    const formData = new FormData(e.currentTarget);
    const updatedProduct = {
      name: formData.get('name'),
      brand: formData.get('brand'),
      category: formData.get('category'),
      modelNumber: formData.get('modelNumber'),
      unit: (formData.get('unit') as string)?.trim() || editingProduct.unit || (units[0]?.abbreviation || units[0]?.name || 'Pcs'),
      purchasePrice: editingProduct.purchasePrice || 0,
      salePrice: editingProduct.salePrice || 0,
      stock: editingProduct.stock || 0,
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(doc(db, 'products', editingProduct.id), updatedProduct);
      toast.success('Product updated successfully');
      setEditingProduct(null);
    } catch (error) {
      console.error('Error updating product:', error);
      toast.error('Failed to update product');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await deleteDoc(doc(db, 'products', id));
        toast.success('Product deleted successfully');
      } catch (error) {
        console.error('Error deleting product:', error);
        toast.error('Failed to delete product');
      }
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.modelNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.brand.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isFormOpen = showAddForm || !!editingProduct;

  if (isFormOpen) {
    const isEditing = !!editingProduct;
    const initialData = editingProduct || {} as Partial<Product>;

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">{isEditing ? 'Edit Product' : 'Add Product'}</h1>
            <p className="text-sm text-slate-500 mt-1">{isEditing ? 'Update the product details' : 'Enter the details for the new product'}</p>
          </div>
          <button 
            onClick={() => {
              setShowAddForm(false);
              setEditingProduct(null);
            }}
            className="flex items-center px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-200 transition-colors shadow-sm text-sm font-semibold"
          >
            Cancel
          </button>
        </div>

        <div className="glass-panel rounded-2xl shadow-sm overflow-hidden border border-slate-200">
          <form onSubmit={isEditing ? handleUpdateProduct : handleAddProduct}>
            <div className="bg-white px-6 py-6 sm:p-8">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2 lg:col-span-4">
                  <label htmlFor="name" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Product Name</label>
                  <input type="text" name="name" id="name" defaultValue={initialData.name} required className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" />
                </div>
                <div>
                  <label htmlFor="brand" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Brand</label>
                  <input type="text" name="brand" id="brand" defaultValue={initialData.brand} required className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" />
                </div>
                <div>
                  <label htmlFor="category" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Category</label>
                  <select name="category" id="category" defaultValue={initialData.category} required className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm">
                    <option value="Television">Television</option>
                    <option value="Refrigerator">Refrigerator</option>
                    <option value="Air Conditioner">Air Conditioner</option>
                    <option value="Mobile Phone">Mobile Phone</option>
                    <option value="Laptop">Laptop</option>
                    <option value="Camera">Camera</option>
                    <option value="DVR">DVR</option>
                    <option value="Security System">Security System</option>
                    <option value="Accessories">Accessories</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="unit" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Unit of Measure
                  </label>
                  <select
                    name="unit"
                    id="unit"
                    defaultValue={initialData.unit || (units[0]?.abbreviation || units[0]?.name || 'Pcs')}
                    required
                    className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm font-semibold text-slate-800"
                  >
                    {units.map((u, i) => {
                      const val = u.abbreviation || u.name;
                      return (
                        <option key={i} value={val}>
                          {u.name} {u.abbreviation && u.abbreviation !== u.name ? `(${u.abbreviation})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label htmlFor="modelNumber" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Model Number</label>
                  <input type="text" name="modelNumber" id="modelNumber" defaultValue={initialData.modelNumber} required className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" />
                </div>
              </div>

              {/* Available Stock Serial Numbers (shown when editing) */}
              {isEditing && (() => {
                const availableSerials = editProductSerials.filter(s => s.status === 'Available');
                const soldSerials = editProductSerials.filter(s => s.status === 'Sold');
                const filteredAvailable = availableSerials.filter(s =>
                  s.serialNumber.toLowerCase().includes(serialSearch.toLowerCase())
                );

                return (
                  <div className="mt-8 pt-6 border-t border-slate-200 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#0a382c] text-white flex items-center justify-center shrink-0">
                          <Barcode className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">
                              Serial Numbers in Available Stock
                            </h4>
                            <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                              {availableSerials.length} Available
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Units currently recorded in store inventory
                          </p>
                        </div>
                      </div>

                      {availableSerials.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleCopyAllAvailable(availableSerials)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl transition-all shadow-2xs cursor-pointer shrink-0"
                          title="Copy all available serial numbers"
                        >
                          {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                          <span>{copiedAll ? 'Copied All!' : 'Copy All'}</span>
                        </button>
                      )}
                    </div>

                    {availableSerials.length > 4 && (
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Search serial numbers..."
                          value={serialSearch}
                          onChange={(e) => setSerialSearch(e.target.value)}
                          className="glass-input block w-full pl-8 pr-3 py-1.5 rounded-xl text-xs font-mono text-slate-800 bg-slate-50 focus:bg-white"
                        />
                      </div>
                    )}

                    {loadingSerials ? (
                      <div className="flex items-center justify-center py-6 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#0a382c]"></div>
                        <span className="text-xs text-slate-500 font-bold ml-2">Loading serial numbers...</span>
                      </div>
                    ) : filteredAvailable.length > 0 ? (
                      <div className="max-h-52 overflow-y-auto p-3 bg-slate-50/70 border border-slate-200 rounded-xl">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {filteredAvailable.map((sn, idx) => (
                            <div
                              key={sn.id || idx}
                              className="group bg-white border border-slate-200/90 hover:border-emerald-300 rounded-lg p-2 flex items-center justify-between text-xs transition-all shadow-2xs"
                            >
                              <div className="flex items-center gap-1.5 min-w-0 pr-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                <span className="font-mono font-bold text-slate-800 truncate" title={sn.serialNumber}>
                                  {sn.serialNumber}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopySerial(sn.serialNumber)}
                                className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors cursor-pointer shrink-0"
                                title="Copy serial number"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : availableSerials.length > 0 ? (
                      <div className="text-center py-4 bg-slate-50 rounded-xl border border-slate-200 text-slate-500 text-xs">
                        No serial numbers match "{serialSearch}".
                      </div>
                    ) : (
                      <div className="p-4 bg-emerald-50/30 border border-emerald-100 rounded-xl flex items-center gap-3">
                        <Barcode className="w-5 h-5 text-emerald-700 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-slate-800">No Serial Numbers in Available Stock</p>
                          <p className="text-[11px] text-slate-500">
                            Serial numbers can be added when adding stock in the Inventory module.
                          </p>
                        </div>
                      </div>
                    )}

                    {soldSerials.length > 0 && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setShowSold(!showSold)}
                          className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          {showSold ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          <span>{showSold ? 'Hide' : 'Show'} Sold Serial Numbers ({soldSerials.length} sold)</span>
                        </button>

                        {showSold && (
                          <div className="mt-2 max-h-36 overflow-y-auto p-2.5 bg-slate-100/70 border border-slate-200 rounded-xl">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                              {soldSerials.map((sn, idx) => (
                                <div
                                  key={sn.id || idx}
                                  className="bg-white/80 border border-slate-200 rounded-lg p-1.5 px-2 flex items-center justify-between text-xs"
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"></span>
                                    <span className="font-mono text-slate-500 truncate" title={sn.serialNumber}>
                                      {sn.serialNumber}
                                    </span>
                                  </div>
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-1 py-0.5 rounded">
                                    Sold
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="bg-[#f8faf9] px-6 py-4 sm:px-8 flex justify-end gap-3 border-t border-slate-200">
              <button type="button" onClick={() => {
                setShowAddForm(false);
                setEditingProduct(null);
              }} className="inline-flex justify-center rounded-xl border border-slate-200 px-5 py-2.5 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 focus:outline-none transition-colors">
                Cancel
              </button>
              <button type="submit" className="inline-flex justify-center rounded-xl px-5 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white text-sm font-bold shadow-md shadow-emerald-950/10 focus:outline-none transition-colors">
                {isEditing ? 'Update Product' : 'Save Product'}
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
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Products</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your product catalog and inventory</p>
        </div>
        <button 
          onClick={() => setShowAddForm(true)}
          className="flex items-center px-4 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl shadow-md shadow-emerald-950/10 transition-colors text-sm font-bold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Product
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
              placeholder="Search products..."
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
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Product</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Unit</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Price</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Stock</th>
                <th scope="col" className="relative px-6 py-4"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a382c] mx-auto"></div>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                    No products found. Add a new product to get started.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-[#f8faf9] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center">
                          <Package className="h-5 w-5 text-[#0a382c]" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-bold text-slate-900">{product.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{product.brand} • {product.modelNumber}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2.5 py-1 inline-flex text-[10px] leading-5 font-black rounded-full bg-emerald-50 border border-emerald-150 text-emerald-800 uppercase tracking-wider">
                        {product.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2.5 py-1 inline-flex text-[11px] font-bold rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                        {product.unit || 'Pcs'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">
                      PKR {product.salePrice.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 inline-flex text-[10px] leading-5 font-black rounded-full uppercase tracking-wider ${
                        product.stock > 10 
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-150' 
                          : product.stock > 0 
                            ? 'bg-amber-50 text-amber-800 border border-amber-150' 
                            : 'bg-rose-50 text-rose-800 border border-rose-150'
                      }`}>
                        {product.stock} {product.unit ? product.unit : 'in stock'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold">
                      <button 
                        onClick={() => setEditingProduct(product)}
                        className="text-slate-400 hover:text-slate-800 mr-4 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteProduct(product.id)}
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
