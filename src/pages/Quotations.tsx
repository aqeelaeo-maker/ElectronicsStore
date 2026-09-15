import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc,
  deleteDoc, 
  updateDoc,
  serverTimestamp, 
  query, 
  where 
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
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
  Hash, 
  CheckCircle2, 
  Printer, 
  Pencil, 
  ArrowLeft, 
  Camera, 
  Barcode, 
  Package, 
  Layers, 
  Clock, 
  Send, 
  ArrowRight,
  Sparkles,
  DollarSign,
  AlertCircle
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

export interface QuotationItem {
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

export interface Quotation {
  id: string;
  quotationNo: string;
  customerId?: string | null;
  customerName: string;
  customerMobile?: string;
  customerEmail?: string;
  customerCity?: string;
  total: number;
  subtotal: number;
  totalDiscount: number;
  date: string;
  validUntil: string;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Converted';
  items: QuotationItem[];
  notes?: string;
  convertedSaleId?: string;
  convertedInvoiceNo?: string;
  storeId: string;
  createdAt?: any;
  updatedAt?: any;
}

// Group items for print / display
const groupQuotationItems = (items: QuotationItem[]): QuotationItem[] => {
  if (!items || items.length === 0) return [];
  
  const grouped: QuotationItem[] = [];
  const map = new Map<string, QuotationItem>();

  for (const item of items) {
    if (!item.productId && !item.productName) continue;
    const key = item.productId || item.productName;

    if (map.has(key)) {
      const existing = map.get(key)!;
      const addedQty = item.quantity || 1;
      const prevQty = existing.quantity || 1;
      const newQty = prevQty + addedQty;

      existing.quantity = newQty;
      existing.discount = (existing.discount || 0) + (item.discount || 0);
      existing.subtotal = (existing.subtotal || 0) + (item.subtotal || 0);

      if (existing.salePrice !== item.salePrice && newQty > 0) {
        existing.salePrice = (existing.subtotal + existing.discount) / newQty;
      }

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
      const clone: QuotationItem = {
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

export default function Quotations() {
  const { storeId } = useAuth();
  const navigate = useNavigate();

  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allSerials, setAllSerials] = useState<SerialNumber[]>([]);
  const [storeDetails, setStoreDetails] = useState<{
    name: string;
    logoUrl: string;
    phone: string;
    address: string;
    email: string;
    termsAndConditions?: string;
  }>({
    name: '',
    logoUrl: '',
    phone: '',
    address: '',
    email: '',
    termsAndConditions: ''
  });

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Draft' | 'Sent' | 'Accepted' | 'Converted' | 'Declined'>('All');

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);
  const [quoteToDelete, setQuoteToDelete] = useState<Quotation | null>(null);

  // Form states
  const [quotationNumber, setQuotationNumber] = useState('');
  const [quotationDate, setQuotationDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [validUntilDate, setValidUntilDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split('T')[0];
  });
  const [quotationStatus, setQuotationStatus] = useState<'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Converted'>('Draft');
  const [notes, setNotes] = useState('');

  // Customer state
  const [selectedCustomerId, setSelectedCustomerId] = useState('walk-in');
  const [customerSearchInput, setCustomerSearchInput] = useState('Walk In Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Items in Quotation
  const [quotationItems, setQuotationItems] = useState<Array<{
    productId: string;
    quantity: number;
    salePrice: number;
    discount: number;
    warranty: string;
    selectedSerials: string[];
  }>>([]);
  const [saving, setSaving] = useState(false);

  // Scanner & Product Selection states
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [productSelectionMode, setProductSelectionMode] = useState<'with_serial' | 'without_serial'>('with_serial');
  const [serialSearchInput, setSerialSearchInput] = useState('');
  const [isSerialDropdownOpen, setIsSerialDropdownOpen] = useState(false);
  const serialDropdownRef = useRef<HTMLDivElement>(null);
  const serialInputRef = useRef<HTMLInputElement>(null);

  const [productSearchInput, setProductSearchInput] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);

  // 1. Next Quotation Sequence
  const getNextQuotationNumber = () => {
    const currentYear = new Date().getFullYear();
    const yearQuotes = quotations.filter(q => q.quotationNo && q.quotationNo.startsWith(`QT-${currentYear}-`));
    const nextSeq = yearQuotes.length + 1;
    const paddedSeq = String(nextSeq).padStart(4, '0');
    return `QT-${currentYear}-${paddedSeq}`;
  };

  // 2. Fetch Quotations
  useEffect(() => {
    if (!storeId) return;

    const q = query(collection(db, 'quotations'), where('storeId', '==', storeId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Quotation[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Quotation);
      });

      list.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      setQuotations(list);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching quotations:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [storeId]);

  // 3. Fetch Products for lookup
  useEffect(() => {
    if (!storeId) return;

    const q = query(collection(db, 'products'), where('storeId', '==', storeId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Product[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Product);
      });
      setProducts(list);
    }, (error) => {
      console.error('Error fetching products:', error);
    });

    return () => unsubscribe();
  }, [storeId]);

  // 4. Fetch Customers for lookup
  useEffect(() => {
    if (!storeId) return;

    const q = query(collection(db, 'customers'), where('storeId', '==', storeId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Customer[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Customer);
      });
      setCustomers(list);
    }, (error) => {
      console.error('Error fetching customers:', error);
    });

    return () => unsubscribe();
  }, [storeId]);

  // 5. Fetch Serials for lookup
  useEffect(() => {
    if (!storeId) return;

    const q = query(collection(db, 'serialNumbers'), where('storeId', '==', storeId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: SerialNumber[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as SerialNumber);
      });
      setAllSerials(list);
    }, (error) => {
      console.error('Error fetching serials:', error);
    });

