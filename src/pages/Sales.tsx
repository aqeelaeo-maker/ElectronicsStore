import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  writeBatch, 
  serverTimestamp, 
  query, 
  orderBy, 
  where,
  getDoc,
  getDocs
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  Plus, 
  Search, 
  FileText, 
  Eye, 
  Trash2, 
  X, 
  Calendar, 
  User, 
  DollarSign, 
  Info, 
  Hash, 
  CheckCircle2, 
  Building2,
  Printer,
  Pencil,
  ArrowLeft,
  CreditCard,
  Banknote,
  Globe
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { SearchableProductSelect } from '../components/SearchableProductSelect';

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

interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string;
  city: string;
  balance: number;
}

interface SerialNumber {
  id: string;
  productId: string;
  serialNumber: string;
  status: 'Available' | 'Sold';
}

interface SaleItem {
  productId: string;
  productName: string;
  brand: string;
  modelNumber: string;
  category: string;
  quantity: number;
  salePrice: number;
  discount: number;
  warranty: string;
  subtotal: number;
  selectedSerials: string[];
}

interface Sale {
  id: string;
  invoiceNo: string;
  customerId?: string | null;
  customerName: string;
  total: number;
  date: string;
  status: string;
  items?: SaleItem[];
  paymentMode?: 'Cash' | 'Online';
  bankAccountNumber?: string | null;
  bankName?: string | null;
  accountTitle?: string | null;
}

