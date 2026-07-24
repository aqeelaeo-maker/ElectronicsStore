import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where, doc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Search, Plus, Trash2, Hash } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';

interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  modelNumber: string;
  stock: number;
}

interface SerialNumber {
  id: string;
  productId: string;
  serialNumber: string;
  status: 'Available' | 'Sold';
  createdAt: any;
}

export default function SerialNumbers() {
  const { storeId, role } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [serialNumbers, setSerialNumbers] = useState<SerialNumber[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingSerials, setLoadingSerials] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [newSerialNumber, setNewSerialNumber] = useState('');
  const [addingSerial, setAddingSerial] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    
    const q = query(collection(db, 'products'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'));
      
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Product[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Product);
      });
      setProducts(data);
      setLoadingProducts(false);
    }, (error) => {
      console.error('Error fetching products:', error);
      toast.error('Failed to load products');
      setLoadingProducts(false);
    });
    
    return () => unsubscribe();
  }, [storeId]);

  useEffect(() => {
    if (!selectedProduct || !storeId) {
      setSerialNumbers([]);
      return;
    }
    
    setLoadingSerials(true);
    
    const q = query(
      collection(db, 'serialNumbers'), 
      where('storeId', '==', storeId),
      where('productId', '==', selectedProduct.id)
    );
      
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: SerialNumber[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as SerialNumber);
      });
      
      // Sort client-side by createdAt descending
      data.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });
      
      setSerialNumbers(data);
      setLoadingSerials(false);
    }, (error) => {
      console.error('Error fetching serial numbers:', error);
      toast.error('Failed to load serial numbers');
      setLoadingSerials(false);
    });
    
    return () => unsubscribe();
  }, [selectedProduct, storeId]);

  const handleAddSerialNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetSerialNumber = newSerialNumber.trim();
    if (!selectedProduct || !storeId || !targetSerialNumber) return;
    
    setAddingSerial(true);
    try {
      // Check if serial number already exists for this product locally
      const isLocalDuplicate = serialNumbers.some(sn => sn.serialNumber.toLowerCase() === targetSerialNumber.toLowerCase());
      if (isLocalDuplicate) {
        toast.warning('This serial number already exists for this product');
        setAddingSerial(false);
        return;
      }

      // Check if the serial number already exists across products in this store
      const serialQuery = query(
        collection(db, 'serialNumbers'),
        where('storeId', '==', storeId),
        where('serialNumber', '==', targetSerialNumber)
      );
      const querySnapshot = await getDocs(serialQuery);
      if (!querySnapshot.empty) {
        const existingDoc = querySnapshot.docs[0].data();
        const existingProductId = existingDoc.productId;
        
        // Find if we have the product name loaded to give a highly descriptive error
        const otherProduct = products.find(p => p.id === existingProductId);
        if (otherProduct) {
          toast.error(`This serial number is already assigned to product: "${otherProduct.name}" (${otherProduct.brand})`);
        } else {
          toast.error('This serial number is already assigned to another product');
        }
        setAddingSerial(false);
        return;
      }

      await addDoc(collection(db, 'serialNumbers'), {
        productId: selectedProduct.id,
        storeId,
        serialNumber: newSerialNumber.trim(),
        status: 'Available',
        createdAt: serverTimestamp(),
      });
      
      toast.success('Serial number added successfully');
      setNewSerialNumber('');
    } catch (error) {
      console.error('Error adding serial number:', error);
      toast.error('Failed to add serial number');
    } finally {
      setAddingSerial(false);
    }
  };

  const handleDeleteSerialNumber = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this serial number?')) {
      try {
        await deleteDoc(doc(db, 'serialNumbers', id));
        toast.success('Serial number deleted successfully');
      } catch (error) {
        console.error('Error deleting serial number:', error);
        toast.error('Failed to delete serial number');
      }
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
    p.modelNumber.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.brand.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Serial Numbers</h1>
        <p className="text-sm text-slate-500 mt-1">Manage unique serial numbers for serialized store inventory</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* Left Column: Products List */}
        <div className="w-full lg:w-1/3 flex flex-col glass-panel rounded-2xl shadow-sm overflow-hidden bg-white">
          <div className="p-4 border-b border-slate-150 bg-slate-50/50">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Select Product</h2>
            <div className="relative">
              <input
                type="text"
                placeholder="Search products..."
                className="glass-input block w-full pl-10 pr-3 py-2 rounded-xl text-xs"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              <Search className="w-4 h-4 text-slate-450 absolute left-3.5 top-3" />
            </div>
          </div>
          
          <div className="overflow-y-auto flex-1 p-2 space-y-1 bg-white">
            {loadingProducts ? (
              <div className="flex justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a382c]"></div>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center p-8 text-slate-400 text-xs">
                No products found.
              </div>
            ) : (
              <ul className="space-y-1">
                {filteredProducts.map(product => {
                  const isSelected = selectedProduct?.id === product.id;
                  return (
                    <li key={product.id}>
                      <button
                        onClick={() => setSelectedProduct(product)}
                        className={`w-full text-left px-4 py-3 rounded-xl transition-all border ${
                          isSelected 
                            ? 'bg-emerald-50/40 border-emerald-300 shadow-sm ring-1 ring-emerald-500/10' 
                            : 'hover:bg-[#f8faf9] border-transparent'
                        }`}
                      >
                        <div className="font-bold text-slate-900 text-sm">{product.name}</div>
                        <div className="text-xs text-slate-500 flex justify-between mt-1.5">
                          <span>{product.brand} • {product.modelNumber}</span>
                          <span className="text-[#0a382c] font-black uppercase tracking-wider bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded text-[10px]">Stock: {product.stock}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Right Column: Serial Numbers */}
        <div className="w-full lg:w-2/3 flex flex-col glass-panel rounded-2xl shadow-sm overflow-hidden bg-white border border-slate-200">
          {!selectedProduct ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500 min-h-[350px]">
              <Hash className="w-16 h-16 text-slate-300 mb-4" />
              <p className="text-base font-bold text-slate-700 mb-1">No Product Selected</p>
              <p className="text-xs max-w-xs mx-auto text-slate-500 leading-relaxed">Select a product from the list on the left to manage its serial numbers.</p>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-slate-150 bg-slate-50/50 flex justify-between items-center">
                <div>
                  <h2 className="text-base font-bold text-slate-900">{selectedProduct.name}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedProduct.brand} | Model: {selectedProduct.modelNumber}</p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold">Available Stock</div>
                  <div className="text-xl font-black text-[#0a382c]">{selectedProduct.stock}</div>
                </div>
              </div>

              <div className="p-4 border-b border-slate-150 bg-white">
                <form onSubmit={handleAddSerialNumber} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter new serial number..."
                    className="glass-input block flex-1 rounded-xl py-2 px-3 text-xs"
                    value={newSerialNumber}
                    onChange={(e) => setNewSerialNumber(e.target.value)}
                    required
                  />
                  <button
                    type="submit"
                    disabled={addingSerial || !newSerialNumber.trim()}
                    className="flex items-center px-4 py-2 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl transition-all text-xs font-bold disabled:opacity-50 shadow-md shadow-emerald-950/10"
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Add
                  </button>
                </form>
              </div>

              <div className="flex-1 overflow-y-auto p-4 bg-white">
                {loadingSerials ? (
                  <div className="flex justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a382c]"></div>
                  </div>
                ) : serialNumbers.length === 0 ? (
                  <div className="text-center p-8 text-slate-400 text-xs">
                    No serial numbers recorded for this product yet.
                  </div>
                ) : (
                  <div className="border border-slate-150 rounded-xl overflow-hidden">
                    <table className="min-w-full divide-y divide-slate-100">
                      <thead className="bg-[#f8faf9]">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Serial Number
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th scope="col" className="px-6 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {serialNumbers.map((sn) => (
                          <tr key={sn.id} className="hover:bg-[#f8faf9] transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-bold text-slate-800 font-mono tracking-wider">{sn.serialNumber}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2.5 py-1 inline-flex text-[9px] font-black uppercase tracking-wider rounded-full ${
                                sn.status === 'Available' 
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-150' 
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}>
                                {sn.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold">
                              <button 
                                onClick={() => handleDeleteSerialNumber(sn.id)}
                                className="text-red-500 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
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
      </div>
    </div>
  );
}
