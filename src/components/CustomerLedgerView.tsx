import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft,
  Receipt, 
  Calendar, 
  Banknote, 
  Globe, 
  FileText, 
  PlusCircle, 
  RotateCcw, 
  Search, 
  User, 
  ArrowDownLeft, 
  CheckCircle2, 
  Clock, 
  Printer,
  Phone,
  Mail,
  MapPin,
  Building2,
  Eye,
  X,
  CreditCard,
  AlertCircle,
  Download,
  Edit,
  Trash2,
  Save,
  AlertTriangle
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  writeBatch, 
  serverTimestamp, 
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { downloadHtmlAsPdf } from '../lib/pdfDownloader';

// Helper to strip any undefined values and prevent Firestore rejection
function cleanDataForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
  // Handle Firestore FieldValue / Timestamp
  if (
    ('_methodName' in obj) ||
    (obj.constructor && obj.constructor.name === 'FieldValue') ||
    (typeof (obj as any).isEqual === 'function' && '_delegate' in obj)
  ) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanDataForFirestore);
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = cleanDataForFirestore(value);
    }
  }
  return clean;
}

const getInitials = (name?: string) => {
  if (!name) return 'EM';
  return name.split(' ').filter(Boolean).map(p => p[0]).join('').toUpperCase().slice(0, 2);
};

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string;
  city: string;
  balance: number;
  openingBalance?: number;
  initialBalance?: number;
  storeId?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface CustomerPaymentRecord {
  id: string;
  storeId: string;
  customerId: string;
  customerName: string;
  saleId?: string;
  invoiceNo?: string;
  totalAmount?: number;
  paidAmount?: number;
  pendingAmount?: number;
  refundAmount?: number;
  paymentMode: string;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  paymentDate?: string;
  type?: 'InvoicePayment' | 'ReturnCredit' | 'PaymentReceived' | string;
  referenceNo?: string;
  notes?: string;
  createdAt?: any;
}

export interface CustomerSaleItem {
  productId: string;
  productName: string;
  brand?: string;
  modelNumber?: string;
  quantity: number;
  salePrice: number;
  subtotal: number;
  discount?: number;
  warranty?: string;
  selectedSerials?: string[];
}

export interface CustomerSaleRecord {
  id: string;
  invoiceNo: string;
  date: string;
  total: number;
  paidAmount?: number;
  pendingAmount?: number;
  status: string;
  paymentMode?: string;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  accountTitle?: string | null;
  items?: CustomerSaleItem[];
  returns?: any[];
  totalRefunded?: number;
  notes?: string;
  createdAt?: any;
}

interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountTitle?: string;
  openingBalance?: number;
  balance?: number;
}

interface CustomerLedgerViewProps {
  customer: Customer;
  storeId: string;
  onBack: () => void;
}

