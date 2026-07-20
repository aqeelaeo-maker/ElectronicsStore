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

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.brand.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.modelNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStockBadge = (stock: number) => {
    if (stock === 0) {
      return (
        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
          Out of Stock
        </span>
      );
    } else if (stock < 5) {
      return (
        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
          Low Stock ({stock})
        </span>
      );
    } else {
      return (
        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
          In Stock ({stock})
        </span>
      );
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500">Track current stock levels and add incoming stock</p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="bg-gray-100 p-1 rounded-lg flex shadow-sm border border-gray-200">
          <button
            onClick={() => setActiveTab('current')}
            className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'current'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Package className="w-4 h-4 mr-2" />
            Current Stock
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'history'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <History className="w-4 h-4 mr-2" />
            Stock History
          </button>
        </div>
      </div>

      {activeTab === 'current' ? (
        <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
          {/* Left Column: Products List with search */}
          <div className="w-full lg:w-3/5 flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search products by name, brand, category, or model..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Search className="w-5 h-5 text-gray-400 absolute left-3 top-3" />
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-4">
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-lg font-medium">No Products Found</p>
                  <p className="text-sm">Add products in the Products section first.</p>
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
                            ? 'border-blue-500 bg-blue-50/50 shadow-sm ring-1 ring-blue-500/50'
                            : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide bg-blue-50 px-2 py-0.5 rounded-md">
                              {product.category}
                            </span>
                            <h3 className="font-bold text-gray-900 mt-1 line-clamp-1">{product.name}</h3>
                            <p className="text-xs text-gray-500">{product.brand} | Model: {product.modelNumber}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                          <div>
                            <span className="text-xs text-gray-500 block">Current Stock</span>
                            {getStockBadge(product.stock || 0)}
                          </div>
                          
                          <button
                            onClick={() => {
                              setSelectedProduct(product);
                              setQuantityToAdd(10); // Default placeholder suggestion
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center shadow-sm ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
          <div className="w-full lg:w-2/5 flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {!selectedProduct ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-500 min-h-[300px]">
                <TrendingUp className="w-16 h-16 text-gray-300 mb-4" />
                <p className="text-lg font-medium text-gray-900 mb-1">Select a Product</p>
                <p className="text-sm max-w-xs mx-auto">
                  Click the "Add Stock" button on any product card on the left to add incoming inventory.
                </p>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Add Stock</h2>
                      <p className="text-sm text-gray-500">{selectedProduct.name}</p>
                    </div>
                    <button
                      onClick={() => setSelectedProduct(null)}
                      className="text-gray-400 hover:text-gray-600 text-sm font-medium"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-4 text-xs pt-3 border-t border-gray-200">
                    <div>
                      <span className="text-gray-500 block">Model</span>
                      <span className="font-semibold text-gray-800">{selectedProduct.modelNumber}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Current Stock</span>
                      <span className="font-semibold text-gray-800">{selectedProduct.stock || 0} units</span>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleAddStockSubmit} className="p-6 space-y-4 flex-1 overflow-y-auto">
                  <div>
                    <label htmlFor="quantityToAdd" className="block text-sm font-semibold text-gray-700">
                      Quantity to Add <span className="text-red-500">*</span>
                    </label>
                    <div className="mt-1 flex items-center gap-3">
                      <input
                        type="number"
                        id="quantityToAdd"
                        required
                        min="1"
                        className="block w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm font-medium"
                        value={quantityToAdd}
                        onChange={(e) => setQuantityToAdd(Math.max(1, parseInt(e.target.value) || 0))}
                      />
                      <div className="flex gap-1.5">
                        {[10, 25, 50, 100].map(val => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setQuantityToAdd(val)}
                            className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded text-xs transition-colors border border-gray-200"
                          >
                            +{val}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="vendor" className="block text-sm font-semibold text-gray-700">
                      Supplier / Vendor (Optional)
                    </label>
                    <select
                      id="vendor"
                      className="mt-1 block w-full bg-white border border-gray-300 rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm font-medium"
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
                    <label htmlFor="refNumber" className="block text-sm font-semibold text-gray-700">
                      Reference / Invoice Number (Optional)
                    </label>
                    <input
                      type="text"
                      id="refNumber"
                      placeholder="e.g. INV-2026-001"
                      className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                    />
                  </div>

                  <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-2 text-sm mt-6">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Previous Stock:</span>
                      <span className="font-semibold text-gray-800">{selectedProduct.stock || 0} units</span>
                    </div>
                    <div className="flex justify-between text-blue-700 font-bold">
                      <span>New Projected Stock:</span>
                      <span>{(selectedProduct.stock || 0) + quantityToAdd} units</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={saving || quantityToAdd <= 0}
                    className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 mt-6"
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
        /* History / Audit Log Table */
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Inventory Transaction Log</h2>
            <span className="text-xs font-semibold text-gray-500 bg-white border border-gray-200 px-2.5 py-1 rounded-full">
              {logs.length} Transactions
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            {logs.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-lg font-medium">No Logged Additions Yet</p>
                <p className="text-sm">Added stock entries will show up here as an audit trail.</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 table-fixed">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/4">Product</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/6">Qty Added</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/6">Stock Path</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/4">Supplier & Ref</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/6">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
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
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900 line-clamp-1">{log.productName}</div>
                          <div className="text-xs text-gray-500">
                            {log.productBrand} | Model: {log.productModelNumber}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center text-sm font-bold text-green-700 bg-green-50 px-2 py-1 rounded">
                            <Plus className="w-3 h-3 mr-0.5" />
                            {log.quantityAdded} units
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex items-center gap-1.5 font-medium font-mono text-xs">
                            <span className="text-gray-400">{log.previousStock}</span>
                            <span>→</span>
                            <span className="text-blue-600 font-semibold">{log.newStock}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-semibold text-gray-800 line-clamp-1">
                            {log.vendorName ? (
                              <span className="flex items-center">
                                <User className="w-3.5 h-3.5 mr-1 text-purple-500" />
                                {log.vendorName}
                              </span>
                            ) : (
                              <span className="text-gray-400 font-normal italic">Direct stock addition</span>
                            )}
                          </div>
                          {log.referenceNumber && (
                            <div className="text-xs text-gray-500 flex items-center mt-1">
                              <FileText className="w-3 h-3 mr-1 text-gray-400" />
                              Ref: {log.referenceNumber}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 font-medium">
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
