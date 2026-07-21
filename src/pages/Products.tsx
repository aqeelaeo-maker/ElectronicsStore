import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Plus, Search, Edit2, Trash2, Package } from 'lucide-react';
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

export default function Products() {
  const { storeId, role } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

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
      setLoading(false);
    }, (error) => {
      console.error('Error fetching products:', error);
      toast.error('Failed to load products');
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [storeId, role]);

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
      purchasePrice: 0,
      salePrice: 0,
      stock: Number(formData.get('stock')),
      storeId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, 'products'), newProduct);
      toast.success('Stock added successfully');
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding stock:', error);
      toast.error('Failed to add stock');
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
      purchasePrice: editingProduct.purchasePrice || 0,
      salePrice: editingProduct.salePrice || 0,
      stock: Number(formData.get('stock')),
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(doc(db, 'products', editingProduct.id), updatedProduct);
      toast.success('Stock updated successfully');
      setEditingProduct(null);
    } catch (error) {
      console.error('Error updating stock:', error);
      toast.error('Failed to update stock');
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
            <h1 className="text-3xl font-black tracking-tight text-slate-900">{isEditing ? 'Edit Stock' : 'Add Stock'}</h1>
            <p className="text-sm text-slate-500 mt-1">{isEditing ? 'Update the stock details' : 'Enter the details for the new stock product'}</p>
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
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2 lg:col-span-3">
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
                  <label htmlFor="modelNumber" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Model Number</label>
                  <input type="text" name="modelNumber" id="modelNumber" defaultValue={initialData.modelNumber} required className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" />
                </div>
                <div>
                  <label htmlFor="stock" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Initial Stock</label>
                  <input type="number" name="stock" id="stock" defaultValue={initialData.stock} required min="0" className="glass-input block w-full rounded-xl py-2.5 px-4 sm:text-sm" />
                </div>
              </div>
            </div>
            <div className="bg-[#f8faf9] px-6 py-4 sm:px-8 flex justify-end gap-3 border-t border-slate-200">
              <button type="button" onClick={() => {
                setShowAddForm(false);
                setEditingProduct(null);
              }} className="inline-flex justify-center rounded-xl border border-slate-200 px-5 py-2.5 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 focus:outline-none transition-colors">
                Cancel
              </button>
              <button type="submit" className="inline-flex justify-center rounded-xl px-5 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white text-sm font-bold shadow-md shadow-emerald-950/10 focus:outline-none transition-colors">
                {isEditing ? 'Update Stock' : 'Save Stock'}
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
          Add Stock
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
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Price</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Stock</th>
                <th scope="col" className="relative px-6 py-4"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a382c] mx-auto"></div>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic text-sm">
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">
                      ${product.salePrice.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 inline-flex text-[10px] leading-5 font-black rounded-full uppercase tracking-wider ${
                        product.stock > 10 
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-150' 
                          : product.stock > 0 
                            ? 'bg-amber-50 text-amber-800 border border-amber-150' 
                            : 'bg-rose-50 text-rose-800 border border-rose-150'
                      }`}>
                        {product.stock} in stock
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
