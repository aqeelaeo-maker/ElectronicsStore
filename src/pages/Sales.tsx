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
  Minus,
  Check,
  RotateCcw,
  AlertCircle,
  Phone,
  ShieldCheck,
  Tag,
  Calculator,
  Download
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import BarcodeScannerModal, { playScanBeep } from '../components/BarcodeScannerModal';
import SalesReturnModal, { printReturnReceipt, SaleReturnRecord } from '../components/SalesReturnModal';
import { Pagination } from '../components/Pagination';
import { downloadHtmlAsPdf } from '../lib/pdfDownloader';

interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  modelNumber: string;
  productType?: 'Serials' | 'Without Serials' | string;
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
  discount?: number;
  warranty?: string;
  subtotal: number;
  selectedSerials: string[];
  returnedQuantity?: number;
  returnedSerials?: string[];
}

interface Sale {
  id: string;
  invoiceNo: string;
  customerId?: string | null;
  customerName: string;
  total: number;
  subtotal?: number;
  discount?: number;
  warranty?: string;
  paidAmount?: number;
  pendingAmount?: number;
  date: string;
  status: string;
  items?: SaleItem[];
  paymentMode?: 'Cash' | 'Online';
  bankAccountNumber?: string | null;
  bankName?: string | null;
  accountTitle?: string | null;
  returns?: SaleReturnRecord[];
  returnStatus?: 'None' | 'Partially Returned' | 'Fully Returned';
  totalRefunded?: number;
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
  const [statusFilter, setStatusFilter] = useState<'All' | 'Paid' | 'Partial' | 'Pending' | 'Returns'>('All');
  const [showModal, setShowModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [returnSale, setReturnSale] = useState<Sale | null>(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showSelectReturnInvoiceModal, setShowSelectReturnInvoiceModal] = useState(false);
  const [returnInvoiceSearch, setReturnInvoiceSearch] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const [sourceQuotationId, setSourceQuotationId] = useState<string | null>(null);

  // New Invoice Form States
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('walk-in');
  const [customerSearchInput, setCustomerSearchInput] = useState('Walk In Customer');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Online'>('Cash');
  const [selectedBankAccNumber, setSelectedBankAccNumber] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState<'Paid' | 'Pending' | 'Partial'>('Paid');
  const [paidAmountInput, setPaidAmountInput] = useState('');
  const [isPaidAmountCustom, setIsPaidAmountCustom] = useState(false);
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0);
  const [invoiceDiscountInput, setInvoiceDiscountInput] = useState<string>('0');
  const [invoiceWarranty, setInvoiceWarranty] = useState<string>('No Warranty');
  const [isCustomWarranty, setIsCustomWarranty] = useState<boolean>(false);
  const [customWarrantyInput, setCustomWarrantyInput] = useState<string>('');
  const [invoiceItems, setInvoiceItems] = useState<Array<{
    productId: string;
    quantity: number;
    salePrice: number;
    discount?: number;
    warranty?: string;
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
  const [editingInvoiceItemIndex, setEditingInvoiceItemIndex] = useState<number | null>(null);

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

  // Handle Quotation Conversion: prefill invoice items and customer from quotation
  useEffect(() => {
    if (location.state && (location.state as any).fromQuotation && products.length > 0) {
      const quote = (location.state as any).fromQuotation;
      setSourceQuotationId(quote.id);
      setEditingSale(null);

      // Pre-fill customer
      if (quote.customerId && customers.some(c => c.id === quote.customerId)) {
        setSelectedCustomerId(quote.customerId);
      } else if (quote.customerName && quote.customerName !== 'Walk In Customer') {
        setSelectedCustomerId(quote.customerName);
      } else {
        setSelectedCustomerId('walk-in');
      }
      setCustomerSearchInput(quote.customerName || 'Walk In Customer');

      // Pre-fill items from quotation
      if (quote.items && quote.items.length > 0) {
        const mappedItems: any[] = [];
        quote.items.forEach((item: any) => {
          if (item.selectedSerials && item.selectedSerials.length > 0) {
            item.selectedSerials.forEach((snStr: string) => {
              const matchedDoc = allSerials.find(s => (s.serialNumber === snStr || s.id === snStr) && s.productId === item.productId);
              mappedItems.push({
                productId: item.productId,
                quantity: 1,
                salePrice: item.salePrice,
                discount: 0,
                warranty: item.warranty || '1 Year Warranty',
                selectedSerials: [matchedDoc ? matchedDoc.id : snStr]
              });
            });
          } else {
            mappedItems.push({
              productId: item.productId,
              quantity: item.quantity || 1,
              salePrice: item.salePrice,
              discount: 0,
              warranty: item.warranty || '1 Year Warranty',
              selectedSerials: []
            });
          }
        });
        setInvoiceItems(mappedItems);
      } else {
        setInvoiceItems([]);
      }

      // Pre-fill invoice-level discount & warranty from quotation
      const quoteDiscount = quote.discount !== undefined
        ? quote.discount
        : (quote.items?.reduce((sum: number, it: any) => sum + (it.discount || 0), 0) || 0);
      setInvoiceDiscount(quoteDiscount);
      setInvoiceDiscountInput(quoteDiscount ? String(quoteDiscount) : '0');

      const quoteWarranty = quote.warranty || quote.items?.[0]?.warranty || 'No Warranty';
      setInvoiceWarranty(quoteWarranty);
      const standardWarranties = [
        'No Warranty',
        '7 Days Checking Warranty',
        '1 Month Warranty',
        '3 Months Warranty',
        '6 Months Warranty',
        '1 Year Warranty',
        '2 Years Warranty',
        '3 Years Warranty',
        'Lifetime Warranty'
      ];
      if (standardWarranties.includes(quoteWarranty)) {
        setIsCustomWarranty(false);
        setCustomWarrantyInput('');
      } else if (quoteWarranty && quoteWarranty !== 'No Warranty') {
        setIsCustomWarranty(true);
        setCustomWarrantyInput(quoteWarranty);
      } else {
        setIsCustomWarranty(false);
        setCustomWarrantyInput('');
      }

      setInvoiceStatus('Paid');
      setPaymentMode('Cash');
      setShowModal(true);
      toast.info(`Loaded Quotation ${quote.quotationNo} into New Sale. Review and save to deduct inventory stock.`);

      // Clear router location state so reloading or tab switching doesn't re-trigger
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, products, customers, allSerials]);

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

  // Products WITH serial numbers: explicit productType === 'Serials' (or fallback: has serials)
  const productsWithSerials = useMemo(() => {
    return products.filter(p => {
      if (p.productType === 'Without Serials') return false;
      if (p.productType === 'Serials') return true;
      return allSerials.some(s => s.productId === p.id);
    });
  }, [products, allSerials]);

  // Products WITHOUT serial numbers: explicit productType === 'Without Serials' (or fallback: no serials)
  const productsWithoutSerials = useMemo(() => {
    return products.filter(p => {
      if (p.productType === 'Without Serials') return true;
      if (p.productType === 'Serials') return false;
      return !allSerials.some(s => s.productId === p.id);
    });
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
    if (editingInvoiceItemIndex === index) {
      setEditingInvoiceItemIndex(null);
    } else if (editingInvoiceItemIndex !== null && editingInvoiceItemIndex > index) {
      setEditingInvoiceItemIndex(editingInvoiceItemIndex - 1);
    }
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

  const calculateItemsSubtotal = () => {
    return invoiceItems.reduce((sum, item) => sum + ((item.quantity || 1) * (item.salePrice || 0)), 0);
  };

  const calculateInvoiceTotal = () => {
    const subtotal = calculateItemsSubtotal();
    return Math.max(0, subtotal - (invoiceDiscount || 0));
  };

  const handleInvoiceDiscountChange = (valStr: string) => {
    setInvoiceDiscountInput(valStr);
    const parsed = parseFloat(valStr);
    const num = isNaN(parsed) ? 0 : Math.max(0, parsed);
    setInvoiceDiscount(num);
  };

  const handleInvoiceWarrantyChange = (val: string) => {
    if (val === 'Custom Warranty') {
      setIsCustomWarranty(true);
      setInvoiceWarranty(customWarrantyInput || 'Custom Warranty');
    } else {
      setIsCustomWarranty(false);
      setInvoiceWarranty(val);
    }
  };

  const handleCustomWarrantyInputChange = (val: string) => {
    setCustomWarrantyInput(val);
    setInvoiceWarranty(val.trim() || 'No Warranty');
  };

  const getInvoicePaidAndPending = (total: number) => {
    let paid = 0;
    if (isPaidAmountCustom) {
      if (paidAmountInput === '') {
        paid = 0;
      } else {
        paid = Math.max(0, parseFloat(paidAmountInput) || 0);
      }
    } else {
      if (invoiceStatus === 'Paid') {
        paid = total;
      } else if (invoiceStatus === 'Pending') {
        paid = 0;
      } else {
        paid = total > 0 ? Number((total / 2).toFixed(2)) : 0;
      }
    }
    const pending = Math.max(0, Number((total - paid).toFixed(2)));
    return { paid, pending };
  };

  const handlePaidAmountChange = (valStr: string) => {
    setIsPaidAmountCustom(true);
    setPaidAmountInput(valStr);
    const num = parseFloat(valStr);
    const total = calculateInvoiceTotal();
    if (valStr === '' || isNaN(num) || num <= 0) {
      setInvoiceStatus('Pending');
    } else if (num >= total && total > 0) {
      setInvoiceStatus('Paid');
    } else {
      setInvoiceStatus('Partial');
    }
  };

  const handleInvoiceStatusChange = (newStatus: 'Paid' | 'Pending' | 'Partial') => {
    setInvoiceStatus(newStatus);
    const total = calculateInvoiceTotal();
    if (newStatus === 'Paid') {
      setIsPaidAmountCustom(false);
      setPaidAmountInput(total.toString());
    } else if (newStatus === 'Pending') {
      setIsPaidAmountCustom(false);
      setPaidAmountInput('0');
    } else {
      setIsPaidAmountCustom(true);
      const half = total > 0 ? Number((total / 2).toFixed(2)) : 0;
      setPaidAmountInput(half.toString());
    }
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
        warranty: invoiceWarranty || 'No Warranty',
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
    const raw = productSearchInput.trim();
    if (!raw) return;

    // First attempt to scan it with the universal scan code handler (e.g. if cashier used barcode scanner gun or typed model/serial)
    const handled = handleScanCode(raw);
    if (handled) {
      setProductSearchInput('');
      setIsProductDropdownOpen(false);
      return;
    }

    const trimmed = raw.toLowerCase();
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

    // 4. Verify stock (ensure inStockSerialsCount is considered so product.stock being 0 in db doesn't block valid serial)
    const previousQty = editingSale?.items?.find(pi => pi.productId === product.id)?.quantity || 0;
    const inStockSerialsCount = availableSerialsInStock.filter(s => s.productId === product.id).length;
    const effectiveStock = Math.max(product.stock || 0, inStockSerialsCount);
    const maxAllowed = effectiveStock + previousQty;
    const currentlyAddedForProduct = invoiceItems.filter(i => i.productId === product.id).length;
    if (maxAllowed > 0 && currentlyAddedForProduct >= maxAllowed) {
      playScanBeep('warning');
      toast.warning(`Maximum available stock (${maxAllowed}) reached for ${product.name}.`);
      return false;
    }

    const newItem = {
      productId: product.id,
      quantity: 1,
      salePrice: product.salePrice || 0,
      discount: 0,
      warranty: invoiceWarranty || 'No Warranty',
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

  // Master Universal Barcode & Serial Scanner Handler (works for camera scanner and hardware barcode scanner)
  const handleScanCode = (scannedText: string): boolean => {
    const raw = scannedText.trim();
    if (!raw) return false;

    // Clean any surrounding quotes or barcode terminal characters
    let trimmed = raw.replace(/^["']|["']$/g, '').trim();
    
    // Strip common barcode label prefixes if present (e.g. "SN: 1002" or "S/N: ABC")
    if (/^(sn|s\/n|serial|ser|barcode)\s*[:#-]?\s*/i.test(trimmed)) {
      trimmed = trimmed.replace(/^(sn|s\/n|serial|ser|barcode)\s*[:#-]?\s*/i, '').trim();
    }
    const lower = trimmed.toLowerCase();

    // 1. Direct Match against serial numbers in allSerials (by serialNumber or ID)
    const matchedSerial = allSerials.find(
      s => s.serialNumber.trim().toLowerCase() === lower || s.id.toLowerCase() === lower
    );

    if (matchedSerial) {
      return addSerialNumberToInvoice(matchedSerial);
    }

    // 2. Direct Match against products (by modelNumber, name, barcode, or ID)
    const matchedProduct = products.find(
      p => (p.modelNumber && p.modelNumber.trim().toLowerCase() === lower) ||
           (p.name && p.name.trim().toLowerCase() === lower) ||
           (p.id.toLowerCase() === lower) ||
           ((p as any).barcode && String((p as any).barcode).trim().toLowerCase() === lower)
    );

    if (matchedProduct) {
      // If product is configured without serials, add it directly!
      if (matchedProduct.productType === 'Without Serials') {
        return addProductWithoutSerialToInvoice(matchedProduct);
      }

      // Check if product has available serials in stock
      const availableSerial = availableSerialsInStock.find(
        s => s.productId === matchedProduct.id && !alreadyAddedSerialIds.has(s.id) && !alreadyAddedSerialIds.has(s.serialNumber)
      );

      if (availableSerial) {
        return addSerialNumberToInvoice(availableSerial);
      }

      // If no serials are registered for this product and product is not strictly marked 'Serials', allow adding non-serialized
      const hasAnySerialsRegistered = allSerials.some(s => s.productId === matchedProduct.id);
      if (!hasAnySerialsRegistered && matchedProduct.productType !== 'Serials') {
        return addProductWithoutSerialToInvoice(matchedProduct);
      }

      playScanBeep('warning');
      toast.warning(`No available in-stock serial numbers remaining for "${matchedProduct.name}".`);
      return false;
    }

    // 3. Normalized / Stripped Match for serial numbers (stripping leading zeros or non-alphanumeric noise from scanners)
    const strippedCode = lower.replace(/^0+/, '');
    if (strippedCode.length >= 2) {
      const fuzzySerial = allSerials.find(
        s => s.serialNumber.trim().toLowerCase().replace(/^0+/, '') === strippedCode
      );
      if (fuzzySerial) {
        return addSerialNumberToInvoice(fuzzySerial);
      }
    }

    // 4. Alphanumeric match (ignoring dashes, hyphens, and whitespace between characters)
    const alphaNumCode = lower.replace(/[^a-z0-9]/g, '');
    if (alphaNumCode.length >= 2) {
      const alphaNumSerial = allSerials.find(
        s => s.serialNumber.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === alphaNumCode
      );
      if (alphaNumSerial) {
        return addSerialNumberToInvoice(alphaNumSerial);
      }
    }

    // 5. Fuzzy Match against products (e.g. scanner captured model number within a full barcode or vice versa)
    const fuzzyProduct = products.find(
      p => (p.modelNumber && (lower.includes(p.modelNumber.trim().toLowerCase()) || p.modelNumber.trim().toLowerCase().includes(lower))) ||
           (p.name && (lower.includes(p.name.trim().toLowerCase()) || p.name.trim().toLowerCase().includes(lower)))
    );

    if (fuzzyProduct) {
      if (fuzzyProduct.productType === 'Without Serials') {
        return addProductWithoutSerialToInvoice(fuzzyProduct);
      }
      const availableSerial = availableSerialsInStock.find(
        s => s.productId === fuzzyProduct.id && !alreadyAddedSerialIds.has(s.id) && !alreadyAddedSerialIds.has(s.serialNumber)
      );
      if (availableSerial) {
        return addSerialNumberToInvoice(availableSerial);
      }
      if (fuzzyProduct.productType !== 'Serials' && !allSerials.some(s => s.productId === fuzzyProduct.id)) {
        return addProductWithoutSerialToInvoice(fuzzyProduct);
      }
    }

    playScanBeep('error');
    toast.error(`Barcode or serial "${trimmed}" not found in inventory.`);
    return false;
  };

  const handleScanSerialNumber = handleScanCode;

  const handleHardwareBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = serialSearchInput.trim();
    if (!trimmed) return;
    handleScanCode(trimmed);
  };

  // Global hardware barcode scanner listener (e.g. USB/Bluetooth barcode gun or thermal POS scanner)
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = 0;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only process hardware scanner when Create/Edit Sales modal is active and scanner/detail modals are closed
      if (!showModal || showSalesCameraScanner || showDetailModal) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const isSearchInput = target === serialInputRef.current || target === productInputRef.current;
      const isOtherInput = !isSearchInput && (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA');

      const now = Date.now();
      const diff = now - lastKeyTime;
      lastKeyTime = now;

      if (e.key === 'Enter') {
        // If Enter is pressed and buffer has at least 2 chars within scanner burst speed (<90ms average per char) or inside barcode input
        if (buffer.length >= 2) {
          const scannedCode = buffer.trim();
          buffer = '';
          if (scannedCode) {
            e.preventDefault();
            handleScanCode(scannedCode);
          }
          return;
        }
        buffer = '';
        return;
      }

      // Ignore single modifier keys (Shift, Alt, Control, Meta, Arrow keys, etc.)
      if (e.key.length > 1) {
        return;
      }

      // Barcode scanners send keystrokes extremely rapidly, typically within 20-50ms per key
      if (diff > 90 && isOtherInput) {
        // Reset buffer if delay is long and user is typing in another input (e.g. customer name or notes)
        buffer = e.key;
      } else {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showModal, showSalesCameraScanner, showDetailModal, allSerials, products, availableSerialsInStock, alreadyAddedSerialIds, invoiceItems]);

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
    const currentStatus = (sale.status as 'Paid' | 'Pending' | 'Partial') || 'Paid';
    setInvoiceStatus(currentStatus);
    const existingPaid = sale.paidAmount !== undefined 
      ? sale.paidAmount 
      : (sale.status === 'Paid' ? (sale.total || 0) : 0);
    setPaidAmountInput(existingPaid.toString());
    setIsPaidAmountCustom(true);
    setSerialSearchInput('');
    setIsSerialDropdownOpen(false);
    setProductSearchInput('');
    setIsProductDropdownOpen(false);
    setProductSelectionMode('with_serial');
    
    // Set invoice-level discount and warranty
    const existingDiscount = sale.discount !== undefined
      ? sale.discount
      : (sale.items?.reduce((sum, item) => sum + (item.discount || 0), 0) || 0);
    setInvoiceDiscount(existingDiscount);
    setInvoiceDiscountInput(existingDiscount ? String(existingDiscount) : '0');

    const existingWarranty = sale.warranty || (sale.items?.find(i => i.warranty && i.warranty !== 'No Warranty')?.warranty) || 'No Warranty';
    const standardWarranties = [
      'No Warranty',
      '7 Days Checking Warranty',
      '1 Month Warranty',
      '3 Months Warranty',
      '6 Months Warranty',
      '1 Year Warranty',
      '2 Years Warranty',
      '3 Years Warranty',
      'Lifetime Warranty'
    ];
    if (standardWarranties.includes(existingWarranty)) {
      setIsCustomWarranty(false);
      setCustomWarrantyInput('');
      setInvoiceWarranty(existingWarranty);
    } else if (existingWarranty && existingWarranty !== 'No Warranty') {
      setIsCustomWarranty(true);
      setCustomWarrantyInput(existingWarranty);
      setInvoiceWarranty(existingWarranty);
    } else {
      setIsCustomWarranty(false);
      setCustomWarrantyInput('');
      setInvoiceWarranty('No Warranty');
    }

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
              discount: 0,
              warranty: existingWarranty || 'No Warranty',
              selectedSerials: [matchedDoc ? matchedDoc.id : snStr]
            });
          });
        } else {
          mappedItems.push({
            productId: item.productId,
            quantity: item.quantity || 1,
            salePrice: item.salePrice,
            discount: 0,
            warranty: existingWarranty || 'No Warranty',
            selectedSerials: []
          });
        }
      });
      setInvoiceItems(mappedItems);
    } else {
      setInvoiceItems([]);
    }
    setEditingInvoiceItemIndex(null);
    
    setShowModal(true);
  };

  // Delete invoice directly without returning products to stock (works whether products are in the list or not)
  const handleDeleteInvoice = async (sale: Sale) => {
    if (!window.confirm(`Are you sure you want to delete invoice ${sale.invoiceNo}? Products will not be returned to stock.`)) {
      return;
    }
    
    setSaving(true);
    try {
      const batch = writeBatch(db);
      
      // If deleted invoice was paid online, revert the bank account balance by the actual paid amount
      const salePaidAmount = sale.paidAmount !== undefined 
        ? sale.paidAmount 
        : (sale.status === 'Paid' ? sale.total : 0);

      if (sale.paymentMode === 'Online' && sale.bankAccountNumber && salePaidAmount > 0 && storeId) {
        try {
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
                  balance: Number((curBal - salePaidAmount).toFixed(2))
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
        } catch (storeErr) {
          console.warn('Could not revert store bank balance on deletion:', storeErr);
        }
      }

      // Revert customer pending balance if invoice had an outstanding amount
      const salePendingAmount = sale.pendingAmount !== undefined 
        ? sale.pendingAmount 
        : (sale.status === 'Pending' ? sale.total : 0);

      if (salePendingAmount > 0 && sale.customerId && sale.customerId !== 'walk-in') {
        try {
          const customerRef = doc(db, 'customers', sale.customerId);
          const custSnap = await getDoc(customerRef);
          if (custSnap.exists()) {
            const currentCustBal = custSnap.data().balance || 0;
            const newCustBal = Math.max(0, Number((currentCustBal - salePendingAmount).toFixed(2)));
            batch.update(customerRef, {
              balance: newCustBal,
              updatedAt: serverTimestamp()
            });
          }
        } catch (custErr) {
          console.warn('Could not revert customer balance on deletion:', custErr);
        }
      }

      // Delete the invoice document directly from database
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
        productName: prod?.name || '',
        brand: prod?.brand || '',
        modelNumber: prod?.modelNumber || '',
        category: prod?.category || '',
        quantity: item.quantity,
        salePrice: item.salePrice,
        discount: 0,
        warranty: invoiceWarranty || 'No Warranty',
        subtotal: item.quantity * item.salePrice,
        selectedSerials: item.selectedSerials.map(sId => {
          const sn = allSerials.find(s => s.id === sId);
          return sn ? sn.serialNumber : sId;
        })
      };
    });