export default function Sales() {
  const { storeId, role } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allSerials, setAllSerials] = useState<SerialNumber[]>([]);
  const [storeDetails, setStoreDetails] = useState<{
    name: string;
    logoUrl: string;
    phone: string;
    address: string;
    email: string;
    bankAccounts?: { bankName: string; accountNumber: string; accountTitle?: string; openingBalance?: number; balance?: number }[];
  }>({
    name: '',
    logoUrl: '',
    phone: '',
    address: '',
    email: '',
    bankAccounts: []
  });
  
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);

  // New Invoice Form States
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('walk-in');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Online'>('Cash');
  const [selectedBankAccNumber, setSelectedBankAccNumber] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState<'Paid' | 'Pending'>('Paid');
  const [invoiceItems, setInvoiceItems] = useState<Array<{
    productId: string;
    quantity: number;
    salePrice: number;
    discount: number;
    warranty: string;
    selectedSerials: string[];
  }>>([{ productId: '', quantity: 1, salePrice: 0, discount: 0, warranty: 'No Warranty', selectedSerials: [] }]);
  const [saving, setSaving] = useState(false);
  const [printOnCreate, setPrintOnCreate] = useState(false);

  const getNextInvoiceNumber = () => {
    const currentYear = new Date().getFullYear();
    const yearSales = sales.filter(s => s.invoiceNo && s.invoiceNo.startsWith(`INV-${currentYear}-`));
    const nextSeq = yearSales.length + 1;
    const paddedSeq = String(nextSeq).padStart(4, '0');
    return `INV-${currentYear}-${paddedSeq}`;
  };

  // 1. Fetch Sales List
  useEffect(() => {
    if (!storeId) return;

    const q = query(collection(db, 'sales'), where('storeId', '==', storeId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Sale[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Sale);
      });

      data.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      setSales(data);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching sales:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [storeId]);

  // 2. Fetch Products for Lookup
  useEffect(() => {
    if (!storeId) return;

    const q = query(collection(db, 'products'), where('storeId', '==', storeId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Product[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Product);
      });

      data.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      setProducts(data);
    }, (error) => {
      console.error('Error fetching products:', error);
    });

    return () => unsubscribe();
  }, [storeId]);

  // 3. Fetch Customers for Lookup
  useEffect(() => {
    if (!storeId) return;

    const q = query(collection(db, 'customers'), where('storeId', '==', storeId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Customer[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Customer);
      });

      data.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      setCustomers(data);
    }, (error) => {
      console.error('Error fetching customers:', error);
    });

    return () => unsubscribe();
  }, [storeId]);

  // 4. Fetch Serial Numbers for Verification & Selection
  useEffect(() => {
    if (!storeId) return;

    const q = query(collection(db, 'serialNumbers'), where('storeId', '==', storeId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: SerialNumber[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as SerialNumber);
      });
      setAllSerials(data);
    }, (error) => {
      console.error('Error fetching serial numbers:', error);
    });

    return () => unsubscribe();
  }, [storeId]);

  // 5. Fetch Store Details
  useEffect(() => {
    if (!storeId) return;

    const storeRef = doc(db, 'stores', storeId);
    const unsubscribe = onSnapshot(storeRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let loadedAccounts: { bankName: string; accountNumber: string; accountTitle?: string; openingBalance?: number; balance?: number }[] = [];
        if (Array.isArray(data.bankAccounts)) {
          loadedAccounts = data.bankAccounts.map((item: any) => {
            if (typeof item === 'string') {
              return { bankName: 'Bank', accountNumber: item, openingBalance: 0, balance: 0 };
            }
            const opBal = typeof item.openingBalance === 'number' ? item.openingBalance : (parseFloat(item.openingBalance) || 0);
            const curBal = typeof item.balance === 'number' ? item.balance : (parseFloat(item.balance) || opBal);
            return {
              bankName: item.bankName || '',
              accountNumber: item.accountNumber || '',
              accountTitle: item.accountTitle || '',
              openingBalance: opBal,
              balance: curBal
            };
          });
        }

        setStoreDetails({
          name: data.name || '',
          logoUrl: data.logoUrl || '',
          phone: data.phone || '',
          address: data.address || '',
          email: data.email || '',
          bankAccounts: loadedAccounts
        });
      }
    }, (error) => {
      console.error('Error listening to store details:', error);
    });

    return () => unsubscribe();
  }, [storeId]);

  // Form Management Helpers
  const handleAddItemRow = () => {
    setInvoiceItems([...invoiceItems, { productId: '', quantity: 1, salePrice: 0, discount: 0, warranty: 'No Warranty', selectedSerials: [] }]);
  };

  const handleRemoveItemRow = (index: number) => {
    const updated = invoiceItems.filter((_, i) => i !== index);
    setInvoiceItems(updated.length > 0 ? updated : [{ productId: '', quantity: 1, salePrice: 0, discount: 0, warranty: 'No Warranty', selectedSerials: [] }]);
  };

  const handleItemProductChange = (index: number, pId: string) => {
    const product = products.find(p => p.id === pId);
    const updated = [...invoiceItems];
    updated[index] = {
      productId: pId,
      quantity: 1,
      salePrice: product ? product.salePrice : 0,
      discount: 0,
      warranty: 'No Warranty',
      selectedSerials: []
    };
    setInvoiceItems(updated);
  };

  const handleItemQuantityChange = (index: number, qtyVal: number) => {
    const updated = [...invoiceItems];
    const item = updated[index];
    const product = products.find(p => p.id === item.productId);
    const maxStock = product ? product.stock : 999;
    
    const qty = Math.max(1, Math.min(maxStock, qtyVal || 1));
    // Prune excess serial numbers if quantity is reduced
    const currentSerials = item.selectedSerials.slice(0, qty);
    
    updated[index] = {
      ...item,
      quantity: qty,
      selectedSerials: currentSerials
    };
    setInvoiceItems(updated);
  };

  const handleItemPriceChange = (index: number, price: number) => {
    const updated = [...invoiceItems];
    updated[index] = {
      ...updated[index],
      salePrice: Math.max(0, price)
    };
    setInvoiceItems(updated);
  };

  const handleItemDiscountChange = (index: number, discount: number) => {
    const updated = [...invoiceItems];
    updated[index] = {
      ...updated[index],
      discount: Math.max(0, discount)
    };
    setInvoiceItems(updated);
  };

  const handleItemWarrantyChange = (index: number, warranty: string) => {
    const updated = [...invoiceItems];
    updated[index] = {
      ...updated[index],
      warranty
    };
    setInvoiceItems(updated);
  };

  const calculateInvoiceTotal = () => {
    return invoiceItems.reduce((sum, item) => sum + Math.max(0, (item.quantity * item.salePrice) - (item.discount || 0)), 0);
  };

  // Handle setting up edit mode
  const handleEditClick = (sale: Sale) => {
    setEditingSale(sale);
    setInvoiceNumber(sale.invoiceNo || '');
    setInvoiceDate(sale.date ? new Date(sale.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    if (sale.customerId && customers.some(c => c.id === sale.customerId)) {
      setSelectedCustomerId(sale.customerId);
    } else if (sale.customerName && sale.customerName !== 'Walk In Customer') {
      setSelectedCustomerId(sale.customerName);
    } else {
      setSelectedCustomerId('walk-in');
    }
    setPaymentMode(sale.paymentMode || 'Cash');
    setSelectedBankAccNumber(sale.bankAccountNumber || '');
    setInvoiceStatus((sale.status as 'Paid' | 'Pending') || 'Paid');
    
    if (sale.items) {
      const mappedItems = sale.items.map(item => {
        // Map the serial number strings back to Firestore document IDs from allSerials
        const selectedSerialsWithIds = item.selectedSerials.map(snStr => {
          const matchedDoc = allSerials.find(s => s.serialNumber === snStr && s.productId === item.productId);
          return matchedDoc ? matchedDoc.id : snStr;
        });
        
        return {
          productId: item.productId,
          quantity: item.quantity,
          salePrice: item.salePrice,
          discount: item.discount,
          warranty: item.warranty || 'No Warranty',
          selectedSerials: selectedSerialsWithIds
        };
      });
      setInvoiceItems(mappedItems);
    } else {
      setInvoiceItems([{ productId: '', quantity: 1, salePrice: 0, discount: 0, warranty: 'No Warranty', selectedSerials: [] }]);
    }
    
    setShowModal(true);
  };

  // Delete invoice with automatic stock and serial restoration
  const handleDeleteInvoice = async (sale: Sale) => {
    if (!window.confirm(`Are you sure you want to delete invoice ${sale.invoiceNo}? This will restore all product stock and set serialized numbers to 'Available'.`)) {
      return;
    }
    
    setSaving(true);
    try {
      const batch = writeBatch(db);
      
      if (sale.items) {
        for (const item of sale.items) {
          // Get current product state from the database to ensure we restore correctly
          const productRef = doc(db, 'products', item.productId);
          const productSnap = await getDoc(productRef);
          
          if (productSnap.exists()) {
            const currentStock = productSnap.data().stock || 0;
            const restoredStock = currentStock + item.quantity;
            
            batch.update(productRef, {
              stock: restoredStock,
              updatedAt: serverTimestamp()
            });
            
            // Add restoration entry to inventory logs
            const logId = doc(collection(db, 'inventoryLogs')).id;
            const logRef = doc(db, 'inventoryLogs', logId);
            batch.set(logRef, {
              storeId,
              productId: item.productId,
              productName: item.productName,
              productBrand: item.brand,
              productModelNumber: item.modelNumber,
              quantityAdded: item.quantity,
              previousStock: currentStock,
              newStock: restoredStock,
              referenceNumber: sale.invoiceNo,
              notes: `Stock restored (Deleted Invoice ${sale.invoiceNo})`,
              createdAt: serverTimestamp()
            });
          }
          
          // Restore selected serial numbers to Available status
          if (item.selectedSerials && item.selectedSerials.length > 0) {
            const matchingSerials = allSerials.filter(s => 
              s.productId === item.productId && 
              item.selectedSerials.includes(s.serialNumber)
            );
            for (const s of matchingSerials) {
              batch.update(doc(db, 'serialNumbers', s.id), {
                status: 'Available',
                updatedAt: serverTimestamp()
              });
            }
          }
        }
      }
      
      // If deleted invoice was paid online and status was not Pending, revert the bank account balance
      if (sale.paymentMode === 'Online' && sale.bankAccountNumber && sale.status !== 'Pending' && storeId) {
        const storeRef = doc(db, 'stores', storeId);
        const storeSnap = await getDoc(storeRef);
        if (storeSnap.exists()) {
          const storeData = storeSnap.data();
          let currentAccounts = Array.isArray(storeData.bankAccounts) ? [...storeData.bankAccounts] : [];
          currentAccounts = currentAccounts.map((acc: any) => {
            const opBal = typeof acc.openingBalance === 'number' ? acc.openingBalance : (parseFloat(acc.openingBalance) || 0);
            const curBal = typeof acc.balance === 'number' ? acc.balance : (parseFloat(acc.balance) || opBal);
            if (acc.accountNumber === sale.bankAccountNumber) {
              return {
                ...acc,
                balance: Number((curBal - sale.total).toFixed(2))
              };
            }
            return {
              ...acc,
              balance: curBal
            };
          });
          batch.update(storeRef, {
            bankAccounts: currentAccounts,
            updatedAt: serverTimestamp()
          });
        }
      }

      // Delete the invoice document
      batch.delete(doc(db, 'sales', sale.id));
      
      await batch.commit();
      toast.success(`Invoice ${sale.invoiceNo} has been deleted successfully!`);
    } catch (error) {
      console.error('Error deleting invoice:', error);
      toast.error('Failed to delete invoice');
    } finally {
      setSaving(false);
    }
  };

  // Submit Detailed Invoice (Create or Edit) using Atomic Batch writes
  const handleCreateInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) {
      toast.error('Store ID not found');
      return;
    }

    let customerName = 'Walk In Customer';
    let customerId: string | null = null;

    if (selectedCustomerId && selectedCustomerId !== 'walk-in') {
      const cust = customers.find(c => c.id === selectedCustomerId);
      if (cust) {
        customerName = cust.name;
        customerId = cust.id;
      } else {
        customerName = selectedCustomerId;
        customerId = null;
      }
    } else {
      const walkInCust = customers.find(c => c.name?.trim().toLowerCase() === 'walk in customer' || c.name?.trim().toLowerCase() === 'walk-in customer');
      customerName = 'Walk In Customer';
      customerId = walkInCust ? walkInCust.id : null;
    }

    // Validation
    for (let i = 0; i < invoiceItems.length; i++) {
      const item = invoiceItems[i];
      if (!item.productId) {
        toast.error(`Please select a product for line ${i + 1}`);
        return;
      }
      const prod = products.find(p => p.id === item.productId);
      if (!prod) {
        toast.error(`Selected product in line ${i + 1} was not found`);
        return;
      }

      // If editing, the stock currently allocated to this invoice's prior version shouldn't be counted as "unavailable"
      let previousQty = 0;
      if (editingSale && editingSale.items) {
        const prevItem = editingSale.items.find(pi => pi.productId === item.productId);
        if (prevItem) {
          previousQty = prevItem.quantity;
        }
      }
      const availableStockWithPrev = prod.stock + previousQty;

      if (item.quantity > availableStockWithPrev) {
        toast.error(`Not enough stock for "${prod.name}". Available: ${availableStockWithPrev}`);
        return;
      }
      
      // Serial selection count check
      const productSerials = allSerials.filter(sn => 
        sn.productId === item.productId && 
        (sn.status === 'Available' || (editingSale && editingSale.items?.some(pi => pi.productId === item.productId && pi.selectedSerials.includes(sn.serialNumber))))
      );
      if (productSerials.length > 0 && item.selectedSerials.length !== item.quantity) {
        toast.error(`Please select exactly ${item.quantity} serial number(s) for "${prod.name}"`);
        return;
      }
    }

    // Payment mode validation
    if (paymentMode === 'Online') {
      if (!selectedBankAccNumber) {
        toast.error('Please select a bank account for online payment');
        return;
      }
      const matched = storeDetails.bankAccounts?.find(b => b.accountNumber === selectedBankAccNumber);
      if (!matched) {
        toast.error('Selected bank account was not found in store settings');
        return;
      }
    }

    setSaving(true);
    
    // Determine Invoice Number
    let invoiceNo = '';
    if (invoiceNumber && invoiceNumber.trim()) {
      invoiceNo = invoiceNumber.trim();
    } else if (editingSale) {
      invoiceNo = editingSale.invoiceNo;
    } else {
      invoiceNo = getNextInvoiceNumber();
    }

    const saleDate = invoiceDate ? new Date(invoiceDate).toISOString() : (editingSale ? editingSale.date : new Date().toISOString());

    const batch = writeBatch(db);

    const itemsToSave: SaleItem[] = invoiceItems.map(item => {
      const prod = products.find(p => p.id === item.productId)!;
      return {
        productId: item.productId,
        productName: prod.name,
        brand: prod.brand,
        modelNumber: prod.modelNumber,
        category: prod.category,
        quantity: item.quantity,
        salePrice: item.salePrice,
        discount: item.discount || 0,
        warranty: item.warranty || 'No Warranty',
        subtotal: Math.max(0, (item.quantity * item.salePrice) - (item.discount || 0)),
        selectedSerials: item.selectedSerials.map(sId => {
          const sn = allSerials.find(s => s.id === sId);
          return sn ? sn.serialNumber : sId;
        })
      };
    });

    const totalAmount = itemsToSave.reduce((sum, item) => sum + item.subtotal, 0);
    const saleId = editingSale ? editingSale.id : doc(collection(db, 'sales')).id;

    const matchedBank = paymentMode === 'Online'
      ? storeDetails.bankAccounts?.find(b => b.accountNumber === selectedBankAccNumber)
      : null;

    const newSaleDoc = {
      id: saleId,
      invoiceNo,
      customerId,
      customerName,
      items: itemsToSave,
      total: totalAmount,
      status: invoiceStatus,
      paymentMode,
      bankAccountNumber: paymentMode === 'Online' && matchedBank ? matchedBank.accountNumber : null,
      bankName: paymentMode === 'Online' && matchedBank ? matchedBank.bankName : null,
      accountTitle: paymentMode === 'Online' && matchedBank ? (matchedBank.accountTitle || '') : null,
      date: saleDate,
      storeId,
      createdAt: editingSale ? (editingSale as any).createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      // 1. Set the Sales document (overwrites the existing one if editing, merges or replaces completely)
      const saleRef = doc(db, 'sales', saleId);
      batch.set(saleRef, newSaleDoc);

      // 2. Map of stock changes (add back old quantities, deduct new quantities)
      const stockChangeMap: Record<string, number> = {};

      if (editingSale && editingSale.items) {
        for (const oldItem of editingSale.items) {
          stockChangeMap[oldItem.productId] = (stockChangeMap[oldItem.productId] || 0) + oldItem.quantity;
        }
      }

      for (const newItem of invoiceItems) {
        stockChangeMap[newItem.productId] = (stockChangeMap[newItem.productId] || 0) - newItem.quantity;
      }

      // Update product stocks and logs
      for (const [pId, change] of Object.entries(stockChangeMap)) {
        if (change === 0) continue; // no change in stock for this product

        const prod = products.find(p => p.id === pId)!;
        const previousStock = prod.stock || 0;
        const newStock = previousStock + change;

        // Update product stock count
        const productRef = doc(db, 'products', pId);
        batch.update(productRef, {
          stock: newStock,
          updatedAt: serverTimestamp()
        });

        // Insert inventory log entry
        const logId = doc(collection(db, 'inventoryLogs')).id;
        const logRef = doc(db, 'inventoryLogs', logId);
        batch.set(logRef, {
          storeId,
          productId: pId,
          productName: prod.name,
          productBrand: prod.brand,
          productModelNumber: prod.modelNumber,
          quantityAdded: change,
          previousStock,
          newStock,
          referenceNumber: invoiceNo,
          notes: editingSale 
            ? `Invoice ${invoiceNo} edited (Stock adjusted by ${change > 0 ? '+' : ''}${change})`
            : `Sold to ${customerName}`,
          createdAt: serverTimestamp()
        });
      }

      // 3. Serial status changes
      const previousSerialNumbersSet = new Set<string>();
      if (editingSale && editingSale.items) {
        editingSale.items.forEach(item => {
          if (item.selectedSerials) {
            item.selectedSerials.forEach(sn => previousSerialNumbersSet.add(sn));
          }
        });
      }

      const newSerialNumbersSet = new Set<string>();
      const newSerialIdsSet = new Set<string>();
      invoiceItems.forEach(item => {
        item.selectedSerials.forEach(sId => {
          newSerialIdsSet.add(sId);
          const sn = allSerials.find(s => s.id === sId);
          if (sn) {
            newSerialNumbersSet.add(sn.serialNumber);
          } else {
            newSerialNumbersSet.add(sId);
          }
        });
      });

      // Serials to revert to 'Available': previously selected but not currently selected
      const serialsToMakeAvailable = [...previousSerialNumbersSet].filter(sn => !newSerialNumbersSet.has(sn));

      for (const sn of serialsToMakeAvailable) {
        const matched = allSerials.find(s => s.serialNumber === sn);
        if (matched) {
          batch.update(doc(db, 'serialNumbers', matched.id), {
            status: 'Available',
            updatedAt: serverTimestamp()
          });
        }
      }

      // Serials to make 'Sold': currently selected
      for (const sId of [...newSerialIdsSet]) {
        batch.update(doc(db, 'serialNumbers', sId), {
          status: 'Sold',
          updatedAt: serverTimestamp()
        });
      }

      // 4. Update Bank Account Balance in Store document if online payment is involved
      if (storeId) {
        const storeRef = doc(db, 'stores', storeId);
        const storeSnap = await getDoc(storeRef);
        if (storeSnap.exists()) {
          const storeData = storeSnap.data();
          let currentAccounts = Array.isArray(storeData.bankAccounts) ? [...storeData.bankAccounts] : [];
          let bankChanged = false;

          // Normalize accounts
          currentAccounts = currentAccounts.map((item: any) => {
            if (typeof item === 'string') {
              return { bankName: 'Bank', accountNumber: item, openingBalance: 0, balance: 0 };
            }
            const opBal = typeof item.openingBalance === 'number' ? item.openingBalance : (parseFloat(item.openingBalance) || 0);
            const curBal = typeof item.balance === 'number' ? item.balance : (parseFloat(item.balance) || opBal);
            return {
              ...item,
              bankName: item.bankName || '',
              accountNumber: item.accountNumber || '',
              accountTitle: item.accountTitle || '',
              openingBalance: opBal,
              balance: curBal
            };
          });

          // If editing an existing sale that was paid Online and was Paid, revert its previous payment
          if (editingSale && editingSale.paymentMode === 'Online' && editingSale.bankAccountNumber && editingSale.status !== 'Pending') {
            currentAccounts = currentAccounts.map((acc: any) => {
              if (acc.accountNumber === editingSale.bankAccountNumber) {
                bankChanged = true;
                return {
                  ...acc,
                  balance: Number(((acc.balance || 0) - editingSale.total).toFixed(2))
                };
              }
              return acc;
            });
          }

          // If current invoice is Online and marked Paid, add totalAmount to selected bank account
          if (paymentMode === 'Online' && selectedBankAccNumber && invoiceStatus === 'Paid') {
            currentAccounts = currentAccounts.map((acc: any) => {
              if (acc.accountNumber === selectedBankAccNumber) {
                bankChanged = true;
                return {
                  ...acc,
                  balance: Number(((acc.balance || 0) + totalAmount).toFixed(2))
                };
              }
              return acc;
            });
          }

          if (bankChanged) {
            batch.update(storeRef, {
              bankAccounts: currentAccounts,
              updatedAt: serverTimestamp()
            });
          }
        }
      }

      await batch.commit();

      toast.success(editingSale ? `Invoice ${invoiceNo} updated successfully!` : `Invoice ${invoiceNo} recorded successfully!`);
      setShowModal(false);
      setEditingSale(null);
      
      if (printOnCreate) {
        const createdSale: Sale = {
          id: saleId,
          invoiceNo,
          customerId,
          customerName,
          items: itemsToSave,
          total: totalAmount,
          status: invoiceStatus,
          date: newSaleDoc.date,
          paymentMode,
          bankAccountNumber: paymentMode === 'Online' && matchedBank ? matchedBank.accountNumber : undefined,
          bankName: paymentMode === 'Online' && matchedBank ? matchedBank.bankName : undefined,
          accountTitle: paymentMode === 'Online' && matchedBank ? matchedBank.accountTitle : undefined,
        };
        printInvoice(createdSale);
      }

      // Reset form states
      setInvoiceItems([{ productId: '', quantity: 1, salePrice: 0, discount: 0, warranty: 'No Warranty', selectedSerials: [] }]);
      setSelectedCustomerId('walk-in');
      setPaymentMode('Cash');
      setSelectedBankAccNumber('');
      setInvoiceStatus('Paid');
      setInvoiceNumber('');
      setInvoiceDate(new Date().toISOString().split('T')[0]);
    } catch (error) {
      console.error('Error submitting sales invoice:', error);
      toast.error(editingSale ? 'Failed to update sales invoice' : 'Failed to create sales invoice');
    } finally {
      setSaving(false);
    }
  };

  const formatInvoiceDate = (dateVal: string | Date | undefined | null): string => {
    if (!dateVal) return 'N/A';
    if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
      const [year, monthNum, dayNum] = dateVal.split('-');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const mIndex = parseInt(monthNum, 10) - 1;
      return `${dayNum.padStart(2, '0')}-${months[mIndex] || monthNum}-${year}`;
    }
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'N/A';
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const printInvoice = (sale: Sale) => {
    // Create a temporary hidden iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      toast.error('Failed to initialize print process');
      return;
    }

    const itemsRows = sale.items && sale.items.length > 0 
      ? sale.items.map(item => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 10px; text-align: left; vertical-align: top;">
            <div style="font-weight: bold; color: #1e293b; font-size: 11px;">${item.productName}</div>
            <div style="font-size: 9px; color: #64748b; margin-top: 1px;">
              ${item.brand} • ${item.modelNumber} • ${item.category}
            </div>
            ${item.selectedSerials && item.selectedSerials.length > 0 ? `
              <div style="margin-top: 3px; display: flex; flex-wrap: wrap; gap: 3px;">
                <span style="font-size: 8px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Serials:</span>
                ${item.selectedSerials.map(sn => `<span style="font-family: monospace; font-size: 8px; background-color: #f1f5f9; color: #334155; padding: 0.5px 3px; border-radius: 2px; border: 1px solid #e2e8f0; margin-right: 3px; display: inline-block;">${sn}</span>`).join('')}
              </div>
            ` : ''}
          </td>
          <td style="padding: 6px 10px; text-align: center; font-weight: 500; color: #334155; vertical-align: top; font-size: 11px;">PKR ${item.salePrice.toFixed(2)}</td>
          <td style="padding: 6px 10px; text-align: center; font-weight: bold; color: #0f172a; vertical-align: top; font-size: 11px;">${item.quantity}</td>
          <td style="padding: 6px 10px; text-align: right; font-weight: bold; color: #0f172a; vertical-align: top; font-size: 11px;">PKR ${(item.subtotal || (item.quantity * item.salePrice - (item.discount || 0))).toFixed(2)}</td>
        </tr>
      `).join('')
      : `
        <tr>
          <td colspan="4" style="padding: 16px 0; text-align: center; color: #64748b; font-style: italic; font-size: 11px;">
            No itemized details recorded.
          </td>
        </tr>
      `;

    const subtotal = sale.items?.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0) || sale.total;
    const totalDiscount = sale.items?.reduce((sum, item) => sum + (item.discount || 0), 0) || 0;
    const matchedCust = customers.find(c => c.id === sale.customerId || c.name.toLowerCase() === sale.customerName.toLowerCase());

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice - ${sale.invoiceNo}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400;1,700&family=Cinzel:wght@700;800;900&family=Playfair+Display:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
          body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 10px 22px;
            color: #1e293b;
            background-color: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .receipt-container {
            max-width: 800px;
            margin: 0 auto;
          }
          .invoice-header-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 0;
            margin-bottom: 0;
            padding: 0;
          }
          .header-divider-line {
            width: 100%;
            border-bottom: 2px solid #000000;
            margin-top: 4px;
            margin-bottom: 8px;
          }
          .logo-cell {
            width: 105px;
            vertical-align: middle;
            text-align: left;
            padding: 0;
          }
          .logo-container {
            width: 85px;
            height: 85px;
            border-radius: 12px;
            background-color: #f0b90b;
            color: #0f172a;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            font-weight: 900;
            border: none;
            outline: none;
            box-shadow: none;
          }
          .logo-img {
            width: 85px;
            height: 85px;
            border-radius: 12px;
            object-fit: contain;
            border: none;
            outline: none;
            box-shadow: none;
            background: transparent;
            display: block;
          }
          .center-info-cell {
            text-align: center;
            vertical-align: middle;
            padding: 0 8px;
          }
          .right-spacer-cell {
            width: 105px;
            vertical-align: middle;
          }
          .company-name {
            font-family: 'Cinzel', 'Playfair Display', 'Plus Jakarta Sans', Georgia, serif;
            font-size: 38px;
            font-weight: 900;
            color: #000000;
            margin: 0;
            line-height: 1.15;
            text-align: center;
            letter-spacing: 0.01em;
            text-decoration: underline;
            text-underline-offset: 6px;
            text-decoration-thickness: 2.5px;
            text-decoration-color: #000000;
          }
          .details-cell {
            padding-top: 1px;
            padding-bottom: 0;
            vertical-align: top;
            text-align: left;
          }
          .company-left-details {
            font-family: 'Calibri', 'Carlito', Candara, Segoe, 'Segoe UI', Arial, sans-serif;
            font-size: 14px;
            line-height: 1.35;
            color: #1e293b;
            text-align: left;
          }
          .left-detail-row {
            margin-bottom: 1px;
            word-break: break-word;
          }
          .left-detail-label {
            font-weight: 700;
            color: #000000;
            margin-right: 4px;
          }
          .meta-grid {
            width: 100%;
            border-collapse: collapse;
            border-bottom: none;
            padding-bottom: 4px;
            margin-bottom: 10px;
          }
          .meta-grid td {
            vertical-align: top;
            font-size: 11px;
            padding-bottom: 4px;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
          }
          .items-table thead {
            background-color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .items-table thead tr {
            background-color: #000000 !important;
            color: #ffffff !important;
          }
          .items-table th {
            background-color: #000000 !important;
            color: #ffffff !important;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: 7px 10px;
            border: 1px solid #000000;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .items-table td {
            padding: 6px 10px;
            font-size: 11px;
          }
          .totals-table {
            width: 280px;
            margin-left: auto;
            border-collapse: collapse;
            font-size: 11px;
          }
          .totals-table td {
            padding: 3px 0;
          }
          .totals-table .total-row {
            font-size: 13px;
            font-weight: 900;
            color: #0a382c;
            border-top: 1.5px solid #000000;
            padding-top: 6px;
          }
          .footer {
            margin-top: 24px;
            border-top: 1px solid #e2e8f0;
            padding-top: 10px;
            text-align: center;
            font-size: 10px;
            color: #94a3b8;
            font-weight: 600;
            line-height: 1.4;
          }
          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <table class="invoice-header-table">
            <tr>
              <td class="logo-cell">
                ${storeDetails.logoUrl 
                  ? `<img src="${storeDetails.logoUrl}" class="logo-img" alt="Logo" />`
                  : `<div class="logo-container">${getInitials(storeDetails.name || 'ElectroManage')}</div>`
                }
              </td>
              <td class="center-info-cell">
                <h1 class="company-name">${storeDetails.name || 'ElectroManage'}</h1>
              </td>
              <td class="right-spacer-cell"></td>
            </tr>
            <tr>
              <td colspan="3" class="details-cell">
                <div class="company-left-details">
                  <div class="left-detail-row"><span class="left-detail-label">Address:</span> ${storeDetails.address || 'Madni Chowk Pindi Gheb'}</div>
                  <div class="left-detail-row"><span class="left-detail-label">Phone:</span> ${storeDetails.phone || '0312-5653636'}</div>
                  <div class="left-detail-row"><span class="left-detail-label">Email:</span> ${storeDetails.email || 'smarttech5535@gmail.com'}</div>
                </div>
              </td>
            </tr>
          </table>

          <div class="header-divider-line"></div>

          <table class="meta-grid">
            <tr>
              <td style="width: 50%; vertical-align: top; text-align: left;">
                <table style="border-collapse: collapse; font-size: 13px; color: #1e293b; line-height: 1.6;">
                  <tr>
                    <td style="padding: 1px 8px 1px 0; font-weight: bold; color: #000; white-space: nowrap; vertical-align: top;">Customer:</td>
                    <td style="padding: 1px 0; font-weight: 700; color: #000; vertical-align: top;">${sale.customerName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 1px 8px 1px 0; font-weight: bold; color: #000; white-space: nowrap; vertical-align: top;">Payment Mode:</td>
                    <td style="padding: 1px 0; font-weight: 500; color: #334155; vertical-align: top;">${sale.paymentMode || 'Cash'}${sale.paymentMode === 'Online' && sale.bankName ? ` <span style="font-size: 11px; color: #64748b;">(${sale.bankName} - ${sale.bankAccountNumber})</span>` : ''}</td>
                  </tr>
                </table>
              </td>
              <td style="width: 50%; vertical-align: top; text-align: right;">
                <div style="display: inline-block; text-align: left;">
                  <table style="border-collapse: collapse; font-size: 13px; color: #1e293b; line-height: 1.6;">
                    <tr>
                      <td style="padding: 1px 8px 1px 0; font-weight: bold; color: #000; white-space: nowrap; vertical-align: top;">Invoice No:</td>
                      <td style="padding: 1px 0; font-family: monospace; font-weight: bold; color: #000; vertical-align: top;">${sale.invoiceNo}</td>
                    </tr>
                    <tr>
                      <td style="padding: 1px 8px 1px 0; font-weight: bold; color: #000; white-space: nowrap; vertical-align: top;">Date:</td>
                      <td style="padding: 1px 0; font-weight: 600; color: #000; vertical-align: top;">${formatInvoiceDate(sale.date)}</td>
                    </tr>
                  </table>
                </div>
              </td>
            </tr>
          </table>

          <table class="items-table">
            <thead>
              <tr style="background-color: #000000; color: #ffffff;">
                <th style="text-align: left; width: 55%; background-color: #000000; color: #ffffff; padding: 7px 10px; border: 1px solid #000000;">PRODUCT</th>
                <th style="text-align: center; width: 15%; background-color: #000000; color: #ffffff; padding: 7px 10px; border: 1px solid #000000;">PRICE</th>
                <th style="text-align: center; width: 12%; background-color: #000000; color: #ffffff; padding: 7px 10px; border: 1px solid #000000;">QTY</th>
                <th style="text-align: right; width: 18%; background-color: #000000; color: #ffffff; padding: 7px 10px; border: 1px solid #000000;">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <table class="totals-table">
            <tr>
              <td style="color: #64748b; font-weight: 500;">Subtotal (Pre-discount):</td>
              <td style="text-align: right; font-weight: 600; color: #334155;">PKR ${subtotal.toFixed(2)}</td>
            </tr>
            ${totalDiscount > 0 ? `
              <tr>
                <td style="color: #e11d48; font-weight: 500;">Total Discount:</td>
                <td style="text-align: right; font-weight: 600; color: #e11d48;">-PKR ${totalDiscount.toFixed(2)}</td>
              </tr>
            ` : ''}
            <tr>
              <td style="color: #64748b; font-weight: 500;">Tax / VAT (0%):</td>
              <td style="text-align: right; font-weight: 600; color: #334155;">PKR 0.00</td>
            </tr>
            <tr class="total-row">
              <td style="padding-top: 10px;">${sale.status === 'Pending' ? 'Total Amount Due:' : 'Total Amount Paid:'}</td>
              <td style="text-align: right; padding-top: 10px;">PKR ${sale.total?.toFixed(2)}</td>
            </tr>
          </table>

          <div class="footer">
            Thank you for your purchase!<br>
            For any warranty claims, please present this invoice.
          </div>
        </div>
      </body>
      </html>
    `;

    doc.open();
    doc.write(htmlContent);
    doc.close();

    // Trigger printing once content is fully loaded
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      // Remove iframe from document after a delay to clean up
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 5000);
    }, 500);
  };

  const filteredSales = sales.filter(s => 
    s.invoiceNo?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getInitials = (name: string) => {
    if (!name) return 'EM';
    return name
      .split(' ')
      .filter(Boolean)
      .map(word => word[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  if (showModal) {
    const currentInvoiceNo = invoiceNumber.trim() || (editingSale?.invoiceNo || getNextInvoiceNumber());
    const matchedBank = paymentMode === 'Online'
      ? storeDetails.bankAccounts?.find(b => b.accountNumber === selectedBankAccNumber)
      : null;

    const currentCustomer = (() => {
      if (selectedCustomerId === 'walk-in') {
        return { id: 'walk-in', name: 'Walk In Customer', mobile: '', address: '', email: '' };
      }
      const found = customers.find(c => c.id === selectedCustomerId);
      if (found) {
        return { id: found.id, name: found.name, mobile: found.mobile || '', address: found.address || '', email: found.email || '' };
      }
      return { id: selectedCustomerId, name: selectedCustomerId, mobile: '', address: '', email: '' };
    })();

    const draftItems: SaleItem[] = invoiceItems.map(item => {
      const prod = products.find(p => p.id === item.productId);
      return {
        productId: item.productId,
        productName: prod?.name || (item.productId ? 'Product' : 'Select a Product'),
        brand: prod?.brand || '',
        modelNumber: prod?.modelNumber || '',
        category: prod?.category || '',
        quantity: item.quantity || 1,
        salePrice: item.salePrice || 0,
        discount: item.discount || 0,
        warranty: item.warranty || 'No Warranty',
        subtotal: Math.max(0, ((item.quantity || 1) * (item.salePrice || 0)) - (item.discount || 0)),
        selectedSerials: item.selectedSerials.map(sId => {
          const sn = allSerials.find(s => s.id === sId);
          return sn ? sn.serialNumber : sId;
        })
      };
    });

    const draftSubtotal = draftItems.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0);
    const draftTotalDiscount = draftItems.reduce((sum, item) => sum + (item.discount || 0), 0);
    const draftTotal = Math.max(0, draftSubtotal - draftTotalDiscount);

    const currentDraftSale: Sale = {
      id: editingSale?.id || 'draft-invoice',
      invoiceNo: currentInvoiceNo,
      customerId: currentCustomer.id,
      customerName: currentCustomer.name,
      items: draftItems,
      total: draftTotal,
      status: invoiceStatus,
      paymentMode,
      bankAccountNumber: paymentMode === 'Online' && matchedBank ? matchedBank.accountNumber : undefined,
      bankName: paymentMode === 'Online' && matchedBank ? matchedBank.bankName : undefined,
      accountTitle: paymentMode === 'Online' && matchedBank ? matchedBank.accountTitle : undefined,
      date: invoiceDate ? new Date(invoiceDate).toISOString() : new Date().toISOString(),
    };

    return (
      <div className="space-y-6">
        {/* Full-Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-emerald-50 text-[#0a382c] flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                {editingSale ? 'Edit Sales Invoice' : 'Create Sales Invoice'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                {editingSale ? 'Update this customer sale, items, and adjust serialized stock' : 'Record a customer sale, select items, and deduct serialized stock'}
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => { 
              setShowModal(false); 
              setEditingSale(null); 
              setInvoiceNumber('');
              setInvoiceDate(new Date().toISOString().split('T')[0]);
              setSelectedCustomerId('walk-in'); 
              setPaymentMode('Cash'); 
              setSelectedBankAccNumber('');
              setInvoiceStatus('Paid');
            }} 
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-200 transition-colors shadow-xs text-sm font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Sales
          </button>
        </div>

        {/* Full Page Invoice Creation Card */}
        <div className="glass-panel rounded-2xl shadow-sm border border-slate-200 overflow-hidden bg-white">
          <form onSubmit={handleCreateInvoiceSubmit} className="flex flex-col">
            <div className="p-4 sm:p-6 lg:p-8 space-y-8">
              
              {/* Top Two Panels: Left = Invoice Information (vertical), Right = Product Line Items (vertical) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* LEFT PANEL: Invoice Information (Vertically) */}
                <div className="lg:col-span-4 bg-[#f8faf9] p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-[#0a382c]" />
                      Invoice Information
                    </h3>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                      invoiceStatus === 'Pending' 
                        ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}>
                      {invoiceStatus}
                    </span>
                  </div>

                  {/* Customer Selection */}
                  <div className="space-y-1 pb-2.5 border-b border-slate-200/80">
                    <div className="flex items-center justify-between">
                      <label htmlFor="customerId" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        <span>Select Customer:</span>
                      </label>
                      {selectedCustomerId === 'walk-in' ? (
                        <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                          Walk-In
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                          Selected
                        </span>
                      )}
                    </div>
                    <select
                      id="customerId"
                      className="glass-input block w-full rounded-xl py-1.5 px-3 text-xs font-semibold text-slate-800 bg-white border border-slate-200 focus:border-[#0a382c]"
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                    >
                      <option value="walk-in">Walk In Customer</option>
                      {editingSale && !customers.some(c => c.id === editingSale.customerId) && editingSale.customerName && editingSale.customerName !== 'Walk In Customer' && (
                        <option value={editingSale.customerName}>{editingSale.customerName}</option>
                      )}
                      {customers
                        .filter(c => c.name?.trim().toLowerCase() !== 'walk in customer' && c.name?.trim().toLowerCase() !== 'walk-in customer')
                        .map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.mobile || 'No Mobile'})</option>
                        ))}
                    </select>

                    {selectedCustomerId !== 'walk-in' && (() => {
                      const selectedCust = customers.find(c => c.id === selectedCustomerId);
                      if (!selectedCust) return null;
                      return (
                        <div className="mt-1.5 p-2 rounded-lg bg-white border border-slate-200/80 text-[11px] text-slate-600 space-y-0.5 shadow-2xs">
                          <div className="font-bold text-slate-800">{selectedCust.name}</div>
                          {selectedCust.mobile && <div>Phone: <span className="font-semibold text-slate-800">{selectedCust.mobile}</span></div>}
                          {selectedCust.address && <div className="truncate">Address: <span className="font-medium text-slate-700">{selectedCust.address}</span></div>}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Compact Vertically Aligned Key-Value Form with Minimum Space */}
                  <div className="space-y-2 text-xs pt-0.5">
                    {/* 1. Invoice Number : */}
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <label htmlFor="invoiceNumberInput" className="col-span-5 text-xs font-bold text-slate-700 whitespace-nowrap">
                        Invoice Number :
                      </label>
                      <div className="col-span-7">
                        <input
                          id="invoiceNumberInput"
                          type="text"
                          required
                          className="glass-input block w-full rounded-lg py-1.5 px-2.5 text-xs font-mono font-bold text-slate-900 bg-white border border-slate-200 focus:border-[#0a382c]"
                          value={invoiceNumber || (editingSale ? editingSale.invoiceNo : getNextInvoiceNumber())}
                          onChange={(e) => setInvoiceNumber(e.target.value)}
                          placeholder="e.g. INV-2026-0001"
                        />
                      </div>
                    </div>

                    {/* 2. Date: */}
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <label htmlFor="invoiceDateInput" className="col-span-5 text-xs font-bold text-slate-700 whitespace-nowrap">
                        Date:
                      </label>
                      <div className="col-span-7">
                        <input
                          id="invoiceDateInput"
                          type="date"
                          required
                          className="glass-input block w-full rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 focus:border-[#0a382c]"
                          value={invoiceDate}
                          onChange={(e) => setInvoiceDate(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* 3. Payment Mode */}
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <label htmlFor="paymentModeSelect" className="col-span-5 text-xs font-bold text-slate-700 whitespace-nowrap">
                        Payment Mode:
                      </label>
                      <div className="col-span-7">
                        <select
                          id="paymentModeSelect"
                          className="glass-input block w-full rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 focus:border-[#0a382c]"
                          value={paymentMode}
                          onChange={(e) => {
                            const mode = e.target.value as 'Cash' | 'Online';
                            setPaymentMode(mode);
                            if (mode === 'Online' && !selectedBankAccNumber && storeDetails.bankAccounts && storeDetails.bankAccounts.length > 0) {
                              setSelectedBankAccNumber(storeDetails.bankAccounts[0].accountNumber);
                            }
                          }}
                        >
                          <option value="Cash">Cash</option>
                          <option value="Online">Online</option>
                        </select>
                      </div>
                    </div>

                    {/* Bank Account Selection if Online */}
                    {paymentMode === 'Online' && (
                      <div className="bg-white p-2 rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5 my-1">
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <label htmlFor="bankAccountSelect" className="col-span-5 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                            Bank Account <span className="text-red-500">*</span>:
                          </label>
                          <div className="col-span-7">
                            {storeDetails.bankAccounts && storeDetails.bankAccounts.length > 0 ? (
                              <select
                                id="bankAccountSelect"
                                required={paymentMode === 'Online'}
                                className="glass-input block w-full rounded-lg py-1.5 px-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200"
                                value={selectedBankAccNumber}
                                onChange={(e) => setSelectedBankAccNumber(e.target.value)}
                              >
                                <option value="">-- Select Bank --</option>
                                {storeDetails.bankAccounts.map((acc, idx) => (
                                  <option key={idx} value={acc.accountNumber}>
                                    {acc.bankName} - {acc.accountNumber}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[10px] text-amber-600 font-bold">No accounts</span>
                            )}
                          </div>
                        </div>

                        {selectedBankAccNumber && (() => {
                          const chosenAcc = storeDetails.bankAccounts?.find(a => a.accountNumber === selectedBankAccNumber);
                          if (!chosenAcc) return null;
                          const currentBal = chosenAcc.balance !== undefined ? chosenAcc.balance : (chosenAcc.openingBalance || 0);
                          return (
                            <div className="p-2 rounded-lg bg-emerald-50/90 border border-emerald-200/80 text-[10px] space-y-0.5">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-600 font-medium">Bank Balance:</span>
                                <span className="font-mono font-black text-[#0a382c]">
                                  PKR {currentBal.toFixed(2)}
                                </span>
                              </div>
                              {calculateInvoiceTotal() > 0 && (
                                <div className="flex items-center justify-between text-[10px] text-emerald-800 pt-1 border-t border-emerald-100/80 font-semibold">
                                  <span>{invoiceStatus === 'Paid' ? 'After Sale:' : 'If Paid:'}</span>
                                  <span className="font-mono font-bold">
                                    PKR {(currentBal + calculateInvoiceTotal()).toFixed(2)}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* 4. Status */}
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <label htmlFor="statusSelect" className="col-span-5 text-xs font-bold text-slate-700 whitespace-nowrap">
                        Status:
                      </label>
                      <div className="col-span-7">
                        <select
                          id="statusSelect"
                          className="glass-input block w-full rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 focus:border-[#0a382c]"
                          value={invoiceStatus}
                          onChange={(e) => setInvoiceStatus(e.target.value as 'Paid' | 'Pending')}
                        >
                          <option value="Paid">Paid</option>
                          <option value="Pending">Pending</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT PANEL: Items (Vertically) */}
                <div className="lg:col-span-8 bg-[#f8faf9] p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <Hash className="w-4 h-4 text-[#0a382c]" />
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        Items
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 font-bold bg-white border border-slate-200 px-2.5 py-1 rounded-full">
                        {invoiceItems.length} {invoiceItems.length === 1 ? 'item' : 'items'}
                      </span>
                      <button
                        type="button"
                        onClick={handleAddItemRow}
                        className="inline-flex items-center gap-1 text-xs font-bold text-white bg-[#0a382c] hover:bg-[#0d4a3b] px-3 py-1.5 rounded-xl transition-all shadow-2xs cursor-pointer"
                        title="Add Product to invoice"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Product
                      </button>
                    </div>
                  </div>

                  {/* Vertical Stack of Item Rows */}
                  <div className="space-y-3.5">
                    {invoiceItems.map((item, index) => {
                      const selectedProduct = products.find(p => p.id === item.productId);
                      const productSerials = allSerials.filter(sn => 
                        sn.productId === item.productId && 
                        (sn.status === 'Available' || item.selectedSerials.includes(sn.id))
                      );

                      return (
                        <div key={index} className="p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white space-y-3 shadow-2xs hover:border-slate-350 transition-all">
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                            {/* Product Selection */}
                            <div className="md:col-span-4">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                Product #{index + 1}
                              </label>
                              <SearchableProductSelect
                                products={products}
                                selectedProductId={item.productId}
                                onSelectProduct={(pId) => handleItemProductChange(index, pId)}
                                required
                              />
                            </div>

                            {/* Unit Price */}
                            <div className="md:col-span-2">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Unit Price (PKR)</label>
                              <input
                                type="number"
                                required
                                min="0"
                                step="0.01"
                                className="glass-input block w-full rounded-xl py-2 px-3 text-xs"
                                value={item.salePrice || ''}
                                onChange={(e) => handleItemPriceChange(index, parseFloat(e.target.value) || 0)}
                              />
                            </div>

                            {/* Quantity */}
                            <div className="md:col-span-1">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 text-center">Qty</label>
                              <input
                                type="number"
                                required
                                min="1"
                                max={(() => {
                                  let previousQty = 0;
                                  if (editingSale && editingSale.items) {
                                    const prevItem = editingSale.items.find(pi => pi.productId === item.productId);
                                    if (prevItem) {
                                      previousQty = prevItem.quantity;
                                    }
                                  }
                                  return selectedProduct ? (selectedProduct.stock + previousQty) : 999;
                                })()}
                                className="glass-input block w-full rounded-xl py-2 px-1 text-xs font-bold text-center"
                                value={item.quantity || ''}
                                onChange={(e) => handleItemQuantityChange(index, parseInt(e.target.value) || 1)}
                              />
                            </div>

                            {/* Discount */}
                            <div className="md:col-span-2">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Discount (PKR)</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                className="glass-input block w-full rounded-xl py-2 px-3 text-xs"
                                value={item.discount || ''}
                                onChange={(e) => handleItemDiscountChange(index, parseFloat(e.target.value) || 0)}
                              />
                            </div>

                            {/* Warranty */}
                            <div className="md:col-span-2">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Warranty</label>
                              <select
                                className="glass-input block w-full rounded-xl py-2 px-3 text-xs"
                                value={item.warranty || 'No Warranty'}
                                onChange={(e) => handleItemWarrantyChange(index, e.target.value)}
                              >
                                <option value="No Warranty">No Warranty</option>
                                <option value="3 Months">3 Months</option>
                                <option value="6 Months">6 Months</option>
                                <option value="1 Year">1 Year</option>
                                <option value="2 Years">2 Years</option>
                                <option value="3 Years">3 Years</option>
                              </select>
                            </div>

                            {/* Subtotal & Delete */}
                            <div className="md:col-span-1 flex flex-col justify-start">
                              <span className="hidden md:block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 text-right">Total</span>
                              <div className="flex items-center justify-between md:justify-end gap-1.5 w-full pt-1 md:pt-1">
                                <div className="text-right">
                                  <span className="block md:hidden text-[10px] font-bold text-slate-400 uppercase">Subtotal</span>
                                  <span className="text-xs font-black text-slate-900 font-mono whitespace-nowrap">
                                    PKR {Math.max(0, (item.quantity * item.salePrice) - (item.discount || 0)).toFixed(2)}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItemRow(index)}
                                  className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition-colors ml-1 cursor-pointer shrink-0"
                                  title="Delete row"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Serial Number Selector for Electronics */}
                          {selectedProduct && productSerials.length > 0 && (
                            <div className="mt-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                                  Select Sold Serial Numbers (Required: {item.quantity})
                                </span>
                                <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                  {productSerials.length} Available
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-32 overflow-y-auto pr-1">
                                {productSerials.map(sn => {
                                  const isChecked = item.selectedSerials.includes(sn.id);
                                  return (
                                    <label key={sn.id} className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                                      isChecked 
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-bold' 
                                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700 font-medium'
                                    }`}>
                                      <input
                                        type="checkbox"
                                        className="rounded border-slate-300 text-[#0a382c] focus:ring-[#0a382c] h-3.5 w-3.5"
                                        checked={isChecked}
                                        disabled={!isChecked && item.selectedSerials.length >= item.quantity}
                                        onChange={(e) => {
                                          const checked = e.target.checked;
                                          let newSerials = [...item.selectedSerials];
                                          if (checked) {
                                            if (newSerials.length < item.quantity) {
                                              newSerials.push(sn.id);
                                            }
                                          } else {
                                            newSerials = newSerials.filter(id => id !== sn.id);
                                          }
                                          const updatedItems = [...invoiceItems];
                                          updatedItems[index] = { ...item, selectedSerials: newSerials };
                                          setInvoiceItems(updatedItems);
                                        }}
                                      />
                                      <span className="font-mono truncate">{sn.serialNumber}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              {item.selectedSerials.length !== item.quantity && (
                                <span className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                                  <Info className="w-3 h-3" /> Please check exactly {item.quantity} serial number(s) to verify item delivery. (Selected: {item.selectedSerials.length})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Product Button */}
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="flex items-center text-xs font-bold text-[#0a382c] hover:text-[#0d4a3b] bg-white hover:bg-emerald-50/70 border border-slate-200 hover:border-emerald-200 px-4 py-2.5 rounded-xl transition-all shadow-2xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add Product
                  </button>
                </div>
              </div>

              {/* BELOW BOTH PANELS: Invoice Printable View (Dynamic Live Preview) */}
              <div className="pt-8 border-t border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Printer className="w-4 h-4 text-[#0a382c]" />
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        Invoice Printable View (Live Dynamic Preview)
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      This printable receipt automatically updates in real time as you adjust invoice information or product items above.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => printInvoice(currentDraftSale)}
                    disabled={draftTotal <= 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold shadow-2xs transition-colors disabled:opacity-40"
                    title="Print this preview"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#0a382c]" />
                    Print Preview
                  </button>
                </div>

                {/* Printable Document Paper Card */}
                <div className="bg-white rounded-2xl border border-slate-250 shadow-sm p-5 sm:p-6 max-w-4xl mx-auto font-sans text-slate-700 space-y-3">
                  {/* Header Section (Logo, Title, Contact Info & Black Line all moved up) */}
                  <div>
                    {/* Top Row: Company Logo on Left, Company Name Centered, Vertically Aligned at Start of Page */}
                    <div className="flex items-center justify-between gap-4 pt-0 pb-0">
                      {/* Company Logo on Left */}
                      <div className="w-20 sm:w-24 flex-shrink-0">
                        {storeDetails.logoUrl ? (
                          <img 
                            src={storeDetails.logoUrl} 
                            alt="Store Logo" 
                            className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-contain border-0 shadow-none ring-0 outline-none bg-transparent" 
                          />
                        ) : (
                          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-[#f0b90b] text-slate-950 font-black text-2xl sm:text-3xl flex items-center justify-center border-0 shadow-none ring-0 outline-none">
                            {getInitials(storeDetails.name || 'ElectroManage')}
                          </div>
                        )}
                      </div>

                      {/* Company Name (Enlarged, Prestigious Font, Underlined, Vertically Aligned with Logo) */}
                      <div className="flex-1 text-center py-0 sm:px-4">
                        <h2 
                          style={{ fontFamily: "'Cinzel', 'Playfair Display', 'Plus Jakarta Sans', Georgia, serif" }}
                          className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-950 tracking-tight leading-tight underline underline-offset-6 decoration-[2.5px] decoration-slate-950"
                        >
                          {storeDetails.name || 'ElectroManage'}
                        </h2>
                      </div>

                      {/* Right spacer for symmetry */}
                      <div className="hidden sm:block w-20 sm:w-24 flex-shrink-0"></div>
                    </div>

                    {/* Company Info under Logo on left side in Calibri font size 14 - MOVED UP */}
                    <div className="mt-0.5 text-left max-w-sm">
                      <div 
                        style={{ fontFamily: "'Calibri', 'Carlito', Candara, Segoe, 'Segoe UI', Arial, sans-serif" }}
                        className="text-[14px] text-slate-800 space-y-0.5 leading-tight"
                      >
                        <p>
                          <strong className="text-slate-950 font-bold">Address:</strong> {storeDetails.address || 'Madni Chowk Pindi Gheb'}
                        </p>
                        <p>
                          <strong className="text-slate-950 font-bold">Phone:</strong> {storeDetails.phone || '0312-5653636'}
                        </p>
                        <p>
                          <strong className="text-slate-950 font-bold">Email:</strong> {storeDetails.email || 'smarttech5535@gmail.com'}
                        </p>
                      </div>
                    </div>

                    {/* Black line drawn under Email Address - MOVED UP */}
                    <div className="w-full border-b-2 border-black mt-1.5 mb-2.5"></div>
                  </div>

                  {/* Meta Grid: Customer & Invoice Details (no line under payment mode) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-1 text-xs sm:text-sm">
                    {/* Customer & Payment Mode */}
                    <div className="space-y-1 text-slate-700">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-slate-950 min-w-[90px]">Customer:</span>
                        <span className="font-bold text-slate-950">{currentCustomer.name}</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-slate-950 min-w-[90px]">Payment Mode:</span>
                        <span className="text-slate-800">
                          {paymentMode}
                          {paymentMode === 'Online' && matchedBank && (
                            <span className="text-xs text-slate-500"> ({matchedBank.bankName} - {matchedBank.accountNumber})</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Invoice Details (in right corner of page, aligned vertically from left side, without 'Invoice Details' title) */}
                    <div className="flex justify-start md:justify-end text-xs sm:text-sm text-slate-800">
                      <div className="text-left space-y-1 min-w-[170px]">
                        <div className="flex items-baseline gap-2">
                          <span className="font-bold text-slate-950 min-w-[80px]">Invoice No:</span>
                          <span className="font-mono font-bold text-slate-950">{currentInvoiceNo}</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="font-bold text-slate-950 min-w-[80px]">Date:</span>
                          <span className="font-semibold text-slate-900">{formatInvoiceDate(invoiceDate || new Date())}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Line Items Table with Black Rectangle header & White Text */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-black text-white">
                          <th className="py-2 px-3 text-left font-extrabold uppercase text-[11px] tracking-wider text-white bg-black rounded-l">PRODUCT</th>
                          <th className="py-2 px-3 text-center font-extrabold uppercase text-[11px] tracking-wider text-white bg-black">PRICE</th>
                          <th className="py-2 px-3 text-center font-extrabold uppercase text-[11px] tracking-wider text-white bg-black">QTY</th>
                          <th className="py-2 px-3 text-right font-extrabold uppercase text-[11px] tracking-wider text-white bg-black rounded-r">TOTAL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {draftItems.filter(item => item.productId).length > 0 ? (
                          draftItems
                            .filter(item => item.productId)
                            .map((item, idx) => (
                              <tr key={idx} className="align-top">
                                <td className="py-2.5 px-3">
                                  <div className="font-bold text-slate-900">{item.productName}</div>
                                  {(item.brand || item.modelNumber) && (
                                    <div className="text-[10px] text-slate-500 mt-0.5">{item.brand} • {item.modelNumber}</div>
                                  )}
                                  {item.selectedSerials && item.selectedSerials.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase">S/N:</span>
                                      {item.selectedSerials.map((sn, sIdx) => (
                                        <span key={sIdx} className="font-mono text-[9px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                          {sn}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center text-slate-700 font-mono">PKR {item.salePrice.toFixed(2)}</td>
                                <td className="py-2.5 px-3 text-center font-bold text-slate-900">{item.quantity}</td>
                                <td className="py-2.5 px-3 text-right font-bold font-mono text-slate-900">
                                  PKR {item.subtotal.toFixed(2)}
                                </td>
                              </tr>
                            ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-slate-400 italic text-xs">
                              No products selected yet. Select products from the line items section above to preview them here.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals Summary */}
                  <div className="flex justify-end pt-4 border-t border-slate-200">
                    <div className="w-72 space-y-2 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal (Pre-discount):</span>
                        <span className="font-semibold text-slate-800 font-mono">PKR {draftSubtotal.toFixed(2)}</span>
                      </div>
                      {draftTotalDiscount > 0 && (
                        <div className="flex justify-between text-red-600">
                          <span>Total Discount:</span>
                          <span className="font-semibold font-mono">-PKR {draftTotalDiscount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-500">
                        <span>Tax / VAT (0%):</span>
                        <span className="font-mono">PKR 0.00</span>
                      </div>
                      <div className="flex justify-between items-center pt-2.5 border-t border-slate-300 text-sm">
                        <span className="font-black text-slate-900">
                          {invoiceStatus === 'Pending' ? 'Total Amount Due:' : 'Total Amount Paid:'}
                        </span>
                        <span className="font-black font-mono text-base text-[#0a382c]">
                          PKR {draftTotal.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="pt-6 border-t border-slate-200 text-center text-[11px] text-slate-400 font-medium space-y-1">
                    <p>Thank you for your purchase!</p>
                    <p>For any warranty claims, please present this original invoice.</p>
                  </div>
                </div>
              </div>

            </div>

            {/* Bottom Form Actions Bar */}
            <div className="bg-[#f8faf9] px-6 py-4 sm:px-8 flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-slate-200">
              <div className="text-center sm:text-left">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold block">Invoice Total Amount</span>
                <span className="text-2xl font-black text-[#0a382c]">PKR {calculateInvoiceTotal().toFixed(2)}</span>
              </div>

              <div className="flex flex-wrap gap-2.5 w-full sm:w-auto">
                <button 
                  type="button" 
                  onClick={() => { 
                    setShowModal(false); 
                    setEditingSale(null); 
                    setInvoiceNumber('');
                    setInvoiceDate(new Date().toISOString().split('T')[0]);
                    setSelectedCustomerId('walk-in'); 
                    setPaymentMode('Cash'); 
                    setSelectedBankAccNumber('');
                    setInvoiceStatus('Paid');
                  }} 
                  className="flex-1 sm:flex-none inline-flex justify-center rounded-xl border border-slate-200 px-5 py-2.5 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  onClick={() => setPrintOnCreate(false)}
                  disabled={saving || calculateInvoiceTotal() <= 0}
                  className="flex-1 sm:flex-none inline-flex justify-center items-center rounded-xl px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-sm font-bold text-slate-800 focus:outline-none transition-colors disabled:opacity-50"
                >
                  {saving && !printOnCreate ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-800"></div>
                  ) : (
                    editingSale ? 'Update Invoice' : 'Create Invoice'
                  )}
                </button>
                <button 
                  type="submit"
                  onClick={() => setPrintOnCreate(true)}
                  disabled={saving || calculateInvoiceTotal() <= 0}
                  className="flex-1 sm:flex-none inline-flex justify-center items-center rounded-xl px-5 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-sm font-bold text-white shadow-md shadow-emerald-950/10 focus:outline-none transition-colors disabled:opacity-50 gap-1.5"
                >
                  {saving && printOnCreate ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <Printer className="w-4 h-4" />
                      {editingSale ? 'Update & Print' : 'Save & Print'}
                    </>
                  )}
                </button>
              </div>
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
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Sales Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">Manage sales receipts, view item details, and track performance</p>
        </div>
        <button 
          onClick={() => {
            setEditingSale(null);
            setInvoiceNumber(getNextInvoiceNumber());
            setInvoiceDate(new Date().toISOString().split('T')[0]);
            setSelectedCustomerId('walk-in');
            setPaymentMode('Cash');
            setSelectedBankAccNumber('');
            setInvoiceStatus('Paid');
            setInvoiceItems([{ productId: '', quantity: 1, salePrice: 0, discount: 0, warranty: 'No Warranty', selectedSerials: [] }]);
            setShowModal(true);
          }}
          className="flex items-center px-4 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl shadow-md shadow-emerald-950/10 transition-colors text-sm font-bold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Invoice
        </button>
      </div>

      <div className="glass-panel rounded-2xl shadow-sm overflow-hidden bg-white">
        <div className="p-4 border-b border-slate-150 bg-slate-50/50">
          <div className="relative max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-450" />
            </div>
            <input
              type="text"
              placeholder="Search invoices by invoice number or customer..."
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
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Invoice No</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Customer</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</th>
                <th scope="col" className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="relative px-6 py-4"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a382c] mx-auto"></div>
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic text-sm bg-white">
                    No sales invoices found. Create a new invoice to get started.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-[#f8faf9] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0 bg-emerald-50 border border-emerald-100 text-[#0a382c] rounded-lg flex items-center justify-center">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-bold text-slate-900">{sale.invoiceNo}</div>
                          {sale.items && sale.items.length > 0 && (
                            <div className="text-[10px] text-slate-400 mt-0.5">{sale.items.length} item(s)</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800 font-bold">
                      {sale.customerName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-semibold">
                      {sale.date ? new Date(sale.date).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-extrabold text-slate-950">
                      PKR {sale.total?.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`px-2.5 py-0.5 inline-flex text-[10px] leading-4 font-black rounded-full uppercase tracking-wider ${
                          sale.status === 'Pending'
                            ? 'bg-amber-50 border border-amber-200 text-amber-800'
                            : 'bg-emerald-50 border border-emerald-150 text-emerald-800'
                        }`}>
                          {sale.status || 'Paid'}
                        </span>
                        <span className={`px-2 py-0.5 inline-flex items-center gap-1 text-[10px] font-bold rounded-md ${
                          sale.paymentMode === 'Online'
                            ? 'bg-blue-50 text-blue-700 border border-blue-100'
                            : 'bg-amber-50 text-amber-800 border border-amber-100'
                        }`}>
                          {sale.paymentMode === 'Online' ? <Globe className="w-3 h-3 text-blue-600" /> : <Banknote className="w-3 h-3 text-amber-600" />}
                          {sale.paymentMode || 'Cash'}
                          {sale.paymentMode === 'Online' && sale.bankName && (
                            <span className="text-[9px] font-medium text-blue-600 max-w-[90px] truncate">({sale.bankName})</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold">
                      <div className="flex items-center justify-end gap-1.5">
                        <button 
                          onClick={() => {
                            setSelectedSale(sale);
                            setShowDetailModal(true);
                          }}
                          className="text-slate-500 hover:text-slate-800 p-1.5 hover:bg-slate-100/80 rounded-lg transition-colors flex items-center gap-1"
                          title="View Receipt"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold">View</span>
                        </button>
                        <button 
                          onClick={() => printInvoice(sale)}
                          className="text-emerald-700 hover:text-emerald-900 p-1.5 hover:bg-emerald-50 rounded-lg transition-colors flex items-center gap-1"
                          title="Print Invoice"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold">Print</span>
                        </button>
                        <button 
                          onClick={() => handleEditClick(sale)}
                          className="text-amber-600 hover:text-amber-800 p-1.5 hover:bg-amber-50 rounded-lg transition-colors flex items-center gap-1"
                          title="Edit Invoice"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold">Edit</span>
                        </button>
                        <button 
                          onClick={() => handleDeleteInvoice(sale)}
                          className="text-red-600 hover:text-red-800 p-1.5 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1"
                          title="Delete Invoice"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold">Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Styled Printable Receipt Detail Modal */}
      {showDetailModal && selectedSale && (() => {
        const detailCustomer = customers.find(c => c.id === selectedSale.customerId || c.name.toLowerCase() === selectedSale.customerName.toLowerCase());
        return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setShowDetailModal(false)} />
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
            <div className="relative z-10 inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full border border-slate-200">
              <div className="bg-[#0a382c] px-6 py-4 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Printer className="w-4 h-4 text-emerald-300" />
                  <span className="font-extrabold text-sm tracking-wide uppercase">Sales Invoice & Receipt</span>
                </div>
                <button 
                  onClick={() => setShowDetailModal(false)} 
                  className="text-emerald-100 hover:text-white p-1 rounded-lg hover:bg-emerald-900 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-white p-5 sm:p-6 space-y-3">
                {/* Header Section (Logo, Title, Contact Info & Black Line all moved up) */}
                <div>
                  {/* Top Row: Company Logo on Left, Company Name Centered, Vertically Aligned at Start of Page */}
                  <div className="flex items-center justify-between gap-4 pt-0 pb-0">
                    {/* Company Logo on Left */}
                    <div className="w-20 sm:w-24 flex-shrink-0">
                      {storeDetails.logoUrl ? (
                        <img 
                          src={storeDetails.logoUrl} 
                          alt="Company Logo" 
                          className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-contain border-0 shadow-none ring-0 outline-none bg-transparent" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-[#f0b90b] text-slate-950 flex items-center justify-center font-black text-2xl sm:text-3xl border-0 shadow-none ring-0 outline-none">
                          {getInitials(storeDetails.name || 'ElectroManage')}
                        </div>
                      )}
                    </div>

                    {/* Company Details (Centered with professional fonts, underlined, previous perfect size) */}
                    <div className="flex-1 text-center py-0 sm:px-4">
                      <h3 
                        style={{ fontFamily: "'Cinzel', 'Playfair Display', 'Plus Jakarta Sans', Georgia, serif" }}
                        className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-950 tracking-tight leading-tight underline underline-offset-6 decoration-[2.5px] decoration-slate-950"
                      >
                        {storeDetails.name || 'ElectroManage'}
                      </h3>
                    </div>

                    {/* Right spacer for symmetry */}
                    <div className="hidden sm:block w-20 sm:w-24 flex-shrink-0"></div>
                  </div>

                  {/* Company Info under Logo on left side in Calibri font size 14 - MOVED UP */}
                  <div className="mt-0.5 text-left max-w-sm">
                    <div 
                      style={{ fontFamily: "'Calibri', 'Carlito', Candara, Segoe, 'Segoe UI', Arial, sans-serif" }}
                      className="text-[14px] text-slate-800 space-y-0.5 leading-tight"
                    >
                      <p>
                        <strong className="text-slate-950 font-bold">Address:</strong> {storeDetails.address || 'Madni Chowk Pindi Gheb'}
                      </p>
                      <p>
                        <strong className="text-slate-950 font-bold">Phone:</strong> {storeDetails.phone || '0312-5653636'}
                      </p>
                      <p>
                        <strong className="text-slate-950 font-bold">Email:</strong> {storeDetails.email || 'smarttech5535@gmail.com'}
                      </p>
                    </div>
                  </div>

                  {/* Black line drawn under Email Address - MOVED UP */}
                  <div className="w-full border-b-2 border-black mt-1.5 mb-2.5"></div>
                </div>

                {/* Meta & Customer/Invoice details (no line under payment mode) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-1 text-xs sm:text-sm">
                  {/* Customer & Payment Mode */}
                  <div className="space-y-1 text-slate-700">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-slate-950 min-w-[90px]">Customer:</span>
                      <span className="font-bold text-slate-950">{selectedSale.customerName}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-slate-950 min-w-[90px]">Payment Mode:</span>
                      <span className="text-slate-800">
                        {selectedSale.paymentMode || 'Cash'}
                        {selectedSale.paymentMode === 'Online' && selectedSale.bankName && (
                          <span className="text-xs text-slate-500"> ({selectedSale.bankName} - {selectedSale.bankAccountNumber})</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Invoice Details (in right corner of page, aligned vertically from left side, without 'Invoice Details' title) */}
                  <div className="flex justify-start sm:justify-end text-xs sm:text-sm text-slate-800">
                    <div className="text-left space-y-1 min-w-[170px]">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-slate-950 min-w-[80px]">Invoice No:</span>
                        <span className="font-mono font-bold text-slate-950">{selectedSale.invoiceNo}</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-slate-950 min-w-[80px]">Date:</span>
                        <span className="font-semibold text-slate-900">{formatInvoiceDate(selectedSale.date)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items details table */}
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Itemized Bill</h4>
                  {selectedSale.items && selectedSale.items.length > 0 ? (
                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                      <table className="min-w-full divide-y divide-slate-100">
                        <thead className="bg-black text-white">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-[11px] font-extrabold uppercase tracking-wider text-white bg-black">PRODUCT</th>
                            <th className="px-4 py-2.5 text-center text-[11px] font-extrabold uppercase tracking-wider text-white bg-black">PRICE</th>
                            <th className="px-4 py-2.5 text-center text-[11px] font-extrabold uppercase tracking-wider text-white bg-black">QTY</th>
                            <th className="px-4 py-2.5 text-right text-[11px] font-extrabold uppercase tracking-wider text-white bg-black">TOTAL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {selectedSale.items.map((item, i) => (
                            <tr key={i} className="align-top">
                              <td className="px-4 py-3">
                                <div className="font-bold text-slate-900">{item.productName}</div>
                                <div className="text-[10px] text-slate-500 mt-0.5">{item.brand} • {item.modelNumber}</div>
                                {item.selectedSerials && item.selectedSerials.length > 0 && (
                                  <div className="mt-2.5 flex flex-wrap gap-1">
                                    <span className="text-[9px] text-slate-400 uppercase font-black block w-full">Serials:</span>
                                    {item.selectedSerials.map((sn, snIdx) => (
                                      <span key={snIdx} className="font-mono text-[9px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-150">
                                        {sn}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center font-semibold text-slate-700">PKR {item.salePrice.toFixed(2)}</td>
                              <td className="px-4 py-3 text-center font-bold text-slate-900">{item.quantity}</td>
                              <td className="px-4 py-3 text-right font-bold text-slate-900">
                                PKR {(item.subtotal || (item.quantity * item.salePrice - (item.discount || 0))).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 text-center">
                      <p className="text-xs text-slate-500 italic">No direct line item details recorded. This was entered as a quick-sum invoice.</p>
                      <div className="mt-3 text-sm font-bold text-slate-800">Total Invoice Amount: PKR {selectedSale.total?.toFixed(2)}</div>
                    </div>
                  )}
                </div>

                {/* Totals panel */}
                <div className="flex flex-col sm:flex-row justify-end items-start gap-4 pt-4 border-t border-slate-100">

                  <div className="w-full sm:w-1/2 text-right space-y-1.5 text-xs">
                    <div className="flex justify-between font-semibold text-slate-500">
                      <span>Subtotal (Pre-discount):</span>
                      <span>
                        PKR {selectedSale.items?.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0).toFixed(2) || selectedSale.total?.toFixed(2)}
                      </span>
                    </div>
                    {selectedSale.items?.some(item => item.discount > 0) && (
                      <div className="flex justify-between font-semibold text-rose-600">
                        <span>Total Discount:</span>
                        <span>
                          -PKR {selectedSale.items?.reduce((sum, item) => sum + (item.discount || 0), 0).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-slate-500">
                      <span>Tax / VAT (0%):</span>
                      <span>PKR 0.00</span>
                    </div>
                    <div className="flex justify-between text-base font-black text-[#0a382c] border-t border-slate-100 pt-2.5">
                      <span>Total Amount Paid:</span>
                      <span>PKR {selectedSale.total?.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[#f8faf9] px-6 py-4 flex justify-between items-center border-t border-slate-150">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Authorized Receipt
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => printInvoice(selectedSale)}
                    className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow-md transition-colors flex items-center gap-1.5"
                  >
                    <Printer className="w-4 h-4" />
                    Print Invoice
                  </button>
                  <button 
                    onClick={() => setShowDetailModal(false)}
                    className="px-5 py-2.5 bg-slate-950 hover:bg-slate-900 text-white font-bold rounded-xl text-xs shadow-md transition-colors"
                  >
                    Close Receipt
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
