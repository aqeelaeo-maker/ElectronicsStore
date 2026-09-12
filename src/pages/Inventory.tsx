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
  ChevronUp,
  Barcode,
  Copy,
  Check
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import AddInventoryStock, { Product, Vendor } from './AddInventoryStock';
import { DEFAULT_PRODUCT_CATEGORIES } from './Settings';

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
  const [editProdUnit, setEditProdUnit] = useState('Pcs');
  const [editProdStock, setEditProdStock] = useState<number>(0);
  const [editProdPurchasePrice, setEditProdPurchasePrice] = useState<number>(0);
  const [editProdSalePrice, setEditProdSalePrice] = useState<number>(0);
  const [savingProductEdit, setSavingProductEdit] = useState(false);

  // Store Units
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

  // Store Categories
  const [categories, setCategories] = useState<string[]>(DEFAULT_PRODUCT_CATEGORIES);

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

        if (Array.isArray(data.categories) && data.categories.length > 0) {
          const parsedCategories = data.categories
            .map((c: any) => typeof c === 'string' ? c.trim() : (c.name || String(c)).trim())
            .filter(Boolean);
          if (parsedCategories.length > 0) {
            setCategories(parsedCategories);
          }
        }
      }
    });

    return () => unsubStore();
  }, [storeId]);

  // Serial Numbers for Product being edited
  const [editProductSerials, setEditProductSerials] = useState<Array<{ id: string; serialNumber: string; status: 'Available' | 'Sold'; createdAt?: any }>>([]);
  const [loadingEditProductSerials, setLoadingEditProductSerials] = useState(false);
  const [serialSearchTerm, setSerialSearchTerm] = useState('');
  const [showSoldSerials, setShowSoldSerials] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

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
    setEditProdUnit(product.unit || (units[0]?.abbreviation || units[0]?.name || 'Pcs'));
    setEditProdStock(product.stock || 0);
    setEditProdPurchasePrice(product.purchasePrice || 0);
    setEditProdSalePrice(product.salePrice || 0);
  };

  // Fetch Serial Numbers for Product being edited
  useEffect(() => {
    if (!editingProduct || !storeId) {
      setEditProductSerials([]);
      setSerialSearchTerm('');
      setShowSoldSerials(false);
      setCopiedAll(false);
      return;
    }

    setLoadingEditProductSerials(true);
    const q = query(
      collection(db, 'serialNumbers'),
      where('storeId', '==', storeId),
      where('productId', '==', editingProduct.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Array<{ id: string; serialNumber: string; status: 'Available' | 'Sold'; createdAt?: any }> = [];
      snapshot.forEach((docSnap) => {
        data.push({ id: docSnap.id, ...docSnap.data() } as any);
      });

      // Natural alphanumeric sort by serialNumber
      data.sort((a, b) => a.serialNumber.localeCompare(b.serialNumber, undefined, { numeric: true, sensitivity: 'base' }));

      setEditProductSerials(data);
      setLoadingEditProductSerials(false);
    }, (error) => {
      console.error('Error fetching serial numbers for product:', error);
      setLoadingEditProductSerials(false);
    });

    return () => unsubscribe();
  }, [editingProduct?.id, storeId]);

  const handleCopySerial = (sn: string) => {
    navigator.clipboard.writeText(sn);
    toast.success(`Copied serial: ${sn}`);
  };

  const handleCopyAllAvailableSerials = () => {
    const available = editProductSerials.filter(s => s.status === 'Available');
    if (available.length === 0) return;
    const text = available.map(s => s.serialNumber).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
    toast.success(`Copied ${available.length} available serial numbers to clipboard`);
  };

  const handleDeleteSerialFromModal = async (serialId: string, serialNum: string) => {
    if (!window.confirm(`Are you sure you want to remove serial number "${serialNum}" from inventory stock?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'serialNumbers', serialId));
      if (editProdStock > 0) {
        const newStock = Math.max(0, editProdStock - 1);
        setEditProdStock(newStock);
        if (editingProduct) {
          await updateDoc(doc(db, 'products', editingProduct.id), {
            stock: newStock,
            updatedAt: serverTimestamp()
          });
        }
      }
      toast.success(`Serial ${serialNum} removed`);
    } catch (err: any) {
      console.error('Error removing serial number:', err);
      toast.error('Failed to delete serial number');
    }
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
        unit: editProdUnit || 'Pcs',
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

      {/* Edit Product Modal with Available Stock Serial Numbers */}
      {editingProduct && (() => {
        const availableSerials = editProductSerials.filter(s => s.status === 'Available');
        const soldSerials = editProductSerials.filter(s => s.status === 'Sold');
        const filteredAvailableSerials = availableSerials.filter(s =>
          s.serialNumber.toLowerCase().includes(serialSearchTerm.toLowerCase())
        );

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
              {/* Header */}
              <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-150 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-150 flex items-center justify-center text-[#0a382c] shrink-0">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                      Edit Product Details
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {editingProduct.name} &bull; {editingProduct.brand} (Model: {editingProduct.modelNumber})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-200/60 rounded-xl cursor-pointer"
                  title="Close dialog"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
                {/* Form fields */}
                <form id="edit-product-form" onSubmit={handleSaveProductEdit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Category <span className="text-rose-500">*</span>
                      </label>
                      <select
                        required
                        className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800"
                        value={editProdCategory}
                        onChange={(e) => setEditProdCategory(e.target.value)}
                      >
                        {editProdCategory && !categories.includes(editProdCategory) && (
                          <option value={editProdCategory}>{editProdCategory} (Current)</option>
                        )}
                        {categories.map((cat, idx) => (
                          <option key={idx} value={cat}>{cat}</option>
                        ))}
                        {categories.length === 0 && !editProdCategory && (
                          <option value="">No categories defined</option>
                        )}
                      </select>
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
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Unit of Measure <span className="text-rose-500">*</span>
                      </label>
                      <select
                        required
                        className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800"
                        value={editProdUnit}
                        onChange={(e) => setEditProdUnit(e.target.value)}
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
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                </form>

                {/* AVAILABLE STOCK SERIAL NUMBERS SECTION */}
                <div className="pt-5 border-t border-slate-200 space-y-3">
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
                          Active individual units currently available for sale in inventory
                        </p>
                      </div>
                    </div>

                    {availableSerials.length > 0 && (
                      <button
                        type="button"
                        onClick={handleCopyAllAvailableSerials}
                        className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl transition-all shadow-2xs cursor-pointer shrink-0"
                        title="Copy all available serial numbers to clipboard"
                      >
                        {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                        <span>{copiedAll ? 'Copied All!' : 'Copy All'}</span>
                      </button>
                    )}
                  </div>

                  {/* Filter / Search Serial Numbers */}
                  {availableSerials.length > 4 && (
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search serial numbers..."
                        value={serialSearchTerm}
                        onChange={(e) => setSerialSearchTerm(e.target.value)}
                        className="glass-input block w-full pl-8 pr-3 py-1.5 rounded-xl text-xs font-mono text-slate-800 bg-slate-50 focus:bg-white"
                      />
                    </div>
                  )}

                  {/* Serial Numbers Grid */}
                  {loadingEditProductSerials ? (
                    <div className="flex items-center justify-center py-8 bg-slate-50/60 rounded-xl border border-slate-150">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#0a382c]"></div>
                      <span className="text-xs text-slate-500 font-bold ml-2">Loading serial numbers...</span>
                    </div>
                  ) : filteredAvailableSerials.length > 0 ? (
                    <div className="max-h-56 overflow-y-auto p-3 bg-slate-50/70 border border-slate-200 rounded-xl">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {filteredAvailableSerials.map((sn, idx) => (
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
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleCopySerial(sn.serialNumber)}
                                className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                                title="Copy serial number"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSerialFromModal(sn.id, sn.serialNumber)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                title="Remove serial number"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : availableSerials.length > 0 ? (
                    <div className="text-center py-6 bg-slate-50/70 rounded-xl border border-slate-200 text-slate-500 text-xs">
                      No serial numbers match "{serialSearchTerm}".
                    </div>
                  ) : (
                    <div className="p-4 bg-emerald-50/40 border border-emerald-100 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                      <div className="flex items-center gap-2.5">
                        <Barcode className="w-5 h-5 text-emerald-700 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-slate-800">No Serial Numbers in Available Stock</p>
                          <p className="text-[11px] text-slate-500">
                            You can add serial numbers to this product through Add Inventory Stock.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const prod = editingProduct;
                          setEditingProduct(null);
                          handleOpenAddStock(prod);
                        }}
                        className="px-3 py-1.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Stock Serials</span>
                      </button>
                    </div>
                  )}

                  {/* Sold Serials Collapsible View (if any exist) */}
                  {soldSerials.length > 0 && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setShowSoldSerials(!showSoldSerials)}
                        className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {showSoldSerials ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        <span>{showSoldSerials ? 'Hide' : 'Show'} Sold Serial Numbers ({soldSerials.length} sold)</span>
                      </button>

                      {showSoldSerials && (
                        <div className="mt-2 max-h-36 overflow-y-auto p-2.5 bg-slate-100/70 border border-slate-200 rounded-xl">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
              </div>

              {/* Footer */}
              <div className="p-4 sm:px-6 bg-slate-50 border-t border-slate-150 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="py-2 px-4 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="edit-product-form"
                  disabled={savingProductEdit}
                  className="flex justify-center items-center py-2 px-5 border border-transparent rounded-xl shadow-md text-xs font-black text-white bg-[#0a382c] hover:bg-[#0d4a3b] focus:outline-none transition-colors disabled:opacity-50 shadow-emerald-950/10 cursor-pointer"
                >
                  {savingProductEdit ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    'Save Product Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
