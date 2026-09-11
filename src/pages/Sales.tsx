import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Globe,
  Camera,
  Barcode,
  Package,
  Layers,
  Minus
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import BarcodeScannerModal, { playScanBeep } from '../components/BarcodeScannerModal';

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

// Helper function to group all items and serial numbers of the same product model for the printable invoice view
const groupSaleItemsForPrint = (items: SaleItem[]): SaleItem[] => {
  if (!items || items.length === 0) return [];
  
  const grouped: SaleItem[] = [];
  const map = new Map<string, SaleItem>();

  for (const item of items) {
    if (!item.productId && !item.productName) continue;
    
    // Group key by product ID (fallback to productName)
    const key = item.productId || item.productName;

    if (map.has(key)) {
      const existing = map.get(key)!;
      const addedQty = item.quantity || 1;
      const prevQty = existing.quantity || 1;
      const newQty = prevQty + addedQty;

      existing.quantity = newQty;
      existing.discount = (existing.discount || 0) + (item.discount || 0);
      existing.subtotal = (existing.subtotal || 0) + (item.subtotal || 0);

      // Keep salePrice or recalculate if prices differ
      if (existing.salePrice !== item.salePrice && newQty > 0) {
        existing.salePrice = (existing.subtotal + existing.discount) / newQty;
      }

      // Merge all serial numbers horizontally without duplicates
      if (item.selectedSerials && item.selectedSerials.length > 0) {
        if (!existing.selectedSerials) {
          existing.selectedSerials = [];
        }
        for (const sn of item.selectedSerials) {
          if (sn && !existing.selectedSerials.includes(sn)) {
            existing.selectedSerials.push(sn);
          }
        }
      }
    } else {
      const clone: SaleItem = {
        ...item,
        quantity: item.quantity || 1,
        salePrice: item.salePrice || 0,
        discount: item.discount || 0,
        subtotal: item.subtotal !== undefined 
          ? item.subtotal 
          : Math.max(0, ((item.quantity || 1) * (item.salePrice || 0)) - (item.discount || 0)),
        selectedSerials: item.selectedSerials ? [...item.selectedSerials] : []
      };
      map.set(key, clone);
      grouped.push(clone);
    }
  }

  return grouped;
};

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
    termsAndConditions?: string;
  }>({
    name: '',
    logoUrl: '',
    phone: '',
    address: '',
    email: '',
    bankAccounts: [],
    termsAndConditions: ''
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
  const [customerSearchInput, setCustomerSearchInput] = useState('Walk In Customer');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

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
  }>>([]);
  const [saving, setSaving] = useState(false);
  const [printOnCreate, setPrintOnCreate] = useState(false);

  // Serial Selection & Scanner States
  const [showSalesCameraScanner, setShowSalesCameraScanner] = useState(false);
  const [serialSearchInput, setSerialSearchInput] = useState('');
  const [isSerialDropdownOpen, setIsSerialDropdownOpen] = useState(false);
  const serialDropdownRef = useRef<HTMLDivElement>(null);
  const serialInputRef = useRef<HTMLInputElement>(null);
  const [activeScanningItemIndex, setActiveScanningItemIndex] = useState<number | null>(null);

  // Product Selection Mode: 'with_serial' (By Serial Number) vs 'without_serial' (Without Serial Number)
  const [productSelectionMode, setProductSelectionMode] = useState<'with_serial' | 'without_serial'>('with_serial');
  const [productSearchInput, setProductSearchInput] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);

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
          bankAccounts: loadedAccounts,
          termsAndConditions: data.termsAndConditions || ''
        });
      }
    }, (error) => {
      console.error('Error listening to store details:', error);
    });

    return () => unsubscribe();
  }, [storeId]);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
      if (serialDropdownRef.current && !serialDropdownRef.current.contains(event.target as Node)) {
        setIsSerialDropdownOpen(false);
      }
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setIsProductDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Available serial numbers in stock (or part of current editing invoice)
  const availableSerialsInStock = useMemo(() => {
    return allSerials.filter(sn => {
      if (sn.status === 'Available') return true;
      if (editingSale && editingSale.items) {
        return editingSale.items.some(
          item => item.selectedSerials?.includes(sn.id) || item.selectedSerials?.includes(sn.serialNumber)
        );
      }
      return false;
    });
  }, [allSerials, editingSale]);

  // Set of serial IDs & serial numbers currently added to this invoice
  const alreadyAddedSerialIds = useMemo(() => {
    const set = new Set<string>();
    invoiceItems.forEach(item => {
      item.selectedSerials?.forEach(idOrSn => {
        set.add(idOrSn);
        const snDoc = allSerials.find(s => s.id === idOrSn || s.serialNumber === idOrSn);
        if (snDoc) {
          set.add(snDoc.id);
          set.add(snDoc.serialNumber);
        }
      });
    });
    return set;
  }, [invoiceItems, allSerials]);

  // Filtered customers matching typed search text
  const filteredCustomers = useMemo(() => {
    const q = customerSearchInput.toLowerCase().trim();
    const nonWalkInCustomers = customers.filter(
      c => c.name?.trim().toLowerCase() !== 'walk in customer' && c.name?.trim().toLowerCase() !== 'walk-in customer'
    );
    if (!q || q === 'walk in customer' || q === 'walk-in customer') {
      return nonWalkInCustomers;
    }
    return nonWalkInCustomers.filter(c => {
      return (
        c.name?.toLowerCase().includes(q) ||
        c.mobile?.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
      );
    });
  }, [customers, customerSearchInput]);

  // Products WITH serial numbers: products that have registered serial numbers in allSerials
  const productsWithSerials = useMemo(() => {
    return products.filter(p => allSerials.some(s => s.productId === p.id));
  }, [products, allSerials]);

  // Products WITHOUT serial numbers: products that do NOT have registered serial numbers in allSerials
  const productsWithoutSerials = useMemo(() => {
    return products.filter(p => !allSerials.some(s => s.productId === p.id));
  }, [products, allSerials]);

  // Available non-serialized products: falls back to all products if no dedicated non-serialized products exist
  const availableProductsWithoutSerials = useMemo(() => {
    if (productsWithoutSerials.length > 0) {
      return productsWithoutSerials;
    }
    return products;
  }, [productsWithoutSerials, products]);

  // Filtered available in-stock serial numbers matching search text (for "By Serial Number" mode)
  const filteredStockSerials = useMemo(() => {
    const q = serialSearchInput.toLowerCase().trim();
    return availableSerialsInStock
      .filter(s => !alreadyAddedSerialIds.has(s.id) && !alreadyAddedSerialIds.has(s.serialNumber))
      .map(s => {
        const product = products.find(p => p.id === s.productId);
        return { ...s, product };
      })
      .filter(s => !!s.product)
      .filter(s => {
        if (!q) return true;
        return (
          s.serialNumber.toLowerCase().includes(q) ||
          s.product!.name.toLowerCase().includes(q) ||
          s.product!.brand?.toLowerCase().includes(q) ||
          s.product!.modelNumber?.toLowerCase().includes(q) ||
          s.product!.category?.toLowerCase().includes(q)
        );
      });
  }, [availableSerialsInStock, alreadyAddedSerialIds, products, serialSearchInput]);

  // Filtered products WITHOUT serial numbers matching search text (for "Without Serial Number" mode)
  const filteredProductsWithoutSerials = useMemo(() => {
    const q = productSearchInput.toLowerCase().trim();
    return availableProductsWithoutSerials.filter(p => {
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.modelNumber && p.modelNumber.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    });
  }, [availableProductsWithoutSerials, productSearchInput]);

  // Form Management Helpers
  const handleRemoveItemRow = (index: number) => {
    const updated = invoiceItems.filter((_, i) => i !== index);
    setInvoiceItems(updated);
  };

  const handleItemQuantityChange = (index: number, newQty: number) => {
    const updated = [...invoiceItems];
    const item = updated[index];
    if (!item) return;

    const prod = products.find(p => p.id === item.productId);
    const previousQty = editingSale?.items?.find(pi => pi.productId === item.productId)?.quantity || 0;
    const maxAllowed = (prod?.stock || 0) + previousQty;

    let validQty = Math.max(1, newQty);
    if (maxAllowed > 0 && validQty > maxAllowed) {
      toast.warning(`Maximum available stock for "${prod?.name}" is ${maxAllowed}.`);
      validQty = maxAllowed;
    }

    updated[index] = {
      ...updated[index],
      quantity: validQty
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
    return invoiceItems.reduce((sum, item) => sum + Math.max(0, ((item.quantity || 1) * item.salePrice) - (item.discount || 0)), 0);
  };

  // Add a product WITHOUT serial number to the invoice
  const addProductWithoutSerialToInvoice = (product: Product): boolean => {
    const previousQty = editingSale?.items?.find(pi => pi.productId === product.id)?.quantity || 0;
    const maxAllowed = (product.stock || 0) + previousQty;

    const existingIndex = invoiceItems.findIndex(
      i => i.productId === product.id && (!i.selectedSerials || i.selectedSerials.length === 0)
    );

    const currentQtyInInvoice = invoiceItems
      .filter(i => i.productId === product.id)
      .reduce((sum, item) => sum + (item.quantity || 1), 0);

    if (maxAllowed > 0 && currentQtyInInvoice >= maxAllowed) {
      playScanBeep('warning');
      toast.warning(`Maximum available stock (${maxAllowed}) reached for "${product.name}".`);
      return false;
    }

    if (existingIndex >= 0) {
      const updated = [...invoiceItems];
      const newQty = (updated[existingIndex].quantity || 1) + 1;
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: newQty
      };
      setInvoiceItems(updated);
      playScanBeep('success');
      toast.success(`Incremented quantity for "${product.name}" (${newQty})`);
    } else {
      const newItem = {
        productId: product.id,
        quantity: 1,
        salePrice: product.salePrice || 0,
        discount: 0,
        warranty: 'No Warranty',
        selectedSerials: []
      };
      const existingValid = invoiceItems.filter(i => i.productId && i.productId !== '');
      setInvoiceItems([...existingValid, newItem]);
      playScanBeep('success');
      toast.success(`Added "${product.name}" without serial number`);
    }

    setProductSearchInput('');
    setIsProductDropdownOpen(false);
    return true;
  };

  const handleWithoutSerialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = productSearchInput.trim().toLowerCase();
    if (!trimmed) return;

    const match = filteredProductsWithoutSerials.find(
      p => p.name.toLowerCase() === trimmed ||
           (p.modelNumber && p.modelNumber.toLowerCase() === trimmed)
    ) || filteredProductsWithoutSerials[0];

    if (match) {
      addProductWithoutSerialToInvoice(match);
    } else {
      playScanBeep('error');
      toast.warning(`No matching product without serial number found for "${productSearchInput}".`);
    }
  };

  // Add a selected serial number from stock to the invoice
  const addSerialNumberToInvoice = (serialDoc: SerialNumber): boolean => {
    // 1. Verify availability
    let isAllowed = serialDoc.status === 'Available';
    if (!isAllowed && editingSale && editingSale.items) {
      isAllowed = editingSale.items.some(
        item => item.selectedSerials?.includes(serialDoc.id) || item.selectedSerials?.includes(serialDoc.serialNumber)
      );
    }
    if (!isAllowed) {
      playScanBeep('error');
      toast.warning(`Serial "${serialDoc.serialNumber}" is already marked as ${serialDoc.status}.`);
      return false;
    }

    // 2. Check if already added
    if (alreadyAddedSerialIds.has(serialDoc.id) || alreadyAddedSerialIds.has(serialDoc.serialNumber)) {
      playScanBeep('warning');
      toast.info(`Serial "${serialDoc.serialNumber}" is already added to this invoice.`);
      return false;
    }

    // 3. Find linked product
    const product = products.find(p => p.id === serialDoc.productId);
    if (!product) {
      playScanBeep('error');
      toast.error(`Product linked to serial "${serialDoc.serialNumber}" was not found.`);
      return false;
    }

    // 4. Verify stock
    const previousQty = editingSale?.items?.find(pi => pi.productId === product.id)?.quantity || 0;
    const maxAllowed = product.stock + previousQty;
    const currentlyAddedForProduct = invoiceItems.filter(i => i.productId === product.id).length;
    if (currentlyAddedForProduct >= maxAllowed) {
      playScanBeep('warning');
      toast.warning(`Maximum available stock (${maxAllowed}) reached for ${product.name}.`);
      return false;
    }

    const newItem = {
      productId: product.id,
      quantity: 1,
      salePrice: product.salePrice || 0,
      discount: 0,
      warranty: 'No Warranty',
      selectedSerials: [serialDoc.id]
    };

    // Filter out any empty placeholder item if present
    const existingValid = invoiceItems.filter(i => i.productId && i.productId !== '');
    setInvoiceItems([...existingValid, newItem]);

    playScanBeep('success');
    toast.success(`Added ${product.name} (SN: ${serialDoc.serialNumber})`);
    setSerialSearchInput('');
    setIsSerialDropdownOpen(false);
    return true;
  };

  // Add items and attach serial numbers via barcode or camera scan
  const handleScanSerialNumber = (scannedText: string): boolean => {
    const trimmed = scannedText.trim();
    if (!trimmed) return false;

    // 1. Check matching serial in allSerials
    const matchedSerial = allSerials.find(
      s => s.serialNumber.trim().toLowerCase() === trimmed.toLowerCase()
    );

    if (matchedSerial) {
      return addSerialNumberToInvoice(matchedSerial);
    }

    // 2. If not found in allSerials, check if user scanned a product model number or name
    const matchedProduct = products.find(
      p => (p.modelNumber && p.modelNumber.trim().toLowerCase() === trimmed.toLowerCase()) ||
           (p.name && p.name.trim().toLowerCase() === trimmed.toLowerCase())
    );

    if (matchedProduct) {
      const availableSerial = availableSerialsInStock.find(
        s => s.productId === matchedProduct.id && !alreadyAddedSerialIds.has(s.id) && !alreadyAddedSerialIds.has(s.serialNumber)
      );
      if (availableSerial) {
        return addSerialNumberToInvoice(availableSerial);
      } else {
        playScanBeep('warning');
        toast.warning(`No available in-stock serial numbers remaining for "${matchedProduct.name}".`);
        return false;
      }
    }

    playScanBeep('error');
    toast.error(`Serial number "${trimmed}" not found in registered stock.`);
    return false;
  };

  const handleHardwareBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = serialSearchInput.trim();
    if (!trimmed) return;
    handleScanSerialNumber(trimmed);
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
    setCustomerSearchInput(sale.customerName || (sale.customerId && customers.find(c => c.id === sale.customerId)?.name) || 'Walk In Customer');
    setPaymentMode(sale.paymentMode || 'Cash');
    setSelectedBankAccNumber(sale.bankAccountNumber || '');
    setInvoiceStatus((sale.status as 'Paid' | 'Pending') || 'Paid');
    setSerialSearchInput('');
    setIsSerialDropdownOpen(false);
    setProductSearchInput('');
    setIsProductDropdownOpen(false);
    setProductSelectionMode('with_serial');
    
    if (sale.items) {
      const mappedItems: any[] = [];
      sale.items.forEach(item => {
        if (item.selectedSerials && item.selectedSerials.length > 0) {
          item.selectedSerials.forEach(snStr => {
            const matchedDoc = allSerials.find(s => (s.serialNumber === snStr || s.id === snStr) && s.productId === item.productId);
            mappedItems.push({
              productId: item.productId,
              quantity: 1,
              salePrice: item.salePrice,
              discount: item.discount ? (item.discount / item.selectedSerials.length) : 0,
              warranty: item.warranty || 'No Warranty',
              selectedSerials: [matchedDoc ? matchedDoc.id : snStr]
            });
          });
        } else {
          mappedItems.push({
            productId: item.productId,
            quantity: item.quantity || 1,
            salePrice: item.salePrice,
            discount: item.discount || 0,
            warranty: item.warranty || 'No Warranty',
            selectedSerials: []
          });
        }
      });
      setInvoiceItems(mappedItems);
    } else {
      setInvoiceItems([]);
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
    if (invoiceItems.length === 0 || invoiceItems.every(i => !i.productId)) {
      toast.error('Please select at least one product for the invoice');
      return;
    }

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
      
      // Serial selection count check: only validate if item was added with serial numbers
      if (item.selectedSerials && item.selectedSerials.length > 0) {
        if (item.selectedSerials.length !== item.quantity) {
          toast.error(`Please select exactly ${item.quantity} serial number(s) for "${prod.name}"`);
          return;
        }
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

    const rawItemsToSave: SaleItem[] = invoiceItems.map(item => {
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

    const itemsToSave: SaleItem[] = groupSaleItemsForPrint(rawItemsToSave);

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
      setInvoiceItems([]);
      setSelectedCustomerId('walk-in');
      setCustomerSearchInput('Walk In Customer');
      setIsCustomerDropdownOpen(false);
      setSerialSearchInput('');
      setIsSerialDropdownOpen(false);
      setProductSearchInput('');
      setIsProductDropdownOpen(false);
      setProductSelectionMode('with_serial');
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

    const groupedPrintItems = groupSaleItemsForPrint(sale.items || []);
    const itemsRows = groupedPrintItems && groupedPrintItems.length > 0 
      ? groupedPrintItems.map(item => `
        <tr style="border-bottom: 1.5px solid #000000;">
          <td style="padding: 6px 10px; text-align: left; vertical-align: top; border-bottom: 1.5px solid #000000;">
            <div style="font-weight: bold; color: #000000; font-size: 11px;">${item.productName}</div>
            ${(item.brand || item.modelNumber || item.category) ? `
              <div style="font-size: 10px; color: #000000; margin-top: 1px; font-weight: 500;">
                ${item.brand ? item.brand + ' • ' : ''}${item.modelNumber ? item.modelNumber + ' • ' : ''}${item.category || ''}
              </div>
            ` : ''}
            ${item.selectedSerials && item.selectedSerials.length > 0 ? `
              <div style="font-size: 9.5px; color: #000000; margin-top: 2px; line-height: 1.25; word-break: break-word;">
                <span style="font-weight: bold; text-transform: uppercase; font-size: 8.5px;">S/N: </span>
                <span style="font-family: monospace; font-weight: 600;">${item.selectedSerials.join(', ')}</span>
              </div>
            ` : ''}
          </td>
          <td style="padding: 6px 10px; text-align: center; font-weight: 700; color: #000000; vertical-align: top; font-size: 11px; border-bottom: 1.5px solid #000000;">PKR ${item.salePrice.toFixed(2)}</td>
          <td style="padding: 6px 10px; text-align: center; font-weight: 800; color: #000000; vertical-align: top; font-size: 11px; border-bottom: 1.5px solid #000000;">${item.quantity}</td>
          <td style="padding: 6px 10px; text-align: right; font-weight: 800; color: #000000; vertical-align: top; font-size: 11px; border-bottom: 1.5px solid #000000;">PKR ${(item.subtotal || (item.quantity * item.salePrice - (item.discount || 0))).toFixed(2)}</td>
        </tr>
      `).join('')
      : `
        <tr style="border-bottom: 1.5px solid #000000;">
          <td colspan="4" style="padding: 16px 0; text-align: center; color: #000000; font-style: italic; font-size: 11px; border-bottom: 1.5px solid #000000;">
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
          @page {
            size: auto;
            margin: 8mm 12mm;
          }
          html, body {
            height: 100%;
            margin: 0 !important;
            padding: 0 !important;
            color: #000000;
            background-color: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            padding: 8mm 12mm;
            box-sizing: border-box;
            color: #000000;
          }
          .receipt-container {
            width: 100%;
            max-width: 800px;
            margin: 0 auto;
            min-height: 255mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
          }
          .invoice-main-content {
            width: 100%;
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
            width: 115px;
            vertical-align: middle;
            text-align: left;
            padding: 0;
          }
          .logo-container {
            width: 95px;
            height: 95px;
            border-radius: 14px;
            background-color: #f0b90b;
            color: #000000;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            font-weight: 900;
            border: none;
            outline: none;
            box-shadow: none;
          }
          .logo-img {
            width: 95px;
            height: 95px;
            border-radius: 14px;
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
            width: 115px;
            vertical-align: middle;
          }
          .company-name {
            font-family: 'Cinzel', 'Playfair Display', 'Plus Jakarta Sans', Georgia, serif;
            font-size: 44px;
            font-weight: 900;
            color: #000000;
            margin: 0;
            line-height: 1.15;
            text-align: center;
            letter-spacing: 0.01em;
            text-decoration: underline;
            text-underline-offset: 7px;
            text-decoration-thickness: 3px;
            text-decoration-color: #000000;
          }
          .details-cell {
            padding-top: 2px;
            padding-bottom: 0;
            vertical-align: top;
            text-align: left;
          }
          .company-left-details {
            font-family: 'Calibri', 'Carlito', Candara, Segoe, 'Segoe UI', Arial, sans-serif;
            font-size: 16px;
            line-height: 1.4;
            color: #000000;
            text-align: left;
          }
          .left-detail-row {
            margin-bottom: 2px;
            word-break: break-word;
            color: #000000;
          }
          .left-detail-label {
            font-weight: 700;
            color: #000000;
            margin-right: 5px;
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
            color: #000000;
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
            font-size: 18px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: 10px 10px;
            border: 1px solid #000000;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .items-table tbody tr {
            border-bottom: 1.5px solid #000000 !important;
          }
          .items-table td {
            padding: 7px 10px;
            font-size: 12px;
            color: #000000;
            border-bottom: 1.5px solid #000000 !important;
          }
          .invoice-bottom-section {
            width: 100%;
            margin-top: auto;
            padding-top: 20px;
            page-break-inside: avoid;
          }
          .totals-table {
            width: 390px;
            margin-left: auto;
            border-collapse: collapse;
            font-size: 18px;
            color: #000000;
          }
          .totals-table td {
            padding: 6px 0;
            color: #000000;
          }
          .totals-table .total-row {
            font-size: 20px;
            font-weight: 900;
            color: #000000;
            border-top: 2px solid #000000;
            padding-top: 8px;
          }
          .terms-section {
            margin-top: 14px;
            border-top: 1.5px solid #000000;
            padding-top: 6px;
            text-align: left;
            page-break-inside: avoid;
          }
          .terms-header {
            font-size: 10px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #000000;
            margin-bottom: 3px;
          }
          .terms-text {
            font-size: 9.5px;
            color: #000000;
            line-height: 1.4;
            white-space: pre-wrap;
            font-weight: 600;
          }
          .footer {
            margin-top: 12px;
            border-top: 1.5px solid #000000;
            padding-top: 8px;
            text-align: center;
            font-size: 11px;
            color: #000000;
            font-weight: 700;
            line-height: 1.4;
          }
          @media print {
            body {
              padding: 0 !important;
              margin: 0 !important;
            }
            .receipt-container {
              width: 100% !important;
              max-width: 100% !important;
              min-height: 255mm !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
            }
            .invoice-bottom-section {
              margin-top: auto !important;
              page-break-inside: avoid !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="invoice-main-content">
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
                  <table style="border-collapse: collapse; font-size: 13px; color: #000000; line-height: 1.6;">
                    <tr>
                      <td style="padding: 1px 8px 1px 0; font-weight: bold; color: #000000; white-space: nowrap; vertical-align: top;">Customer:</td>
                      <td style="padding: 1px 0; font-weight: 700; color: #000000; vertical-align: top;">${sale.customerName}</td>
                    </tr>
                    <tr>
                      <td style="padding: 1px 8px 1px 0; font-weight: bold; color: #000000; white-space: nowrap; vertical-align: top;">Payment Mode:</td>
                      <td style="padding: 1px 0; font-weight: 600; color: #000000; vertical-align: top;">${sale.paymentMode || 'Cash'}${sale.paymentMode === 'Online' && sale.bankName ? ` <span style="font-size: 11px; color: #000000; font-weight: bold;">(${sale.bankName} - ${sale.bankAccountNumber})</span>` : ''}</td>
                    </tr>
                  </table>
                </td>
                <td style="width: 50%; vertical-align: top; text-align: right;">
                  <div style="display: inline-block; text-align: left;">
                    <table style="border-collapse: collapse; font-size: 13px; color: #000000; line-height: 1.6;">
                      <tr>
                        <td style="padding: 1px 8px 1px 0; font-weight: bold; color: #000000; white-space: nowrap; vertical-align: top;">Invoice No:</td>
                        <td style="padding: 1px 0; font-family: monospace; font-weight: bold; color: #000000; vertical-align: top;">${sale.invoiceNo}</td>
                      </tr>
                      <tr>
                        <td style="padding: 1px 8px 1px 0; font-weight: bold; color: #000000; white-space: nowrap; vertical-align: top;">Date:</td>
                        <td style="padding: 1px 0; font-weight: 700; color: #000000; vertical-align: top;">${formatInvoiceDate(sale.date)}</td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>
            </table>

            <table class="items-table">
              <thead>
                <tr style="background-color: #000000; color: #ffffff;">
                  <th style="text-align: left; width: 50%; background-color: #000000; color: #ffffff; padding: 10px 10px; font-size: 18px; font-weight: 900; border: 1px solid #000000; letter-spacing: 0.05em;">PRODUCT</th>
                  <th style="text-align: center; width: 17%; background-color: #000000; color: #ffffff; padding: 10px 10px; font-size: 18px; font-weight: 900; border: 1px solid #000000; letter-spacing: 0.05em;">PRICE</th>
                  <th style="text-align: center; width: 13%; background-color: #000000; color: #ffffff; padding: 10px 10px; font-size: 18px; font-weight: 900; border: 1px solid #000000; letter-spacing: 0.05em;">QTY</th>
                  <th style="text-align: right; width: 20%; background-color: #000000; color: #ffffff; padding: 10px 10px; font-size: 18px; font-weight: 900; border: 1px solid #000000; letter-spacing: 0.05em;">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRows}
              </tbody>
            </table>
          </div>

          <div class="invoice-bottom-section">
            <table class="totals-table">
              <tr>
                <td style="color: #000000; font-weight: bold; font-size: 18px; padding: 6px 0;">Subtotal (Pre-discount):</td>
                <td style="text-align: right; font-weight: bold; color: #000000; font-size: 18px; padding: 6px 0;">PKR ${subtotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="color: #000000; font-weight: bold; font-size: 18px; padding: 6px 0;">Discount:</td>
                <td style="text-align: right; font-weight: bold; color: #000000; font-size: 18px; padding: 6px 0;">PKR ${totalDiscount.toFixed(2)}</td>
              </tr>
              <tr class="total-row">
                <td style="padding-top: 8px; color: #000000; font-weight: 900; font-size: 20px;">Total Amount Paid:</td>
                <td style="text-align: right; padding-top: 8px; color: #000000; font-weight: 900; font-size: 20px;">PKR ${sale.total?.toFixed(2)}</td>
              </tr>
            </table>

            ${storeDetails.termsAndConditions ? `
              <div class="terms-section">
                <div class="terms-header">Terms & Conditions:</div>
                <div class="terms-text">${storeDetails.termsAndConditions.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
              </div>
            ` : ''}

            <div class="footer">
              Thank you for your purchase!
              ${!storeDetails.termsAndConditions ? '<br>For any warranty claims, please present this invoice.' : ''}
            </div>
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

    const groupedDraftItems = groupSaleItemsForPrint(draftItems.filter(item => item.productId));

    const draftSubtotal = draftItems.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0);
    const draftTotalDiscount = draftItems.reduce((sum, item) => sum + (item.discount || 0), 0);
    const draftTotal = Math.max(0, draftSubtotal - draftTotalDiscount);

    const currentDraftSale: Sale = {
      id: editingSale?.id || 'draft-invoice',
      invoiceNo: currentInvoiceNo,
      customerId: currentCustomer.id,
      customerName: currentCustomer.name,
      items: groupedDraftItems,
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
              setCustomerSearchInput('Walk In Customer');
              setIsCustomerDropdownOpen(false);
              setSerialSearchInput('');
              setIsSerialDropdownOpen(false);
              setProductSearchInput('');
              setIsProductDropdownOpen(false);
              setProductSelectionMode('with_serial');
              setInvoiceItems([]);
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

                  {/* Customer Selection - Searchable Textbox */}
                  <div className="space-y-1 pb-2.5 border-b border-slate-200/80 relative" ref={customerDropdownRef}>
                    <div className="flex items-center justify-between">
                      <label htmlFor="customerSearchInput" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        <span>Select Customer:</span>
                      </label>
                      {selectedCustomerId === 'walk-in' ? (
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          Walk-In
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          Selected
                        </span>
                      )}
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        id="customerSearchInput"
                        type="text"
                        autoComplete="off"
                        placeholder="Type customer name or phone to search..."
                        value={customerSearchInput}
                        onFocus={() => setIsCustomerDropdownOpen(true)}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomerSearchInput(val);
                          setIsCustomerDropdownOpen(true);
                          if (!val.trim()) {
                            setSelectedCustomerId('walk-in');
                          } else {
                            const exactMatch = customers.find(c => c.name.toLowerCase() === val.toLowerCase().trim());
                            if (exactMatch) {
                              setSelectedCustomerId(exactMatch.id);
                            } else {
                              setSelectedCustomerId(val);
                            }
                          }
                        }}
                        className="glass-input block w-full pl-8 pr-7 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:border-[#0a382c] focus:ring-2 focus:ring-[#0a382c]/10"
                      />
                      {customerSearchInput && customerSearchInput !== 'Walk In Customer' && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomerSearchInput('');
                            setSelectedCustomerId('walk-in');
                            setIsCustomerDropdownOpen(true);
                          }}
                          className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                          title="Clear search"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}

                      {/* Dropdown displaying customers filtered by text */}
                      {isCustomerDropdownOpen && (
                        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100 text-xs">
                          {/* Walk In option */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCustomerId('walk-in');
                              setCustomerSearchInput('Walk In Customer');
                              setIsCustomerDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 hover:bg-emerald-50/60 flex items-center justify-between transition-colors ${
                              selectedCustomerId === 'walk-in' ? 'bg-emerald-50 text-[#0a382c] font-bold' : 'text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <User className="w-3.5 h-3.5 text-slate-400" />
                              <span>Walk In Customer</span>
                            </div>
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Default</span>
                          </button>

                          {/* Filtered list of customers according to typed text */}
                          {filteredCustomers.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setSelectedCustomerId(c.id);
                                setCustomerSearchInput(c.name);
                                setIsCustomerDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 hover:bg-emerald-50/60 flex flex-col transition-colors ${
                                selectedCustomerId === c.id ? 'bg-emerald-50 text-[#0a382c] font-bold' : 'text-slate-800'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold">{c.name}</span>
                                {c.mobile && <span className="text-[11px] font-mono text-slate-500">{c.mobile}</span>}
                              </div>
                              {(c.city || c.address) && (
                                <span className="text-[10px] text-slate-400 truncate mt-0.5">
                                  {[c.city, c.address].filter(Boolean).join(' • ')}
                                </span>
                              )}
                            </button>
                          ))}

                          {filteredCustomers.length === 0 && customerSearchInput.trim() && customerSearchInput.trim().toLowerCase() !== 'walk in customer' && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCustomerId(customerSearchInput.trim());
                                setIsCustomerDropdownOpen(false);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-600 italic flex items-center justify-between"
                            >
                              <span>Use <strong>"{customerSearchInput.trim()}"</strong> as customer</span>
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">Custom</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Selected Customer Details Card */}
                    {selectedCustomerId !== 'walk-in' && (() => {
                      const selectedCust = customers.find(c => c.id === selectedCustomerId);
                      if (!selectedCust) {
                        return (
                          <div className="mt-1.5 p-2 rounded-xl bg-white border border-slate-200 text-[11px] text-slate-600 space-y-0.5 shadow-2xs">
                            <div className="font-bold text-slate-900">{customerSearchInput}</div>
                            <div className="text-[10px] text-slate-400 italic">Custom customer name</div>
                          </div>
                        );
                      }
                      return (
                        <div className="mt-1.5 p-2 rounded-xl bg-white border border-emerald-200/80 text-[11px] text-slate-600 space-y-1 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{selectedCust.name}</span>
                            <span className="text-[10px] font-bold text-[#0a382c] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                              Active Customer
                            </span>
                          </div>
                          {selectedCust.mobile && <div>Phone: <span className="font-semibold text-slate-800">{selectedCust.mobile}</span></div>}
                          {(selectedCust.address || selectedCust.city) && (
                            <div className="truncate text-slate-500">
                              Address: <span className="font-medium text-slate-700">{[selectedCust.address, selectedCust.city].filter(Boolean).join(', ')}</span>
                            </div>
                          )}
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

                {/* RIGHT PANEL: Items (Selected by Serial numbers in stock) */}
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
                      <span className="text-[11px] text-slate-500 font-bold bg-white border border-slate-200 px-2.5 py-1 rounded-full">
                        {productSelectionMode === 'with_serial'
                          ? `${availableSerialsInStock.length} Serials In Stock`
                          : `${availableProductsWithoutSerials.length} Products Without Serials`}
                      </span>
                    </div>
                  </div>

                  {/* Mode Selector: By Serial Number vs Without Serial Number */}
                  <div className="bg-slate-100 p-1.5 rounded-2xl flex items-center gap-1.5 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setProductSelectionMode('with_serial');
                        setIsProductDropdownOpen(false);
                        setTimeout(() => serialInputRef.current?.focus(), 50);
                      }}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        productSelectionMode === 'with_serial'
                          ? 'bg-white text-[#0a382c] shadow-sm border border-emerald-300 ring-2 ring-emerald-500/10'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                      }`}
                    >
                      <Barcode className="w-4 h-4 text-[#0a382c]" />
                      <span>By Serial Number</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        productSelectionMode === 'with_serial' ? 'bg-emerald-100 text-[#0a382c]' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {availableSerialsInStock.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setProductSelectionMode('without_serial');
                        setIsSerialDropdownOpen(false);
                        setTimeout(() => productInputRef.current?.focus(), 50);
                      }}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        productSelectionMode === 'without_serial'
                          ? 'bg-white text-[#0a382c] shadow-sm border border-emerald-300 ring-2 ring-emerald-500/10'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                      }`}
                    >
                      <Package className="w-4 h-4 text-[#0a382c]" />
                      <span>Without Serial Number</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        productSelectionMode === 'without_serial' ? 'bg-emerald-100 text-[#0a382c]' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {availableProductsWithoutSerials.length}
                      </span>
                    </button>
                  </div>

                  {/* Mode 1: Product Selection By Serial Number */}
                  {productSelectionMode === 'with_serial' && (
                    <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3 sm:p-3.5 space-y-2.5 relative" ref={serialDropdownRef}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-[#0a382c] text-white flex items-center justify-center shrink-0">
                            <Barcode className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-slate-900 tracking-tight">
                              Select Product by Serial Number in Stock
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Scan with barcode gun, camera scanner, or type to select from stock
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveScanningItemIndex(null);
                            setShowSalesCameraScanner(true);
                          }}
                          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black transition-all shadow-xs shrink-0 cursor-pointer"
                          title="Open device camera to scan serial barcodes"
                        >
                          <Camera className="w-4 h-4" />
                          <span>Scan with Camera</span>
                        </button>
                      </div>

                      {/* Search / Scan Input with Live Autocomplete Dropdown */}
                      <form onSubmit={handleHardwareBarcodeSubmit} className="relative">
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                            <input
                              ref={serialInputRef}
                              type="text"
                              placeholder="Scan or type serial number or product in stock (e.g. SN-1002)..."
                              value={serialSearchInput}
                              onFocus={() => setIsSerialDropdownOpen(true)}
                              onChange={(e) => {
                                setSerialSearchInput(e.target.value);
                                setIsSerialDropdownOpen(true);
                              }}
                              autoComplete="off"
                              className="glass-input block w-full pl-9 pr-8 py-2 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-[#0a382c]/20 bg-white border border-slate-200"
                            />
                            {serialSearchInput && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSerialSearchInput('');
                                  setIsSerialDropdownOpen(false);
                                }}
                                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                                title="Clear input"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <button
                            type="submit"
                            disabled={!serialSearchInput.trim()}
                            className="px-4 py-2 bg-[#0a382c] hover:bg-[#0d4a3b] disabled:opacity-50 text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center gap-1 cursor-pointer shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </button>
                        </div>

                        {/* Dropdown displaying in-stock products with serial numbers */}
                        {isSerialDropdownOpen && (
                          <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100 text-xs">
                            <div className="p-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-bold">
                              <span>Available Products with Serial Numbers ({filteredStockSerials.length})</span>
                              <span className="text-[10px] text-slate-400">Click to add to invoice</span>
                            </div>
                            {filteredStockSerials.length > 0 ? (
                              filteredStockSerials.map(sn => (
                                <button
                                  key={sn.id}
                                  type="button"
                                  onClick={() => addSerialNumberToInvoice(sn)}
                                  className="w-full text-left p-3 hover:bg-emerald-50/70 flex items-center justify-between transition-colors gap-3 group cursor-pointer"
                                >
                                  <div className="space-y-0.5 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-black text-xs text-[#0a382c] bg-emerald-50 group-hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-lg">
                                        {sn.serialNumber}
                                      </span>
                                      <span className="text-xs font-bold text-slate-900 truncate">
                                        {sn.product?.name}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 flex items-center gap-2">
                                      {sn.product?.brand && <span>Brand: {sn.product.brand}</span>}
                                      {sn.product?.modelNumber && <span>• Model: {sn.product.modelNumber}</span>}
                                      <span>• Stock: {sn.product?.stock}</span>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="text-xs font-bold font-mono text-slate-900 block">
                                      PKR {sn.product?.salePrice?.toFixed(2) || '0.00'}
                                    </span>
                                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 uppercase">
                                      + Add Item
                                    </span>
                                  </div>
                                </button>
                              ))
                            ) : (
                              <div className="p-4 text-center text-slate-400 italic text-xs">
                                {serialSearchInput.trim() 
                                  ? `No in-stock serial numbers found matching "${serialSearchInput.trim()}"`
                                  : 'No available in-stock serial numbers remaining.'
                                }
                              </div>
                            )}
                          </div>
                        )}
                      </form>
                    </div>
                  )}

                  {/* Mode 2: Product Selection Without Serial Number */}
                  {productSelectionMode === 'without_serial' && (
                    <div className="bg-sky-50/70 border border-sky-200/80 rounded-2xl p-3 sm:p-3.5 space-y-2.5 relative" ref={productDropdownRef}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-sky-700 text-white flex items-center justify-center shrink-0">
                            <Package className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-slate-900 tracking-tight">
                              Select Product Without Serial Number
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Type to search and select products sold without individual serial numbers
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Search Input with Autocomplete Dropdown */}
                      <form onSubmit={handleWithoutSerialSubmit} className="relative">
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Package className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                            <input
                              ref={productInputRef}
                              type="text"
                              placeholder="Type product name, brand, or model (e.g. USB Cable, Adapter)..."
                              value={productSearchInput}
                              onFocus={() => setIsProductDropdownOpen(true)}
                              onChange={(e) => {
                                setProductSearchInput(e.target.value);
                                setIsProductDropdownOpen(true);
                              }}
                              autoComplete="off"
                              className="glass-input block w-full pl-9 pr-8 py-2 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20 bg-white border border-slate-200"
                            />
                            {productSearchInput && (
                              <button
                                type="button"
                                onClick={() => {
                                  setProductSearchInput('');
                                  setIsProductDropdownOpen(false);
                                }}
                                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                                title="Clear input"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <button
                            type="submit"
                            disabled={!productSearchInput.trim()}
                            className="px-4 py-2 bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center gap-1 cursor-pointer shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </button>
                        </div>

                        {/* Dropdown displaying products without serial numbers */}
                        {isProductDropdownOpen && (
                          <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100 text-xs">
                            <div className="p-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-bold">
                              <span>Products Without Serial Numbers ({filteredProductsWithoutSerials.length})</span>
                              <span className="text-[10px] text-slate-400">Click to add to invoice</span>
                            </div>
                            {filteredProductsWithoutSerials.length > 0 ? (
                              filteredProductsWithoutSerials.map(prod => (
                                <button
                                  key={prod.id}
                                  type="button"
                                  onClick={() => addProductWithoutSerialToInvoice(prod)}
                                  className="w-full text-left p-3 hover:bg-sky-50/70 flex items-center justify-between transition-colors gap-3 group cursor-pointer"
                                >
                                  <div className="space-y-0.5 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-black text-slate-900 truncate">
                                        {prod.name}
                                      </span>
                                      {prod.category && (
                                        <span className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-1.5 py-0.5 rounded">
                                          {prod.category}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-slate-500 flex items-center gap-2">
                                      {prod.brand && <span>Brand: {prod.brand}</span>}
                                      {prod.modelNumber && <span>• Model: {prod.modelNumber}</span>}
                                      <span className="text-sky-700 font-bold">• Stock: {prod.stock} {prod.unit || 'pcs'}</span>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="text-xs font-bold font-mono text-slate-900 block">
                                      PKR {prod.salePrice?.toFixed(2) || '0.00'}
                                    </span>
                                    <span className="text-[9px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 uppercase group-hover:bg-sky-100">
                                      + Add Product
                                    </span>
                                  </div>
                                </button>
                              ))
                            ) : (
                              <div className="p-4 text-center text-slate-400 italic text-xs">
                                {productSearchInput.trim()
                                  ? `No products without serial numbers found matching "${productSearchInput.trim()}"`
                                  : 'No products without serial numbers available.'}
                              </div>
                            )}
                          </div>
                        )}
                      </form>
                    </div>
                  )}

                  {/* List of Selected Items - Details shown below with price editable */}
                  <div className="space-y-3 pt-1">
                    {invoiceItems.length === 0 ? (
                      <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 bg-white/70 text-center space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#0a382c] flex items-center justify-center mx-auto">
                          <Layers className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-black text-slate-800">No Items Added Yet</h4>
                          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                            Select products above <strong className="text-slate-700 font-bold">By Serial Number</strong> or <strong className="text-slate-700 font-bold">Without Serial Number</strong> to add them to this invoice.
                          </p>
                        </div>
                        <div className="inline-flex items-center gap-3 px-3.5 py-1.5 bg-slate-100 rounded-full text-[11px] font-bold text-slate-600">
                          <span>{availableSerialsInStock.length} serials in stock</span>
                          <span>•</span>
                          <span>{availableProductsWithoutSerials.length} products without serials</span>
                        </div>
                      </div>
                    ) : (
                      invoiceItems.map((item, index) => {
                        const selectedProduct = products.find(p => p.id === item.productId);
                        const isSerialized = Boolean(item.selectedSerials && item.selectedSerials.length > 0);
                        const serialDoc = isSerialized ? allSerials.find(s => item.selectedSerials?.includes(s.id) || item.selectedSerials?.includes(s.serialNumber)) : null;
                        const serialText = serialDoc?.serialNumber || item.selectedSerials?.[0] || '';
                        const previousQty = editingSale?.items?.find(pi => pi.productId === item.productId)?.quantity || 0;
                        const maxAllowed = (selectedProduct?.stock || 0) + previousQty;

                        return (
                          <div 
                            key={index} 
                            className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3.5 shadow-2xs hover:border-slate-300 transition-all"
                          >
                            {/* Header: Item #, Serial Number badge / Without Serial badge, Product Name, Total, and Delete */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <span className="w-6 h-6 rounded-lg bg-[#0a382c] text-white text-xs font-black flex items-center justify-center shrink-0">
                                  #{index + 1}
                                </span>
                                {isSerialized ? (
                                  <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200/90 px-2.5 py-1 rounded-xl">
                                    <Barcode className="w-3.5 h-3.5 text-[#0a382c]" />
                                    <span className="text-xs font-mono font-black text-[#0a382c]">{serialText}</span>
                                    <span className="text-[9px] font-black uppercase text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded ml-1">In Stock</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 bg-sky-50 border border-sky-200/90 px-2.5 py-1 rounded-xl">
                                    <Package className="w-3.5 h-3.5 text-sky-700" />
                                    <span className="text-xs font-bold text-sky-800">Without Serial Number</span>
                                    <span className="text-[9px] font-black uppercase text-sky-800 bg-sky-100 px-1.5 py-0.5 rounded ml-1">
                                      Qty: {item.quantity} {selectedProduct?.unit || 'pcs'}
                                    </span>
                                  </div>
                                )}
                                <h4 className="text-sm font-black text-slate-900">
                                  {selectedProduct?.name || 'Product'}
                                </h4>
                              </div>

                              <div className="flex items-center gap-3 self-end sm:self-center">
                                <div className="text-right">
                                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total</span>
                                  <span className="text-sm font-black text-slate-900 font-mono">
                                    PKR {Math.max(0, ((item.quantity || 1) * item.salePrice) - (item.discount || 0)).toFixed(2)}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItemRow(index)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                                  title="Remove product"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Product Meta Details: Brand, Model, Category, Current Stock */}
                            {selectedProduct && (
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-medium">
                                {selectedProduct.brand && (
                                  <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-md">
                                    Brand: {selectedProduct.brand}
                                  </span>
                                )}
                                {selectedProduct.modelNumber && (
                                  <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-md">
                                    Model: {selectedProduct.modelNumber}
                                  </span>
                                )}
                                {selectedProduct.category && (
                                  <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-md">
                                    Category: {selectedProduct.category}
                                  </span>
                                )}
                                <span className="text-slate-400">
                                  Stock Available: {selectedProduct.stock} {selectedProduct.unit || ''}
                                </span>
                              </div>
                            )}

                            {/* Editable Fields: Quantity (for without serial), Unit Price, Discount, Warranty */}
                            <div className={`grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1 items-end`}>
                              {/* Quantity control for without-serial items */}
                              {!isSerialized && (
                                <div className="sm:col-span-3">
                                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Quantity *
                                  </label>
                                  <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white">
                                    <button
                                      type="button"
                                      onClick={() => handleItemQuantityChange(index, Math.max(1, (item.quantity || 1) - 1))}
                                      disabled={(item.quantity || 1) <= 1}
                                      className="p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                                      title="Decrease quantity"
                                    >
                                      <Minus className="w-3.5 h-3.5" />
                                    </button>
                                    <input
                                      type="number"
                                      min="1"
                                      max={maxAllowed > 0 ? maxAllowed : undefined}
                                      value={item.quantity || 1}
                                      onChange={(e) => handleItemQuantityChange(index, parseInt(e.target.value) || 1)}
                                      className="w-full text-center py-2 px-1 text-xs font-bold text-slate-900 border-x border-slate-200 focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleItemQuantityChange(index, (item.quantity || 1) + 1)}
                                      disabled={maxAllowed > 0 && (item.quantity || 1) >= maxAllowed}
                                      className="p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                                      title="Increase quantity"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Unit Price (PKR) - Editable */}
                              <div className={!isSerialized ? 'sm:col-span-3' : 'sm:col-span-5'}>
                                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                                  <span className="flex items-center gap-1 text-[#0a382c]">
                                    <DollarSign className="w-3 h-3" />
                                    <span>Unit Price (PKR) *</span>
                                  </span>
                                  {selectedProduct && (
                                    <span className="text-[9px] text-slate-400 font-normal">Catalog: PKR {selectedProduct.salePrice.toFixed(2)}</span>
                                  )}
                                </label>
                                <input
                                  type="number"
                                  required
                                  min="0"
                                  step="0.01"
                                  value={item.salePrice === 0 ? '' : item.salePrice}
                                  onChange={(e) => handleItemPriceChange(index, parseFloat(e.target.value) || 0)}
                                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-bold text-slate-900 border border-slate-200 focus:border-[#0a382c] focus:ring-2 focus:ring-[#0a382c]/10 bg-white"
                                  placeholder="Enter unit selling price"
                                />
                              </div>

                              {/* Discount (PKR) */}
                              <div className={!isSerialized ? 'sm:col-span-3' : 'sm:col-span-3'}>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                  Discount (PKR)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={item.discount || ''}
                                  onChange={(e) => handleItemDiscountChange(index, parseFloat(e.target.value) || 0)}
                                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 border border-slate-200 focus:border-[#0a382c] bg-white"
                                />
                              </div>

                              {/* Warranty */}
                              <div className={!isSerialized ? 'sm:col-span-3' : 'sm:col-span-4'}>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                  Warranty
                                </label>
                                <select
                                  value={item.warranty || 'No Warranty'}
                                  onChange={(e) => handleItemWarrantyChange(index, e.target.value)}
                                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 border border-slate-200 focus:border-[#0a382c] bg-white"
                                >
                                  <option value="No Warranty">No Warranty</option>
                                  <option value="3 Months">3 Months</option>
                                  <option value="6 Months">6 Months</option>
                                  <option value="1 Year">1 Year</option>
                                  <option value="2 Years">2 Years</option>
                                  <option value="3 Years">3 Years</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
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
                <div className="bg-white rounded-2xl border border-black shadow-sm p-5 sm:p-6 max-w-4xl mx-auto font-sans text-black min-h-[720px] flex flex-col justify-between">
                  {/* Top Section */}
                  <div className="space-y-3">
                    {/* Header Section (Logo, Title, Contact Info & Black Line all moved up) */}
                    <div>
                      {/* Top Row: Company Logo on Left, Company Name Centered, Vertically Aligned at Start of Page */}
                      <div className="flex items-center justify-between gap-4 pt-0 pb-0">
                        {/* Company Logo on Left */}
                        <div className="w-24 sm:w-28 flex-shrink-0">
                          {storeDetails.logoUrl ? (
                            <img 
                              src={storeDetails.logoUrl} 
                              alt="Store Logo" 
                              className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl object-contain border-0 shadow-none ring-0 outline-none bg-transparent" 
                            />
                          ) : (
                            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-[#f0b90b] text-black font-black text-3xl sm:text-4xl flex items-center justify-center border-0 shadow-none ring-0 outline-none">
                              {getInitials(storeDetails.name || 'ElectroManage')}
                            </div>
                          )}
                        </div>

                        {/* Company Name (Enlarged, Prestigious Font, Underlined, Vertically Aligned with Logo) */}
                        <div className="flex-1 text-center py-0 sm:px-4">
                          <h2 
                            style={{ fontFamily: "'Cinzel', 'Playfair Display', 'Plus Jakarta Sans', Georgia, serif" }}
                            className="text-4xl sm:text-5xl lg:text-6xl font-black text-black tracking-tight leading-tight underline underline-offset-8 decoration-[3px] decoration-black"
                          >
                            {storeDetails.name || 'ElectroManage'}
                          </h2>
                        </div>

                        {/* Right spacer for symmetry */}
                        <div className="hidden sm:block w-24 sm:w-28 flex-shrink-0"></div>
                      </div>

                      {/* Company Info under Logo on left side in Calibri font size 16 - MOVED UP */}
                      <div className="mt-1 text-left max-w-md">
                        <div 
                          style={{ fontFamily: "'Calibri', 'Carlito', Candara, Segoe, 'Segoe UI', Arial, sans-serif" }}
                          className="text-[16px] text-black space-y-0.5 leading-snug"
                        >
                          <p>
                            <strong className="text-black font-bold">Address:</strong> {storeDetails.address || 'Madni Chowk Pindi Gheb'}
                          </p>
                          <p>
                            <strong className="text-black font-bold">Phone:</strong> {storeDetails.phone || '0312-5653636'}
                          </p>
                          <p>
                            <strong className="text-black font-bold">Email:</strong> {storeDetails.email || 'smarttech5535@gmail.com'}
                          </p>
                        </div>
                      </div>

                      {/* Black line drawn under Email Address - MOVED UP */}
                      <div className="w-full border-b-2 border-black mt-1.5 mb-2.5"></div>
                    </div>

                    {/* Meta Grid: Customer & Invoice Details (no line under payment mode) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-1 text-xs sm:text-sm text-black">
                      {/* Customer & Payment Mode */}
                      <div className="space-y-1 text-black">
                        <div className="flex items-baseline gap-2">
                          <span className="font-bold text-black min-w-[90px]">Customer:</span>
                          <span className="font-bold text-black">{currentCustomer.name}</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="font-bold text-black min-w-[90px]">Payment Mode:</span>
                          <span className="font-semibold text-black">
                            {paymentMode}
                            {paymentMode === 'Online' && matchedBank && (
                              <span className="text-xs text-black font-bold"> ({matchedBank.bankName} - {matchedBank.accountNumber})</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Invoice Details (in right corner of page, aligned vertically from left side, without 'Invoice Details' title) */}
                      <div className="flex justify-start md:justify-end text-xs sm:text-sm text-black">
                        <div className="text-left space-y-1 min-w-[170px]">
                          <div className="flex items-baseline gap-2">
                            <span className="font-bold text-black min-w-[80px]">Invoice No:</span>
                            <span className="font-mono font-bold text-black">{currentInvoiceNo}</span>
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className="font-bold text-black min-w-[80px]">Date:</span>
                            <span className="font-bold text-black">{formatInvoiceDate(invoiceDate || new Date())}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Line Items Table with Black Rectangle header & White Text */}
                    <div className="overflow-x-auto border border-black rounded">
                      <table className="min-w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-black text-white">
                            <th className="py-3 px-3.5 text-left font-black uppercase text-base sm:text-lg tracking-wider text-white bg-black">PRODUCT</th>
                            <th className="py-3 px-3 text-center font-black uppercase text-base sm:text-lg tracking-wider text-white bg-black">PRICE</th>
                            <th className="py-3 px-3 text-center font-black uppercase text-base sm:text-lg tracking-wider text-white bg-black">QTY</th>
                            <th className="py-3 px-3.5 text-right font-black uppercase text-base sm:text-lg tracking-wider text-white bg-black">TOTAL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black text-black">
                          {groupedDraftItems.length > 0 ? (
                            groupedDraftItems.map((item, idx) => (
                              <tr key={idx} className="align-top border-b border-black">
                                <td className="py-2.5 px-3">
                                  <div className="font-bold text-black">{item.productName}</div>
                                  {(item.brand || item.modelNumber) && (
                                    <div className="text-[10px] text-black font-medium mt-0.5">
                                      {item.brand ? item.brand + ' • ' : ''}{item.modelNumber || ''}
                                    </div>
                                  )}
                                  {item.selectedSerials && item.selectedSerials.length > 0 && (
                                    <div className="text-[10px] text-black mt-1 leading-snug break-words">
                                      <span className="font-bold uppercase text-[9px] text-black">S/N: </span>
                                      <span className="font-mono font-semibold">{item.selectedSerials.join(', ')}</span>
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center text-black font-semibold font-mono">PKR {item.salePrice.toFixed(2)}</td>
                                <td className="py-2.5 px-3 text-center font-bold text-black">{item.quantity}</td>
                                <td className="py-2.5 px-3 text-right font-bold font-mono text-black">
                                  PKR {item.subtotal.toFixed(2)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} className="py-8 text-center text-black italic text-xs">
                                No products selected yet. Select products from the line items section above to preview them here.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Bottom Section: Totals & Footer placed at the end of the page */}
                  <div className="mt-auto pt-6 space-y-3">
                    {/* Totals Summary */}
                    <div className="flex justify-end pt-3">
                      <div className="w-80 sm:w-96 space-y-2.5 text-black">
                        <div className="flex justify-between font-bold text-black text-base sm:text-lg">
                          <span>Subtotal (Pre-discount):</span>
                          <span className="font-mono font-bold">PKR {draftSubtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-black text-base sm:text-lg">
                          <span>Discount:</span>
                          <span className="font-mono font-bold">PKR {draftTotalDiscount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2.5 border-t-2 border-black text-lg sm:text-xl">
                          <span className="font-black text-black">
                            {invoiceStatus === 'Pending' ? 'Total Amount Due:' : 'Total Amount Paid:'}
                          </span>
                          <span className="font-black font-mono text-lg sm:text-xl text-black">
                            PKR {draftTotal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Terms & Conditions (Configured in Settings) */}
                    {storeDetails.termsAndConditions && (
                      <div className="pt-2.5 border-t border-black text-left">
                        <div className="text-[10px] font-black uppercase tracking-wider text-black mb-1">
                          Terms & Conditions:
                        </div>
                        <div className="text-[9.5px] text-black font-semibold leading-relaxed whitespace-pre-wrap">
                          {storeDetails.termsAndConditions}
                        </div>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="pt-3 border-t-2 border-black text-center text-[11px] text-black font-semibold space-y-0.5">
                      <p>Thank you for your purchase!</p>
                      {!storeDetails.termsAndConditions && (
                        <p>For any warranty claims, please present this original invoice.</p>
                      )}
                    </div>
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
            setInvoiceItems([]);
            setSerialSearchInput('');
            setIsSerialDropdownOpen(false);
            setProductSearchInput('');
            setIsProductDropdownOpen(false);
            setProductSelectionMode('with_serial');
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
                    <div className="w-24 sm:w-28 flex-shrink-0">
                      {storeDetails.logoUrl ? (
                        <img 
                          src={storeDetails.logoUrl} 
                          alt="Company Logo" 
                          className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl object-contain border-0 shadow-none ring-0 outline-none bg-transparent" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-[#f0b90b] text-slate-950 flex items-center justify-center font-black text-3xl sm:text-4xl border-0 shadow-none ring-0 outline-none">
                          {getInitials(storeDetails.name || 'ElectroManage')}
                        </div>
                      )}
                    </div>

                    {/* Company Details (Centered with professional fonts, underlined, previous perfect size) */}
                    <div className="flex-1 text-center py-0 sm:px-4">
                      <h3 
                        style={{ fontFamily: "'Cinzel', 'Playfair Display', 'Plus Jakarta Sans', Georgia, serif" }}
                        className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-950 tracking-tight leading-tight underline underline-offset-8 decoration-[3px] decoration-slate-950"
                      >
                        {storeDetails.name || 'ElectroManage'}
                      </h3>
                    </div>

                    {/* Right spacer for symmetry */}
                    <div className="hidden sm:block w-24 sm:w-28 flex-shrink-0"></div>
                  </div>

                  {/* Company Info under Logo on left side in Calibri font size 16 - MOVED UP */}
                  <div className="mt-1 text-left max-w-md">
                    <div 
                      style={{ fontFamily: "'Calibri', 'Carlito', Candara, Segoe, 'Segoe UI', Arial, sans-serif" }}
                      className="text-[16px] text-slate-800 space-y-0.5 leading-snug"
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-1 text-xs sm:text-sm text-black">
                  {/* Customer & Payment Mode */}
                  <div className="space-y-1 text-black">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-black min-w-[90px]">Customer:</span>
                      <span className="font-bold text-black">{selectedSale.customerName}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-black min-w-[90px]">Payment Mode:</span>
                      <span className="font-semibold text-black">
                        {selectedSale.paymentMode || 'Cash'}
                        {selectedSale.paymentMode === 'Online' && selectedSale.bankName && (
                          <span className="text-xs text-black font-bold"> ({selectedSale.bankName} - {selectedSale.bankAccountNumber})</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Invoice Details (in right corner of page, aligned vertically from left side, without 'Invoice Details' title) */}
                  <div className="flex justify-start sm:justify-end text-xs sm:text-sm text-black">
                    <div className="text-left space-y-1 min-w-[170px]">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-black min-w-[80px]">Invoice No:</span>
                        <span className="font-mono font-bold text-black">{selectedSale.invoiceNo}</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-black min-w-[80px]">Date:</span>
                        <span className="font-bold text-black">{formatInvoiceDate(selectedSale.date)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items details table */}
                <div>
                  <h4 className="text-[10px] font-black text-black uppercase tracking-wider mb-2">Itemized Bill</h4>
                  {selectedSale.items && selectedSale.items.length > 0 ? (
                    <div className="border border-black rounded-lg overflow-hidden">
                      <table className="min-w-full divide-y divide-black text-black">
                        <thead className="bg-black text-white">
                          <tr>
                            <th className="px-4 py-3 text-left text-base sm:text-lg font-black uppercase tracking-wider text-white bg-black">PRODUCT</th>
                            <th className="px-4 py-3 text-center text-base sm:text-lg font-black uppercase tracking-wider text-white bg-black">PRICE</th>
                            <th className="px-4 py-3 text-center text-base sm:text-lg font-black uppercase tracking-wider text-white bg-black">QTY</th>
                            <th className="px-4 py-3 text-right text-base sm:text-lg font-black uppercase tracking-wider text-white bg-black">TOTAL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black text-xs text-black">
                          {groupSaleItemsForPrint(selectedSale.items).map((item, i) => (
                            <tr key={i} className="align-top border-b border-black">
                              <td className="px-4 py-3">
                                <div className="font-bold text-black">{item.productName}</div>
                                {(item.brand || item.modelNumber) && (
                                  <div className="text-[10px] text-black font-medium mt-0.5">
                                    {item.brand ? item.brand + ' • ' : ''}{item.modelNumber || ''}
                                  </div>
                                )}
                                {item.selectedSerials && item.selectedSerials.length > 0 && (
                                  <div className="text-[10px] text-black mt-1 leading-snug break-words">
                                    <span className="font-bold uppercase text-[9px] text-black">S/N: </span>
                                    <span className="font-mono font-semibold">{item.selectedSerials.join(', ')}</span>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center font-semibold font-mono text-black">PKR {item.salePrice.toFixed(2)}</td>
                              <td className="px-4 py-3 text-center font-bold text-black">{item.quantity}</td>
                              <td className="px-4 py-3 text-right font-bold font-mono text-black">
                                PKR {(item.subtotal || (item.quantity * item.salePrice - (item.discount || 0))).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="bg-slate-50 p-4 rounded-xl border border-black text-center">
                      <p className="text-xs text-black italic">No direct line item details recorded. This was entered as a quick-sum invoice.</p>
                      <div className="mt-3 text-sm font-bold text-black">Total Invoice Amount: PKR {selectedSale.total?.toFixed(2)}</div>
                    </div>
                  )}
                </div>

                {/* Totals panel */}
                <div className="flex flex-col sm:flex-row justify-end items-start gap-4 pt-4 border-t-2 border-black">
                  <div className="w-full sm:w-80 md:w-96 text-right space-y-2.5 text-black">
                    <div className="flex justify-between font-bold text-black text-base sm:text-lg">
                      <span>Subtotal (Pre-discount):</span>
                      <span className="font-mono font-bold">
                        PKR {selectedSale.items?.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0).toFixed(2) || selectedSale.total?.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-black text-base sm:text-lg">
                      <span>Discount:</span>
                      <span className="font-mono font-bold">
                        PKR {(selectedSale.items?.reduce((sum, item) => sum + (item.discount || 0), 0) || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-lg sm:text-xl font-black text-black border-t-2 border-black pt-2.5">
                      <span>Total Amount Paid:</span>
                      <span className="font-mono">PKR {selectedSale.total?.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Terms & Conditions (Configured in Settings) */}
                {storeDetails.termsAndConditions && (
                  <div className="pt-3 border-t border-black text-left">
                    <div className="text-[10px] font-black uppercase tracking-wider text-black mb-1">
                      Terms & Conditions:
                    </div>
                    <div className="text-[9.5px] text-black font-semibold leading-relaxed whitespace-pre-wrap">
                      {storeDetails.termsAndConditions}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="pt-3 border-t-2 border-black text-center text-[11px] text-black font-semibold space-y-0.5">
                  <p>Thank you for your purchase!</p>
                  {!storeDetails.termsAndConditions && (
                    <p>For any warranty claims, please present this original invoice.</p>
                  )}
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

      {/* Sales Camera Barcode / Serial Scanner Modal */}
      <BarcodeScannerModal
        isOpen={showSalesCameraScanner}
        onClose={() => {
          setShowSalesCameraScanner(false);
          setActiveScanningItemIndex(null);
        }}
        onScan={handleScanSerialNumber}
        title={
          activeScanningItemIndex !== null && invoiceItems[activeScanningItemIndex]
            ? `Scan Serials for ${products.find(p => p.id === invoiceItems[activeScanningItemIndex].productId)?.name || 'Item'}`
            : 'Scan Barcode or Serial Number'
        }
        subtitle="Point camera at product serial number or barcode label to add to invoice automatically"
        continuous={true}
      />
    </div>
  );
}
