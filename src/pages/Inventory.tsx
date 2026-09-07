import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  query, 
  where 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  Plus, 
  Search, 
  Package, 
  History, 
  User, 
  FileText, 
  Edit2, 
  Trash2, 
  X, 
  Hash,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import AddInventoryStock, { Product, Vendor } from './AddInventoryStock';

interface InventoryLog {
  id: string;
  productId: string;
  productName: string;
  productBrand: string;
  productModelNumber: string;
  quantityAdded: number;
  serialNumbers?: string[];
  previousStock: number;
  newStock: number;
  purchasePrice?: number;
  salePrice?: number;
  vendorId?: string;
  vendorName?: string;
  referenceNumber?: string;
  createdAt: any;
}

interface InventoryProps {
  initialAddStock?: boolean;
}

export default function Inventory({ initialAddStock = false }: InventoryProps) {
  const navigate = useNavigate();
  const { storeId } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Full-page Add Stock state
  const [isAddStockView, setIsAddStockView] = useState(initialAddStock);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Edit Log State
  const [editingLog, setEditingLog] = useState<InventoryLog | null>(null);
  const [editQty, setEditQty] = useState<number>(0);
  const [editPurchasePrice, setEditPurchasePrice] = useState<number>(0);
  const [editSalePrice, setEditSalePrice] = useState<number>(0);
  const [editVendorId, setEditVendorId] = useState<string>('');
  const [editRefNumber, setEditRefNumber] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  // Edit Product State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editProdName, setEditProdName] = useState('');
  const [editProdBrand, setEditProdBrand] = useState('');
  const [editProdCategory, setEditProdCategory] = useState('');
  const [editProdModel, setEditProdModel] = useState('');
  const [editProdStock, setEditProdStock] = useState<number>(0);
  const [editProdPurchasePrice, setEditProdPurchasePrice] = useState<number>(0);
  const [editProdSalePrice, setEditProdSalePrice] = useState<number>(0);
  const [savingProductEdit, setSavingProductEdit] = useState(false);

  // Fetch Firestore Collections
  useEffect(() => {
    if (!storeId) return;

    // 1. Fetch Products
    const productsQuery = query(collection(db, 'products'), where('storeId', '==', storeId));
    const unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
      const data: Product[] = [];
      snapshot.forEach((docSnap) => {
        data.push({ id: docSnap.id, ...docSnap.data() } as Product);
      });

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

    // 2. Fetch Vendors
    const vendorsQuery = query(collection(db, 'vendors'), where('storeId', '==', storeId));
    const unsubscribeVendors = onSnapshot(vendorsQuery, (snapshot) => {
      const data: Vendor[] = [];
      snapshot.forEach((docSnap) => {
        data.push({ id: docSnap.id, ...docSnap.data() } as Vendor);
      });

      data.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      setVendors(data);
    }, (error) => {
      console.error('Error fetching vendors:', error);
    });

    // 3. Fetch Inventory Logs
    const logsQuery = query(collection(db, 'inventoryLogs'), where('storeId', '==', storeId));
    const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
      const data: InventoryLog[] = [];
      snapshot.forEach((docSnap) => {
        data.push({ id: docSnap.id, ...docSnap.data() } as InventoryLog);
      });

      data.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
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
  }, [storeId]);

  // Open Full-Page Add Stock
  const handleOpenAddStock = (product?: Product) => {
    setSelectedProduct(product || null);
    setIsAddStockView(true);
  };

  // Delete Log
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

  // Open Edit Log Modal
  const handleOpenEditLog = (log: InventoryLog) => {
    setEditingLog(log);
    setEditQty(log.quantityAdded);
    setEditPurchasePrice(log.purchasePrice || 0);
    setEditSalePrice(log.salePrice || 0);
    setEditVendorId(log.vendorId || '');
    setEditRefNumber(log.referenceNumber || '');
  };

  // Save Edited Log
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

  // Open Edit Product Modal
  const handleOpenEditProduct = (product: Product) => {
    setEditingProduct(product);
    setEditProdName(product.name || '');
    setEditProdBrand(product.brand || '');
    setEditProdCategory(product.category || '');
    setEditProdModel(product.modelNumber || '');
    setEditProdStock(product.stock || 0);
    setEditProdPurchasePrice(product.purchasePrice || 0);
    setEditProdSalePrice(product.salePrice || 0);
  };

  // Save Product Edit
  const handleSaveProductEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    setSavingProductEdit(true);
    try {
      await updateDoc(doc(db, 'products', editingProduct.id), {
        name: editProdName,
        brand: editProdBrand,
        category: editProdCategory,
        modelNumber: editProdModel,
        stock: editProdStock,
        purchasePrice: editProdPurchasePrice,
        salePrice: editProdSalePrice,
        updatedAt: serverTimestamp()
      });
      toast.success('Product updated successfully');
      setEditingProduct(null);
    } catch (error: any) {
      console.error('Error updating product:', error);
      toast.error(`Failed to update product: ${error?.message || 'Unknown error'}`);
    } finally {
      setSavingProductEdit(false);
    }
  };

  // Delete Product
  const handleDeleteProduct = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'products', id));
      toast.success('Product deleted successfully');
    } catch (error: any) {
      console.error('Error deleting product:', error);
      toast.error(`Failed to delete product: ${error?.message || 'Unknown error'}`);
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

  // Full-Page View Render
  if (isAddStockView) {
    return (
      <AddInventoryStock
        initialProduct={selectedProduct}
        onBack={() => {
          setIsAddStockView(false);
          setSelectedProduct(null);
          if (window.location.pathname.includes('/inventory/add')) {
            navigate('/inventory');
          }
        }}
      />
    );
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500 mt-1">Track current stock levels and add incoming serialized stock</p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-100 p-1 rounded-xl flex border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('current')}
              className={`flex items-center px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === 'current'
                  ? 'bg-[#0a382c] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Package className="w-3.5 h-3.5 mr-2" />
              Current Stock
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex items-center px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-[#0a382c] text-white shadow-xs'
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
        <div className="glass-panel rounded-2xl shadow-xs flex-1 flex flex-col overflow-hidden bg-white animate-in fade-in duration-200">
          <div className="px-6 py-4 border-b border-slate-150 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                placeholder="Search products by name, model, brand..."
                className="glass-input block w-full pl-10 pr-3 py-2.5 rounded-xl text-xs"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            </div>

            <button
              type="button"
              onClick={() => handleOpenAddStock()}
              className="flex items-center px-4 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl transition-all shadow-md shadow-emerald-950/10 text-xs font-black cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Stock
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a382c]"></div>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <Package className="w-12 h-12 text-slate-350 mx-auto mb-3" />
                <p className="text-base font-bold text-slate-700">No Inventory Items Found</p>
                <p className="text-xs text-slate-500 mt-1">Add items using the Add Stock button or in the Products section.</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-slate-100 table-fixed">
                <thead className="bg-[#f8faf9] sticky top-0 z-10">
                  <tr>
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[35%]">Product Info</th>
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[15%]">Stock Level</th>
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[18%]">Purchase Price</th>
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[18%]">Sale Price</th>
                    <th scope="col" className="px-6 py-4 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[14%]">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-[#f8faf9] transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900 text-sm">{product.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {product.brand} | Model: {product.modelNumber}
                        </div>
                        <div className="mt-1.5">
                          <span className="text-[10px] font-bold text-[#0a382c] bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded uppercase tracking-wider">
                            {product.category}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStockBadge(product.stock || 0)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-800 font-mono">
                        PKR {(product.purchasePrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-[#0a382c] font-mono">
                        PKR {(product.salePrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenAddStock(product)}
                            className="p-1 text-emerald-800 hover:text-white hover:bg-[#0a382c] rounded-lg transition-all border border-emerald-200 hover:border-transparent cursor-pointer flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-1"
                            title="Quick Add Serialized Stock"
                          >
                            <Plus className="w-3 h-3" />
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditProduct(product)}
                            className="p-1.5 text-slate-500 hover:text-[#0a382c] hover:bg-emerald-50 rounded-lg transition-colors border border-transparent hover:border-emerald-150 cursor-pointer"
                            title="Edit Product"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(product.id, product.name)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-150 cursor-pointer"
                            title="Delete Product"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        /* History / Audit Log Table */
        <div className="glass-panel rounded-2xl shadow-xs flex-1 flex flex-col overflow-hidden bg-white">
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
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[26%]">Product & Serials</th>
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[12%]">Qty Added</th>
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[12%]">Stock Path</th>
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[20%]">Supplier & Ref</th>
                    <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[16%]">Date</th>
                    <th scope="col" className="px-6 py-4 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[14%]">Actions</th>
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

                    const hasSerials = log.serialNumbers && log.serialNumbers.length > 0;
                    const isExpanded = expandedLogId === log.id;

                    return (
                      <tr key={log.id} className="hover:bg-[#f8faf9] transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900 line-clamp-1 text-sm">{log.productName}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {log.productBrand} | Model: {log.productModelNumber}
                          </div>
                          {(log.purchasePrice !== undefined || log.salePrice !== undefined) && (
                            <div className="text-[10px] font-mono mt-1 flex gap-2">
                              {log.purchasePrice !== undefined && (
                                <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                  Buy: <strong>PKR {log.purchasePrice.toFixed(2)}</strong>
                                </span>
                              )}
                              {log.salePrice !== undefined && (
                                <span className="bg-[#e8f5e9] text-emerald-800 px-1.5 py-0.5 rounded border border-[#c8e6c9]">
                                  Sell: <strong>PKR {log.salePrice.toFixed(2)}</strong>
                                </span>
                              )}
                            </div>
                          )}

                          {/* Serial Numbers Badge & Dropdown */}
                          {hasSerials && (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[#0a382c] bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 transition-colors cursor-pointer"
                              >
                                <Hash className="w-2.5 h-2.5 text-[#0a382c]" />
                                {log.serialNumbers?.length} Serials
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>

                              {isExpanded && (
                                <div className="mt-1.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200 max-h-36 overflow-y-auto space-y-1 animate-in fade-in duration-150">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                    Associated Serial Numbers:
                                  </span>
                                  <div className="flex flex-wrap gap-1">
                                    {log.serialNumbers?.map((sn, idx) => (
                                      <span key={idx} className="font-mono text-[10px] font-bold bg-white border border-slate-200 text-slate-800 px-1.5 py-0.5 rounded">
                                        {sn}
                                      </span>
                                    ))}
                                  </div>
                                </div>
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
                              type="button"
                              onClick={() => handleOpenEditLog(log)}
                              className="p-1.5 text-slate-500 hover:text-[#0a382c] hover:bg-emerald-50 rounded-lg transition-colors border border-transparent hover:border-emerald-150 cursor-pointer"
                              title="Edit Stock Entry"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
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

      {/* Edit Log Modal */}
      {editingLog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in duration-200">
            <div className="p-4 bg-slate-50 border-b border-slate-150 flex justify-between items-center">
              <div>
                <h3 className="text-base font-black text-slate-900">Edit Stock Transaction</h3>
                <p className="text-xs text-slate-500 mt-0.5">{editingLog.productName}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingLog(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-150 rounded-lg cursor-pointer"
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
                    Purchase Price (PKR) <span className="text-rose-500">*</span>
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
                    Sale Price (PKR) <span className="text-rose-500">*</span>
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

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 bg-slate-50 border-b border-slate-150 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black text-slate-900">Edit Product Details</h3>
                <p className="text-xs text-slate-500 mt-0.5">Modify general parameters, stock count, and pricing</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-150 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProductEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Product Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="glass-input block w-full rounded-xl py-2 px-3 text-xs text-slate-800"
                    value={editProdName}
                    onChange={(e) => setEditProdName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Brand <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="glass-input block w-full rounded-xl py-2 px-3 text-xs text-slate-800"
                    value={editProdBrand}
                    onChange={(e) => setEditProdBrand(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Category <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="glass-input block w-full rounded-xl py-2 px-3 text-xs text-slate-800"
                    value={editProdCategory}
                    onChange={(e) => setEditProdCategory(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Model Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="glass-input block w-full rounded-xl py-2 px-3 text-xs text-slate-800"
                    value={editProdModel}
                    onChange={(e) => setEditProdModel(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Stock Level <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    className="glass-input block w-full rounded-xl py-2 px-3 text-xs text-slate-850 font-bold"
                    value={editProdStock}
                    onChange={(e) => setEditProdStock(Math.max(0, parseInt(e.target.value) || 0))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Purchase (PKR) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    className="glass-input block w-full rounded-xl py-2 px-3 text-xs text-slate-850 font-bold"
                    value={editProdPurchasePrice}
                    onChange={(e) => setEditProdPurchasePrice(Math.max(0, parseFloat(e.target.value) || 0))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Sale (PKR) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    className="glass-input block w-full rounded-xl py-2 px-3 text-xs text-slate-850 font-bold"
                    value={editProdSalePrice}
                    onChange={(e) => setEditProdSalePrice(Math.max(0, parseFloat(e.target.value) || 0))}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProductEdit}
                  className="flex-1 flex justify-center items-center py-2.5 px-4 border border-transparent rounded-xl shadow-md text-xs font-black text-white bg-[#0a382c] hover:bg-[#0d4a3b] focus:outline-none transition-colors disabled:opacity-50 shadow-emerald-950/10 cursor-pointer"
                >
                  {savingProductEdit ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    'Save Product'
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