    const itemsToSave: SaleItem[] = groupSaleItemsForPrint(rawItemsToSave);

    const itemsSubtotal = itemsToSave.reduce((sum, item) => sum + item.subtotal, 0);
    const invoiceDiscountNum = Number((invoiceDiscount || 0).toFixed(2));
    const totalAmount = Math.max(0, itemsSubtotal - invoiceDiscountNum);
    const { paid: calcPaid, pending: calcPending } = getInvoicePaidAndPending(totalAmount);
    const paidAmount = Number(calcPaid.toFixed(2));
    const pendingAmount = Number(calcPending.toFixed(2));
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
      subtotal: itemsSubtotal,
      discount: invoiceDiscountNum,
      warranty: invoiceWarranty || 'No Warranty',
      total: totalAmount,
      paidAmount,
      pendingAmount,
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

      // 4. Update Customer Outstanding Balance & Payment Record
      if (customerId && customerId !== 'walk-in') {
        const customerRef = doc(db, 'customers', customerId);
        const custSnap = await getDoc(customerRef);
        if (custSnap.exists()) {
          const currentCustBalance = custSnap.data().balance || 0;
          let netBalanceDiff = pendingAmount;

          if (editingSale) {
            const oldPending = editingSale.pendingAmount !== undefined 
              ? editingSale.pendingAmount 
              : (editingSale.status === 'Pending' ? editingSale.total : 0);
            
            if (editingSale.customerId === customerId) {
              netBalanceDiff = pendingAmount - oldPending;
            } else {
              // Revert old customer's balance if customer changed
              if (editingSale.customerId && editingSale.customerId !== 'walk-in') {
                try {
                  const oldCustRef = doc(db, 'customers', editingSale.customerId);
                  const oldCustSnap = await getDoc(oldCustRef);
                  if (oldCustSnap.exists()) {
                    const oldCustBal = oldCustSnap.data().balance || 0;
                    batch.update(oldCustRef, {
                      balance: Math.max(0, Number((oldCustBal - oldPending).toFixed(2))),
                      updatedAt: serverTimestamp()
                    });
                  }
                } catch (oldErr) {
                  console.warn('Could not revert old customer balance:', oldErr);
                }
              }
              netBalanceDiff = pendingAmount;
            }
          }

          const newCustBalance = Number((currentCustBalance + netBalanceDiff).toFixed(2));
          batch.update(customerRef, {
            balance: newCustBalance,
            updatedAt: serverTimestamp()
          });
        }

        // Add / Record transaction to customerPayments
        const paymentRecordId = doc(collection(db, 'customerPayments')).id;
        const paymentRef = doc(db, 'customerPayments', paymentRecordId);
        batch.set(paymentRef, {
          id: paymentRecordId,
          storeId,
          customerId,
          customerName,
          saleId,
          invoiceNo,
          totalAmount,
          paidAmount,
          pendingAmount,
          paymentMode,
          bankAccountNumber: paymentMode === 'Online' && matchedBank ? matchedBank.accountNumber : null,
          bankName: paymentMode === 'Online' && matchedBank ? matchedBank.bankName : null,
          paymentDate: saleDate,
          type: 'InvoicePayment',
          notes: pendingAmount > 0 
            ? `Invoice ${invoiceNo}: Paid PKR ${paidAmount.toFixed(2)}, Pending PKR ${pendingAmount.toFixed(2)}` 
            : `Invoice ${invoiceNo}: Full payment received`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else if (editingSale && editingSale.customerId && editingSale.customerId !== 'walk-in') {
        // If changed from a registered customer to walk-in, revert old customer pending balance
        const oldPending = editingSale.pendingAmount !== undefined 
          ? editingSale.pendingAmount 
          : (editingSale.status === 'Pending' ? editingSale.total : 0);
        if (oldPending > 0) {
          try {
            const oldCustRef = doc(db, 'customers', editingSale.customerId);
            const oldCustSnap = await getDoc(oldCustRef);
            if (oldCustSnap.exists()) {
              const oldCustBal = oldCustSnap.data().balance || 0;
              batch.update(oldCustRef, {
                balance: Math.max(0, Number((oldCustBal - oldPending).toFixed(2))),
                updatedAt: serverTimestamp()
              });
            }
          } catch (oldErr) {
            console.warn('Could not revert old customer balance:', oldErr);
          }
        }
      }

      // 5. Update Bank Account Balance in Store document if online payment is involved
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

          // If editing an existing sale that was paid Online, revert its previous online paid amount
          if (editingSale && editingSale.paymentMode === 'Online' && editingSale.bankAccountNumber) {
            const prevOnlinePaid = editingSale.paidAmount !== undefined 
              ? editingSale.paidAmount 
              : (editingSale.status === 'Paid' ? editingSale.total : 0);

            if (prevOnlinePaid > 0) {
              currentAccounts = currentAccounts.map((acc: any) => {
                if (acc.accountNumber === editingSale.bankAccountNumber) {
                  bankChanged = true;
                  return {
                    ...acc,
                    balance: Number(((acc.balance || 0) - prevOnlinePaid).toFixed(2))
                  };
                }
                return acc;
              });
            }
          }

          // If current invoice is Online and has a positive paidAmount, add paidAmount to selected bank account
          if (paymentMode === 'Online' && selectedBankAccNumber && paidAmount > 0) {
            currentAccounts = currentAccounts.map((acc: any) => {
              if (acc.accountNumber === selectedBankAccNumber) {
                bankChanged = true;
                return {
                  ...acc,
                  balance: Number(((acc.balance || 0) + paidAmount).toFixed(2))
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

      // If this sale was created by converting a Quotation, mark quotation as Converted
      if (sourceQuotationId) {
        batch.update(doc(db, 'quotations', sourceQuotationId), {
          status: 'Converted',
          convertedSaleId: saleId,
          convertedInvoiceNo: invoiceNo,
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();

      toast.success(editingSale ? `Invoice ${invoiceNo} updated successfully!` : `Invoice ${invoiceNo} recorded successfully!`);
      setShowModal(false);
      setEditingSale(null);
      setSourceQuotationId(null);
      
      if (printOnCreate) {
        const createdSale: Sale = {
          id: saleId,
          invoiceNo,
          customerId,
          customerName,
          items: itemsToSave,
          subtotal: itemsSubtotal,
          discount: invoiceDiscountNum,
          warranty: invoiceWarranty || 'No Warranty',
          total: totalAmount,
          paidAmount,
          pendingAmount,
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
      setInvoiceDiscount(0);
      setInvoiceDiscountInput('0');
      setInvoiceWarranty('No Warranty');
      setIsCustomWarranty(false);
      setCustomWarrantyInput('');
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
      setPaidAmountInput('');
      setIsPaidAmountCustom(false);
      setInvoiceNumber('');
      setInvoiceDate(new Date().toISOString().split('T')[0]);
      setSourceQuotationId(null);
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

  // Generate HTML for Sales Invoice Printing and PDF Download
  const generateSaleInvoiceHtml = (sale: Sale): string => {
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

    const subtotal = sale.subtotal !== undefined
      ? sale.subtotal
      : (sale.items?.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0) || sale.total);
    const totalDiscount = sale.discount !== undefined
      ? sale.discount
      : (sale.items?.reduce((sum, item) => sum + (item.discount || 0), 0) || 0);
    const matchedCust = customers.find(c => c.id === sale.customerId || c.name.toLowerCase() === sale.customerName.toLowerCase());

    const salePaidDisplay = sale.paidAmount !== undefined 
      ? sale.paidAmount 
      : (sale.status === 'Paid' ? (sale.total || 0) : 0);
    const salePendingDisplay = sale.pendingAmount !== undefined 
      ? sale.pendingAmount 
      : Math.max(0, Number(((sale.total || 0) - salePaidDisplay).toFixed(2)));

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
                    <tr>
                      <td style="padding: 1px 8px 1px 0; font-weight: bold; color: #000000; white-space: nowrap; vertical-align: top;">Payment Status:</td>
                      <td style="padding: 1px 0; font-weight: 700; color: #000000; vertical-align: top;">${sale.status || 'Paid'}</td>
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
                      ${sale.warranty && sale.warranty !== 'No Warranty' ? `
                      <tr>
                        <td style="padding: 1px 8px 1px 0; font-weight: bold; color: #000000; white-space: nowrap; vertical-align: top;">Warranty:</td>
                        <td style="padding: 1px 0; font-weight: 700; color: #000000; vertical-align: top;">${sale.warranty}</td>
                      </tr>
                      ` : ''}
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
                <td style="padding-top: 8px; color: #000000; font-weight: 900; font-size: 20px;">Total Amount:</td>
                <td style="text-align: right; padding-top: 8px; color: #000000; font-weight: 900; font-size: 20px;">PKR ${sale.total?.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="color: #000000; font-weight: bold; font-size: 18px; padding: 6px 0;">Paid Amount:</td>
                <td style="text-align: right; font-weight: bold; color: #000000; font-size: 18px; padding: 6px 0;">PKR ${salePaidDisplay.toFixed(2)}</td>
              </tr>
              <tr style="border-top: 1.5px dashed #000000;">
                <td style="padding-top: 6px; color: #000000; font-weight: 900; font-size: 18px;">Amount Pending:</td>
                <td style="text-align: right; padding-top: 6px; color: #000000; font-weight: 900; font-size: 18px;">PKR ${salePendingDisplay.toFixed(2)}</td>
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

    return htmlContent;
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

    const htmlContent = generateSaleInvoiceHtml(sale);

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

  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

  // Download Sales Invoice as high-quality PDF
  const handleDownloadInvoice = async (sale: Sale) => {
    try {
      const idKey = sale.id || sale.invoiceNo || 'draft';
      setDownloadingInvoiceId(idKey);
      toast.info(`Preparing PDF for Invoice #${sale.invoiceNo}...`);
      const htmlContent = generateSaleInvoiceHtml(sale);
      const safeCustomerName = (sale.customerName || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `Invoice_${sale.invoiceNo}_${safeCustomerName}`;
      await downloadHtmlAsPdf(htmlContent, filename);
      toast.success(`Invoice #${sale.invoiceNo} downloaded successfully!`);
    } catch (err) {
      console.error('Failed to download invoice PDF:', err);
      toast.error('Failed to download invoice PDF');
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    const saved = localStorage.getItem('pos_per_page_sales');
    return saved ? Number(saved) : 25;
  });

  const handleItemsPerPageChange = (val: number) => {
    setItemsPerPage(val);
    localStorage.setItem('pos_per_page_sales', String(val));
  };

  const filteredSales = sales.filter(s => {
    const matchesSearch = 
      s.invoiceNo?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.customerName?.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (statusFilter === 'Paid') return s.status === 'Paid';
    if (statusFilter === 'Pending') return s.status === 'Pending';
    if (statusFilter === 'Returns') return s.returns && s.returns.length > 0;
    return true;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const paginatedSales = useMemo(() => {
    if (itemsPerPage === -1) return filteredSales;
    const totalPages = Math.max(1, Math.ceil(filteredSales.length / itemsPerPage));
    const page = Math.min(Math.max(1, currentPage), totalPages);
    const start = (page - 1) * itemsPerPage;
    return filteredSales.slice(start, start + itemsPerPage);
  }, [filteredSales, currentPage, itemsPerPage]);

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
        discount: 0,
        warranty: invoiceWarranty || 'No Warranty',
        subtotal: (item.quantity || 1) * (item.salePrice || 0),
        selectedSerials: item.selectedSerials.map(sId => {
          const sn = allSerials.find(s => s.id === sId);
          return sn ? sn.serialNumber : sId;
        })
      };
    });

    const groupedDraftItems = groupSaleItemsForPrint(draftItems.filter(item => item.productId));

    const draftSubtotal = draftItems.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0);
    const draftTotalDiscount = Number(invoiceDiscount) || 0;
    const draftTotal = Math.max(0, draftSubtotal - draftTotalDiscount);

    const currentDraftSale: Sale = {
      id: editingSale?.id || 'draft-invoice',
      invoiceNo: currentInvoiceNo,
      customerId: currentCustomer.id,
      customerName: currentCustomer.name,
      items: groupedDraftItems,
      subtotal: draftSubtotal,
      discount: draftTotalDiscount,
      warranty: invoiceWarranty || 'No Warranty',
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
              
              {/* Stacked Layout: 1) Invoice Information Horizontally on Top, 2) ITEMS Underneath Full Width */}
              <div className="space-y-6">
                
                {/* 1. TOP SECTION: Invoice Information (Displayed Horizontally Across Top) */}
                <div className="w-full bg-[#f8faf9] p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                  {/* Top Bar of Invoice Information */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#0a382c]" />
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        Invoice Information
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {invoiceWarranty && invoiceWarranty !== 'No Warranty' && (
                        <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                          <span>Warranty: {invoiceWarranty}</span>
                        </span>
                      )}
                      {Number(invoiceDiscount) > 0 && (
                        <span className="text-[11px] font-bold text-rose-800 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                          <Tag className="w-3.5 h-3.5 text-rose-600" />
                          <span>Discount: -PKR {Number(invoiceDiscount).toFixed(2)}</span>
                        </span>
                      )}
                      <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                        invoiceStatus === 'Paid'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : invoiceStatus === 'Partial'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}>
                        {invoiceStatus}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-full shadow-2xs">
                        Net Total: <strong className="text-[#0a382c]">PKR {calculateInvoiceTotal().toFixed(2)}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Row 1: Primary Identification (Invoice Number, Date, Customer & Warranty) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 items-start">
                    {/* Invoice Number */}
                    <div className="lg:col-span-2 space-y-1">
                      <label htmlFor="invoiceNumberInput" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <Hash className="w-3.5 h-3.5 text-slate-400" />
                        <span>Invoice No</span>
                      </label>
                      <input
                        id="invoiceNumberInput"
                        type="text"
                        required
                        className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-900 bg-white border border-slate-200 focus:border-[#0a382c]"
                        value={invoiceNumber || (editingSale ? editingSale.invoiceNo : getNextInvoiceNumber())}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        placeholder="e.g. INV-2026-0001"
                      />
                    </div>

                    {/* Invoice Date */}
                    <div className="lg:col-span-2 space-y-1">
                      <label htmlFor="invoiceDateInput" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Date</span>
                      </label>
                      <input
                        id="invoiceDateInput"
                        type="date"
                        required
                        className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 bg-white border border-slate-200 focus:border-[#0a382c]"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                      />
                    </div>

                    {/* Customer Selection - Searchable Input with Dropdown & Selected Details */}
                    <div className="sm:col-span-2 lg:col-span-4 space-y-1 relative" ref={customerDropdownRef}>
                      <div className="flex items-center justify-between">
                        <label htmlFor="customerSearchInput" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-500" />
                          <span>Select Customer</span>
                        </label>
                        {selectedCustomerId === 'walk-in' ? (
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            Walk-In Customer
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
                          placeholder="Search customer name or phone..."
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
                          className="glass-input block w-full pl-8 pr-7 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:border-[#0a382c] focus:ring-2 focus:ring-[#0a382c]/10"
                        />
                        {customerSearchInput && customerSearchInput !== 'Walk In Customer' && (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomerSearchInput('');
                              setSelectedCustomerId('walk-in');
                              setIsCustomerDropdownOpen(true);
                            }}
                            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
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

                      {/* Selected Customer Details Bar */}
                      {selectedCustomerId !== 'walk-in' && (() => {
                        const selectedCust = customers.find(c => c.id === selectedCustomerId);
                        if (!selectedCust) {
                          return (
                            <div className="mt-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between shadow-2xs">
                              <span className="font-bold text-slate-900">{customerSearchInput}</span>
                              <span className="text-[10px] text-slate-400 italic">Custom customer</span>
                            </div>
                          );
                        }
                        return (
                          <div className="mt-1.5 px-3 py-1.5 rounded-xl bg-white border border-emerald-200/80 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="font-bold text-slate-900">{selectedCust.name}</span>
                              {selectedCust.mobile && (
                                <span className="text-slate-600 flex items-center gap-1 font-mono">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  {selectedCust.mobile}
                                </span>
                              )}
                              {(selectedCust.address || selectedCust.city) && (
                                <span className="text-slate-500 truncate max-w-xs">
                                  {[selectedCust.address, selectedCust.city].filter(Boolean).join(', ')}
                                </span>
                              )}
                            </div>
                            {selectedCust.balance !== undefined && (
                              <div className="flex items-center gap-1 text-[11px] shrink-0 font-medium">
                                <span className="text-slate-500">Balance:</span>
                                <span className={`font-mono font-bold ${selectedCust.balance > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                                  PKR {Number(selectedCust.balance).toFixed(2)}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Warranty - Global Invoice Warranty */}
                    <div className="sm:col-span-2 lg:col-span-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <label htmlFor="invoiceWarrantySelect" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                          <span>Warranty</span>
                        </label>
                        {invoiceWarranty && invoiceWarranty !== 'No Warranty' && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <select
                          id="invoiceWarrantySelect"
                          className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 bg-white border border-slate-200 focus:border-[#0a382c] cursor-pointer"
                          value={isCustomWarranty ? 'Custom Warranty' : invoiceWarranty}
                          onChange={(e) => handleInvoiceWarrantyChange(e.target.value)}
                        >
                          <option value="No Warranty">No Warranty</option>
                          <option value="7 Days Checking Warranty">7 Days Checking Warranty</option>
                          <option value="1 Month Warranty">1 Month Warranty</option>
                          <option value="3 Months Warranty">3 Months Warranty</option>
                          <option value="6 Months Warranty">6 Months Warranty</option>
                          <option value="1 Year Warranty">1 Year Warranty</option>
                          <option value="2 Years Warranty">2 Years Warranty</option>
                          <option value="3 Years Warranty">3 Years Warranty</option>
                          <option value="Lifetime Warranty">Lifetime Warranty</option>
                          <option value="Custom Warranty">Custom Warranty...</option>
                        </select>
                        {isCustomWarranty && (
                          <div className="relative">
                            <input
                              type="text"
                              value={customWarrantyInput}
                              onChange={(e) => handleCustomWarrantyInputChange(e.target.value)}
                              placeholder="Enter custom warranty (e.g. 45 Days, 18 Months)..."
                              className="glass-input block w-full py-1.5 px-3 pr-7 text-xs font-bold text-amber-900 bg-amber-50/50 border border-amber-300 rounded-xl focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setIsCustomWarranty(false);
                                setCustomWarrantyInput('');
                                setInvoiceWarranty('No Warranty');
                              }}
                              className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                              title="Reset warranty"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Financials & Settlement (Subtotal, Discount, Net Total, Payment Mode, Status, Paid & Pending) */}
                  <div className="pt-3 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-12 gap-3.5 items-end">
                    {/* Items Subtotal */}
                    <div className="lg:col-span-2 space-y-1">
                      <span className="text-xs font-bold text-slate-700 block">
                        Items Subtotal
                      </span>
                      <div className="font-mono font-bold text-xs text-slate-700 bg-white py-2 px-3 rounded-xl border border-slate-200">
                        PKR {calculateItemsSubtotal().toFixed(2)}
                      </div>
                    </div>

                    {/* Invoice Discount (Global) */}
                    <div className="lg:col-span-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <label htmlFor="invoiceDiscountInput" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          <Tag className="w-3.5 h-3.5 text-rose-500" />
                          <span>Discount (PKR)</span>
                        </label>
                        {Number(invoiceDiscount) > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setInvoiceDiscount(0);
                              setInvoiceDiscountInput('0');
                            }}
                            className="text-[10px] text-rose-600 hover:text-rose-800 font-bold hover:underline cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <input
                        id="invoiceDiscountInput"
                        type="number"
                        min="0"
                        step="0.01"
                        max={calculateItemsSubtotal()}
                        className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-mono font-bold text-rose-700 bg-white border border-slate-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                        value={invoiceDiscountInput}
                        onChange={(e) => handleInvoiceDiscountChange(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>

                    {/* Net Total Amount */}
                    <div className="lg:col-span-2 space-y-1">
                      <span className="text-xs font-bold text-slate-700 block">
                        Net Total
                      </span>
                      <div className="font-mono font-black text-xs text-[#0a382c] bg-emerald-50/60 py-2 px-3 rounded-xl border border-emerald-200">
                        PKR {calculateInvoiceTotal().toFixed(2)}
                      </div>
                    </div>

                    {/* Payment Mode */}
                    <div className={`${paymentMode === 'Online' ? 'lg:col-span-1' : 'lg:col-span-2'} space-y-1`}>
                      <label htmlFor="paymentModeSelect" className="text-xs font-bold text-slate-700">
                        Mode
                      </label>
                      <select
                        id="paymentModeSelect"
                        className="glass-input block w-full rounded-xl py-2 px-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 focus:border-[#0a382c]"
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

                    {/* Bank Account Selection (Visible if Online) */}
                    {paymentMode === 'Online' && (
                      <div className="lg:col-span-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <label htmlFor="bankAccountSelect" className="text-xs font-bold text-slate-700 truncate">
                            Bank <span className="text-red-500">*</span>
                          </label>
                          {selectedBankAccNumber && (() => {
                            const chosenAcc = storeDetails.bankAccounts?.find(a => a.accountNumber === selectedBankAccNumber);
                            if (!chosenAcc) return null;
                            const currentBal = chosenAcc.balance !== undefined ? chosenAcc.balance : (chosenAcc.openingBalance || 0);
                            return (
                              <span className="text-[10px] font-mono font-bold text-[#0a382c] truncate">
                                Bal: PKR {currentBal.toFixed(0)}
                              </span>
                            );
                          })()}
                        </div>
                        {storeDetails.bankAccounts && storeDetails.bankAccounts.length > 0 ? (
                          <select
                            id="bankAccountSelect"
                            required={paymentMode === 'Online'}
                            className="glass-input block w-full rounded-xl py-2 px-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200"
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
                          <div className="py-2 px-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-bold truncate">
                            No banks
                          </div>
                        )}
                      </div>
                    )}

                    {/* Payment Status Dropdown */}
                    <div className="lg:col-span-1 space-y-1">
                      <label htmlFor="statusSelect" className="text-xs font-bold text-slate-700">
                        Status
                      </label>
                      <select
                        id="statusSelect"
                        className="glass-input block w-full rounded-xl py-2 px-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 focus:border-[#0a382c]"
                        value={invoiceStatus}
                        onChange={(e) => handleInvoiceStatusChange(e.target.value as 'Paid' | 'Partial' | 'Pending')}
                      >
                        <option value="Paid">Paid</option>
                        <option value="Partial">Partial</option>
                        <option value="Pending">Pending</option>
                      </select>
                    </div>

                    {/* Paid Amount Input + Quick Presets */}
                    <div className="lg:col-span-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <label htmlFor="paidAmountInput" className="text-xs font-bold text-slate-700">
                          Paid Amount
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const tot = calculateInvoiceTotal();
                              setPaidAmountInput(String(tot));
                              setIsPaidAmountCustom(true);
                              setInvoiceStatus('Paid');
                            }}
                            className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-50 text-[#0a382c] border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                          >
                            100%
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const half = Number((calculateInvoiceTotal() / 2).toFixed(2));
                              setPaidAmountInput(String(half));
                              setIsPaidAmountCustom(true);
                              setInvoiceStatus(half > 0 ? 'Partial' : 'Pending');
                            }}
                            className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                          >
                            50%
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPaidAmountInput('0');
                              setIsPaidAmountCustom(true);
                              setInvoiceStatus('Pending');
                            }}
                            className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
                          >
                            0
                          </button>
                        </div>
                      </div>
                      <input
                        id="paidAmountInput"
                        type="number"
                        min="0"
                        step="0.01"
                        max={calculateInvoiceTotal()}
                        className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-mono font-bold text-emerald-800 bg-white border border-slate-200 focus:border-[#0a382c]"
                        value={isPaidAmountCustom ? paidAmountInput : getInvoicePaidAndPending(calculateInvoiceTotal()).paid}
                        onChange={(e) => handlePaidAmountChange(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>

                    {/* Amount Pending Display */}
                    <div className={`${paymentMode === 'Online' ? 'lg:col-span-2' : 'lg:col-span-2'} space-y-1`}>
                      <span className="text-xs font-bold text-slate-700 block">
                        Amount Pending
                      </span>
                      <div className={`font-mono font-black text-xs py-2 px-3 rounded-xl border flex items-center justify-between ${
                        getInvoicePaidAndPending(calculateInvoiceTotal()).pending > 0 
                          ? 'bg-rose-50 text-rose-700 border-rose-200' 
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}>
                        <span>PKR {getInvoicePaidAndPending(calculateInvoiceTotal()).pending.toFixed(2)}</span>
                        {getInvoicePaidAndPending(calculateInvoiceTotal()).pending > 0 ? (
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">Due</span>
                        ) : (
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">Cleared</span>
                        )}
                      </div>
                    </div>

                    {/* Pending Ledger Notice if any */}
                    {getInvoicePaidAndPending(calculateInvoiceTotal()).pending > 0 && (
                      <div className="col-span-full text-[11px] text-amber-800 bg-amber-50 border border-amber-200 py-1.5 px-3 rounded-xl flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>
                          {selectedCustomerId && selectedCustomerId !== 'walk-in'
                            ? `* PKR ${getInvoicePaidAndPending(calculateInvoiceTotal()).pending.toFixed(2)} will be added to ${customerSearchInput}'s customer balance.`
                            : '* Pending amount will not be added to customer ledger for Walk-in customer.'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. UNDER IT: ITEMS (Full Width with complete product details and visible actions without scroll bar) */}
                <div className="w-full bg-[#f8faf9] p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
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
                          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-xl text-xs font-black transition-all shadow-xs shrink-0 cursor-pointer"
                          title="Open device camera to scan product barcodes"
                        >
                          <Camera className="w-4 h-4" />
                          <span>Scan with Camera</span>
                        </button>
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

                  {/* List of Selected Items - Full width, product details displayed fully, edit and delete actions visible without scroll bar */}
                  <div className="space-y-2 pt-1">
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
                      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                        <div className="w-full overflow-x-auto lg:overflow-x-visible">
                          <table className="w-full text-left text-xs table-auto">
                            <thead className="bg-slate-50/90 text-slate-600 border-b border-slate-200 font-bold text-[11px] uppercase tracking-wider">
                              <tr>
                                <th className="py-3 px-3 w-10 text-center">#</th>
                                <th className="py-3 px-4">Product Details</th>
                                <th className="py-3 px-3 text-center w-24">Qty</th>
                                <th className="py-3 px-3 text-right w-32">Unit Price</th>
                                <th className="py-3 px-3 text-right w-32">Total (PKR)</th>
                                <th className="py-3 px-3 text-center w-36 whitespace-nowrap">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {invoiceItems.map((item, index) => {
                                const selectedProduct = products.find(p => p.id === item.productId);
                                const isSerialized = Boolean(item.selectedSerials && item.selectedSerials.length > 0);
                                const serialDoc = isSerialized ? allSerials.find(s => item.selectedSerials?.includes(s.id) || item.selectedSerials?.includes(s.serialNumber)) : null;
                                const serialText = serialDoc?.serialNumber || item.selectedSerials?.[0] || '';
                                const previousQty = editingSale?.items?.find(pi => pi.productId === item.productId)?.quantity || 0;
                                const maxAllowed = (selectedProduct?.stock || 0) + previousQty;
                                const isEditing = editingInvoiceItemIndex === index;
                                const lineTotal = (item.quantity || 1) * item.salePrice;

                                return (
                                  <tr 
                                    key={index} 
                                    className={`transition-colors ${isEditing ? 'bg-amber-50/40' : 'hover:bg-slate-50/60'}`}
                                  >
                                    {/* 1. Item Index */}
                                    <td className="py-3 px-3 text-center font-bold text-slate-400">
                                      #{index + 1}
                                    </td>

                                    {/* 2. Product Details (Fully displayed with serial badge, name, brand, model & category) */}
                                    <td className="py-3 px-4">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {isSerialized ? (
                                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-[#0a382c] border border-emerald-200 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold shrink-0">
                                            <Barcode className="w-3.5 h-3.5 text-[#0a382c]" />
                                            {serialText}
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-800 border border-sky-200 px-2 py-0.5 rounded-md text-[11px] font-bold shrink-0">
                                            <Package className="w-3.5 h-3.5 text-sky-600" />
                                            Non-Serial
                                          </span>
                                        )}
                                        <span className="font-bold text-slate-900 text-xs">
                                          {selectedProduct?.name || 'Product'}
                                        </span>
                                        {(selectedProduct?.brand || selectedProduct?.modelNumber) && (
                                          <span className="text-[11px] text-slate-500 font-normal">
                                            ({[selectedProduct?.brand, selectedProduct?.modelNumber].filter(Boolean).join(' • ')})
                                          </span>
                                        )}
                                        {selectedProduct?.category && (
                                          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-medium">
                                            {selectedProduct.category}
                                          </span>
                                        )}
                                      </div>
                                    </td>

                                    {/* 3. Quantity */}
                                    <td className="py-3 px-3 text-center whitespace-nowrap">
                                      {isEditing && !isSerialized ? (
                                        <div className="inline-flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white shadow-2xs">
                                          <button
                                            type="button"
                                            onClick={() => handleItemQuantityChange(index, Math.max(1, (item.quantity || 1) - 1))}
                                            disabled={(item.quantity || 1) <= 1}
                                            className="px-1.5 py-0.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                                            title="Decrease"
                                          >
                                            <Minus className="w-3 h-3" />
                                          </button>
                                          <input
                                            type="number"
                                            min="1"
                                            max={maxAllowed > 0 ? maxAllowed : undefined}
                                            value={item.quantity || 1}
                                            onChange={(e) => handleItemQuantityChange(index, parseInt(e.target.value) || 1)}
                                            className="w-10 text-center py-0.5 text-xs font-bold text-slate-900 border-x border-slate-200 focus:outline-none"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleItemQuantityChange(index, (item.quantity || 1) + 1)}
                                            disabled={maxAllowed > 0 && (item.quantity || 1) >= maxAllowed}
                                            className="px-1.5 py-0.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                                            title="Increase"
                                          >
                                            <Plus className="w-3 h-3" />
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                                          {item.quantity || 1} {selectedProduct?.unit || ''}
                                        </span>
                                      )}
                                    </td>

                                    {/* 4. Unit Price */}
                                    <td className="py-3 px-3 text-right whitespace-nowrap">
                                      {isEditing ? (
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={item.salePrice === 0 ? '' : item.salePrice}
                                          onChange={(e) => handleItemPriceChange(index, parseFloat(e.target.value) || 0)}
                                          className="w-24 px-2 py-1 text-right text-xs font-mono font-bold border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#0a382c] bg-white"
                                          placeholder="0.00"
                                        />
                                      ) : (
                                        <span className="font-mono font-bold text-slate-900">
                                          PKR {Number(item.salePrice || 0).toFixed(2)}
                                        </span>
                                      )}
                                    </td>

                                    {/* 5. Line Total */}
                                    <td className="py-3 px-3 text-right whitespace-nowrap">
                                      <span className="font-mono font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                                        PKR {lineTotal.toFixed(2)}
                                      </span>
                                    </td>

                                    {/* 6. Actions (Edit and Delete fully visible without scroll bar) */}
                                    <td className="py-3 px-3 text-center whitespace-nowrap">
                                      <div className="flex items-center justify-center gap-1.5">
                                        {isEditing ? (
                                          <button
                                            type="button"
                                            onClick={() => setEditingInvoiceItemIndex(null)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-[#0a382c] hover:bg-[#0d4a3b] rounded-lg transition-colors cursor-pointer shadow-2xs"
                                            title="Done editing"
                                          >
                                            <Check className="w-3.5 h-3.5" />
                                            <span>Done</span>
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setEditingInvoiceItemIndex(index)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-amber-700 hover:text-amber-900 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                            title="Edit product details"
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                            <span>Edit</span>
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveItemRow(index)}
                                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                          title="Delete product"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                          <span>Delete</span>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
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

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadInvoice(currentDraftSale)}
                      disabled={draftTotal <= 0 || downloadingInvoiceId === (currentDraftSale.id || currentDraftSale.invoiceNo || 'draft')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-xl text-xs font-bold shadow-2xs transition-colors disabled:opacity-40 cursor-pointer"
                      title="Download this invoice preview as PDF"
                    >
                      {downloadingInvoiceId === (currentDraftSale.id || currentDraftSale.invoiceNo || 'draft') ? (
                        <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      Download PDF
                    </button>
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
                        <div className="flex items-baseline gap-2">
                          <span className="font-bold text-black min-w-[90px]">Payment Status:</span>
                          <span className="font-bold text-black">{invoiceStatus}</span>
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
                          {invoiceWarranty && invoiceWarranty !== 'No Warranty' && (
                            <div className="flex items-baseline gap-2">
                              <span className="font-bold text-black min-w-[80px]">Warranty:</span>
                              <span className="font-bold text-black">{invoiceWarranty}</span>
                            </div>
                          )}
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
                      <div className="w-80 sm:w-96 space-y-2 text-black">
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
                            Total Amount:
                          </span>
                          <span className="font-black font-mono text-lg sm:text-xl text-black">
                            PKR {draftTotal.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between font-bold text-black text-base sm:text-lg">
                          <span>Paid Amount:</span>
                          <span className="font-mono font-bold">
                            PKR {getInvoicePaidAndPending(draftTotal).paid.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-1.5 border-t border-dashed border-black font-black text-base sm:text-lg">
                          <span>Amount Pending:</span>
                          <span className="font-mono font-black">
                            PKR {getInvoicePaidAndPending(draftTotal).pending.toFixed(2)}
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

        {/* Sales Camera Barcode / Serial Scanner Modal */}
        <BarcodeScannerModal
          isOpen={showSalesCameraScanner}
          onClose={() => {
            setShowSalesCameraScanner(false);
            setActiveScanningItemIndex(null);
          }}
          onScan={handleScanSerialNumber}
          title={
            productSelectionMode === 'without_serial'
              ? 'Scan Product Barcode'
              : 'Scan Barcode or Serial Number'
          }
          subtitle="Point device camera at barcodes or QR labels to automatically add units to invoice."
          continuous={true}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Sales Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">Manage sales receipts, process customer returns, and track performance</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button 
            type="button"
            onClick={() => {
              setReturnInvoiceSearch('');
              setShowSelectReturnInvoiceModal(true);
            }}
            className="flex items-center px-4 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-xl shadow-xs transition-colors text-sm font-bold cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 mr-2 text-purple-700" />
            Return Items
          </button>
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
            className="flex items-center px-4 py-2.5 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl shadow-md shadow-emerald-950/10 transition-colors text-sm font-bold cursor-pointer"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Invoice
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-2xl shadow-sm overflow-hidden bg-white">
        <div className="p-4 border-b border-slate-150 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative max-w-sm w-full">
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

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setStatusFilter('All')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === 'All'
                  ? 'bg-[#0a382c] text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              All ({sales.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('Paid')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === 'Paid'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Paid ({sales.filter(s => s.status === 'Paid').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('Pending')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === 'Pending'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Pending ({sales.filter(s => s.status === 'Pending').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('Returns')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                statusFilter === 'Returns'
                  ? 'bg-purple-700 text-white shadow-2xs'
                  : 'bg-white text-purple-700 hover:bg-purple-50 border border-purple-200'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              With Returns ({sales.filter(s => s.returns && s.returns.length > 0).length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-slate-100">
            <thead className="bg-[#f8faf9]">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Invoice & Customer</th>
                <th scope="col" className="px-3 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-28 sm:w-36">Status</th>
                <th scope="col" className="px-3 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-36 sm:w-44">Amount Details</th>
                <th scope="col" className="px-3 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider w-36 sm:w-44">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a382c] mx-auto"></div>
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic text-sm bg-white">
                    No sales invoices found. Create a new invoice to get started.
                  </td>
                </tr>
              ) : (
                paginatedSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-[#f8faf9] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-start">
                        <div className="h-8 w-8 flex-shrink-0 bg-emerald-50 border border-emerald-100 text-[#0a382c] rounded-lg flex items-center justify-center mt-0.5">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="ml-2.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-slate-900 font-mono">{sale.invoiceNo}</span>
                            <span className="text-slate-300 font-bold">•</span>
                            <span className="text-sm font-bold text-slate-900">{sale.customerName}</span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              {sale.date ? new Date(sale.date).toLocaleDateString() : 'N/A'}
                            </span>
                            {sale.items && sale.items.length > 0 && (
                              <span className="text-slate-400 font-medium">
                                • {sale.items.length} item(s)
                              </span>
                            )}
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                              sale.paymentMode === 'Online'
                                ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                : 'bg-amber-50 text-amber-800 border border-amber-100'
                            }`}>
                              {sale.paymentMode === 'Online' ? <Globe className="w-2.5 h-2.5 text-blue-600" /> : <Banknote className="w-2.5 h-2.5 text-amber-600" />}
                              {sale.paymentMode || 'Cash'}
                              {sale.paymentMode === 'Online' && sale.bankName && (
                                <span className="text-[9px] font-medium text-blue-600 max-w-[80px] truncate">({sale.bankName})</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`px-2.5 py-0.5 inline-flex text-[10px] leading-4 font-black rounded-full uppercase tracking-wider ${
                          sale.status === 'Pending'
                            ? 'bg-amber-50 border border-amber-200 text-amber-800'
                            : sale.status === 'Returned'
                              ? 'bg-rose-50 border border-rose-200 text-rose-800'
                              : 'bg-emerald-50 border border-emerald-150 text-emerald-800'
                        }`}>
                          {sale.status || 'Paid'}
                        </span>
                        {sale.returns && sale.returns.length > 0 && (
                          <span className={`px-2 py-0.5 inline-flex items-center gap-1 text-[9.5px] font-bold rounded-md ${
                            sale.returnStatus === 'Fully Returned'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-purple-50 text-purple-700 border border-purple-200'
                          }`}>
                            <RotateCcw className="w-2.5 h-2.5" />
                            {sale.returnStatus || 'Returned'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-mono text-sm font-black text-slate-900">
                        PKR {sale.total?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-[11px] font-bold text-emerald-700 mt-0.5">
                        Paid: PKR {(sale.paidAmount !== undefined ? sale.paidAmount : (sale.status === 'Paid' ? sale.total : 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {(sale.pendingAmount !== undefined ? sale.pendingAmount : (sale.status === 'Pending' ? sale.total : 0)) > 0 && (
                        <div className="text-[11px] font-bold text-amber-700">
                          Pending: PKR {(sale.pendingAmount !== undefined ? sale.pendingAmount : (sale.status === 'Pending' ? sale.total : 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      )}
                      {sale.totalRefunded && sale.totalRefunded > 0 ? (
                        <div className="text-[10px] font-bold text-purple-700">
                          Refunded: PKR {sale.totalRefunded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          onClick={() => {
                            setSelectedSale(sale);
                            setShowDetailModal(true);
                          }}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="View Receipt"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => printInvoice(sale)}
                          className="p-1.5 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                          title="Print Invoice"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDownloadInvoice(sale)}
                          disabled={downloadingInvoiceId === (sale.id || sale.invoiceNo)}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                          title="Download Invoice (PDF)"
                        >
                          {downloadingInvoiceId === (sale.id || sale.invoiceNo) ? (
                            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </button>
                        <button 
                          onClick={() => {
                            setReturnSale(sale);
                            setShowReturnModal(true);
                          }}
                          className="p-1.5 text-purple-700 hover:text-purple-900 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer"
                          title="Return Items / Process Refund"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleEditClick(sale)}
                          className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                          title="Edit Invoice"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteInvoice(sale)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete Invoice"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalItems={filteredSales.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={handleItemsPerPageChange}
          itemName="sales invoices"
        />
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
                                {item.returnedQuantity && item.returnedQuantity > 0 ? (
                                  <div className="text-[10px] text-purple-800 font-bold mt-1 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 inline-block">
                                    Returned: {item.returnedQuantity} of {item.quantity}
                                    {item.returnedSerials && item.returnedSerials.length > 0 && ` (S/N: ${item.returnedSerials.join(', ')})`}
                                  </div>
                                ) : null}
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
                      <span>Total Amount:</span>
                      <span className="font-mono">PKR {selectedSale.total?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-black text-base sm:text-lg">
                      <span>Paid Amount:</span>
                      <span className="font-mono font-bold text-emerald-800">
                        PKR {(selectedSale.paidAmount !== undefined ? selectedSale.paidAmount : (selectedSale.status === 'Paid' ? selectedSale.total : 0)).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center font-black text-black text-base sm:text-lg border-t border-dashed border-black pt-1.5">
                      <span>Amount Pending:</span>
                      <span className={`font-mono font-black ${(selectedSale.pendingAmount !== undefined ? selectedSale.pendingAmount : (selectedSale.status === 'Pending' ? selectedSale.total : 0)) > 0 ? 'text-amber-900' : 'text-slate-900'}`}>
                        PKR {(selectedSale.pendingAmount !== undefined ? selectedSale.pendingAmount : (selectedSale.status === 'Pending' ? selectedSale.total : 0)).toFixed(2)}
                      </span>
                    </div>
                    {selectedSale.totalRefunded && selectedSale.totalRefunded > 0 ? (
                      <>
                        <div className="flex justify-between font-bold text-purple-900 text-sm sm:text-base border-t border-purple-200 pt-1.5">
                          <span>Total Refunded:</span>
                          <span className="font-mono font-bold">- PKR {selectedSale.totalRefunded.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-black text-black text-base sm:text-lg">
                          <span>Net Adjusted:</span>
                          <span className="font-mono">PKR {Math.max(0, (selectedSale.total || 0) - (selectedSale.totalRefunded || 0)).toFixed(2)}</span>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>

                {/* Returns & Refunds History if any returns exist */}
                {selectedSale.returns && selectedSale.returns.length > 0 && (
                  <div className="pt-3 border-t-2 border-black text-left">
                    <h4 className="text-[10px] font-black text-purple-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5 text-purple-700" />
                      Sales Returns & Refunds History ({selectedSale.returns.length})
                    </h4>
                    <div className="space-y-2">
                      {selectedSale.returns.map((ret, idx) => (
                        <div key={idx} className="p-3 bg-purple-50/80 border border-purple-200 rounded-xl text-xs space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-purple-950">{ret.id}</span>
                              <span className="text-slate-400">•</span>
                              <span className="text-slate-700 font-semibold">{new Date(ret.returnDate).toLocaleDateString()}</span>
                              <span className="text-slate-400">•</span>
                              <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[10px]">
                                {ret.refundMode} {ret.bankName ? `(${ret.bankName})` : ''}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {ret.restocked ? '(Restocked)' : '(Not Restocked)'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-black font-mono text-purple-950">
                                Refunded: PKR {ret.totalRefund.toFixed(2)}
                              </span>
                              <button
                                type="button"
                                onClick={() => printReturnReceipt(selectedSale, ret, storeDetails)}
                                className="px-2 py-1 bg-white border border-purple-300 hover:bg-purple-100 text-purple-800 font-bold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                                title="Print Return Voucher"
                              >
                                <Printer className="w-3 h-3 text-purple-700" />
                                Print Voucher
                              </button>
                            </div>
                          </div>
                          <div className="text-[11px] text-slate-700">
                            <strong className="text-purple-900">Reason:</strong> {ret.reason} {ret.notes ? `— ${ret.notes}` : ''}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            <strong className="text-slate-800">Returned Items: </strong>
                            {ret.items.map((it, itIdx) => (
                              <span key={itIdx} className="inline-block mr-2 font-medium">
                                {it.productName} (x{it.quantity})
                                {it.returnedSerials && it.returnedSerials.length > 0 && ` [S/N: ${it.returnedSerials.join(', ')}]`}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
                    onClick={() => {
                      setReturnSale(selectedSale);
                      setShowReturnModal(true);
                    }}
                    className="px-4 py-2.5 bg-purple-750 hover:bg-purple-850 text-white font-bold rounded-xl text-xs shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Return Items
                  </button>
                  <button 
                    onClick={() => printInvoice(selectedSale)}
                    className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    Print Invoice
                  </button>
                  <button 
                    onClick={() => handleDownloadInvoice(selectedSale)}
                    disabled={downloadingInvoiceId === (selectedSale.id || selectedSale.invoiceNo)}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {downloadingInvoiceId === (selectedSale.id || selectedSale.invoiceNo) ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Download Invoice
                  </button>
                  <button 
                    onClick={() => setShowDetailModal(false)}
                    className="px-5 py-2.5 bg-slate-950 hover:bg-slate-900 text-white font-bold rounded-xl text-xs shadow-md transition-colors cursor-pointer"
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

      {/* Select Invoice to Process Return Modal */}
      {showSelectReturnInvoiceModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div 
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity" 
              onClick={() => setShowSelectReturnInvoiceModal(false)} 
            />
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
            <div className="relative z-10 inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full border border-slate-200">
              <div className="bg-purple-900 px-6 py-4 text-white flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-white/10 rounded-xl">
                    <RotateCcw className="w-5 h-5 text-purple-200" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight">Select Invoice to Return</h3>
                    <p className="text-xs text-purple-200">Choose an existing invoice to process returned items and refunds</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSelectReturnInvoiceModal(false)}
                  className="p-1.5 rounded-lg text-purple-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search invoice number, customer name..."
                    value={returnInvoiceSearch}
                    onChange={(e) => setReturnInvoiceSearch(e.target.value)}
                    className="glass-input w-full pl-10 pr-4 py-2.5 rounded-xl text-sm font-medium"
                  />
                  {returnInvoiceSearch && (
                    <button
                      type="button"
                      onClick={() => setReturnInvoiceSearch('')}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Invoices List */}
                <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 border border-slate-150 rounded-xl">
                  {(() => {
                    const filtered = sales.filter(s => {
                      if (!returnInvoiceSearch.trim()) return true;
                      const q = returnInvoiceSearch.toLowerCase();
                      return (
                        s.invoiceNo?.toLowerCase().includes(q) ||
                        s.customerName?.toLowerCase().includes(q) ||
                        s.paymentMode?.toLowerCase().includes(q)
                      );
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="p-8 text-center text-slate-400 text-sm italic">
                          No matching invoices found.
                        </div>
                      );
                    }

                    return filtered.map((s) => {
                      const isFullyReturned = s.returnStatus === 'Fully Returned';
                      const itemsCount = s.items?.length || 0;
                      return (
                        <div
                          key={s.id}
                          onClick={() => {
                            if (isFullyReturned) return;
                            setShowSelectReturnInvoiceModal(false);
                            setReturnSale(s);
                            setShowReturnModal(true);
                          }}
                          className={`p-4 flex items-center justify-between gap-4 transition-colors ${
                            isFullyReturned 
                              ? 'bg-slate-50 opacity-60 cursor-not-allowed' 
                              : 'hover:bg-purple-50/50 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-100 text-purple-800 shrink-0 mt-0.5">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900 text-sm">{s.invoiceNo}</span>
                                <span className="text-xs text-slate-400">•</span>
                                <span className="text-xs text-slate-600 font-semibold">{s.customerName}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500">
                                <span>{s.date ? new Date(s.date).toLocaleDateString() : 'N/A'}</span>
                                <span>•</span>
                                <span>{itemsCount} item{itemsCount !== 1 ? 's' : ''}</span>
                                <span>•</span>
                                <span className="font-medium text-slate-700">{s.paymentMode || 'Cash'}</span>
                                {s.returns && s.returns.length > 0 && (
                                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                    isFullyReturned ? 'bg-rose-100 text-rose-800' : 'bg-purple-100 text-purple-800'
                                  }`}>
                                    {s.returnStatus || 'Partially Returned'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="font-mono font-black text-slate-900 text-sm">
                              PKR {s.total?.toFixed(2)}
                            </div>
                            {s.totalRefunded && s.totalRefunded > 0 ? (
                              <div className="text-[10px] font-bold text-purple-700 mt-0.5">
                                Refunded: PKR {s.totalRefunded.toFixed(2)}
                              </div>
                            ) : null}
                            <div className="mt-1">
                              {isFullyReturned ? (
                                <span className="text-[10px] font-bold text-slate-400">
                                  Fully Returned
                                </span>
                              ) : (
                                <span className="text-xs font-bold text-purple-700 hover:text-purple-900">
                                  Select &rarr;
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="bg-slate-50 px-6 py-3 border-t border-slate-150 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowSelectReturnInvoiceModal(false)}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sales Return & Refund Modal */}
      <SalesReturnModal
        isOpen={showReturnModal}
        onClose={() => {
          setShowReturnModal(false);
          setReturnSale(null);
        }}
        sale={returnSale}
        storeId={storeId}
        products={products}
        customers={customers}
        allSerials={allSerials}
        storeDetails={storeDetails}
        onSuccess={() => {
          // If the detail modal was viewing the returned sale, it will automatically reflect the update via firestore snapshot
        }}
      />
    </div>
  );
}