export default function CustomerLedgerView({
  customer,
  storeId,
  onBack
}: CustomerLedgerViewProps) {
  const { storeId: authStoreId, user } = useAuth();
  const activeStoreId = authStoreId || auth.currentUser?.uid || storeId || (customer as any)?.storeId || user?.uid || '';

  const [sales, setSales] = useState<CustomerSaleRecord[]>([]);
  const [payments, setPayments] = useState<CustomerPaymentRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [storeDetails, setStoreDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments' | 'statement'>('invoices');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'month' | 'year'>('all');
  
  // Quick View Invoice Modal
  const [viewingInvoice, setViewingInvoice] = useState<CustomerSaleRecord | null>(null);

  // Edit & Delete modals state for Invoices
  const [editingInvoice, setEditingInvoice] = useState<CustomerSaleRecord | null>(null);
  const [invoiceEditForm, setInvoiceEditForm] = useState({
    date: '',
    total: '',
    paidAmount: '',
    paymentMode: 'Cash' as 'Cash' | 'Online',
    bankAccountNumber: '',
    bankName: '',
    status: 'Paid',
    notes: ''
  });
  const [deletingInvoice, setDeletingInvoice] = useState<CustomerSaleRecord | null>(null);

  // Edit & Delete modals state for Payments
  const [editingPayment, setEditingPayment] = useState<CustomerPaymentRecord | null>(null);
  const [paymentEditForm, setPaymentEditForm] = useState({
    paidAmount: '',
    paymentDate: '',
    paymentMode: 'Cash' as 'Cash' | 'Online',
    bankAccountNumber: '',
    bankName: '',
    referenceNo: '',
    notes: ''
  });
  const [deletingPayment, setDeletingPayment] = useState<CustomerPaymentRecord | null>(null);
  const [processingAction, setProcessingAction] = useState(false);

  // Payment receiving form state
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [receivingAmount, setReceivingAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Online'>('Cash');
  const [selectedBankAcc, setSelectedBankAcc] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Fetch Store Details & Bank Accounts
  useEffect(() => {
    if (!activeStoreId) return;
    const storeRef = doc(db, 'stores', activeStoreId);
    getDoc(storeRef).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        setStoreDetails(data);
        const accs = Array.isArray(data.bankAccounts) ? data.bankAccounts : [];
        setBankAccounts(accs);
        if (accs.length > 0) {
          setSelectedBankAcc(accs[0].accountNumber);
        }
      }
    }).catch(err => console.warn('Could not fetch store details:', err));
  }, [activeStoreId]);

  // Fetch customer sales and payment records
  useEffect(() => {
    if (!activeStoreId || !customer?.id) return;

    setLoading(true);

    // Sales query for this customer
    const salesQuery = query(
      collection(db, 'sales'),
      where('storeId', '==', activeStoreId),
      where('customerId', '==', customer.id)
    );

    const unsubSales = onSnapshot(salesQuery, (snapshot) => {
      const salesList: CustomerSaleRecord[] = [];
      snapshot.forEach(d => {
        salesList.push({ id: d.id, ...d.data() } as CustomerSaleRecord);
      });
      salesList.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      setSales(salesList);
    }, (err) => {
      console.error('Error fetching customer sales:', err);
    });

    // Payments query for this customer
    const paymentsQuery = query(
      collection(db, 'customerPayments'),
      where('storeId', '==', activeStoreId),
      where('customerId', '==', customer.id)
    );

    const unsubPayments = onSnapshot(paymentsQuery, (snapshot) => {
      const paymentsList: CustomerPaymentRecord[] = [];
      snapshot.forEach(d => {
        paymentsList.push({ id: d.id, ...d.data() } as CustomerPaymentRecord);
      });
      paymentsList.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.paymentDate || 0).getTime();
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.paymentDate || 0).getTime();
        return timeB - timeA;
      });
      setPayments(paymentsList);
      setLoading(false);
    }, (err) => {
      console.error('Error fetching customer payments:', err);
      setLoading(false);
    });

    return () => {
      unsubSales();
      unsubPayments();
    };
  }, [activeStoreId, customer?.id]);

  // Calculate or derive the Initial / Opening Balance of customer account
  const initialBalance = useMemo(() => {
    if (customer.openingBalance !== undefined && customer.openingBalance !== null && !isNaN(Number(customer.openingBalance))) {
      return Number(customer.openingBalance);
    }
    if (customer.initialBalance !== undefined && customer.initialBalance !== null && !isNaN(Number(customer.initialBalance))) {
      return Number(customer.initialBalance);
    }
    
    // If not explicitly stored, derive mathematically:
    // currentBalance = initialBalance + totalPending - totalReturns
    // initialBalance = currentBalance - totalPending + totalReturns
    let totalPendingInvoices = 0;
    let totalReturns = 0;
    sales.forEach(sale => {
      const pending = sale.pendingAmount !== undefined 
        ? sale.pendingAmount 
        : (sale.status === 'Pending' ? (sale.total || 0) : (sale.status === 'Paid' ? 0 : Math.max(0, (sale.total || 0) - (sale.paidAmount || 0))));
      totalPendingInvoices += pending;
      if (typeof sale.totalRefunded === 'number' && sale.totalRefunded > 0) {
        totalReturns += sale.totalRefunded;
      } else if (Array.isArray(sale.returns) && sale.returns.length > 0) {
        sale.returns.forEach((r: any) => {
          totalReturns += Number(r.totalRefund) || 0;
        });
      }
    });

    const derived = Number(((customer.balance || 0) - totalPendingInvoices + totalReturns).toFixed(2));
    if (derived > 0) return derived;
    if (sales.length === 0 && (customer.balance || 0) > 0) return customer.balance;
    return 0;
  }, [customer, sales, payments]);

  // Statement Row type definition
  type StatementRowItem = {
    id: string;
    date: string;
    dateObj: Date;
    sortOrder: number;
    type: 'Initial Balance' | 'Invoice' | 'Payment' | 'Return';
    refNo: string;
    description: string;
    debit: number;          // Increases amount customer owes
    credit: number;         // Reduces amount customer owes
    runningBalance: number; // Cumulative net account balance
    mode: string;
    bankInfo?: string;
    rawSale?: CustomerSaleRecord;
    rawPayment?: CustomerPaymentRecord;
  };

  // Combined Running Account Statement
  const statementRows = useMemo(() => {
    const combined: (Omit<StatementRowItem, 'runningBalance'>)[] = [];

    // Earliest date for Initial Balance row
    let earliestDate: Date;
    if (customer.createdAt?.toMillis) {
      earliestDate = new Date(customer.createdAt.toMillis());
    } else if (sales.length > 0 && sales[sales.length - 1]?.date) {
      earliestDate = new Date(new Date(sales[sales.length - 1].date).getTime() - 86400000);
    } else {
      earliestDate = new Date();
    }

    // 1. Initial / Opening Balance Row (only if non-zero initial balance)
    if (initialBalance && Number(initialBalance) !== 0) {
      combined.push({
        id: 'initial-balance-row',
        date: earliestDate.toISOString(),
        dateObj: earliestDate,
        sortOrder: 0, // Top priority
        type: 'Initial Balance',
        refNo: 'INITIAL-BAL',
        description: 'Account Opening / Initial Balance',
        debit: Number(initialBalance) > 0 ? Number(initialBalance) : 0,
        credit: Number(initialBalance) < 0 ? Math.abs(Number(initialBalance)) : 0,
        mode: 'Opening',
      });
    }

    // 2. Sales Invoices (Debit)
    sales.forEach(sale => {
      const saleTotal = Number(sale.total) || 0;
      if (saleTotal <= 0) return; // Do not include entries where there is no credit and no debit

      const itemsCount = sale.items?.length || 0;
      const itemsDesc = sale.items?.slice(0, 2).map((it: any) => it.name).join(', ') + (itemsCount > 2 ? ` +${itemsCount - 2} more` : '');

      const saleDate = sale.date || '';
      combined.push({
        id: `sale-${sale.id}`,
        date: saleDate,
        dateObj: new Date(saleDate || 0),
        sortOrder: 1,
        type: 'Invoice',
        refNo: sale.invoiceNo || `INV-${sale.id.slice(-6).toUpperCase()}`,
        description: `Sales Invoice (${itemsCount} item${itemsCount === 1 ? '' : 's'}${itemsDesc ? `: ${itemsDesc}` : ''})`,
        debit: saleTotal,
        credit: 0,
        rawSale: sale,
        mode: sale.paymentMode || 'Credit',
        bankInfo: sale.bankName ? `${sale.bankName} (${sale.bankAccountNumber})` : undefined
      });
    });

    // 3. Customer Payments & Returns (Credit)
    const existingReturnRefs = new Set<string>();
    const seenInvoicePaymentSaleIds = new Set<string>();
    const coveredSaleIds = new Set<string>();
    const coveredInvoiceNos = new Set<string>();

    payments.forEach(payment => {
      const isReturn = payment.type === 'ReturnCredit' || (payment.refundAmount && payment.refundAmount > 0);
      const amount = isReturn ? (Number(payment.refundAmount) || 0) : (Number(payment.paidAmount) || 0);
      if (amount <= 0) return; // Do not include entries where there is no credit and no debit

      const dateVal = payment.paymentDate || (payment.createdAt?.toMillis ? new Date(payment.createdAt.toMillis()).toISOString() : '');
      if (isReturn) {
        if (payment.referenceNo) existingReturnRefs.add(payment.referenceNo);
        if (payment.saleId) existingReturnRefs.add(`sale-${payment.saleId}`);
      } else if (payment.type === 'InvoicePayment' && payment.saleId) {
        // Prevent duplicate InvoicePayment records for the same saleId
        if (seenInvoicePaymentSaleIds.has(payment.saleId)) return;
        seenInvoicePaymentSaleIds.add(payment.saleId);
      }

      if (payment.saleId) coveredSaleIds.add(payment.saleId);
      if (payment.invoiceNo) coveredInvoiceNos.add(payment.invoiceNo);
      
      combined.push({
        id: `pay-${payment.id}`,
        date: dateVal,
        dateObj: new Date(dateVal || 0),
        sortOrder: 2,
        type: isReturn ? 'Return' : 'Payment',
        refNo: payment.invoiceNo || payment.referenceNo || `PAY-${payment.id.slice(-6).toUpperCase()}`,
        description: payment.notes || (isReturn ? 'Sales Return Refund Credit' : (payment.invoiceNo ? `Payment on Invoice #${payment.invoiceNo}` : 'Account Settlement Payment')),
        debit: 0,
        credit: amount,
        rawPayment: payment,
        mode: payment.paymentMode || 'Cash',
        bankInfo: payment.bankName ? `${payment.bankName} (${payment.bankAccountNumber})` : undefined
      });
    });

    // 4. Ensure payments recorded directly on sales invoices are credited if not present in customerPayments collection
    sales.forEach(sale => {
      const paid = sale.paidAmount !== undefined 
        ? (Number(sale.paidAmount) || 0) 
        : (sale.status === 'Paid' ? (Number(sale.total) || 0) : 0);
      if (paid > 0 && !coveredSaleIds.has(sale.id) && (!sale.invoiceNo || !coveredInvoiceNos.has(sale.invoiceNo))) {
        const saleDate = sale.date || '';
        combined.push({
          id: `pay-auto-${sale.id}`,
          date: saleDate,
          dateObj: new Date(saleDate || 0),
          sortOrder: 2,
          type: 'Payment',
          refNo: sale.invoiceNo ? `PAY-${sale.invoiceNo}` : `PAY-${sale.id.slice(-6).toUpperCase()}`,
          description: `Payment on Invoice #${sale.invoiceNo || sale.id}`,
          debit: 0,
          credit: paid,
          rawSale: sale,
          mode: sale.paymentMode || 'Cash',
          bankInfo: sale.bankName ? `${sale.bankName} (${sale.bankAccountNumber})` : undefined
        });
      }
    });

    // 5. Sales Returns recorded on Invoices (Credit) not already logged in customer payments
    sales.forEach(sale => {
      if (Array.isArray(sale.returns) && sale.returns.length > 0) {
        sale.returns.forEach((r: any) => {
          if (r.id && existingReturnRefs.has(r.id)) return;
          const returnAmt = Number(r.totalRefund) || 0;
          if (returnAmt <= 0) return; // Do not include entries where there is no credit and no debit

          const returnDate = r.returnDate || sale.date || '';
          combined.push({
            id: `ret-${r.id || Math.random()}`,
            date: returnDate,
            dateObj: new Date(returnDate || 0),
            sortOrder: 2,
            type: 'Return',
            refNo: r.id || `RET-${sale.invoiceNo}`,
            description: r.notes || `Sales Return on Inv #${sale.invoiceNo}${r.reason ? ` (${r.reason})` : ''}`,
            debit: 0,
            credit: returnAmt,
            mode: r.refundMode || 'Customer Credit',
            bankInfo: r.bankName ? `${r.bankName} (${r.bankAccountNumber})` : undefined
          });
        });
      } else if (typeof sale.totalRefunded === 'number' && sale.totalRefunded > 0 && !existingReturnRefs.has(`sale-${sale.id}`)) {
        const returnDate = sale.date || '';
        combined.push({
          id: `ret-sale-${sale.id}`,
          date: returnDate,
          dateObj: new Date(returnDate || 0),
          sortOrder: 2,
          type: 'Return',
          refNo: `RET-${sale.invoiceNo}`,
          description: `Sales Return on Inv #${sale.invoiceNo}`,
          debit: 0,
          credit: sale.totalRefunded,
          mode: 'Return Credit'
        });
      }
    });

    // Filter out entries where there is no credit and no debit
    const validEntries = combined.filter(item => {
      const debit = Number(item.debit) || 0;
      const credit = Number(item.credit) || 0;
      return debit > 0 || credit > 0;
    });

    // Sort chronologically ascending to calculate running balance
    validEntries.sort((a, b) => {
      const diff = a.dateObj.getTime() - b.dateObj.getTime();
      if (diff !== 0) return diff;
      return a.sortOrder - b.sortOrder;
    });

    // Calculate running balance starting from Initial Balance
    let running = 0;
    return validEntries.map(item => {
      running = Number((running + item.debit - item.credit).toFixed(2));
      return {
        ...item,
        runningBalance: running
      };
    });
  }, [sales, payments, customer, initialBalance]);

  // Final Net Running Balance at the end of Statement rows
  const finalRunningBalance = useMemo(() => {
    if (statementRows.length > 0) {
      return statementRows[statementRows.length - 1].runningBalance;
    }
    return Number((initialBalance || 0).toFixed(2));
  }, [statementRows, initialBalance]);

  // Financial calculations derived consistently from ledger statement rows
  const financialTotals = useMemo(() => {
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalReturnValue = 0;

    statementRows.forEach(item => {
      if (item.type === 'Invoice') {
        totalInvoiced += (item.debit || 0);
      } else if (item.type === 'Payment') {
        totalPaid += (item.credit || 0);
      } else if (item.type === 'Return') {
        totalReturnValue += (item.credit || 0);
      }
    });

    totalInvoiced = Number(totalInvoiced.toFixed(2));
    totalPaid = Number(totalPaid.toFixed(2));
    totalReturnValue = Number(totalReturnValue.toFixed(2));
    const totalPending = Math.max(0, Number((totalInvoiced - totalPaid - totalReturnValue).toFixed(2)));

    // User Requirement: Net Account Balance should be strictly identical to final Net Running Balance in the statement
    return {
      initialBalance,
      totalInvoiced,
      totalPaid,
      totalPending,
      totalReturnValue,
      currentBalance: finalRunningBalance
    };
  }, [statementRows, initialBalance, finalRunningBalance]);

  // Automatically keep customer.balance in Firestore synced with the ledger's true Net Account Balance
  useEffect(() => {
    if (!customer?.id || loading) return;
    const currentStoredBal = customer.balance !== undefined ? Number(customer.balance) : null;
    if (currentStoredBal !== null && Math.abs(currentStoredBal - financialTotals.currentBalance) > 0.01) {
      try {
        const custRef = doc(db, 'customers', customer.id);
        updateDoc(custRef, {
          balance: financialTotals.currentBalance,
          updatedAt: serverTimestamp()
        }).catch(err => console.warn('Could not sync customer balance in Firestore:', err));
      } catch (e) {
        console.warn('Sync customer balance error:', e);
      }
    }
  }, [customer?.id, customer?.balance, financialTotals.currentBalance, loading]);

  // Handlers for Editing & Deleting Invoices
  const handleOpenEditInvoice = (sale: CustomerSaleRecord) => {
    const paid = sale.paidAmount !== undefined 
      ? sale.paidAmount 
      : (sale.status === 'Paid' ? sale.total : 0);
    setInvoiceEditForm({
      date: sale.date ? sale.date.split('T')[0] : new Date().toISOString().split('T')[0],
      total: (sale.total || 0).toString(),
      paidAmount: paid.toString(),
      paymentMode: (sale.paymentMode === 'Online' ? 'Online' : 'Cash'),
      bankAccountNumber: sale.bankAccountNumber || '',
      bankName: sale.bankName || '',
      status: sale.status || 'Paid',
      notes: sale.notes || ''
    });
    setEditingInvoice(sale);
  };

  const handleSaveEditInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoice || !activeStoreId) return;

    const totalNum = parseFloat(invoiceEditForm.total);
    const paidNum = parseFloat(invoiceEditForm.paidAmount);

    if (isNaN(totalNum) || totalNum < 0) {
      toast.error('Please enter a valid invoice total amount');
      return;
    }
    if (isNaN(paidNum) || paidNum < 0) {
      toast.error('Please enter a valid paid amount');
      return;
    }
    if (paidNum > totalNum) {
      toast.error('Paid amount cannot exceed total invoice amount');
      return;
    }

    const pendingNum = Math.max(0, Number((totalNum - paidNum).toFixed(2)));
    const calculatedStatus = pendingNum === 0 ? 'Paid' : (paidNum > 0 ? 'Partial' : 'Pending');

    const matchedBank = invoiceEditForm.paymentMode === 'Online'
      ? bankAccounts.find(b => b.accountNumber === invoiceEditForm.bankAccountNumber)
      : null;

    setProcessingAction(true);
    try {
      const invoiceRef = doc(db, 'sales', editingInvoice.id);

      // Reconcile store bank balance if Online payment amount or account changed
      const oldPaid = editingInvoice.paidAmount !== undefined 
        ? editingInvoice.paidAmount 
        : (editingInvoice.status === 'Paid' ? editingInvoice.total : 0);
      const wasOnline = editingInvoice.paymentMode === 'Online';
      const isOnline = invoiceEditForm.paymentMode === 'Online';

      if (activeStoreId && (wasOnline || isOnline)) {
        try {
          const storeRef = doc(db, 'stores', activeStoreId);
          const storeSnap = await getDoc(storeRef);
          if (storeSnap.exists()) {
            const storeData = storeSnap.data();
            let currentAccounts = Array.isArray(storeData.bankAccounts) ? [...storeData.bankAccounts] : [];
            let changed = false;

            if (wasOnline && editingInvoice.bankAccountNumber && oldPaid > 0) {
              currentAccounts = currentAccounts.map((acc: any) => {
                if (acc.accountNumber === editingInvoice.bankAccountNumber) {
                  changed = true;
                  const curBal = typeof acc.balance === 'number' ? acc.balance : (parseFloat(acc.balance) || 0);
                  return { ...acc, balance: Number((curBal - oldPaid).toFixed(2)) };
                }
                return acc;
              });
            }

            if (isOnline && invoiceEditForm.bankAccountNumber && paidNum > 0) {
              currentAccounts = currentAccounts.map((acc: any) => {
                if (acc.accountNumber === invoiceEditForm.bankAccountNumber) {
                  changed = true;
                  const curBal = typeof acc.balance === 'number' ? acc.balance : (parseFloat(acc.balance) || 0);
                  return { ...acc, balance: Number((curBal + paidNum).toFixed(2)) };
                }
                return acc;
              });
            }

            if (changed) {
              await updateDoc(storeRef, { bankAccounts: currentAccounts, updatedAt: serverTimestamp() });
            }
          }
        } catch (bankErr) {
          console.warn('Bank account reconcile error on invoice edit:', bankErr);
        }
      }

      await updateDoc(invoiceRef, cleanDataForFirestore({
        date: invoiceEditForm.date || editingInvoice.date,
        total: totalNum,
        paidAmount: paidNum,
        pendingAmount: pendingNum,
        status: calculatedStatus,
        paymentMode: invoiceEditForm.paymentMode,
        bankAccountNumber: isOnline && matchedBank ? matchedBank.accountNumber : null,
        bankName: isOnline && matchedBank ? matchedBank.bankName : null,
        notes: invoiceEditForm.notes.trim() || null,
        updatedAt: serverTimestamp()
      }));

      toast.success(`Invoice ${editingInvoice.invoiceNo} updated successfully!`);
      setEditingInvoice(null);
    } catch (err: any) {
      console.error('Error updating invoice:', err);
      toast.error(`Failed to update invoice: ${err.message || 'Unknown error'}`);
    } finally {
      setProcessingAction(false);
    }
  };

  const handleExecuteDeleteInvoice = async () => {
    if (!deletingInvoice || !activeStoreId) return;

    setProcessingAction(true);
    try {
      const salePaidAmount = deletingInvoice.paidAmount !== undefined 
        ? deletingInvoice.paidAmount 
        : (deletingInvoice.status === 'Paid' ? deletingInvoice.total : 0);

      // Revert store bank account balance if Online
      if (deletingInvoice.paymentMode === 'Online' && deletingInvoice.bankAccountNumber && salePaidAmount > 0 && activeStoreId) {
        try {
          const storeRef = doc(db, 'stores', activeStoreId);
          const storeSnap = await getDoc(storeRef);
          if (storeSnap.exists()) {
            const storeData = storeSnap.data();
            let currentAccounts = Array.isArray(storeData.bankAccounts) ? [...storeData.bankAccounts] : [];
            currentAccounts = currentAccounts.map((acc: any) => {
              if (acc.accountNumber === deletingInvoice.bankAccountNumber) {
                const curBal = typeof acc.balance === 'number' ? acc.balance : (parseFloat(acc.balance) || 0);
                return { ...acc, balance: Number((curBal - salePaidAmount).toFixed(2)) };
              }
              return acc;
            });
            await updateDoc(storeRef, { bankAccounts: currentAccounts, updatedAt: serverTimestamp() });
          }
        } catch (storeErr) {
          console.warn('Bank balance revert error on invoice delete:', storeErr);
        }
      }

      // Delete invoice document
      await deleteDoc(doc(db, 'sales', deletingInvoice.id));
      toast.success(`Invoice ${deletingInvoice.invoiceNo} has been deleted successfully!`);
      setDeletingInvoice(null);
    } catch (err: any) {
      console.error('Error deleting invoice:', err);
      toast.error(`Failed to delete invoice: ${err.message || 'Unknown error'}`);
    } finally {
      setProcessingAction(false);
    }
  };

  // Handlers for Editing & Deleting Payments
  const handleOpenEditPayment = (p: CustomerPaymentRecord) => {
    const isCredit = p.type === 'ReturnCredit' || (p.refundAmount && p.refundAmount > 0);
    const amt = isCredit ? (p.refundAmount || 0) : (p.paidAmount || 0);
    const dateVal = p.paymentDate 
      ? p.paymentDate.split('T')[0] 
      : (p.createdAt?.toMillis ? new Date(p.createdAt.toMillis()).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);

    setPaymentEditForm({
      paidAmount: amt.toString(),
      paymentDate: dateVal,
      paymentMode: (p.paymentMode === 'Online' ? 'Online' : 'Cash'),
      bankAccountNumber: p.bankAccountNumber || '',
      bankName: p.bankName || '',
      referenceNo: p.referenceNo || p.invoiceNo || '',
      notes: p.notes || ''
    });
    setEditingPayment(p);
  };

  const handleSaveEditPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment || !activeStoreId) return;

    const newAmount = parseFloat(paymentEditForm.paidAmount);
    if (isNaN(newAmount) || newAmount <= 0) {
      toast.error('Please enter a valid payment amount greater than zero');
      return;
    }

    const matchedBank = paymentEditForm.paymentMode === 'Online'
      ? bankAccounts.find(b => b.accountNumber === paymentEditForm.bankAccountNumber)
      : null;

    setProcessingAction(true);
    try {
      const isCredit = editingPayment.type === 'ReturnCredit' || (editingPayment.refundAmount && editingPayment.refundAmount > 0);
      const oldAmount = isCredit ? (editingPayment.refundAmount || 0) : (editingPayment.paidAmount || 0);
      const wasOnline = editingPayment.paymentMode === 'Online';
      const isOnline = paymentEditForm.paymentMode === 'Online';

      // Reconcile bank balance if Online
      if (activeStoreId && (wasOnline || isOnline)) {
        try {
          const storeRef = doc(db, 'stores', activeStoreId);
          const storeSnap = await getDoc(storeRef);
          if (storeSnap.exists()) {
            const storeData = storeSnap.data();
            let currentAccounts = Array.isArray(storeData.bankAccounts) ? [...storeData.bankAccounts] : [];
            let changed = false;

            if (wasOnline && editingPayment.bankAccountNumber && oldAmount > 0) {
              currentAccounts = currentAccounts.map((acc: any) => {
                if (acc.accountNumber === editingPayment.bankAccountNumber) {
                  changed = true;
                  const curBal = typeof acc.balance === 'number' ? acc.balance : (parseFloat(acc.balance) || 0);
                  return { ...acc, balance: Number((curBal - oldAmount).toFixed(2)) };
                }
                return acc;
              });
            }

            if (isOnline && paymentEditForm.bankAccountNumber && newAmount > 0) {
              currentAccounts = currentAccounts.map((acc: any) => {
                if (acc.accountNumber === paymentEditForm.bankAccountNumber) {
                  changed = true;
                  const curBal = typeof acc.balance === 'number' ? acc.balance : (parseFloat(acc.balance) || 0);
                  return { ...acc, balance: Number((curBal + newAmount).toFixed(2)) };
                }
                return acc;
              });
            }

            if (changed) {
              await updateDoc(storeRef, { bankAccounts: currentAccounts, updatedAt: serverTimestamp() });
            }
          }
        } catch (bankErr) {
          console.warn('Bank balance reconcile error on payment edit:', bankErr);
        }
      }

      const paymentRef = doc(db, 'customerPayments', editingPayment.id);
      const updateData: any = {
        paymentDate: paymentEditForm.paymentDate,
        paymentMode: paymentEditForm.paymentMode,
        bankAccountNumber: isOnline && matchedBank ? matchedBank.accountNumber : null,
        bankName: isOnline && matchedBank ? matchedBank.bankName : null,
        referenceNo: paymentEditForm.referenceNo.trim() || editingPayment.referenceNo || null,
        notes: paymentEditForm.notes.trim() || null,
        updatedAt: serverTimestamp()
      };

      if (isCredit) {
        updateData.refundAmount = newAmount;
      } else {
        updateData.paidAmount = newAmount;
      }

      await updateDoc(paymentRef, cleanDataForFirestore(updateData));
      toast.success('Payment receipt record updated successfully!');
      setEditingPayment(null);
    } catch (err: any) {
      console.error('Error updating payment:', err);
      toast.error(`Failed to update payment: ${err.message || 'Unknown error'}`);
    } finally {
      setProcessingAction(false);
    }
  };

  const handleExecuteDeletePayment = async () => {
    if (!deletingPayment || !activeStoreId) return;

    setProcessingAction(true);
    try {
      const isCredit = deletingPayment.type === 'ReturnCredit' || (deletingPayment.refundAmount && deletingPayment.refundAmount > 0);
      const deletedAmount = isCredit ? (deletingPayment.refundAmount || 0) : (deletingPayment.paidAmount || 0);

      // Revert store bank account if Online
      if (deletingPayment.paymentMode === 'Online' && deletingPayment.bankAccountNumber && deletedAmount > 0 && activeStoreId) {
        try {
          const storeRef = doc(db, 'stores', activeStoreId);
          const storeSnap = await getDoc(storeRef);
          if (storeSnap.exists()) {
            const storeData = storeSnap.data();
            let currentAccounts = Array.isArray(storeData.bankAccounts) ? [...storeData.bankAccounts] : [];
            currentAccounts = currentAccounts.map((acc: any) => {
              if (acc.accountNumber === deletingPayment.bankAccountNumber) {
                const curBal = typeof acc.balance === 'number' ? acc.balance : (parseFloat(acc.balance) || 0);
                return { ...acc, balance: Number((curBal - deletedAmount).toFixed(2)) };
              }
              return acc;
            });
            await updateDoc(storeRef, { bankAccounts: currentAccounts, updatedAt: serverTimestamp() });
          }
        } catch (bErr) {
          console.warn('Bank balance update error on payment delete:', bErr);
        }
      }

      await deleteDoc(doc(db, 'customerPayments', deletingPayment.id));
      toast.success(`Payment record ${deletingPayment.referenceNo || deletingPayment.invoiceNo || deletingPayment.id} deleted successfully!`);
      setDeletingPayment(null);
    } catch (err: any) {
      console.error('Error deleting payment:', err);
      toast.error(`Failed to delete payment: ${err.message || 'Unknown error'}`);
    } finally {
      setProcessingAction(false);
    }
  };
  const printPaymentReceipt = (payment: CustomerPaymentRecord) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.info('Popup blocked. Please allow popups to print payment receipt.');
      return;
    }

    const receiptHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payment Receipt - ${payment.referenceNo || payment.id}</title>
          <style>
            @page { size: 80mm auto; margin: 4mm; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              width: 72mm;
              margin: 0 auto;
              padding: 6px;
              color: #000;
              font-size: 11px;
              line-height: 1.35;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .font-mono { font-family: monospace; }
            .divider { border-top: 1px dashed #000; margin: 6px 0; }
            .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
            .title { font-size: 14px; font-weight: 900; text-transform: uppercase; margin-bottom: 2px; }
            .badge { display: inline-block; padding: 2px 6px; border: 1px solid #000; font-weight: bold; font-size: 10px; text-transform: uppercase; margin: 4px 0; }
            .amount-box { border: 1.5px solid #000; padding: 6px; text-align: center; margin: 6px 0; }
            .amount-val { font-size: 16px; font-weight: 900; }
            .footer { margin-top: 14px; text-align: center; font-size: 9px; }
            .sig-line { margin-top: 25px; border-top: 1px dotted #000; padding-top: 3px; text-align: center; font-size: 9px; }
          </style>
        </head>
        <body>
          <div class="text-center">
            <div class="title">${storeDetails?.name || 'OFFICIAL PAYMENT RECEIPT'}</div>
            ${storeDetails?.phone ? `<div>Phone: ${storeDetails.phone}</div>` : ''}
            ${storeDetails?.address ? `<div>Address: ${storeDetails.address}</div>` : ''}
            <div class="badge">Payment Receipt Voucher</div>
          </div>
          
          <div class="divider"></div>
          
          <div class="row">
            <span>Receipt #:</span>
            <span class="font-mono font-bold">${payment.referenceNo || payment.id.slice(-8).toUpperCase()}</span>
          </div>
          <div class="row">
            <span>Date:</span>
            <span>${payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : new Date().toLocaleDateString()}</span>
          </div>
          <div class="row">
            <span>Customer:</span>
            <span class="font-bold">${customer.name}</span>
          </div>
          <div class="row">
            <span>Mobile:</span>
            <span>${customer.mobile || '—'}</span>
          </div>
          ${customer.city ? `
          <div class="row">
            <span>City:</span>
            <span>${customer.city}</span>
          </div>` : ''}
          
          <div class="divider"></div>
          
          <div class="amount-box">
            <div style="font-size: 10px; font-weight: bold; text-transform: uppercase;">Amount Received</div>
            <div class="amount-val font-mono">PKR ${(payment.paidAmount || 0).toFixed(2)}</div>
            <div style="font-size: 9px;">Mode: ${payment.paymentMode || 'Cash'} ${payment.bankName ? `(${payment.bankName})` : ''}</div>
          </div>

          <div class="row">
            <span>Remaining Balance:</span>
            <span class="font-mono font-bold">PKR ${(payment.pendingAmount !== undefined ? payment.pendingAmount : (customer.balance || 0)).toFixed(2)}</span>
          </div>
          ${payment.notes ? `
          <div style="margin-top: 4px; font-size: 9.5px;">
            <span class="font-bold">Remarks:</span> ${payment.notes}
          </div>` : ''}

          <div class="sig-line">
            Received by Authorized Representative
          </div>

          <div class="footer">
            Thank you for your business!<br/>
            Printed on: ${new Date().toLocaleString()}
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(() => window.close(), 800);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
  };

  // Handle recording manual payment from customer
  const handleReceivePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer?.id) {
      toast.error('Customer information is missing.');
      return;
    }

    const effectiveStoreId = activeStoreId;
    if (!effectiveStoreId) {
      toast.error('Store ID could not be determined. Please refresh the page and try again.');
      return;
    }

    const amount = parseFloat(receivingAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid payment amount greater than 0');
      return;
    }

    if (paymentMode === 'Online' && !selectedBankAcc) {
      toast.error('Please select a store bank account for the online transfer');
      return;
    }

    setSubmittingPayment(true);
    try {
      const matchedBank = paymentMode === 'Online'
        ? bankAccounts.find(b => b.accountNumber === selectedBankAcc)
        : null;

      // 1. Determine customer balance safely
      const customerRef = doc(db, 'customers', customer.id);
      const currentCustBal = financialTotals.currentBalance > 0 ? financialTotals.currentBalance : (customer.balance || 0);
      const newBalance = Number(Math.max(0, currentCustBal - amount).toFixed(2));

      // 2. Prepare customerPayments entry
      const paymentRecordId = doc(collection(db, 'customerPayments')).id;
      const paymentRef = doc(db, 'customerPayments', paymentRecordId);
      const receiptNo = `RCPT-${Date.now().toString(36).toUpperCase()}`;

      // Resolve storeId ensuring isStoreOwner match
      const safeStoreId = effectiveStoreId || auth.currentUser?.uid || user?.uid || customer?.storeId || '';

      const paymentRecordPayload = cleanDataForFirestore({
        id: paymentRecordId,
        storeId: safeStoreId,
        customerId: customer.id,
        customerName: customer.name || 'Customer',
        totalAmount: 0,
        paidAmount: amount,
        pendingAmount: newBalance,
        paymentMode: paymentMode || 'Cash',
        bankAccountNumber: paymentMode === 'Online' && matchedBank ? (matchedBank.accountNumber || null) : null,
        bankName: paymentMode === 'Online' && matchedBank ? (matchedBank.bankName || null) : null,
        paymentDate: paymentDate || new Date().toISOString().split('T')[0],
        type: 'PaymentReceived',
        referenceNo: receiptNo,
        notes: paymentNotes.trim() || `Received PKR ${amount.toFixed(2)} payment against customer balance`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Write payment record directly
      await setDoc(paymentRef, paymentRecordPayload);

      // Update customer balance safely without touching storeId or overwriting other customer fields
      try {
        await updateDoc(customerRef, {
          balance: newBalance,
          updatedAt: serverTimestamp()
        });
      } catch (custUpdateErr) {
        console.warn('updateDoc on customer failed, attempting merge setDoc:', custUpdateErr);
        await setDoc(customerRef, {
          balance: newBalance,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // 3. Reconcile / allocate payment across pending customer invoices (FIFO) in isolated try/catch
      try {
        let remainingToAllocate = amount;
        const pendingSales = [...sales]
          .filter(s => {
            const pending = s.pendingAmount !== undefined 
              ? s.pendingAmount 
              : (s.status === 'Pending' ? s.total : 0);
            return (pending > 0) || s.status === 'Pending' || s.status === 'Partial';
          })
          .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime())
          .slice(0, 50);

        for (const pendingSale of pendingSales) {
          if (remainingToAllocate <= 0) break;
          const currentPending = pendingSale.pendingAmount !== undefined 
            ? pendingSale.pendingAmount 
            : (pendingSale.status === 'Pending' ? pendingSale.total : 0);
          const currentPaid = pendingSale.paidAmount !== undefined 
            ? pendingSale.paidAmount 
            : (pendingSale.status === 'Paid' ? pendingSale.total : 0);

          if (currentPending <= 0) continue;

          const allocation = Math.min(remainingToAllocate, currentPending);
          const newSalePaid = Number((currentPaid + allocation).toFixed(2));
          const newSalePending = Number(Math.max(0, currentPending - allocation).toFixed(2));
          const newSaleStatus = newSalePending === 0 ? 'Paid' : 'Partial';

          const saleRef = doc(db, 'sales', pendingSale.id);
          try {
            await updateDoc(saleRef, {
              paidAmount: newSalePaid,
              pendingAmount: newSalePending,
              status: newSaleStatus,
              updatedAt: serverTimestamp()
            });
          } catch (saleUpErr) {
            console.warn(`Could not update sales invoice ${pendingSale.id} status:`, saleUpErr);
          }

          remainingToAllocate = Number((remainingToAllocate - allocation).toFixed(2));
        }
      } catch (allocErr) {
        console.warn('Could not complete sales invoice allocation (payment was still recorded successfully):', allocErr);
      }

      // 4. Update store bank account balance if Online payment in isolated try/catch
      if (paymentMode === 'Online' && selectedBankAcc && safeStoreId) {
        try {
          const storeRef = doc(db, 'stores', safeStoreId);
          const storeSnap = await getDoc(storeRef);
          if (storeSnap.exists()) {
            const storeData = storeSnap.data();
            let currentAccounts = Array.isArray(storeData.bankAccounts) ? [...storeData.bankAccounts] : [];
            let bankFound = false;
            currentAccounts = currentAccounts.map((acc: any) => {
              if (typeof acc === 'string') {
                return { bankName: 'Bank', accountNumber: acc, openingBalance: 0, balance: 0 };
              }
              const opBal = typeof acc.openingBalance === 'number' ? acc.openingBalance : (parseFloat(acc.openingBalance) || 0);
              const curBal = typeof acc.balance === 'number' ? acc.balance : (parseFloat(acc.balance) || opBal);
              if (acc.accountNumber === selectedBankAcc) {
                bankFound = true;
                return {
                  ...acc,
                  bankName: acc.bankName || 'Bank',
                  accountNumber: acc.accountNumber,
                  balance: Number((curBal + amount).toFixed(2))
                };
              }
              return acc;
            });

            if (bankFound) {
              await updateDoc(storeRef, {
                bankAccounts: currentAccounts,
                updatedAt: serverTimestamp()
              });
            }
          }
        } catch (bankErr) {
          console.warn('Could not update store bank account balance (payment was still recorded):', bankErr);
        }
      }

      toast.success(`Successfully recorded payment receipt of PKR ${amount.toFixed(2)} for ${customer.name}!`);
      setReceivingAmount('');
      setPaymentNotes('');
      setShowReceiveForm(false);
    } catch (err: any) {
      console.error('Error recording payment:', err);
      const errorDetail = err?.message ? `: ${err.message}` : '. Please try again.';
      toast.error(`Failed to record payment${errorDetail}`);
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Date filtering helper
  const filterByDate = (dateStr?: string) => {
    if (dateFilter === 'all' || !dateStr) return true;
    const d = new Date(dateStr);
    const now = new Date();
    if (dateFilter === 'month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (dateFilter === 'year') {
      return d.getFullYear() === now.getFullYear();
    }
    return true;
  };

  // Filtered Sales
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      const matchesDate = filterByDate(s.date);
      if (!matchesDate) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const matchInvoice = s.invoiceNo?.toLowerCase().includes(term);
      const matchMode = s.paymentMode?.toLowerCase().includes(term);
      const matchStatus = s.status?.toLowerCase().includes(term);
      const matchBank = (s.bankName && s.bankName.toLowerCase().includes(term)) || (s.bankAccountNumber && s.bankAccountNumber.includes(term));
      const matchItem = s.items?.some(i => 
        i.productName.toLowerCase().includes(term) || 
        i.modelNumber?.toLowerCase().includes(term) ||
        i.selectedSerials?.some(sn => sn.toLowerCase().includes(term))
      );
      return matchInvoice || matchMode || matchStatus || matchBank || matchItem;
    });
  }, [sales, searchTerm, dateFilter]);

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      // Filter out entries where there is no credit and no debit (no paid/refund amount)
      const isCredit = p.type === 'ReturnCredit' || (p.refundAmount && p.refundAmount > 0);
      const displayAmount = isCredit ? (p.refundAmount || 0) : (p.paidAmount || 0);
      if (!displayAmount || displayAmount <= 0) return false;

      const matchesDate = filterByDate(p.paymentDate);
      if (!matchesDate) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        (p.invoiceNo && p.invoiceNo.toLowerCase().includes(term)) ||
        (p.paymentMode && p.paymentMode.toLowerCase().includes(term)) ||
        (p.notes && p.notes.toLowerCase().includes(term)) ||
        (p.type && p.type.toLowerCase().includes(term)) ||
        (p.bankName && p.bankName.toLowerCase().includes(term)) ||
        (p.bankAccountNumber && p.bankAccountNumber.includes(term))
      );
    });
  }, [payments, searchTerm, dateFilter]);

  // Generate Statement HTML for Printing and PDF Download
  const generateCustomerLedgerHtml = (): string => {
    const rowsHtml = statementRows.length > 0 ? statementRows.map((r) => `
      <tr style="border-bottom: 1px solid #cbd5e1; ${r.type === 'Initial Balance' ? 'background-color: #f1f5f3; font-weight: bold;' : ''}">
        <td style="padding: 6px 5px; border-right: 1px solid #e2e8f0; font-size: 9.5px; white-space: nowrap;">
          ${r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
        </td>
        <td style="padding: 6px 4px; border-right: 1px solid #e2e8f0; text-align: center;">
          <span style="display: inline-block; padding: 2px 5px; font-size: 8.5px; font-weight: 700; border-radius: 4px; white-space: nowrap; ${
            r.type === 'Initial Balance' ? 'background-color: #d1e7dd; color: #0a382c;' :
            r.type === 'Invoice' ? 'background-color: #e2e8f0; color: #1e293b;' :
            r.type === 'Return' ? 'background-color: #f3e8ff; color: #6b21a8;' :
            'background-color: #dcfce7; color: #15803d;'
          }">${r.type}</span>
        </td>
        <td style="padding: 6px 5px; border-right: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; font-size: 9.5px; word-break: break-all;">${r.refNo}</td>
        <td style="padding: 6px 5px; border-right: 1px solid #e2e8f0; font-size: 9.5px; word-break: break-word; overflow-wrap: break-word; line-height: 1.35;">${r.description}</td>
        <td style="padding: 6px 5px; border-right: 1px solid #e2e8f0; text-align: right; font-weight: bold; font-size: 9.5px; white-space: nowrap;">${r.debit > 0 ? 'PKR ' + r.debit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
        <td style="padding: 6px 5px; border-right: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #15803d; font-size: 9.5px; white-space: nowrap;">${r.credit > 0 ? 'PKR ' + r.credit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
        <td style="padding: 6px 5px; text-align: right; font-weight: 900; font-family: monospace; font-size: 9.5px; white-space: nowrap; ${r.runningBalance > 0 ? 'color: #991b1b;' : 'color: #065f46;'}">
          PKR ${r.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
      </tr>
    `).join('') : `
      <tr>
        <td colspan="7" style="padding: 24px 8px; text-align: center; color: #64748b; font-style: italic; font-size: 11px;">
          No transactions or ledger entries recorded for this customer.
        </td>
      </tr>
    `;

    const statementHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Customer Account Statement - ${customer.name}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400;1,700&family=Cinzel:wght@700;800;900&family=Playfair+Display:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
          <style>
            @page {
              size: A4 landscape;
              margin: 8mm;
            }
            body, .pdf-export-wrapper {
              font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              color: #0f172a;
              background-color: #ffffff;
              margin: 0;
              padding: 0;
              font-size: 11px;
              line-height: 1.35;
              width: 100%;
              box-sizing: border-box;
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
              border-bottom: 3px solid #000000;
              margin-top: 8px;
              margin-bottom: 12px;
            }
            .logo-cell {
              width: 96px;
              vertical-align: top;
              text-align: left;
              padding: 0;
            }
            .logo-container {
              width: 96px;
              height: 96px;
              border-radius: 12px;
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
              width: 96px;
              height: 96px;
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
              vertical-align: top;
              padding: 0 12px 0 12px;
            }
            .right-spacer-cell {
              width: 96px;
              vertical-align: top;
              text-align: right;
            }
            .company-name {
              font-family: 'Cinzel', 'Playfair Display', 'Plus Jakarta Sans', Georgia, serif;
              font-size: 44px;
              font-weight: 900;
              color: #000000;
              margin: -8px 0 0 0;
              padding: 0;
              line-height: 1.15;
              text-align: center;
              letter-spacing: -0.02em;
              text-decoration: none !important;
              border-bottom: none !important;
            }
            .company-title-underline {
              display: inline-block;
              border-bottom: none !important;
              padding-bottom: 0;
              line-height: 1.1;
              text-decoration: none !important;
            }
            .details-cell {
              padding-top: 2px;
              padding-bottom: 0;
              vertical-align: top;
              text-align: left;
            }
            .company-left-details {
              font-family: 'Calibri', 'Carlito', Candara, Segoe, 'Segoe UI', Arial, sans-serif;
              font-size: 15px;
              line-height: 1.35;
              color: #000000;
              text-align: left;
              margin-top: 3px;
            }
            .left-detail-row {
              margin-bottom: 2px;
              color: #000000;
            }
            .left-detail-label {
              font-weight: 700;
              color: #000000;
              margin-right: 5px;
            }
            .summary-cards-table {
              width: 100% !important;
              max-width: 100% !important;
              table-layout: fixed !important;
              border-collapse: separate !important;
              border-spacing: 7px 0 !important;
              margin-bottom: 14px !important;
              box-sizing: border-box !important;
            }
            .summary-card-cell {
              border: 1px solid #cbd5e1;
              background-color: #f8fafc;
              padding: 8px 9px;
              border-radius: 6px;
              vertical-align: top;
              text-align: left;
              box-sizing: border-box;
            }
            .summary-label {
              font-size: 8.5px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.3px;
              color: #64748b;
              margin-bottom: 3px;
              white-space: nowrap;
            }
            .summary-val {
              font-size: 11px;
              font-weight: 800;
              font-family: monospace;
              color: #0f172a;
              white-space: nowrap;
              letter-spacing: -0.2px;
            }
            .table-container {
              width: 100% !important;
              max-width: 100% !important;
              table-layout: fixed !important;
              border-collapse: collapse !important;
              border: 1px solid #0f172a !important;
              margin-bottom: 14px !important;
              box-sizing: border-box !important;
            }
            .table-container th,
            .table-container td {
              box-sizing: border-box !important;
            }
            .table-container th {
              background-color: #f1f5f9;
              font-weight: 800;
              font-size: 9px;
              text-transform: uppercase;
              letter-spacing: 0.3px;
              padding: 6px 5px;
              border-bottom: 1.5px solid #0f172a;
              border-right: 1px solid #cbd5e1;
            }
            .table-container th:last-child,
            .table-container td:last-child {
              border-right: none !important;
            }
            .net-balance-banner {
              border: 2px solid #0a382c;
              background-color: #f0fdf4;
              padding: 12px 16px;
              border-radius: 6px;
              margin-top: 14px;
              margin-bottom: 14px;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .signatures-block {
              margin-top: 28px;
              padding-top: 10px;
              padding-bottom: 28px;
              margin-bottom: 20px;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              overflow: visible !important;
            }
            .signature-line {
              width: 220px;
              border-top: 1px solid #0f172a;
              text-align: center;
              padding-top: 5px;
              font-size: 10px;
              font-weight: 700;
              color: #334155;
            }
            .ledger-software-credit {
              text-align: right;
              font-size: 10px;
              font-weight: 700;
              color: #334155;
              margin-top: 14px;
              padding-right: 6px;
              padding-bottom: 16px;
              letter-spacing: 0.2px;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              white-space: nowrap !important;
              overflow: visible !important;
            }
          </style>
        </head>
        <body>
          <!-- Company Profile with Logo Header (Same Format Like Sales Invoice) -->
          <table class="invoice-header-table">
            <tr>
              <td class="logo-cell">
                ${storeDetails?.logoUrl 
                  ? `<img src="${storeDetails.logoUrl}" class="logo-img" crossorigin="anonymous" alt="Logo" />`
                  : `<div class="logo-container">${getInitials(storeDetails?.name || 'ElectroManage')}</div>`
                }
              </td>
              <td class="center-info-cell">
                <h1 class="company-name">${storeDetails?.name || 'ElectroManage'}</h1>
                <div style="font-size: 13px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 5px; color: #0a382c;">
                  CUSTOMER ACCOUNT LEDGER STATEMENT
                </div>
              </td>
              <td class="right-spacer-cell">
                <div style="font-size: 9.5px; color: #334155; line-height: 1.4; text-align: right;">
                  <div>Date: <strong>${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></div>
                  <div>Time: <strong>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></div>
                </div>
              </td>
            </tr>
            <tr>
              <td colspan="3" class="details-cell">
                <div class="company-left-details">
                  <div class="left-detail-row"><span class="left-detail-label">Address:</span> ${storeDetails?.address || 'Madni Chowk Pindi Gheb'}</div>
                  <div class="left-detail-row"><span class="left-detail-label">Phone:</span> ${storeDetails?.phone || '0312-5653636'}</div>
                  <div class="left-detail-row"><span class="left-detail-label">Email:</span> ${storeDetails?.email || 'smarttech5535@gmail.com'}</div>
                </div>
              </td>
            </tr>
          </table>

          <div class="header-divider-line"></div>

          <!-- Customer Details & Account Reference -->
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; background: #fafafa; border-radius: 6px; margin-bottom: 12px;">
            <tr>
              <td style="padding: 9px 12px; vertical-align: top; text-align: left;">
                <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b;">Customer Information</div>
                <div style="font-size: 14px; font-weight: 900; color: #0f172a; margin-top: 2px;">${customer.name}</div>
                <div style="font-size: 10px; color: #334155; margin-top: 2px;">Phone / Mobile: <strong>${customer.mobile}</strong></div>
                ${customer.email ? `<div style="font-size: 10px; color: #334155;">Email: ${customer.email}</div>` : ''}
                ${customer.city ? `<div style="font-size: 10px; color: #334155;">City: ${customer.city}</div>` : ''}
              </td>
              <td style="padding: 9px 12px; vertical-align: top; text-align: right; width: 220px;">
                <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b;">Account Reference</div>
                <div style="font-family: monospace; font-size: 11px; font-weight: 700; color: #0f172a; margin-top: 2px;">ID: ${customer.id}</div>
                <div style="font-size: 10px; color: #334155; margin-top: 2px;">Total Invoices: <strong>${sales.length}</strong></div>
                <div style="font-size: 10px; color: #334155;">Total Transactions: <strong>${statementRows.length}</strong></div>
              </td>
            </tr>
          </table>

          <!-- Summary Cards Table (Initial Balance, Total Invoiced, Total Paid, Return Value, Pending Invoices, Net Balance) -->
          <table class="summary-cards-table avoid-break">
            <tr>
              <td class="summary-card-cell" style="width: 16.666%;">
                <div class="summary-label">Initial Balance</div>
                <div class="summary-val">PKR ${(initialBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </td>
              <td class="summary-card-cell" style="width: 16.666%;">
                <div class="summary-label">Total Invoiced</div>
                <div class="summary-val">PKR ${(financialTotals.totalInvoiced || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </td>
              <td class="summary-card-cell" style="width: 16.666%; border-color: #bbf7d0; background-color: #f0fdf4;">
                <div class="summary-label" style="color: #166534;">Total Paid</div>
                <div class="summary-val" style="color: #15803d;">PKR ${(financialTotals.totalPaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </td>
              <td class="summary-card-cell" style="width: 16.666%; border-color: #e9d5ff; background-color: #faf5ff;">
                <div class="summary-label" style="color: #6b21a8;">Return Value</div>
                <div class="summary-val" style="color: #7e22ce;">PKR ${(financialTotals.totalReturnValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </td>
              <td class="summary-card-cell" style="width: 16.666%; border-color: #fde68a; background-color: #fffbeb;">
                <div class="summary-label" style="color: #92400e;">Pending Invoices</div>
                <div class="summary-val" style="color: #b45309;">PKR ${(financialTotals.totalPending || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </td>
              <td class="summary-card-cell" style="width: 16.666%; border: 1.5px solid #0a382c; background-color: #f0fdf4;">
                <div class="summary-label" style="color: #0a382c;">Net Balance</div>
                <div class="summary-val" style="color: ${financialTotals.currentBalance > 0 ? '#991b1b' : '#065f46'}; font-size: 11.5px;">
                  PKR ${(financialTotals.currentBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </td>
            </tr>
          </table>

          <!-- Statement Table -->
          <table class="table-container">
            <thead>
              <tr>
                <th style="width: 11%;">Date & Time</th>
                <th style="width: 8%;">Type</th>
                <th style="width: 12%;">Ref / Invoice #</th>
                <th style="width: 31%;">Particulars / Notes</th>
                <th style="width: 12%; text-align: right;">Invoice Total (Dr)</th>
                <th style="width: 12%; text-align: right;">Paid (Cr)</th>
                <th style="width: 14%; text-align: right;">Net Running Bal</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr style="background-color: #f1f5f9; font-weight: 800; border-top: 1.5px solid #0f172a;">
                <td colspan="4" style="padding: 6px 5px; text-align: right; text-transform: uppercase; font-size: 9px; border-right: 1px solid #cbd5e1;">Totals:</td>
                <td style="padding: 6px 5px; text-align: right; border-right: 1px solid #cbd5e1; font-size: 9.5px; white-space: nowrap;">PKR ${(financialTotals.totalInvoiced || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style="padding: 6px 5px; text-align: right; color: #15803d; border-right: 1px solid #cbd5e1; font-size: 9.5px; white-space: nowrap;">PKR ${(financialTotals.totalPaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style="padding: 6px 5px; text-align: right; font-family: monospace; font-size: 9.5px; font-weight: 900; white-space: nowrap; ${financialTotals.currentBalance > 0 ? 'color: #991b1b;' : 'color: #065f46;'}">
                  PKR ${(financialTotals.currentBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>

          <!-- Closing Net Account Balance Banner -->
          <table class="net-balance-banner avoid-break" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="vertical-align: middle; text-align: left;">
                <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0a382c;">
                  Account Settlement Status
                </div>
                <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 2px;">
                  ${financialTotals.currentBalance > 0 ? 'OUTSTANDING BALANCE RECEIVABLE FROM CUSTOMER' : financialTotals.currentBalance < 0 ? 'CREDIT ADVANCE BALANCE IN CUSTOMER ACCOUNT' : 'ACCOUNT FULLY SETTLED / ZERO OUTSTANDING BALANCE'}
                </div>
                <div style="font-size: 10px; color: #475569; margin-top: 3px;">
                  Initial Balance (PKR ${(initialBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) + Invoiced (PKR ${(financialTotals.totalInvoiced || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) - Paid (PKR ${(financialTotals.totalPaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) - Return Value (PKR ${(financialTotals.totalReturnValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                </div>
              </td>
              <td style="vertical-align: middle; text-align: right; width: 260px;">
                <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0a382c;">
                  Net Account Balance (Net Running Balance)
                </div>
                <div style="font-size: 20px; font-weight: 900; font-family: monospace; margin-top: 2px; ${financialTotals.currentBalance > 0 ? 'color: #991b1b;' : 'color: #065f46;'}">
                  PKR ${(financialTotals.currentBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </td>
            </tr>
          </table>

          <!-- Signatures & Credit Block -->
          <div class="signatures-block avoid-break" style="margin-top: 28px; padding-top: 10px; page-break-inside: avoid !important; break-inside: avoid !important;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="width: 50%; vertical-align: top; text-align: left;">
                  <div class="signature-line">
                    Authorized Store Signature
                  </div>
                </td>
                <td style="width: 50%; vertical-align: top; text-align: right;">
                  <div class="signature-line" style="margin-left: auto;">
                    Customer Acknowledgment Signature
                  </div>
                </td>
              </tr>
            </table>

            <div class="ledger-software-credit" style="text-align: right; margin-top: 14px; font-size: 10px; font-weight: 700; color: #334155; padding-right: 6px; padding-bottom: 16px; white-space: nowrap !important; overflow: visible !important;">
              Software developed by 0332-5059526
            </div>
          </div>
        </body>
      </html>
    `;

    return statementHtml;
  };

  const handlePrint = () => {
    try {
      const statementHtml = generateCustomerLedgerHtml();
      const printFrame = document.createElement('iframe');
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      document.body.appendChild(printFrame);

      const frameDoc = printFrame.contentWindow?.document || printFrame.contentDocument;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(statementHtml);
        frameDoc.close();
        setTimeout(() => {
          printFrame.contentWindow?.focus();
          printFrame.contentWindow?.print();
          setTimeout(() => {
            if (document.body.contains(printFrame)) {
              document.body.removeChild(printFrame);
            }
          }, 1500);
        }, 400);
      } else {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.open();
          printWindow.document.write(statementHtml);
          printWindow.document.close();
          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
          }, 400);
        } else {
          window.print();
        }
      }
    } catch {
      window.print();
    }
  };

  const [isDownloadingLedger, setIsDownloadingLedger] = useState(false);

  const handleDownloadLedger = async () => {
    try {
      setIsDownloadingLedger(true);
      toast.info(`Preparing PDF for ${customer.name}'s Ledger Statement...`);
      const statementHtml = generateCustomerLedgerHtml();
      const dateStr = new Date().toISOString().split('T')[0];
      const safeCustomerName = (customer.name || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_');
      await downloadHtmlAsPdf(
        statementHtml, 
        `Customer_Ledger_${safeCustomerName}_${dateStr}`,
        { orientation: 'landscape', margin: [6, 6, 6, 6] }
      );
      toast.success('Customer Ledger downloaded successfully!');
    } catch (err) {
      console.error('Failed to download ledger PDF:', err);
      toast.error('Failed to download customer ledger PDF');
    } finally {
      setIsDownloadingLedger(false);
    }
  };

  return (
    <div 
      id="customer-ledger-view-container"
      className="w-full max-w-full space-y-6 animate-in fade-in duration-200"
    >
      {/* Top Navigation & Action Header */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
            title="Back to Customers List"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                {customer.name}
              </h1>
              <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-[#0a382c]">
                Customer Account Ledger
              </span>
              {(customer.balance || 0) > 0 ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  PKR {(customer.balance || 0).toFixed(2)} Pending
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Account Cleared
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-500 mt-1.5 flex-wrap">
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                {customer.mobile}
              </span>
              {customer.email && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  {customer.email}
                </span>
              )}
              {customer.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {customer.city}
                </span>
              )}
              <span className="text-slate-400 font-mono text-[11px]">
                ID: {customer.id}
              </span>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => setShowReceiveForm(!showReceiveForm)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0a382c] hover:bg-[#0d4a3b] text-white text-xs sm:text-sm font-bold shadow-md shadow-emerald-950/10 transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <Banknote className="w-4 h-4 text-emerald-300 shrink-0" />
            <span className="whitespace-nowrap">{showReceiveForm ? 'Hide Payment Form' : 'Receive / Settle Payment'}</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
            title="Print Full Customer Ledger Statement"
          >
            <Printer className="w-4 h-4 text-slate-600 shrink-0" />
            <span className="whitespace-nowrap">Print Statement</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadLedger}
            disabled={isDownloadingLedger}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            title="Download Customer Ledger Statement as PDF"
          >
            {isDownloadingLedger ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
            ) : (
              <Download className="w-4 h-4 shrink-0" />
            )}
            <span className="whitespace-nowrap">{isDownloadingLedger ? 'Downloading...' : 'Download Ledger'}</span>
          </button>
        </div>
      </div>

      {/* Financial Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Initial Balance</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
            PKR {initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-medium">
            Account opening balance
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Invoiced</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
            PKR {financialTotals.totalInvoiced.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-medium">
            Across {sales.length} sales invoice(s)
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Total Paid Amount</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-2 font-mono">
            PKR {financialTotals.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-emerald-600/90 mt-1 font-medium">
            Payments & receipts cleared
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-purple-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700">Return Value</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-700">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-900 mt-2 font-mono">
            PKR {financialTotals.totalReturnValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-purple-700/80 mt-1 font-medium">
            Credit for returned goods
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Pending on Invoices</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-700">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-900 mt-2 font-mono">
            PKR {financialTotals.totalPending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-amber-700/80 mt-1 font-medium">
            Invoice balances due
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-300 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Net Account Balance</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black mt-2 font-mono ${financialTotals.currentBalance > 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
            PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-medium">
            Same as final Net Running Balance: PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Receive Payment Form Panel */}
      {showReceiveForm && (
        <div className="bg-white p-6 rounded-2xl border-2 border-[#0a382c]/20 shadow-md animate-in slide-in-from-top-3 duration-200">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Banknote className="w-5 h-5 text-emerald-700" />
                Receive & Settle Customer Payment
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Record a payment received from {customer.name} to adjust customer ledger balance and update store bank accounts.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 font-medium">Net Balance Due:</span>
              <div className="text-base font-black text-amber-800">
                PKR {financialTotals.currentBalance.toFixed(2)}
              </div>
            </div>
          </div>

          <form onSubmit={handleReceivePayment} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Payment Amount */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Amount Received (PKR) *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400">
                    PKR
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={receivingAmount}
                    onChange={(e) => setReceivingAmount(e.target.value)}
                    className="w-full pl-12 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0a382c]"
                  />
                </div>
                {/* Quick Presets */}
                {financialTotals.currentBalance > 0 && (
                  <div className="flex gap-1.5 mt-2">
                    <button
                      type="button"
                      onClick={() => setReceivingAmount(financialTotals.currentBalance.toFixed(2))}
                      className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      Full (PKR {financialTotals.currentBalance.toFixed(2)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceivingAmount((financialTotals.currentBalance / 2).toFixed(2))}
                      className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      50%
                    </button>
                  </div>
                )}
              </div>

              {/* Payment Mode */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Payment Mode *
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setPaymentMode('Cash')}
                    className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                      paymentMode === 'Cash' ? 'bg-white text-[#0a382c] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('Online')}
                    className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                      paymentMode === 'Online' ? 'bg-white text-[#0a382c] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                    Online Bank
                  </button>
                </div>
              </div>

              {/* Bank Account Selection (if Online) */}
              {paymentMode === 'Online' ? (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Store Bank Account *
                  </label>
                  <select
                    value={selectedBankAcc}
                    onChange={(e) => setSelectedBankAcc(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#0a382c]"
                  >
                    {bankAccounts.length === 0 ? (
                      <option value="">No bank accounts configured</option>
                    ) : (
                      bankAccounts.map((acc) => (
                        <option key={acc.accountNumber} value={acc.accountNumber}>
                          {acc.bankName} - {acc.accountNumber} {acc.accountTitle ? `(${acc.accountTitle})` : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Receiving Channel
                  </label>
                  <div className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-emerald-700" />
                    Cash in Hand / Drawer
                  </div>
                </div>
              )}

              {/* Payment Date */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Payment Date *
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#0a382c]"
                />
              </div>
            </div>

            {/* Notes / Reference Remarks */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Notes / Reference / Slip Details (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Settle Invoice INV-1002, Cheque #89421, Meezan Bank IBFT ref #99824"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#0a382c]"
              />
            </div>

            {/* Submit / Cancel Buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReceiveForm(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingPayment}
                className="px-6 py-2 rounded-xl bg-[#0a382c] hover:bg-[#0d4a3b] text-white text-xs font-bold shadow-md shadow-emerald-950/10 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {submittingPayment ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                    Recording Payment...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    Confirm Payment Receipt
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Ledger Content Tabs & Full-Width Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Navigation Tabs and Search / Filter Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveTab('invoices')}
              className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${
                activeTab === 'invoices'
                  ? 'bg-[#0a382c] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              Invoices & Sales History ({filteredSales.length})
            </button>
            <button
              onClick={() => setActiveTab('payments')}
              className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${
                activeTab === 'payments'
                  ? 'bg-[#0a382c] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              Payment Records & Ledger ({filteredPayments.length})
            </button>
            <button
              onClick={() => setActiveTab('statement')}
              className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${
                activeTab === 'statement'
                  ? 'bg-[#0a382c] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              Running Balance Statement ({statementRows.length})
            </button>
          </div>

          <div className="flex items-center gap-3 w-full lg:w-auto flex-wrap">
            {/* Date Filter */}
            <div className="flex bg-slate-200/70 rounded-xl p-0.5 text-xs font-bold text-slate-700">
              <button
                type="button"
                onClick={() => setDateFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${dateFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                All Time
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('month')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${dateFilter === 'month' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('year')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${dateFilter === 'year' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                This Year
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 lg:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Search invoice, item, serial, notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0a382c] bg-white"
              />
            </div>
          </div>
        </div>

        {/* Loading Spinner */}
        {loading ? (
          <div className="py-24 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0a382c] mx-auto"></div>
            <p className="text-xs text-slate-500 font-semibold mt-3">Loading customer ledger and billing records...</p>
          </div>
        ) : (
          <div>
            {/* TAB 1: Invoices & Sales Billing */}
            {activeTab === 'invoices' && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] divide-y divide-slate-100 text-left text-xs">
                  <thead className="bg-[#f8faf9] text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-4 px-5">Invoice #</th>
                      <th className="py-4 px-5">Date & Time</th>
                      <th className="py-4 px-5 min-w-[240px]">Purchased Products & Serials</th>
                      <th className="py-4 px-5 text-right whitespace-nowrap">Total Amount</th>
                      <th className="py-4 px-5 text-right whitespace-nowrap">Paid Amount</th>
                      <th className="py-4 px-5 text-right whitespace-nowrap">Amount Pending</th>
                      <th className="py-4 px-5 text-center whitespace-nowrap">Payment Mode</th>
                      <th className="py-4 px-5 text-center whitespace-nowrap">Status</th>
                      <th className="py-4 px-5 text-right whitespace-nowrap">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredSales.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-16 text-center text-slate-400 italic">
                          No invoices found for this customer matching the search criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredSales.map((sale) => {
                        const paid = sale.paidAmount !== undefined 
                          ? sale.paidAmount 
                          : (sale.status === 'Paid' ? sale.total : 0);
                        const pending = sale.pendingAmount !== undefined 
                          ? sale.pendingAmount 
                          : (sale.status === 'Pending' ? sale.total : 0);

                        return (
                          <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                            {/* Invoice No */}
                            <td className="py-4 px-5 whitespace-nowrap font-mono font-bold text-slate-900">
                              <span className="text-[#0a382c] hover:underline cursor-pointer" onClick={() => setViewingInvoice(sale)}>
                                {sale.invoiceNo}
                              </span>
                            </td>

                            {/* Date */}
                            <td className="py-4 px-5 whitespace-nowrap text-slate-600 font-medium">
                              <div>{sale.date ? new Date(sale.date).toLocaleDateString() : 'N/A'}</div>
                              {sale.date && (
                                <div className="text-[10px] text-slate-400">
                                  {new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              )}
                            </td>

                            {/* Items Breakdown */}
                            <td className="py-4 px-5 text-slate-800">
                              <div className="space-y-1 max-w-sm">
                                {sale.items && sale.items.length > 0 ? (
                                  sale.items.map((item, idx) => (
                                    <div key={idx} className="text-xs">
                                      <span className="font-bold text-slate-900">{item.productName}</span>
                                      <span className="text-slate-500 font-medium ml-1">
                                        × {item.quantity} (@ PKR {item.salePrice?.toFixed(2)})
                                      </span>
                                      {item.selectedSerials && item.selectedSerials.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-0.5">
                                          {item.selectedSerials.map((sn, sIdx) => (
                                            <span key={sIdx} className="font-mono text-[10px] bg-slate-100 border border-slate-200 text-slate-700 px-1.5 py-0.2 rounded">
                                              SN: {sn}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-slate-400 italic">No item details</span>
                                )}
                              </div>
                            </td>

                            {/* Total Amount */}
                            <td className="py-4 px-5 text-right whitespace-nowrap font-black text-slate-900 text-sm">
                              PKR {sale.total?.toFixed(2)}
                              {sale.totalRefunded && sale.totalRefunded > 0 ? (
                                <div className="text-[10px] text-purple-700 font-bold">
                                  Ref: PKR {sale.totalRefunded.toFixed(2)}
                                </div>
                              ) : null}
                            </td>

                            {/* Paid Amount */}
                            <td className="py-4 px-5 text-right whitespace-nowrap font-bold text-emerald-700 text-sm">
                              PKR {paid.toFixed(2)}
                            </td>

                            {/* Pending Amount */}
                            <td className="py-4 px-5 text-right whitespace-nowrap font-black text-sm">
                              <span className={pending > 0 ? 'text-amber-800' : 'text-slate-400 font-medium'}>
                                PKR {pending.toFixed(2)}
                              </span>
                            </td>

                            {/* Payment Mode & Bank Account */}
                            <td className="py-4 px-5 text-center whitespace-nowrap">
                              <div>
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                                  sale.paymentMode === 'Online'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}>
                                  {sale.paymentMode === 'Online' ? <Globe className="w-3.5 h-3.5" /> : <Banknote className="w-3.5 h-3.5" />}
                                  {sale.paymentMode || 'Cash'}
                                </span>
                              </div>
                              {sale.bankName && (
                                <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                  {sale.bankName} {sale.bankAccountNumber ? `(${sale.bankAccountNumber})` : ''}
                                </div>
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-4 px-5 text-center whitespace-nowrap">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                                sale.status === 'Paid'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : sale.status === 'Returned'
                                    ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}>
                                {sale.status || 'Paid'}
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="py-4 px-5 text-right whitespace-nowrap font-medium">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setViewingInvoice(sale)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                                  title="View Details"
                                >
                                  <Eye className="w-3.5 h-3.5 text-slate-600" />
                                  <span>View</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditInvoice(sale)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors cursor-pointer border border-blue-200"
                                  title="Edit Invoice"
                                >
                                  <Edit className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingInvoice(sale)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors cursor-pointer border border-rose-200"
                                  title="Delete Invoice"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 2: Payment Records & Ledger (customerPayments) */}
            {activeTab === 'payments' && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[950px] divide-y divide-slate-100 text-left text-xs">
                  <thead className="bg-[#f8faf9] text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-4 px-5">Date & Time</th>
                      <th className="py-4 px-5">Transaction Type</th>
                      <th className="py-4 px-5">Reference / Invoice #</th>
                      <th className="py-4 px-5 text-right whitespace-nowrap">Total Billed</th>
                      <th className="py-4 px-5 text-right whitespace-nowrap">Paid / Received</th>
                      <th className="py-4 px-5 text-center whitespace-nowrap">Payment Method</th>
                      <th className="py-4 px-5 min-w-[200px]">Notes & Remarks</th>
                      <th className="py-4 px-5 text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredPayments.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-16 text-center text-slate-400 italic">
                          No payment records found for this customer.
                        </td>
                      </tr>
                    ) : (
                      filteredPayments.map((p) => {
                        const isCredit = p.type === 'ReturnCredit' || (p.refundAmount && p.refundAmount > 0);
                        const displayAmount = isCredit ? (p.refundAmount || 0) : (p.paidAmount || 0);

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                            {/* Date */}
                            <td className="py-4 px-5 whitespace-nowrap text-slate-700 font-medium">
                              <div>
                                {p.paymentDate 
                                  ? new Date(p.paymentDate).toLocaleDateString() 
                                  : (p.createdAt?.toMillis ? new Date(p.createdAt.toMillis()).toLocaleDateString() : 'N/A')}
                              </div>
                              {p.createdAt?.toMillis && (
                                <div className="text-[10px] text-slate-400">
                                  {new Date(p.createdAt.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              )}
                            </td>

                            {/* Type */}
                            <td className="py-4 px-5 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                                p.type === 'ReturnCredit'
                                  ? 'bg-purple-50 text-purple-800 border border-purple-200'
                                  : p.type === 'PaymentReceived'
                                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}>
                                {p.type === 'ReturnCredit' ? (
                                  <>
                                    <RotateCcw className="w-3 h-3" />
                                    Return Credit
                                  </>
                                ) : p.type === 'PaymentReceived' ? (
                                  <>
                                    <ArrowDownLeft className="w-3 h-3" />
                                    Settlement Received
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3 h-3" />
                                    Invoice Payment
                                  </>
                                )}
                              </span>
                            </td>

                            {/* Invoice Ref */}
                            <td className="py-4 px-5 whitespace-nowrap font-mono font-bold text-slate-900">
                              {p.invoiceNo || p.referenceNo || '—'}
                            </td>

                            {/* Total Billed */}
                            <td className="py-4 px-5 text-right whitespace-nowrap font-bold text-slate-800">
                              {p.totalAmount ? `PKR ${p.totalAmount.toFixed(2)}` : '—'}
                            </td>

                            {/* Paid / Received */}
                            <td className="py-4 px-5 text-right whitespace-nowrap font-black text-sm">
                              <span className={isCredit ? 'text-purple-700' : 'text-emerald-700'}>
                                {isCredit ? '+' : ''}PKR {displayAmount.toFixed(2)}
                              </span>
                            </td>

                            {/* Method */}
                            <td className="py-4 px-5 text-center whitespace-nowrap">
                              <div className="font-bold text-slate-800">
                                {p.paymentMode || 'Cash'}
                              </div>
                              {p.bankName && (
                                <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                  {p.bankName} {p.bankAccountNumber ? `(${p.bankAccountNumber})` : ''}
                                </div>
                              )}
                            </td>

                            {/* Notes */}
                            <td className="py-4 px-5 text-slate-700 text-xs font-medium max-w-xs">
                              {p.notes || '—'}
                            </td>

                            {/* Actions */}
                            <td className="py-4 px-5 text-right whitespace-nowrap font-medium">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => printPaymentReceipt(p)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-[#0a382c] hover:bg-emerald-50 text-slate-700 hover:text-[#0a382c] text-xs font-bold transition-colors cursor-pointer"
                                  title="Print Payment Voucher / Slip"
                                >
                                  <Printer className="w-3.5 h-3.5 text-emerald-700" />
                                  <span>Receipt</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditPayment(p)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors cursor-pointer border border-blue-200"
                                  title="Edit Payment Record"
                                >
                                  <Edit className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingPayment(p)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors cursor-pointer border border-rose-200"
                                  title="Delete Payment Record"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 3: Running Balance Statement */}
            {activeTab === 'statement' && (
              <div>
                {/* Company Profile with Logo Header (Same Format Like Sales Invoice) */}
                <div className="p-6 bg-white border-b border-slate-200">
                  <div className="flex items-center justify-between gap-4 pt-0 pb-0">
                    {/* Company Logo on Left */}
                    <div className="w-20 sm:w-24 flex-shrink-0">
                      {storeDetails?.logoUrl ? (
                        <img 
                          src={storeDetails.logoUrl} 
                          alt="Store Logo" 
                          className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-contain border-0 shadow-none ring-0 outline-none bg-transparent" 
                        />
                      ) : (
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-[#f0b90b] text-black font-black text-2xl sm:text-3xl flex items-center justify-center border-0 shadow-none ring-0 outline-none">
                          {getInitials(storeDetails?.name || 'ElectroManage')}
                        </div>
                      )}
                    </div>

                    {/* Company Name Centered */}
                    <div className="flex-1 text-center py-0 px-2 sm:px-4">
                      <h2 
                        style={{ fontFamily: "'Cinzel', 'Playfair Display', 'Plus Jakarta Sans', Georgia, serif" }}
                        className="text-3xl sm:text-4xl lg:text-5xl font-black text-black tracking-tight leading-tight"
                      >
                        {storeDetails?.name || 'ElectroManage'}
                      </h2>
                      <div className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[#0a382c] mt-2">
                        Customer Account Ledger Statement
                      </div>
                    </div>

                    {/* Right spacer for symmetry */}
                    <div className="hidden sm:block w-20 sm:w-24 flex-shrink-0"></div>
                  </div>

                  {/* Company Info under Logo on left side in Calibri font size 15 */}
                  <div className="mt-1 text-left max-w-md">
                    <div 
                      style={{ fontFamily: "'Calibri', 'Carlito', Candara, Segoe, 'Segoe UI', Arial, sans-serif" }}
                      className="text-[15px] text-black space-y-0.5 leading-snug"
                    >
                      <p>
                        <strong className="text-black font-bold">Address:</strong> {storeDetails?.address || 'Madni Chowk Pindi Gheb'}
                      </p>
                      <p>
                        <strong className="text-black font-bold">Phone:</strong> {storeDetails?.phone || '0312-5653636'}
                      </p>
                      <p>
                        <strong className="text-black font-bold">Email:</strong> {storeDetails?.email || 'smarttech5535@gmail.com'}
                      </p>
                    </div>
                  </div>

                  {/* Black line drawn under Email Address */}
                  <div className="w-full border-b-2 border-black mt-2 mb-2"></div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1150px] divide-y divide-slate-100 text-left text-xs">
                    <thead className="bg-[#f8faf9] text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                      <tr>
                        <th className="py-4 px-5">Date & Time</th>
                        <th className="py-4 px-5">Transaction Type</th>
                        <th className="py-4 px-5">Reference #</th>
                        <th className="py-4 px-5 min-w-[200px]">Particulars / Notes</th>
                        <th className="py-4 px-5 text-right whitespace-nowrap">Invoice Total (Debit)</th>
                        <th className="py-4 px-5 text-right whitespace-nowrap">Paid (Credit)</th>
                        <th className="py-4 px-5 text-right whitespace-nowrap">Net Running Balance</th>
                        <th className="py-4 px-5 text-center whitespace-nowrap">Mode / Channel</th>
                        <th className="py-4 px-5 text-right whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {statementRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-16 text-center text-slate-400 italic">
                            No ledger statement history recorded yet for this customer.
                          </td>
                        </tr>
                      ) : (
                        statementRows.map((row) => (
                          <tr 
                            key={row.id} 
                            className={`transition-colors ${row.type === 'Initial Balance' ? 'bg-emerald-50/40 hover:bg-emerald-50/70 font-semibold' : 'hover:bg-slate-50/80'}`}
                          >
                            <td className="py-4 px-5 whitespace-nowrap text-slate-700 font-medium">
                              {row.date ? new Date(row.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                            </td>
                            <td className="py-4 px-5 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                row.type === 'Initial Balance'
                                  ? 'bg-[#0a382c]/10 text-[#0a382c] border border-[#0a382c]/20'
                                  : row.type === 'Invoice'
                                    ? 'bg-slate-100 text-slate-800'
                                    : row.type === 'Return'
                                      ? 'bg-purple-50 text-purple-800 border border-purple-200'
                                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}>
                                {row.type}
                              </span>
                            </td>
                            <td className="py-4 px-5 whitespace-nowrap font-mono font-bold text-slate-900">
                              {row.refNo}
                            </td>
                            <td className="py-4 px-5 text-slate-700 font-medium">
                              {row.description}
                            </td>
                            <td className="py-4 px-5 text-right whitespace-nowrap font-bold text-slate-900">
                              {row.debit > 0 ? `PKR ${row.debit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                            </td>
                            <td className="py-4 px-5 text-right whitespace-nowrap font-bold text-emerald-700">
                              {row.credit > 0 ? `PKR ${row.credit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                            </td>
                            <td className="py-4 px-5 text-right whitespace-nowrap font-black text-sm">
                              <span className={`font-mono ${row.runningBalance > 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
                                PKR {row.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-center whitespace-nowrap text-slate-600 font-semibold">
                              {row.mode} {row.bankInfo ? `(${row.bankInfo})` : ''}
                            </td>
                            <td className="py-4 px-5 text-right whitespace-nowrap font-medium">
                              {row.type === 'Invoice' && row.rawSale && (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setViewingInvoice(row.rawSale!)}
                                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                                    title="View Invoice"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditInvoice(row.rawSale!)}
                                    className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                                    title="Edit Invoice"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingInvoice(row.rawSale!)}
                                    className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors"
                                    title="Delete Invoice"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                              {(row.type === 'Payment' || row.type === 'Return') && row.rawPayment && (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => printPaymentReceipt(row.rawPayment!)}
                                    className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition-colors"
                                    title="Print Receipt"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditPayment(row.rawPayment!)}
                                    className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                                    title="Edit Payment"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingPayment(row.rawPayment!)}
                                    className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors"
                                    title="Delete Payment"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                              {row.type === 'Initial Balance' && (
                                <span className="text-slate-400 font-mono">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs text-slate-900">
                        <td colSpan={4} className="py-4 px-5 text-right uppercase tracking-wider text-slate-500 text-[11px]">
                          Account Summary Totals:
                        </td>
                        <td className="py-4 px-5 text-right text-slate-900 font-mono font-bold">
                          PKR {financialTotals.totalInvoiced.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-4 px-5 text-right text-emerald-700 font-mono font-bold">
                          PKR {financialTotals.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-4 px-5 text-right text-sm font-black font-mono">
                          <span className={financialTotals.currentBalance > 0 ? 'text-rose-700' : 'text-emerald-800'}>
                            PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-center text-slate-500 font-bold text-xs whitespace-nowrap">
                          Net Account Balance
                        </td>
                        <td className="py-4 px-5 text-right text-slate-400 text-xs"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Prominent Net Account Balance Box at the End of Statement */}
                <div className="m-5 p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-[#0a382c] text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-md">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">
                      Closing Statement Summary
                    </div>
                    <div className="text-base font-black mt-1 text-white">
                      {financialTotals.currentBalance > 0 
                        ? 'Outstanding Balance Receivable from Customer' 
                        : financialTotals.currentBalance < 0 
                          ? 'Advance Credit in Customer Account' 
                          : 'Account Fully Cleared (Zero Balance)'}
                    </div>
                    <div className="text-xs text-slate-300 mt-1 font-mono">
                      Initial Balance (PKR {initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) + Invoiced (PKR {financialTotals.totalInvoiced.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) - Paid (PKR {financialTotals.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) - Return Value (PKR {financialTotals.totalReturnValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                    </div>
                  </div>
                  <div className="text-left sm:text-right bg-white/10 px-5 py-3 rounded-xl border border-white/15 flex flex-col items-start sm:items-end">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                      Net Account Balance (Net Running Balance)
                    </div>
                    <div className="text-2xl font-black font-mono text-white mt-1">
                      PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-emerald-200/90 font-semibold mt-1 whitespace-nowrap">
                      Net Running Balance at end: PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Summary */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="text-xs text-slate-500 font-medium">
            Customer Account ID: <span className="font-mono text-slate-800">{customer.id}</span>
          </div>
          <div className="flex flex-col sm:items-end gap-1">
            <div className="text-xs text-slate-700 font-bold">
              Net Account Balance: <span className="font-mono font-black text-base text-rose-700 ml-1">PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="text-[11px] text-slate-600 font-bold tracking-tight whitespace-nowrap">
              Software developed by 0332-5059526
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Details Modal */}
      {viewingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#0a382c] px-6 py-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-emerald-300" />
                <div>
                  <h3 className="font-bold text-base text-white">Invoice Details: {viewingInvoice.invoiceNo}</h3>
                  <p className="text-xs text-emerald-200/80">Date: {viewingInvoice.date ? new Date(viewingInvoice.date).toLocaleDateString() : 'N/A'}</p>
                </div>
              </div>
              <button 
                onClick={() => setViewingInvoice(null)}
                className="p-1.5 rounded-full hover:bg-white/10 text-emerald-100 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs divide-y divide-slate-100">
                  <thead className="bg-slate-50 text-slate-600 font-bold text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Item</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Price</th>
                      <th className="py-2.5 px-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {viewingInvoice.items?.map((item, i) => (
                      <tr key={i}>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{item.productName}</div>
                          {item.selectedSerials && item.selectedSerials.length > 0 && (
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              Serials: {item.selectedSerials.join(', ')}
                            </div>
                          )}
                          {item.returnedQuantity && item.returnedQuantity > 0 ? (
                            <div className="mt-1">
                              <div className="text-[10px] text-purple-800 font-bold bg-purple-50 px-2.5 py-0.5 rounded border border-purple-200 inline-block text-center">
                                Returned: {item.returnedQuantity} of {item.quantity}
                                {item.returnedSerials && item.returnedSerials.length > 0 && ` (S/N: ${item.returnedSerials.join(', ')})`}
                              </div>
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-800">{item.quantity}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-700">PKR {item.salePrice?.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right font-black text-slate-900">PKR {item.subtotal?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Breakdown */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between font-extrabold text-slate-900 text-sm">
                  <span>Total Amount:</span>
                  <span className="font-mono">PKR {viewingInvoice.total?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-emerald-800">
                  <span>Paid Amount:</span>
                  <span className="font-mono">
                    PKR {(viewingInvoice.paidAmount !== undefined ? viewingInvoice.paidAmount : (viewingInvoice.status === 'Paid' ? viewingInvoice.total : 0)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between font-black text-slate-900 border-t border-slate-200 pt-2">
                  <span>Amount Pending:</span>
                  <span className={`font-mono font-black ${(viewingInvoice.pendingAmount !== undefined ? viewingInvoice.pendingAmount : (viewingInvoice.status === 'Pending' ? viewingInvoice.total : 0)) > 0 ? 'text-amber-800' : 'text-slate-900'}`}>
                    PKR {(viewingInvoice.pendingAmount !== undefined ? viewingInvoice.pendingAmount : (viewingInvoice.status === 'Pending' ? viewingInvoice.total : 0)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 pt-1">
                  <span>Payment Mode:</span>
                  <span className="font-bold">{viewingInvoice.paymentMode || 'Cash'} {viewingInvoice.bankName ? `(${viewingInvoice.bankName})` : ''}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const toEdit = viewingInvoice;
                  setViewingInvoice(null);
                  handleOpenEditInvoice(toEdit);
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Edit className="w-3.5 h-3.5" />
                Edit Invoice
              </button>
              <button
                type="button"
                onClick={() => setViewingInvoice(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT INVOICE MODAL */}
      {editingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-6 py-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <Edit className="w-5 h-5 text-blue-200" />
                <div>
                  <h3 className="font-bold text-base text-white">Edit Customer Invoice</h3>
                  <p className="text-xs text-blue-100 font-mono">Invoice #{editingInvoice.invoiceNo}</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingInvoice(null)}
                className="p-1.5 rounded-full hover:bg-white/10 text-blue-100 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditInvoice} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Invoice Date
                  </label>
                  <input
                    type="date"
                    required
                    value={invoiceEditForm.date}
                    onChange={(e) => setInvoiceEditForm({ ...invoiceEditForm, date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Status
                  </label>
                  <select
                    value={invoiceEditForm.status}
                    onChange={(e) => setInvoiceEditForm({ ...invoiceEditForm, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Partial">Partial</option>
                    <option value="Pending">Pending</option>
                    <option value="Returned">Returned</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Total Amount (PKR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={invoiceEditForm.total}
                    onChange={(e) => setInvoiceEditForm({ ...invoiceEditForm, total: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Paid Amount (PKR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={invoiceEditForm.paidAmount}
                    onChange={(e) => setInvoiceEditForm({ ...invoiceEditForm, paidAmount: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 text-emerald-700"
                  />
                </div>
              </div>

              {/* Live Remaining Balance Calculation */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center text-xs">
                <span className="font-bold text-slate-600">Computed Remaining / Pending:</span>
                <span className="font-mono font-black text-sm text-amber-800">
                  PKR {Math.max(0, (parseFloat(invoiceEditForm.total) || 0) - (parseFloat(invoiceEditForm.paidAmount) || 0)).toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Payment Mode
                  </label>
                  <select
                    value={invoiceEditForm.paymentMode}
                    onChange={(e) => setInvoiceEditForm({ ...invoiceEditForm, paymentMode: e.target.value as 'Cash' | 'Online' })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Online">Online / Bank Transfer</option>
                  </select>
                </div>
                {invoiceEditForm.paymentMode === 'Online' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Deposit Bank Account
                    </label>
                    <select
                      value={invoiceEditForm.bankAccountNumber}
                      onChange={(e) => {
                        const acc = bankAccounts.find(b => b.accountNumber === e.target.value);
                        setInvoiceEditForm({
                          ...invoiceEditForm,
                          bankAccountNumber: e.target.value,
                          bankName: acc ? acc.bankName : ''
                        });
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                    >
                      <option value="">Select Account</option>
                      {bankAccounts.map((b, i) => (
                        <option key={i} value={b.accountNumber}>
                          {b.bankName} - {b.accountNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Invoice Notes & Remarks
                </label>
                <textarea
                  rows={2}
                  value={invoiceEditForm.notes}
                  onChange={(e) => setInvoiceEditForm({ ...invoiceEditForm, notes: e.target.value })}
                  placeholder="Notes, references, adjustments..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="bg-slate-50 -mx-6 -mb-6 px-6 py-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingInvoice(null)}
                  disabled={processingAction}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingAction}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {processingAction ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE INVOICE CONFIRMATION MODAL */}
      {deletingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-rose-600 px-6 py-4 text-white flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Delete Invoice?</h3>
                <p className="text-xs text-rose-100 font-mono">Invoice #{deletingInvoice.invoiceNo}</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to permanently delete invoice <span className="font-bold text-slate-900">#{deletingInvoice.invoiceNo}</span>?
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Invoice Total:</span>
                  <span className="font-bold text-slate-900 font-mono">PKR {deletingInvoice.total?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Paid Amount:</span>
                  <span className="font-bold text-emerald-700 font-mono">
                    PKR {(deletingInvoice.paidAmount !== undefined ? deletingInvoice.paidAmount : (deletingInvoice.status === 'Paid' ? deletingInvoice.total : 0)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Pending Balance:</span>
                  <span className="font-bold text-amber-800 font-mono">
                    PKR {(deletingInvoice.pendingAmount !== undefined ? deletingInvoice.pendingAmount : (deletingInvoice.status === 'Pending' ? deletingInvoice.total : 0)).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Deleting this invoice will adjust the customer balance and any online bank deposit records. This action cannot be undone.
                </span>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingInvoice(null)}
                  disabled={processingAction}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDeleteInvoice}
                  disabled={processingAction}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {processingAction ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PAYMENT MODAL */}
      {editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-emerald-700 to-teal-800 px-6 py-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <Edit className="w-5 h-5 text-emerald-200" />
                <div>
                  <h3 className="font-bold text-base text-white">Edit Customer Payment Receipt</h3>
                  <p className="text-xs text-emerald-100 font-mono">Ref: {editingPayment.referenceNo || editingPayment.invoiceNo || editingPayment.id}</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingPayment(null)}
                className="p-1.5 rounded-full hover:bg-white/10 text-emerald-100 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditPayment} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Amount Received (PKR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={paymentEditForm.paidAmount}
                    onChange={(e) => setPaymentEditForm({ ...paymentEditForm, paidAmount: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-600 text-emerald-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentEditForm.paymentDate}
                    onChange={(e) => setPaymentEditForm({ ...paymentEditForm, paymentDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Payment Mode
                  </label>
                  <select
                    value={paymentEditForm.paymentMode}
                    onChange={(e) => setPaymentEditForm({ ...paymentEditForm, paymentMode: e.target.value as 'Cash' | 'Online' })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Online">Online / Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Receipt / Reference #
                  </label>
                  <input
                    type="text"
                    value={paymentEditForm.referenceNo}
                    onChange={(e) => setPaymentEditForm({ ...paymentEditForm, referenceNo: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              {paymentEditForm.paymentMode === 'Online' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Deposit Bank Account
                  </label>
                  <select
                    value={paymentEditForm.bankAccountNumber}
                    onChange={(e) => {
                      const acc = bankAccounts.find(b => b.accountNumber === e.target.value);
                      setPaymentEditForm({
                        ...paymentEditForm,
                        bankAccountNumber: e.target.value,
                        bankName: acc ? acc.bankName : ''
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white"
                  >
                    <option value="">Select Account</option>
                    {bankAccounts.map((b, i) => (
                      <option key={i} value={b.accountNumber}>
                        {b.bankName} - {b.accountNumber}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Notes & Remarks
                </label>
                <textarea
                  rows={2}
                  value={paymentEditForm.notes}
                  onChange={(e) => setPaymentEditForm({ ...paymentEditForm, notes: e.target.value })}
                  placeholder="Notes, transaction reference, comments..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="bg-slate-50 -mx-6 -mb-6 px-6 py-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  disabled={processingAction}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingAction}
                  className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {processingAction ? 'Saving Changes...' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE PAYMENT CONFIRMATION MODAL */}
      {deletingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-rose-600 px-6 py-4 text-white flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Delete Payment Record?</h3>
                <p className="text-xs text-rose-100 font-mono">Ref: {deletingPayment.referenceNo || deletingPayment.invoiceNo || deletingPayment.id}</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to permanently delete this payment receipt for customer <span className="font-bold text-slate-900">{customer.name}</span>?
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Amount:</span>
                  <span className="font-bold text-rose-700 font-mono text-sm">
                    PKR {(deletingPayment.paidAmount || deletingPayment.refundAmount || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Mode:</span>
                  <span className="font-bold text-slate-800">{deletingPayment.paymentMode || 'Cash'}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Date:</span>
                  <span className="font-semibold text-slate-700">
                    {deletingPayment.paymentDate ? new Date(deletingPayment.paymentDate).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Deleting this payment will add PKR {(deletingPayment.paidAmount || deletingPayment.refundAmount || 0).toFixed(2)} back to the customer's outstanding balance.
                </span>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingPayment(null)}
                  disabled={processingAction}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDeletePayment}
                  disabled={processingAction}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {processingAction ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Print Container for Clean A4 Printing */}
      <div id="print-statement-section" className="hidden print:block print:fixed print:inset-0 print:bg-white print:p-8 print:z-[9999]">
        {/* Company Profile with Logo Header (Same Format Like Sales Invoice) */}
        <div className="pb-3 mb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="w-24 flex-shrink-0">
              {storeDetails?.logoUrl ? (
                <img src={storeDetails.logoUrl} alt="Logo" className="w-20 h-20 rounded-xl object-contain" />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-[#f0b90b] text-black font-black text-2xl flex items-center justify-center">
                  {getInitials(storeDetails?.name || 'ElectroManage')}
                </div>
              )}
            </div>
            <div className="flex-1 text-center">
              <h1 
                style={{ fontFamily: "'Cinzel', 'Playfair Display', 'Plus Jakarta Sans', Georgia, serif" }}
                className="text-3xl font-black text-black tracking-tight leading-tight"
              >
                {storeDetails?.name || 'ElectroManage'}
              </h1>
              <div className="text-xs font-black uppercase tracking-wider text-[#0a382c] mt-2">
                Customer Account Ledger Statement
              </div>
            </div>
            <div className="w-24 text-right text-[10px] text-black font-mono">
              <p>Date: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              <p>Time: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
          <div className="mt-1 text-left text-[14px] text-black space-y-0.5 leading-snug">
            <p><strong className="font-bold">Address:</strong> {storeDetails?.address || 'Madni Chowk Pindi Gheb'}</p>
            <p><strong className="font-bold">Phone:</strong> {storeDetails?.phone || '0312-5653636'}</p>
            <p><strong className="font-bold">Email:</strong> {storeDetails?.email || 'smarttech5535@gmail.com'}</p>
          </div>
          <div className="w-full border-b-2 border-black mt-2 mb-3"></div>
        </div>

        <div className="grid grid-cols-2 gap-4 border border-black p-4 mb-5 text-xs">
          <div>
            <h3 className="font-bold uppercase text-[10px] text-black">Customer Details</h3>
            <p className="font-black text-sm text-black">{customer.name}</p>
            <p className="font-semibold">Mobile: {customer.mobile}</p>
            {customer.city && <p className="font-semibold">City: {customer.city}</p>}
            <p className="font-mono text-[11px]">ID: {customer.id}</p>
          </div>
          <div className="text-right">
            <h3 className="font-bold uppercase text-[10px] text-black">Account Financial Summary</h3>
            <p className="font-semibold">Initial Balance: PKR {initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="font-semibold">Total Invoiced: PKR {financialTotals.totalInvoiced.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="font-semibold">Total Paid: PKR {financialTotals.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="font-semibold">Pending on Invoices: PKR {financialTotals.totalPending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="font-black text-sm text-black mt-1">
              Net Account Balance: PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <table className="w-full border-collapse border border-black text-xs text-left">
          <thead>
            <tr className="bg-slate-100 border-b border-black font-bold">
              <th className="p-2 border-r border-black">Date</th>
              <th className="p-2 border-r border-black">Type</th>
              <th className="p-2 border-r border-black">Ref #</th>
              <th className="p-2 border-r border-black">Particulars / Notes</th>
              <th className="p-2 border-r border-black text-right">Invoice Total</th>
              <th className="p-2 border-r border-black text-right">Paid (Credit)</th>
              <th className="p-2 text-right">Net Running Balance</th>
            </tr>
          </thead>
          <tbody>
            {statementRows.map((r, i) => (
              <tr key={i} className={`border-b border-black ${r.type === 'Initial Balance' ? 'bg-slate-50 font-semibold' : ''}`}>
                <td className="p-2 border-r border-black">{r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</td>
                <td className="p-2 border-r border-black">{r.type}</td>
                <td className="p-2 border-r border-black font-mono font-bold">{r.refNo}</td>
                <td className="p-2 border-r border-black">{r.description}</td>
                <td className="p-2 border-r border-black text-right">{r.debit > 0 ? `PKR ${r.debit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                <td className="p-2 border-r border-black text-right">{r.credit > 0 ? `PKR ${r.credit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                <td className="p-2 text-right font-black font-mono">
                  PKR {r.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 border-t-2 border-black font-bold">
              <td colSpan={4} className="p-2 text-right uppercase border-r border-black">Totals:</td>
              <td className="p-2 text-right border-r border-black">PKR {financialTotals.totalInvoiced.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="p-2 text-right border-r border-black">PKR {financialTotals.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="p-2 text-right font-black font-mono">PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>

        {/* Closing Net Account Balance Banner */}
        <div className="mt-5 p-4 border-2 border-black flex justify-between items-center bg-slate-50">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider">Account Settlement Status</div>
            <div className="text-sm font-black text-black mt-1">
              {financialTotals.currentBalance > 0 
                ? 'OUTSTANDING BALANCE RECEIVABLE FROM CUSTOMER' 
                : financialTotals.currentBalance < 0 
                  ? 'CREDIT ADVANCE BALANCE IN CUSTOMER ACCOUNT' 
                  : 'ACCOUNT FULLY SETTLED / ZERO OUTSTANDING BALANCE'}
            </div>
            <div className="text-[11px] text-black mt-1">
              Initial Balance (PKR {initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) + Invoiced (PKR {financialTotals.totalInvoiced.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) - Paid (PKR {financialTotals.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) - Return Value (PKR {financialTotals.totalReturnValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-wider">Net Account Balance (Net Running Balance)</div>
            <div className="text-xl font-black font-mono text-black mt-1">
              PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="mt-14 flex justify-between pt-6 text-xs font-bold border-t border-black">
          <div>Authorized Store Signature: _________________________</div>
          <div>Customer Acknowledgment Signature: _________________________</div>
        </div>
        <div className="text-right text-[10px] font-bold text-slate-700 pt-2 pb-1 whitespace-nowrap">
          Software developed by 0332-5059526
        </div>
      </div>
    </div>
  );
}