    return () => unsubscribe();
  }, [storeId]);

  // 6. Fetch Store Details
  useEffect(() => {
    if (!storeId) return;

    const storeRef = doc(db, 'stores', storeId);
    const unsubscribe = onSnapshot(storeRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStoreDetails({
          name: data.name || '',
          logoUrl: data.logoUrl || '',
          phone: data.phone || '',
          address: data.address || '',
          email: data.email || '',
          termsAndConditions: data.termsAndConditions || ''
        });
      }
    }, (error) => {
      console.error('Error fetching store info:', error);
    });

    return () => unsubscribe();
  }, [storeId]);

  // Outside click listeners for dropdowns
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
      if (serialDropdownRef.current && !serialDropdownRef.current.contains(e.target as Node)) {
        setIsSerialDropdownOpen(false);
      }
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target as Node)) {
        setIsProductDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Filtered customers for search
  const filteredCustomers = useMemo(() => {
    const raw = customerSearchInput.trim().toLowerCase();
    if (!raw) return customers.slice(0, 10);
    return customers.filter(c => 
      c.name.toLowerCase().includes(raw) || 
      (c.mobile && c.mobile.includes(raw)) ||
      (c.city && c.city.toLowerCase().includes(raw))
    ).slice(0, 15);
  }, [customers, customerSearchInput]);

  // Serials available for selection
  const availableSerialsInStock = useMemo(() => {
    return allSerials.filter(s => s.status === 'Available');
  }, [allSerials]);

  const alreadyAddedSerialIds = useMemo(() => {
    const ids = new Set<string>();
    quotationItems.forEach(item => {
      item.selectedSerials?.forEach(s => ids.add(s));
    });
    return ids;
  }, [quotationItems]);

  const filteredSerials = useMemo(() => {
    const raw = serialSearchInput.trim().toLowerCase();
    const candidateSerials = availableSerialsInStock.filter(s => !alreadyAddedSerialIds.has(s.id) && !alreadyAddedSerialIds.has(s.serialNumber));
    if (!raw) return candidateSerials.slice(0, 20);

    return candidateSerials.filter(s => {
      const matchSn = s.serialNumber.toLowerCase().includes(raw);
      const prod = products.find(p => p.id === s.productId);
      const matchProd = prod && (
        prod.name.toLowerCase().includes(raw) ||
        prod.brand.toLowerCase().includes(raw) ||
        prod.modelNumber.toLowerCase().includes(raw)
      );
      return matchSn || matchProd;
    }).slice(0, 25);
  }, [availableSerialsInStock, serialSearchInput, products, alreadyAddedSerialIds]);

  // Filtered products for without-serial selection
  const filteredProductsWithoutSerials = useMemo(() => {
    const raw = productSearchInput.trim().toLowerCase();
    if (!raw) return products.slice(0, 20);
    return products.filter(p => 
      p.name.toLowerCase().includes(raw) ||
      (p.brand && p.brand.toLowerCase().includes(raw)) ||
      (p.modelNumber && p.modelNumber.toLowerCase().includes(raw)) ||
      (p.category && p.category.toLowerCase().includes(raw))
    ).slice(0, 25);
  }, [products, productSearchInput]);

  // Total calculations
  const calculateTotals = () => {
    let subtotal = 0;
    let totalDiscount = 0;
    quotationItems.forEach(item => {
      const lineSub = (item.quantity * item.salePrice);
      subtotal += lineSub;
      totalDiscount += (item.discount || 0);
    });
    const total = Math.max(0, subtotal - totalDiscount);
    return { subtotal, totalDiscount, total };
  };

  // Add Product WITHOUT Serial Number
  const addProductWithoutSerial = (product: Product) => {
    const existingIndex = quotationItems.findIndex(
      i => i.productId === product.id && (!i.selectedSerials || i.selectedSerials.length === 0)
    );

    if (existingIndex >= 0) {
      const updated = [...quotationItems];
      const newQty = (updated[existingIndex].quantity || 1) + 1;
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: newQty
      };
      setQuotationItems(updated);
      playScanBeep('success');
      toast.success(`Incremented "${product.name}" quantity (${newQty})`);
    } else {
      const newItem = {
        productId: product.id,
        quantity: 1,
        salePrice: product.salePrice || 0,
        discount: 0,
        warranty: '1 Year Warranty',
        selectedSerials: []
      };
      setQuotationItems(prev => [...prev.filter(i => i.productId), newItem]);
      playScanBeep('success');
      toast.success(`Added "${product.name}" to quotation`);
    }

    setProductSearchInput('');
    setIsProductDropdownOpen(false);
  };

  // Add Serial Number to Quotation
  const addSerialNumber = (serialDoc: SerialNumber) => {
    if (alreadyAddedSerialIds.has(serialDoc.id) || alreadyAddedSerialIds.has(serialDoc.serialNumber)) {
      playScanBeep('warning');
      toast.info(`Serial "${serialDoc.serialNumber}" is already in this quotation.`);
      return;
    }

    const prod = products.find(p => p.id === serialDoc.productId);
    if (!prod) {
      playScanBeep('error');
      toast.error('Product for serial was not found');
      return;
    }

    const existingIndex = quotationItems.findIndex(
      i => i.productId === prod.id && i.selectedSerials && i.selectedSerials.length > 0
    );

    if (existingIndex >= 0) {
      const updated = [...quotationItems];
      const currentSerials = updated[existingIndex].selectedSerials || [];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: currentSerials.length + 1,
        selectedSerials: [...currentSerials, serialDoc.serialNumber]
      };
      setQuotationItems(updated);
      playScanBeep('success');
      toast.success(`Added serial "${serialDoc.serialNumber}" to "${prod.name}"`);
    } else {
      const newItem = {
        productId: prod.id,
        quantity: 1,
        salePrice: prod.salePrice || 0,
        discount: 0,
        warranty: '1 Year Warranty',
        selectedSerials: [serialDoc.serialNumber]
      };
      setQuotationItems(prev => [...prev.filter(i => i.productId), newItem]);
      playScanBeep('success');
      toast.success(`Added "${prod.name}" with serial ${serialDoc.serialNumber}`);
    }

    setSerialSearchInput('');
    setIsSerialDropdownOpen(false);
  };

  // Universal Barcode scanner handler
  const handleScanCode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return false;

    // 1. Check if matches serial number
    const matchedSerial = allSerials.find(s => s.serialNumber.toLowerCase() === trimmed.toLowerCase());
    if (matchedSerial) {
      addSerialNumber(matchedSerial);
      return true;
    }

    // 2. Check if matches product model or barcode
    const matchedProduct = products.find(p => 
      p.modelNumber?.toLowerCase() === trimmed.toLowerCase() ||
      p.id.toLowerCase() === trimmed.toLowerCase() ||
      p.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (matchedProduct) {
      addProductWithoutSerial(matchedProduct);
      return true;
    }

    playScanBeep('error');
    toast.warning(`No product or serial matching "${trimmed}" found.`);
    return false;
  };

  // Open New Quotation modal
  const handleOpenNewQuotation = () => {
    setEditingQuotation(null);
    setQuotationNumber(getNextQuotationNumber());
    setQuotationDate(new Date().toISOString().split('T')[0]);
    const d = new Date();
    d.setDate(d.getDate() + 15);
    setValidUntilDate(d.toISOString().split('T')[0]);
    setQuotationStatus('Draft');
    setNotes('Prices quoted are valid for 15 days from the date of quotation. Delivery timeline: within 3-5 business days upon order confirmation.');
    setSelectedCustomerId('walk-in');
    setCustomerSearchInput('Walk In Customer');
    setCustomerPhone('');
    setCustomerEmail('');
    setCustomerCity('');
    setQuotationItems([]);
    setSerialSearchInput('');
    setProductSearchInput('');
    setShowModal(true);
  };

  // Open Edit Quotation
  const handleEditClick = (quote: Quotation) => {
    setEditingQuotation(quote);
    setQuotationNumber(quote.quotationNo || '');
    setQuotationDate(quote.date ? quote.date.split('T')[0] : new Date().toISOString().split('T')[0]);
    setValidUntilDate(quote.validUntil ? quote.validUntil.split('T')[0] : '');
    setQuotationStatus(quote.status || 'Draft');
    setNotes(quote.notes || '');

    if (quote.customerId && customers.some(c => c.id === quote.customerId)) {
      const cust = customers.find(c => c.id === quote.customerId)!;
      setSelectedCustomerId(cust.id);
      setCustomerSearchInput(cust.name);
      setCustomerPhone(cust.mobile || quote.customerMobile || '');
      setCustomerEmail(cust.email || quote.customerEmail || '');
      setCustomerCity(cust.city || quote.customerCity || '');
    } else {
      setSelectedCustomerId(quote.customerId || 'walk-in');
      setCustomerSearchInput(quote.customerName || 'Walk In Customer');
      setCustomerPhone(quote.customerMobile || '');
      setCustomerEmail(quote.customerEmail || '');
      setCustomerCity(quote.customerCity || '');
    }

    if (quote.items) {
      const mapped = quote.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        salePrice: item.salePrice,
        discount: item.discount || 0,
        warranty: item.warranty || '1 Year Warranty',
        selectedSerials: item.selectedSerials ? [...item.selectedSerials] : []
      }));
      setQuotationItems(mapped);
    } else {
      setQuotationItems([]);
    }

    setShowModal(true);
  };

  // Save Quotation (WITHOUT Stock Removal)
  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) {
      toast.error('Store identifier not found');
      return;
    }

    if (quotationItems.length === 0 || quotationItems.every(i => !i.productId)) {
      toast.error('Please add at least one product item to the quotation');
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
        customerName = customerSearchInput.trim() || 'Custom Customer';
        customerId = null;
      }
    } else {
      customerName = customerSearchInput.trim() || 'Walk In Customer';
      customerId = null;
    }

    setSaving(true);
    const qNumber = quotationNumber.trim() || getNextQuotationNumber();
    const { subtotal, totalDiscount, total } = calculateTotals();

    const formattedItems: QuotationItem[] = quotationItems.map(item => {
      const prod = products.find(p => p.id === item.productId);
      return {
        productId: item.productId,
        productName: prod ? prod.name : 'Unknown Product',
        brand: prod ? prod.brand : '',
        modelNumber: prod ? prod.modelNumber : '',
        category: prod ? prod.category : '',
        quantity: item.quantity,
        salePrice: item.salePrice,
        discount: item.discount || 0,
        warranty: item.warranty || '1 Year Warranty',
        subtotal: Math.max(0, (item.quantity * item.salePrice) - (item.discount || 0)),
        selectedSerials: item.selectedSerials ? [...item.selectedSerials] : []
      };
    });

    const quoteId = editingQuotation ? editingQuotation.id : doc(collection(db, 'quotations')).id;
    const quoteDocData = {
      id: quoteId,
      quotationNo: qNumber,
      customerId,
      customerName,
      customerMobile: customerPhone.trim(),
      customerEmail: customerEmail.trim(),
      customerCity: customerCity.trim(),
      date: quotationDate ? new Date(quotationDate).toISOString() : new Date().toISOString(),
      validUntil: validUntilDate ? new Date(validUntilDate).toISOString() : new Date().toISOString(),
      status: quotationStatus,
      items: groupQuotationItems(formattedItems),
      subtotal,
      totalDiscount,
      total,
      notes,
      storeId,
      createdAt: editingQuotation ? (editingQuotation.createdAt || serverTimestamp()) : serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      // NOTE: CRITICAL USER SPECIFICATION:
      // "Add feature of Qoutations same like sales just don't remove items from stock"
      // We write purely to 'quotations' collection. NO reduction of product stock, NO inventoryLogs, NO serial status mutation!
      await setDoc(doc(db, 'quotations', quoteId), quoteDocData, { merge: true });

      toast.success(editingQuotation ? `Quotation ${qNumber} updated successfully!` : `Quotation ${qNumber} created successfully! (Stock unchanged)`);
      setShowModal(false);
      setEditingQuotation(null);
    } catch (err) {
      console.error('Error saving quotation:', err);
      toast.error('Failed to save quotation');
    } finally {
      setSaving(false);
    }
  };

  // Delete Quotation
  const handleDeleteQuotation = (quote: Quotation) => {
    setQuoteToDelete(quote);
  };

  const handleConfirmDelete = async () => {
    if (!quoteToDelete) return;
    try {
      await deleteDoc(doc(db, 'quotations', quoteToDelete.id));
      toast.success(`Quotation ${quoteToDelete.quotationNo} deleted successfully.`);
      if (selectedQuotation?.id === quoteToDelete.id) {
        setShowDetailModal(false);
        setSelectedQuotation(null);
      }
      setQuoteToDelete(null);
    } catch (err) {
      console.error('Error deleting quotation:', err);
      toast.error('Failed to delete quotation');
    }
  };

  // Update Quotation Status inline
  const handleUpdateStatus = async (quote: Quotation, newStatus: Quotation['status']) => {
    try {
      await updateDoc(doc(db, 'quotations', quote.id), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      toast.success(`Quotation status changed to "${newStatus}"`);
      if (selectedQuotation?.id === quote.id) {
        setSelectedQuotation({ ...selectedQuotation, status: newStatus });
      }
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error('Failed to update status');
    }
  };

  // Convert Quotation to Sale
  const handleConvertToSale = (quote: Quotation) => {
    // Navigate to Sales and pass the quotation payload in location.state
    navigate('/sales', {
      state: {
        fromQuotation: quote
      }
    });
  };

  // Format date helper
  const formatDateDisplay = (dateStr: string | undefined | null) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
  };

  // Print Quotation via temporary hidden iframe with professional clean styling
  const printQuotation = (quote: Quotation) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const docPrint = iframe.contentWindow?.document;
    if (!docPrint) {
      toast.error('Failed to initialize print process');
      return;
    }

    const itemsRows = quote.items && quote.items.length > 0 
      ? quote.items.map((item, index) => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 10px; font-size: 11px; text-align: center; color: #475569;">${index + 1}</td>
          <td style="padding: 8px 10px; font-size: 11px; text-align: left;">
            <div style="font-weight: 700; color: #0f172a;">${item.productName}</div>
            ${item.brand || item.modelNumber ? `
              <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
                ${item.brand ? item.brand + ' • ' : ''}${item.modelNumber ? 'Model: ' + item.modelNumber : ''}
              </div>
            ` : ''}
            ${item.warranty ? `
              <div style="font-size: 9.5px; color: #0284c7; font-weight: 600;">Warranty: ${item.warranty}</div>
            ` : ''}
            ${item.selectedSerials && item.selectedSerials.length > 0 ? `
              <div style="font-size: 9px; color: #475569; margin-top: 2px;">
                <span style="font-weight: 700;">Serials: </span>${item.selectedSerials.join(', ')}
              </div>
            ` : ''}
          </td>
          <td style="padding: 8px 10px; font-size: 11px; text-align: center; font-weight: 600; color: #0f172a;">PKR ${item.salePrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          <td style="padding: 8px 10px; font-size: 11px; text-align: center; font-weight: 700; color: #0f172a;">${item.quantity}</td>
          <td style="padding: 8px 10px; font-size: 11px; text-align: center; font-size: 10.5px; color: #e11d48;">${item.discount ? 'PKR ' + item.discount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td>
          <td style="padding: 8px 10px; font-size: 11px; text-align: right; font-weight: 700; color: #0f172a;">PKR ${item.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        </tr>
      `).join('')
      : `<tr><td colspan="6" style="padding: 16px; text-align: center; color: #94a3b8;">No items itemized</td></tr>`;

    const subtotal = quote.subtotal || quote.items?.reduce((s, i) => s + (i.quantity * i.salePrice), 0) || quote.total;
    const discount = quote.totalDiscount || quote.items?.reduce((s, i) => s + (i.discount || 0), 0) || 0;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Quotation - ${quote.quotationNo}</title>
        <style>
          @page { size: A4; margin: 12mm 16mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; padding: 12mm 16mm; }
          .quote-container { width: 100%; max-width: 800px; margin: 0 auto; }
          table { width: 100%; border-collapse: collapse; }
        </style>
      </head>
      <body>
        <div class="quote-container">
          <!-- Header -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0a382c; padding-bottom: 14px; margin-bottom: 16px;">
            <div>
              <h1 style="font-size: 22px; font-weight: 900; margin: 0; color: #0a382c;">${storeDetails.name || 'ElectroManage'}</h1>
              <p style="font-size: 11px; color: #475569; margin: 3px 0 0 0;">${storeDetails.address || 'Commercial Electronics Hub'}</p>
              <p style="font-size: 11px; color: #475569; margin: 2px 0 0 0;">Phone: ${storeDetails.phone || '—'} | Email: ${storeDetails.email || '—'}</p>
            </div>
            <div style="text-align: right;">
              <div style="display: inline-block; background-color: #0a382c; color: #ffffff; padding: 4px 12px; border-radius: 6px; font-size: 13px; font-weight: 800; letter-spacing: 0.5px;">
                PRICE QUOTATION
              </div>
              <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 6px; font-family: monospace;">${quote.quotationNo}</div>
              <div style="font-size: 10.5px; color: #475569; margin-top: 2px;">Date: ${formatDateDisplay(quote.date)}</div>
              <div style="font-size: 10.5px; color: #b45309; font-weight: 700; margin-top: 1px;">Valid Until: ${formatDateDisplay(quote.validUntil)}</div>
            </div>
          </div>

          <!-- Customer & Info Cards -->
          <div style="display: flex; justify-content: space-between; gap: 16px; margin-bottom: 18px;">
            <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px;">
              <div style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 4px;">Prepared For (Customer)</div>
              <div style="font-size: 13px; font-weight: 800; color: #0f172a;">${quote.customerName || 'Walk In Customer'}</div>
              ${quote.customerMobile ? `<div style="font-size: 10.5px; color: #475569; margin-top: 2px;">Phone: <b>${quote.customerMobile}</b></div>` : ''}
              ${quote.customerEmail ? `<div style="font-size: 10.5px; color: #475569; margin-top: 1px;">Email: ${quote.customerEmail}</div>` : ''}
              ${quote.customerCity ? `<div style="font-size: 10.5px; color: #475569; margin-top: 1px;">City: ${quote.customerCity}</div>` : ''}
            </div>
            <div style="width: 220px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px;">
              <div style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 4px;">Quotation Status</div>
              <div style="font-size: 12px; font-weight: 800; color: #0a382c; text-transform: uppercase;">${quote.status}</div>
              <div style="font-size: 10px; color: #64748b; margin-top: 4px;">Items: <b>${quote.items?.reduce((s, i) => s + (i.quantity || 1), 0) || 0} units</b></div>
              <div style="font-size: 10px; color: #64748b; margin-top: 1px;">Total Lines: <b>${quote.items?.length || 0}</b></div>
            </div>
          </div>

          <!-- Items Table -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <thead>
              <tr style="background-color: #0a382c; color: #ffffff;">
                <th style="padding: 7px 10px; font-size: 10px; font-weight: 800; text-align: center; width: 35px;">#</th>
                <th style="padding: 7px 10px; font-size: 10px; font-weight: 800; text-align: left;">Product Details & Warranty</th>
                <th style="padding: 7px 10px; font-size: 10px; font-weight: 800; text-align: center; width: 110px;">Unit Price</th>
                <th style="padding: 7px 10px; font-size: 10px; font-weight: 800; text-align: center; width: 60px;">Qty</th>
                <th style="padding: 7px 10px; font-size: 10px; font-weight: 800; text-align: center; width: 85px;">Discount</th>
                <th style="padding: 7px 10px; font-size: 10px; font-weight: 800; text-align: right; width: 110px;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <!-- Totals Section -->
          <div style="display: flex; justify-content: flex-end; margin-bottom: 18px;">
            <div style="width: 280px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
              <div style="display: flex; justify-content: space-between; padding: 7px 12px; font-size: 11px; background: #ffffff; border-bottom: 1px solid #f1f5f9;">
                <span style="color: #64748b;">Subtotal:</span>
                <span style="font-weight: 700; color: #0f172a;">PKR ${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 7px 12px; font-size: 11px; background: #ffffff; border-bottom: 1px solid #f1f5f9;">
                <span style="color: #64748b;">Total Discount:</span>
                <span style="font-weight: 700; color: #e11d48;">- PKR ${discount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 9px 12px; font-size: 13px; font-weight: 900; background: #ecfdf5; color: #065f46;">
                <span>Estimated Total:</span>
                <span>PKR ${quote.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          <!-- Notes & Terms -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 30px; font-size: 10px; color: #475569; line-height: 1.5;">
            <div style="font-weight: 800; color: #0f172a; margin-bottom: 4px; text-transform: uppercase; font-size: 9.5px;">Terms & Conditions</div>
            <div>• This document is an estimate and does not serve as a sales invoice or claim of stock reservation.</div>
            <div>• Quoted prices are valid until <b>${formatDateDisplay(quote.validUntil)}</b> and are subject to stock availability upon confirmation.</div>
            ${quote.notes ? `<div>• Note: ${quote.notes}</div>` : ''}
            ${storeDetails.termsAndConditions ? `<div>• ${storeDetails.termsAndConditions}</div>` : ''}
          </div>

          <!-- Signatures -->
          <div style="display: flex; justify-content: space-between; margin-top: 40px; padding-top: 10px;">
            <div style="text-align: center; width: 180px;">
              <div style="border-top: 1px solid #94a3b8; margin-bottom: 4px;"></div>
              <div style="font-size: 10.5px; font-weight: 700; color: #475569;">Customer Acceptance</div>
            </div>
            <div style="text-align: center; width: 180px;">
              <div style="border-top: 1px solid #94a3b8; margin-bottom: 4px;"></div>
              <div style="font-size: 10.5px; font-weight: 700; color: #475569;">Authorized Signature / Stamp</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    docPrint.open();
    docPrint.write(htmlContent);
    docPrint.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 400);
  };

  // Filtered Quotations list
  const filteredQuotations = useMemo(() => {
    return quotations.filter(q => {
      const matchStatus = statusFilter === 'All' || q.status === statusFilter;
      const raw = searchTerm.trim().toLowerCase();
      if (!raw) return matchStatus;

      const matchSearch = 
        q.quotationNo?.toLowerCase().includes(raw) ||
        q.customerName?.toLowerCase().includes(raw) ||
        (q.customerMobile && q.customerMobile.includes(raw)) ||
        q.items?.some(i => i.productName.toLowerCase().includes(raw) || i.brand.toLowerCase().includes(raw));

      return matchStatus && matchSearch;
    });
  }, [quotations, statusFilter, searchTerm]);

  // Financial overview metrics
  const { totalQuotationCount, totalQuotedAmount, convertedQuotesCount, activeQuotesCount } = useMemo(() => {
    let quotedTotal = 0;
    let converted = 0;
    let active = 0;

    quotations.forEach(q => {
      quotedTotal += (q.total || 0);
      if (q.status === 'Converted') {
        converted++;
      } else if (q.status === 'Draft' || q.status === 'Sent' || q.status === 'Accepted') {
        active++;
      }
    });

    return {
      totalQuotationCount: quotations.length,
      totalQuotedAmount: quotedTotal,
      convertedQuotesCount: converted,
      activeQuotesCount: active
    };
  }, [quotations]);

  const { subtotal: formSubtotal, totalDiscount: formDiscount, total: formTotal } = calculateTotals();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Quotations</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
              No Stock Removal
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Create and send price estimates to customers without deducting inventory stock
          </p>
        </div>
        <button 
          onClick={handleOpenNewQuotation}
          className="flex items-center gap-2 bg-[#0a382c] hover:bg-[#072d23] text-white px-5 py-2.5 rounded-xl font-bold shadow-md shadow-emerald-950/10 transition-all text-sm"
        >
          <Plus className="w-4 h-4" />
          Create Quotation
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Quotes</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1.5 font-mono">{totalQuotationCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Estimates issued</div>
        </div>

        <div className="glass-panel p-4 rounded-2xl border-emerald-200/60 bg-emerald-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Total Quoted Value</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-900 mt-1.5 font-mono">
            PKR {totalQuotedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-700/80 mt-0.5">Combined quotation amounts</div>
        </div>

        <div className="glass-panel p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Open / Active Quotes</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-800 mt-1.5 font-mono">{activeQuotesCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Draft, Sent, or Accepted</div>
        </div>

        <div className="glass-panel p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700">Converted to Sales</span>
            <CheckCircle2 className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-2xl font-black text-teal-800 mt-1.5 font-mono">{convertedQuotesCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Transformed into real sales</div>
        </div>
      </div>

      {/* Main Table Panel */}
      <div className="glass-panel rounded-2xl shadow-sm overflow-hidden">
        {/* Filters Header */}
        <div className="p-4 border-b border-slate-150 bg-slate-50/50 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search quotation #, customer, phone, product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="glass-input block w-full pl-10 pr-3 py-2 rounded-xl text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {(['All', 'Draft', 'Sent', 'Accepted', 'Converted', 'Declined'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  statusFilter === st 
                    ? 'bg-[#0a382c] text-white shadow-sm' 
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Quotations Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-150">
            <thead className="bg-[#fcfdfd]">
              <tr>
                <th scope="col" className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quotation</th>
                <th scope="col" className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Customer</th>
                <th scope="col" className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dates</th>
                <th scope="col" className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Items</th>
                <th scope="col" className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Amount</th>
                <th scope="col" className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-5 py-3.5 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white/60 divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a382c] mx-auto mb-2"></div>
                    Loading quotations...
                  </td>
                </tr>
              ) : filteredQuotations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">No quotations found</p>
                    <p className="text-xs text-slate-400 mt-1">Create your first price estimate to share with customers.</p>
                  </td>
                </tr>
              ) : (
                filteredQuotations.map(quote => (
                  <tr key={quote.id} className="hover:bg-[#f8faf9] transition-colors">
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="font-mono font-bold text-sm text-slate-900">{quote.quotationNo}</div>
                      <div className="text-[11px] text-slate-400 font-medium">Stock not affected</div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="text-sm font-bold text-slate-900">{quote.customerName}</div>
                      {quote.customerMobile && (
                        <div className="text-xs text-slate-500">{quote.customerMobile}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="text-xs font-semibold text-slate-700">Issued: {formatDateDisplay(quote.date)}</div>
                      <div className="text-[11px] text-amber-700 font-medium">Valid: {formatDateDisplay(quote.validUntil)}</div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="text-xs font-bold text-slate-800">
                        {quote.items?.reduce((s, i) => s + (i.quantity || 1), 0) || 0} unit(s)
                      </div>
                      <div className="text-[11px] text-slate-400">{quote.items?.length || 0} line product(s)</div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="font-mono text-sm font-black text-slate-900">
                        PKR {quote.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {quote.totalDiscount > 0 && (
                        <div className="text-[10px] text-rose-600 font-bold">
                          Disc: PKR {quote.totalDiscount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                        quote.status === 'Converted' 
                          ? 'bg-teal-50 text-teal-800 border-teal-200' 
                          : quote.status === 'Accepted'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : quote.status === 'Sent'
                          ? 'bg-sky-50 text-sky-800 border-sky-200'
                          : quote.status === 'Declined'
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : 'bg-slate-100 text-slate-800 border-slate-200'
                      }`}>
                        {quote.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedQuotation(quote);
                            setShowDetailModal(true);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                          title="View Quotation Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => printQuotation(quote)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                          title="Print Quotation"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleConvertToSale(quote)}
                          className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 flex items-center gap-1 transition-colors"
                          title="Convert to Real Sale (Deducts Stock)"
                        >
                          <ArrowRight className="w-3 h-3" />
                          To Sale
                        </button>
                        <button
                          onClick={() => handleEditClick(quote)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                          title="Edit Quotation"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteQuotation(quote)}
                          className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Delete Quotation"
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
      </div>

      {/* CREATE / EDIT QUOTATION MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="glass-panel bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-150 bg-slate-50/80 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#0a382c]" />
                  {editingQuotation ? `Edit Quotation (${quotationNumber})` : 'New Price Quotation'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Does not deduct items from inventory stock. Safe for estimates and tender submissions.
                </p>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveQuotation} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Top Row Info: Quote #, Date, Validity, Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/60">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Quotation #
                  </label>
                  <input
                    type="text"
                    value={quotationNumber}
                    onChange={e => setQuotationNumber(e.target.value)}
                    required
                    className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Quotation Date
                  </label>
                  <input
                    type="date"
                    value={quotationDate}
                    onChange={e => setQuotationDate(e.target.value)}
                    required
                    className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Valid Until
                  </label>
                  <input
                    type="date"
                    value={validUntilDate}
                    onChange={e => setValidUntilDate(e.target.value)}
                    required
                    className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Quotation Status
                  </label>
                  <select
                    value={quotationStatus}
                    onChange={e => setQuotationStatus(e.target.value as any)}
                    className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-bold"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Sent">Sent to Customer</option>
                    <option value="Accepted">Accepted</option>
                    <option value="Declined">Declined</option>
                    <option value="Converted">Converted to Sale</option>
                  </select>
                </div>
              </div>

              {/* Customer Selector & Contact Info */}
              <div className="p-4 rounded-xl bg-slate-50/50 border border-slate-200/60 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Customer Information
                  </label>
                  {selectedCustomerId !== 'walk-in' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomerId('walk-in');
                        setCustomerSearchInput('Walk In Customer');
                        setCustomerPhone('');
                        setCustomerEmail('');
                        setCustomerCity('');
                      }}
                      className="text-[11px] text-rose-600 hover:underline font-bold"
                    >
                      Reset to Walk-in
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="relative" ref={customerDropdownRef}>
                    <input
                      type="text"
                      placeholder="Type or select customer..."
                      value={customerSearchInput}
                      onChange={e => {
                        setCustomerSearchInput(e.target.value);
                        setIsCustomerDropdownOpen(true);
                      }}
                      onFocus={() => setIsCustomerDropdownOpen(true)}
                      className="glass-input block w-full py-2 px-3 rounded-xl text-xs font-bold"
                    />
                    {isCustomerDropdownOpen && (
                      <div className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200 py-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCustomerId('walk-in');
                            setCustomerSearchInput('Walk In Customer');
                            setCustomerPhone('');
                            setCustomerEmail('');
                            setCustomerCity('');
                            setIsCustomerDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-slate-50 border-b border-slate-100 flex items-center justify-between"
                        >
                          <span>Walk In Customer</span>
                          <span className="text-[10px] text-slate-400">Default</span>
                        </button>
                        {filteredCustomers.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setSelectedCustomerId(c.id);
                              setCustomerSearchInput(c.name);
                              setCustomerPhone(c.mobile || '');
                              setCustomerEmail(c.email || '');
                              setCustomerCity(c.city || '');
                              setIsCustomerDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between"
                          >
                            <div>
                              <div className="font-bold text-slate-800">{c.name}</div>
                              <div className="text-[10px] text-slate-400">{c.mobile || 'No phone'}</div>
                            </div>
                            {c.city && <span className="text-[10px] text-slate-400">{c.city}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <input
                      type="text"
                      placeholder="Phone / Mobile Number"
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      className="glass-input block w-full py-2 px-3 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <input
                      type="email"
                      placeholder="Customer Email"
                      value={customerEmail}
                      onChange={e => setCustomerEmail(e.target.value)}
                      className="glass-input block w-full py-2 px-3 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="City / Address"
                      value={customerCity}
                      onChange={e => setCustomerCity(e.target.value)}
                      className="glass-input block w-full py-2 px-3 rounded-xl text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Product Selection Mode Tabs */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setProductSelectionMode('with_serial')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                        productSelectionMode === 'with_serial'
                          ? 'bg-[#0a382c] text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <Barcode className="w-3.5 h-3.5" />
                      Add With Serial / Barcode Scan
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductSelectionMode('without_serial')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                        productSelectionMode === 'without_serial'
                          ? 'bg-[#0a382c] text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <Package className="w-3.5 h-3.5" />
                      Add Product By Name / Model
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCameraScanner(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Camera Scanner
                  </button>
                </div>

                {/* Mode: With Serial */}
                {productSelectionMode === 'with_serial' && (
                  <div className="relative" ref={serialDropdownRef}>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Barcode className="w-4 h-4 text-slate-400" />
                      </div>
                      <input
                        ref={serialInputRef}
                        type="text"
                        placeholder="Scan or type Serial Number / Product Model..."
                        value={serialSearchInput}
                        onChange={e => {
                          setSerialSearchInput(e.target.value);
                          setIsSerialDropdownOpen(true);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (serialSearchInput.trim()) {
                              handleScanCode(serialSearchInput.trim());
                            }
                          }
                        }}
                        onFocus={() => setIsSerialDropdownOpen(true)}
                        className="glass-input block w-full pl-10 pr-3 py-2.5 rounded-xl text-xs font-mono font-bold"
                      />
                    </div>

                    {isSerialDropdownOpen && filteredSerials.length > 0 && (
                      <div className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200 py-1">
                        {filteredSerials.map(s => {
                          const prod = products.find(p => p.id === s.productId);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => addSerialNumber(s)}
                              className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-xs flex items-center justify-between border-b border-slate-50 last:border-0"
                            >
                              <div>
                                <span className="font-mono font-bold text-slate-900">{s.serialNumber}</span>
                                <span className="ml-2 text-slate-500 font-medium">({prod?.name || 'Product'})</span>
                              </div>
                              <div className="text-right">
                                <span className="font-bold text-emerald-700">PKR {prod?.salePrice?.toFixed(2)}</span>
                                <span className="ml-2 text-[10px] text-slate-400 font-mono">In Stock: {prod?.stock || 0}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Mode: Without Serial */}
                {productSelectionMode === 'without_serial' && (
                  <div className="relative" ref={productDropdownRef}>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="w-4 h-4 text-slate-400" />
                      </div>
                      <input
                        ref={productInputRef}
                        type="text"
                        placeholder="Search product name, brand, model..."
                        value={productSearchInput}
                        onChange={e => {
                          setProductSearchInput(e.target.value);
                          setIsProductDropdownOpen(true);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (filteredProductsWithoutSerials.length > 0) {
                              addProductWithoutSerial(filteredProductsWithoutSerials[0]);
                            }
                          }
                        }}
                        onFocus={() => setIsProductDropdownOpen(true)}
                        className="glass-input block w-full pl-10 pr-3 py-2.5 rounded-xl text-xs font-bold"
                      />
                    </div>

                    {isProductDropdownOpen && filteredProductsWithoutSerials.length > 0 && (
                      <div className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200 py-1">
                        {filteredProductsWithoutSerials.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => addProductWithoutSerial(p)}
                            className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-xs flex items-center justify-between border-b border-slate-50 last:border-0"
                          >
                            <div>
                              <div className="font-bold text-slate-900">{p.name}</div>
                              <div className="text-[10px] text-slate-400">
                                {p.brand} {p.modelNumber ? `• ${p.modelNumber}` : ''} {p.category ? `• ${p.category}` : ''}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-emerald-700">PKR {p.salePrice?.toFixed(2)}</div>
                              <div className="text-[10px] text-slate-500 font-mono">Stock: {p.stock || 0}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Quotation Line Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Quoted Items ({quotationItems.length})
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">
                    Editable prices & discounts for this quote
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-[#fcfdfd]">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider">Product</th>
                        <th className="px-4 py-2.5 text-center font-bold text-slate-500 uppercase tracking-wider w-24">Qty</th>
                        <th className="px-4 py-2.5 text-center font-bold text-slate-500 uppercase tracking-wider w-32">Price (PKR)</th>
                        <th className="px-4 py-2.5 text-center font-bold text-slate-500 uppercase tracking-wider w-28">Discount</th>
                        <th className="px-4 py-2.5 text-center font-bold text-slate-500 uppercase tracking-wider w-32">Warranty</th>
                        <th className="px-4 py-2.5 text-right font-bold text-slate-500 uppercase tracking-wider w-32">Subtotal</th>
                        <th className="px-3 py-2.5 text-right w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {quotationItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                            No items added yet. Scan or search above to add products.
                          </td>
                        </tr>
                      ) : (
                        quotationItems.map((item, idx) => {
                          const prod = products.find(p => p.id === item.productId);
                          const lineTotal = Math.max(0, (item.quantity * item.salePrice) - (item.discount || 0));

                          return (
                            <tr key={idx} className="hover:bg-slate-50/60">
                              <td className="px-4 py-3">
                                <div className="font-bold text-slate-900">{prod?.name || 'Product'}</div>
                                <div className="text-[10px] text-slate-400">
                                  {prod?.brand} {prod?.modelNumber ? `• ${prod.modelNumber}` : ''}
                                </div>
                                {item.selectedSerials && item.selectedSerials.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {item.selectedSerials.map((sn, sIdx) => (
                                      <span key={sIdx} className="inline-block px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[9px] text-slate-700">
                                        {sn}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={e => {
                                    const val = Math.max(1, parseInt(e.target.value) || 1);
                                    const updated = [...quotationItems];
                                    updated[idx].quantity = val;
                                    setQuotationItems(updated);
                                  }}
                                  className="glass-input w-16 text-center py-1 rounded-lg text-xs font-bold"
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.salePrice}
                                  onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    const updated = [...quotationItems];
                                    updated[idx].salePrice = val;
                                    setQuotationItems(updated);
                                  }}
                                  className="glass-input w-24 text-center py-1 rounded-lg text-xs font-mono font-bold"
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.discount}
                                  onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    const updated = [...quotationItems];
                                    updated[idx].discount = val;
                                    setQuotationItems(updated);
                                  }}
                                  className="glass-input w-20 text-center py-1 rounded-lg text-xs font-mono text-rose-600 font-bold"
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <select
                                  value={item.warranty}
                                  onChange={e => {
                                    const updated = [...quotationItems];
                                    updated[idx].warranty = e.target.value;
                                    setQuotationItems(updated);
                                  }}
                                  className="glass-input py-1 px-1.5 rounded-lg text-[11px]"
                                >
                                  <option value="No Warranty">No Warranty</option>
                                  <option value="6 Months Warranty">6 Months</option>
                                  <option value="1 Year Warranty">1 Year</option>
                                  <option value="2 Years Warranty">2 Years</option>
                                  <option value="Company Warranty">Company</option>
                                </select>
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                                PKR {lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuotationItems(quotationItems.filter((_, i) => i !== idx));
                                  }}
                                  className="text-rose-400 hover:text-rose-600 p-1"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom Summary: Notes and Totals */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Quotation Notes / Terms
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Enter special payment terms, delivery timelines, or notes for this quote..."
                    className="glass-input block w-full rounded-xl py-2 px-3 text-xs leading-relaxed"
                  />
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200/80 p-2 rounded-lg">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>This quotation will not adjust inventory stock or deduct quantities from the database.</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-bold font-mono">
                      PKR {formSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-rose-600">
                    <span>Total Discount:</span>
                    <span className="font-bold font-mono">
                      - PKR {formDiscount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-black text-slate-900">
                    <span>Estimated Total:</span>
                    <span className="font-mono text-emerald-800 text-base">
                      PKR {formTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[#0a382c] hover:bg-[#072d23] text-white shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? 'Saving Quotation...' : editingQuotation ? 'Update Quotation' : 'Save Quotation (Stock Unchanged)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {showDetailModal && selectedQuotation && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="glass-panel bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-150 bg-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900 font-mono">
                  {selectedQuotation.quotationNo}
                </h2>
                <p className="text-xs text-slate-500">
                  Created {formatDateDisplay(selectedQuotation.date)} • Valid until {formatDateDisplay(selectedQuotation.validUntil)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => printQuotation(selectedQuotation)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    handleConvertToSale(selectedQuotation);
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  Convert to Sale
                </button>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Customer and Status Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer Details</div>
                  <div className="text-sm font-bold text-slate-900 mt-1">{selectedQuotation.customerName}</div>
                  {selectedQuotation.customerMobile && (
                    <div className="text-slate-600 mt-0.5">Mobile: {selectedQuotation.customerMobile}</div>
                  )}
                  {selectedQuotation.customerEmail && (
                    <div className="text-slate-600 mt-0.5">Email: {selectedQuotation.customerEmail}</div>
                  )}
                  {selectedQuotation.customerCity && (
                    <div className="text-slate-600 mt-0.5">City: {selectedQuotation.customerCity}</div>
                  )}
                </div>

                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status & Actions</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-bold text-slate-700">Status:</span>
                    <select
                      value={selectedQuotation.status}
                      onChange={e => handleUpdateStatus(selectedQuotation, e.target.value as any)}
                      className="glass-input py-1 px-2 text-xs font-bold rounded-lg"
                    >
                      <option value="Draft">Draft</option>
                      <option value="Sent">Sent</option>
                      <option value="Accepted">Accepted</option>
                      <option value="Declined">Declined</option>
                      <option value="Converted">Converted</option>
                    </select>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    Inventory: <span className="font-bold text-emerald-800">Unmodified (Stock remains untouched)</span>
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Itemized Estimate</h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-bold text-slate-500">Product</th>
                        <th className="px-4 py-2.5 text-center font-bold text-slate-500">Qty</th>
                        <th className="px-4 py-2.5 text-center font-bold text-slate-500">Price</th>
                        <th className="px-4 py-2.5 text-center font-bold text-slate-500">Discount</th>
                        <th className="px-4 py-2.5 text-right font-bold text-slate-500">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {selectedQuotation.items?.map((item, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2.5">
                            <div className="font-bold text-slate-900">{item.productName}</div>
                            {item.brand && <div className="text-[10px] text-slate-400">{item.brand} • {item.modelNumber}</div>}
                            {item.selectedSerials && item.selectedSerials.length > 0 && (
                              <div className="text-[9.5px] text-slate-500 font-mono mt-0.5">
                                Serials: {item.selectedSerials.join(', ')}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center font-bold">{item.quantity}</td>
                          <td className="px-4 py-2.5 text-center font-mono">PKR {item.salePrice?.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-center font-mono text-rose-600">
                            {item.discount ? `PKR ${item.discount.toFixed(2)}` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold">
                            PKR {item.subtotal?.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals Breakdown */}
              <div className="flex justify-end">
                <div className="w-64 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal:</span>
                    <span className="font-mono font-bold">PKR {selectedQuotation.subtotal?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-rose-600">
                    <span>Discount:</span>
                    <span className="font-mono font-bold">- PKR {selectedQuotation.totalDiscount?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-black text-slate-900 pt-1 border-t border-slate-200">
                    <span>Estimated Total:</span>
                    <span className="font-mono text-emerald-800">PKR {selectedQuotation.total?.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {selectedQuotation.notes && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
                  <span className="font-bold text-slate-800 block mb-1">Notes / Terms:</span>
                  {selectedQuotation.notes}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {quoteToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto mb-4 text-rose-600">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-slate-900 text-center mb-2">Delete Quotation</h3>
            <p className="text-xs text-slate-500 text-center mb-6">
              Are you sure you want to delete quotation <b className="text-slate-800">{quoteToDelete.quotationNo}</b>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setQuoteToDelete(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Camera Scanner Modal */}
      <BarcodeScannerModal
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onScan={code => {
          setShowCameraScanner(false);
          handleScanCode(code);
        }}
      />
    </div>
  );
}
