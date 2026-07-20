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
      purchasePrice: Number(formData.get('purchasePrice')),
      salePrice: Number(formData.get('salePrice')),
      stock: Number(formData.get('stock')),
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
      purchasePrice: Number(formData.get('purchasePrice')),
      salePrice: Number(formData.get('salePrice')),
      stock: Number(formData.get('stock')),
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
            <h1 className="text-3xl font-extrabold tracking-tight text-white">{isEditing ? 'Edit Product' : 'Add New Product'}</h1>
            <p className="text-sm text-slate-400 mt-1">{isEditing ? 'Update the product details' : 'Enter the details for the new product'}</p>
          </div>
          <button 
            onClick={() => {
              setShowAddForm(false);
              setEditingProduct(null);
            }}
            className="flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors shadow-sm text-sm font-semibold"
          >
            Cancel
          </button>
        </div>

        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <form onSubmit={isEditing ? handleUpdateProduct : handleAddProduct}>
            <div className="px-6 py-6 sm:p-8">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2 lg:col-span-3">
                  <label htmlFor="name" className="block text-sm font-semibold text-slate-300">Product Name</label>
                  <input type="text" name="name" id="name" defaultValue={initialData.name} required className="mt-1.5 block w-full bg-slate-950 border border-slate-800 rounded-xl shadow-sm py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 sm:text-sm text-slate-100 placeholder-slate-600 transition-all" />
                </div>
                <div>
                  <label htmlFor="brand" className="block text-sm font-semibold text-slate-300">Brand</label>
                  <input type="text" name="brand" id="brand" defaultValue={initialData.brand} required className="mt-1.5 block w-full bg-slate-950 border border-slate-800 rounded-xl shadow-sm py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 sm:text-sm text-slate-100 placeholder-slate-600 transition-all" />
                </div>
                <div>
                  <label htmlFor="category" className="block text-sm font-semibold text-slate-300">Category</label>
                  <select name="category" id="category" defaultValue={initialData.category} required className="mt-1.5 block w-full bg-slate-950 border border-slate-800 rounded-xl shadow-sm py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 sm:text-sm text-slate-100 transition-all">
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
                  <label htmlFor="modelNumber" className="block text-sm font-semibold text-slate-300">Model Number</label>
                  <input type="text" name="modelNumber" id="modelNumber" defaultValue={initialData.modelNumber} required className="mt-1.5 block w-full bg-slate-950 border border-slate-800 rounded-xl shadow-sm py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 sm:text-sm text-slate-100 placeholder-slate-600 transition-all" />
                </div>
                <div>
                  <label htmlFor="stock" className="block text-sm font-semibold text-slate-300">Initial Stock</label>
                  <input type="number" name="stock" id="stock" defaultValue={initialData.stock} required min="0" className="mt-1.5 block w-full bg-slate-950 border border-slate-800 rounded-xl shadow-sm py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 sm:text-sm text-slate-100 placeholder-slate-600 transition-all" />
                </div>
                <div>
                  <label htmlFor="purchasePrice" className="block text-sm font-semibold text-slate-300">Purchase Price</label>
                  <input type="number" name="purchasePrice" id="purchasePrice" defaultValue={initialData.purchasePrice} required min="0" step="0.01" className="mt-1.5 block w-full bg-slate-950 border border-slate-800 rounded-xl shadow-sm py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 sm:text-sm text-slate-100 placeholder-slate-600 transition-all" />
                </div>
                <div>
                  <label htmlFor="salePrice" className="block text-sm font-semibold text-slate-300">Sale Price</label>
                  <input type="number" name="salePrice" id="salePrice" defaultValue={initialData.salePrice} required min="0" step="0.01" className="mt-1.5 block w-full bg-slate-950 border border-slate-800 rounded-xl shadow-sm py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 sm:text-sm text-slate-100 placeholder-slate-600 transition-all" />
                </div>
              </div>
            </div>
            <div className="bg-slate-950/40 px-6 py-4 border-t border-slate-850 flex justify-end gap-3">
              <button type="button" onClick={() => {
                setShowAddForm(false);
                setEditingProduct(null);
              }} className="inline-flex justify-center rounded-xl border border-slate-800 shadow-sm px-5 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-sm font-semibold focus:outline-none transition-colors">
                Cancel
              </button>
              <button type="submit" className="inline-flex justify-center rounded-xl border border-transparent shadow-md px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold focus:outline-none transition-colors shadow-blue-500/10">
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
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Products</h1>
          <p className="text-sm text-slate-400 mt-1">Manage your product catalog and inventory</p>
        </div>
        <button 
          onClick={() => setShowAddForm(true)}
          className="flex items-center px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors shadow-md shadow-blue-500/10 text-sm font-semibold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Product
        </button>
      </div>

      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800">
          <div className="relative max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-500" />
            </div>
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 sm:text-sm transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-950/40">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Product</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Category</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Price</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Stock</th>
                <th scope="col" className="relative px-6 py-4"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="bg-slate-900 divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 font-medium">
                    No products found. Add a new product to get started.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-850/40 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center">
                          <Package className="h-5 w-5 text-slate-400" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-bold text-white">{product.name}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{product.brand} • {product.modelNumber}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-3 py-1 inline-flex text-xs font-bold rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {product.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-300">
                      ${product.salePrice.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 inline-flex text-xs font-bold rounded-full ${
                        product.stock > 10 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : product.stock > 0 
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {product.stock} in stock
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                        onClick={() => setEditingProduct(product)}
                        className="text-blue-400 hover:text-blue-300 mr-4 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteProduct(product.id)}
                        className="text-red-400 hover:text-red-300 transition-colors"
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
