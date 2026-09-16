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
  Maximize2,
  Minimize2
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
  updateDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';

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

  const [isFullPage, setIsFullPage] = useState(true);
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

  // Financial calculations
  const financialTotals = useMemo(() => {
    let totalInvoiced = 0;
    let totalPending = 0;

    sales.forEach(sale => {
      totalInvoiced += sale.total || 0;
      const pending = sale.pendingAmount !== undefined 
        ? sale.pendingAmount 
        : (sale.status === 'Pending' ? (sale.total || 0) : (sale.status === 'Paid' ? 0 : Math.max(0, (sale.total || 0) - (sale.paidAmount || 0))));
      totalPending += pending;
    });

    // 1. Total Return Value from sales returns / refund adjustments
    let totalReturnValue = 0;
    const recordedReturnIds = new Set<string>();

    sales.forEach(sale => {
      if (Array.isArray(sale.returns) && sale.returns.length > 0) {
        sale.returns.forEach((r: any) => {
          if (r.id) recordedReturnIds.add(r.id);
          totalReturnValue += Number(r.totalRefund) || 0;
        });
      } else if (typeof sale.totalRefunded === 'number' && sale.totalRefunded > 0) {
        totalReturnValue += sale.totalRefunded;
      }
    });

    // Check payments for any ReturnCredit not already counted
    payments.forEach(payment => {
      const isReturn = payment.type === 'ReturnCredit' || (payment.refundAmount && payment.refundAmount > 0);
      if (isReturn) {
        const ref = payment.referenceNo;
        if (ref && recordedReturnIds.has(ref)) return;
        if (payment.saleId && sales.some(s => s.id === payment.saleId && (s.totalRefunded || 0) > 0)) return;
        totalReturnValue += (payment.refundAmount || payment.paidAmount || 0);
      }
    });
    totalReturnValue = Number(totalReturnValue.toFixed(2));

    // 2. Total Paid Amount (direct payments received, not return credits)
    let totalPaid = 0;
    payments.forEach(payment => {
      const isReturn = payment.type === 'ReturnCredit' || (payment.refundAmount && payment.refundAmount > 0);
      if (!isReturn) {
        totalPaid += (payment.paidAmount || 0);
      }
    });
    totalPaid = Number(totalPaid.toFixed(2));

    // 3. User Mandate: Net Account Balance = Initial Balance + Pending on Invoices - Return Value
    const netAccountBalance = Number((initialBalance + totalPending - totalReturnValue).toFixed(2));

    return {
      initialBalance,
      totalInvoiced,
      totalPaid,
      totalPending,
      totalReturnValue,
      currentBalance: netAccountBalance
    };
  }, [sales, payments, initialBalance]);

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

  // Thermal voucher / Receipt Print for an individual payment
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
    invoiceBalance: number; // Balance remaining on this specific invoice (or initial balance)
    runningBalance: number; // Cumulative net account balance
    mode: string;
    bankInfo?: string;
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

    // 1. Initial / Opening Balance Row (always included, reflecting starting balance)
    combined.push({
      id: 'initial-balance-row',
      date: earliestDate.toISOString(),
      dateObj: earliestDate,
      sortOrder: 0, // Top priority
      type: 'Initial Balance',
      refNo: 'INITIAL-BAL',
      description: 'Account Opening / Initial Balance',
      debit: initialBalance > 0 ? initialBalance : 0,
      credit: 0,
      invoiceBalance: initialBalance,
      mode: 'Opening',
    });

    // 2. Sales Invoices (Debit)
    sales.forEach(sale => {
      const pending = sale.pendingAmount !== undefined 
        ? sale.pendingAmount 
        : (sale.status === 'Paid' ? 0 : (sale.total || 0) - (sale.paidAmount || 0));
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
        debit: sale.total || 0,
        credit: 0,
        invoiceBalance: pending,
        mode: sale.paymentMode || 'Credit',
        bankInfo: sale.bankName ? `${sale.bankName} (${sale.bankAccountNumber})` : undefined
      });
    });

    // 3. Customer Payments & Returns (Credit)
    const existingReturnRefs = new Set<string>();
    payments.forEach(payment => {
      const isReturn = payment.type === 'ReturnCredit' || (payment.refundAmount && payment.refundAmount > 0);
      const amount = isReturn ? (payment.refundAmount || 0) : (payment.paidAmount || 0);
      const dateVal = payment.paymentDate || (payment.createdAt?.toMillis ? new Date(payment.createdAt.toMillis()).toISOString() : '');
      if (isReturn) {
        if (payment.referenceNo) existingReturnRefs.add(payment.referenceNo);
        if (payment.saleId) existingReturnRefs.add(`sale-${payment.saleId}`);
      }
      
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
        invoiceBalance: payment.pendingAmount !== undefined ? payment.pendingAmount : (isReturn ? 0 : 0),
        mode: payment.paymentMode || 'Cash',
        bankInfo: payment.bankName ? `${payment.bankName} (${payment.bankAccountNumber})` : undefined
      });
    });

    // 4. Sales Returns recorded on Invoices (Credit) not already logged in customer payments
    sales.forEach(sale => {
      if (Array.isArray(sale.returns) && sale.returns.length > 0) {
        sale.returns.forEach((r: any) => {
          if (r.id && existingReturnRefs.has(r.id)) return;
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
            credit: Number(r.totalRefund) || 0,
            invoiceBalance: 0,
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
          invoiceBalance: 0,
          mode: 'Return Credit'
        });
      }
    });

    // Sort chronologically ascending to calculate running balance
    combined.sort((a, b) => {
      const diff = a.dateObj.getTime() - b.dateObj.getTime();
      if (diff !== 0) return diff;
      return a.sortOrder - b.sortOrder;
    });

    // Calculate running balance starting from Initial Balance
    let running = 0;
    return combined.map(item => {
      running = Number((running + item.debit - item.credit).toFixed(2));
      return {
        ...item,
        runningBalance: running
      };
    });
  }, [sales, payments, customer, initialBalance]);

  // Handle Print Statement with Full High-Resolution A4 Statement
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

    const rowsHtml = statementRows.map((r) => `
      <tr style="border-bottom: 1px solid #cbd5e1; ${r.type === 'Initial Balance' ? 'background-color: #f1f5f3; font-weight: bold;' : ''}">
        <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0; font-size: 10px;">
          ${r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
        </td>
        <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">
          <span style="display: inline-block; padding: 2px 6px; font-size: 9px; font-weight: 700; border-radius: 4px; ${
            r.type === 'Initial Balance' ? 'background-color: #d1e7dd; color: #0a382c;' :
            r.type === 'Invoice' ? 'background-color: #e2e8f0; color: #1e293b;' :
            r.type === 'Return' ? 'background-color: #f3e8ff; color: #6b21a8;' :
            'background-color: #dcfce7; color: #15803d;'
          }">${r.type}</span>
        </td>
        <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; font-size: 10px;">${r.refNo}</td>
        <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0; font-size: 10px;">${r.description}</td>
        <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0; text-align: right; font-weight: bold; font-size: 10px;">${r.debit > 0 ? 'PKR ' + r.debit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
        <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #15803d; font-size: 10px;">${r.credit > 0 ? 'PKR ' + r.credit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
        <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0; text-align: right; font-weight: bold; font-size: 10px; color: ${r.invoiceBalance > 0 ? '#b45309' : '#475569'};">
          ${r.invoiceBalance !== undefined ? 'PKR ' + r.invoiceBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
        </td>
        <td style="padding: 6px 8px; text-align: right; font-weight: 900; font-family: monospace; font-size: 10px; ${r.runningBalance > 0 ? 'color: #991b1b;' : 'color: #065f46;'}">
          PKR ${r.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
      </tr>
    `).join('');

    const statementHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Customer Account Statement - ${customer.name}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              color: #0f172a;
              background-color: #ffffff;
              margin: 0;
              padding: 0;
              font-size: 11px;
              line-height: 1.35;
            }
            .header-banner {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 10px;
              margin-bottom: 12px;
            }
            .store-name {
              font-size: 18px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: -0.5px;
              color: #0a382c;
            }
            .statement-title {
              font-size: 15px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              text-align: right;
              color: #0f172a;
            }
            .summary-cards-grid {
              display: grid;
              grid-template-columns: repeat(6, 1fr);
              gap: 8px;
              margin-bottom: 14px;
            }
            .summary-card {
              border: 1px solid #cbd5e1;
              background: #f8fafc;
              padding: 7px 9px;
              border-radius: 6px;
            }
            .summary-label {
              font-size: 9px;
              font-weight: 700;
              text-transform: uppercase;
              color: #64748b;
              margin-bottom: 3px;
            }
            .summary-val {
              font-size: 12px;
              font-weight: 800;
              font-family: monospace;
              color: #0f172a;
            }
            .table-container {
              width: 100%;
              border-collapse: collapse;
              border: 1px solid #0f172a;
              margin-bottom: 14px;
            }
            .table-container th {
              background-color: #f1f5f9;
              font-weight: 800;
              font-size: 9.5px;
              text-transform: uppercase;
              letter-spacing: 0.4px;
              padding: 6px 7px;
              border-bottom: 1.5px solid #0f172a;
              border-right: 1px solid #cbd5e1;
            }
            .net-balance-banner {
              border: 2px solid #0a382c;
              background-color: #f0fdf4;
              padding: 12px 16px;
              border-radius: 6px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-top: 14px;
              page-break-inside: avoid;
            }
            .signatures-block {
              display: flex;
              justify-content: space-between;
              margin-top: 36px;
              padding-top: 10px;
              page-break-inside: avoid;
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
          </style>
        </head>
        <body>
          <div class="header-banner">
            <div>
              <div class="store-name">${storeDetails?.name || 'STORE ACCOUNT LEDGER'}</div>
              ${storeDetails?.address ? `<div style="font-size: 10px; color: #334155;">${storeDetails.address}</div>` : ''}
              ${storeDetails?.phone ? `<div style="font-size: 10px; color: #334155;">Phone: ${storeDetails.phone}</div>` : ''}
              ${storeDetails?.email ? `<div style="font-size: 10px; color: #334155;">Email: ${storeDetails.email}</div>` : ''}
            </div>
            <div>
              <div class="statement-title">Customer Account Statement</div>
              <div style="font-size: 10px; color: #475569; text-align: right; margin-top: 3px;">
                Statement Date: <strong>${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
              </div>
              <div style="font-size: 10px; color: #475569; text-align: right;">
                Issue Time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          <!-- Customer Details & Account Reference -->
          <div style="display: flex; justify-content: space-between; border: 1px solid #cbd5e1; background: #fafafa; padding: 9px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div>
              <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b;">Customer Information</div>
              <div style="font-size: 14px; font-weight: 900; color: #0f172a; margin-top: 2px;">${customer.name}</div>
              <div style="font-size: 10px; color: #334155; margin-top: 2px;">Phone / Mobile: <strong>${customer.mobile}</strong></div>
              ${customer.email ? `<div style="font-size: 10px; color: #334155;">Email: ${customer.email}</div>` : ''}
              ${customer.city ? `<div style="font-size: 10px; color: #334155;">City: ${customer.city}</div>` : ''}
            </div>
            <div style="text-align: right;">
              <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b;">Account Reference</div>
              <div style="font-family: monospace; font-size: 11px; font-weight: 700; color: #0f172a; margin-top: 2px;">ID: ${customer.id}</div>
              <div style="font-size: 10px; color: #334155; margin-top: 2px;">Total Invoices: <strong>${sales.length}</strong></div>
              <div style="font-size: 10px; color: #334155;">Total Transactions: <strong>${statementRows.length}</strong></div>
            </div>
          </div>

          <!-- Summary Cards Grid (Initial Balance, Invoiced, Paid, Pending on Invoices, Net Balance) -->
          <div class="summary-cards-grid">
            <div class="summary-card">
              <div class="summary-label">Initial Balance</div>
              <div class="summary-val">PKR ${initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Total Invoiced</div>
              <div class="summary-val">PKR ${financialTotals.totalInvoiced.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Total Paid</div>
              <div class="summary-val" style="color: #15803d;">PKR ${financialTotals.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Return Value</div>
              <div class="summary-val" style="color: #7e22ce;">PKR ${financialTotals.totalReturnValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Pending on Invoices</div>
              <div class="summary-val" style="color: #b45309;">PKR ${financialTotals.totalPending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div class="summary-card" style="border: 1.5px solid #0a382c; background: #f0fdf4;">
              <div class="summary-label" style="color: #0a382c;">Net Account Balance</div>
              <div class="summary-val" style="color: ${financialTotals.currentBalance > 0 ? '#991b1b' : '#065f46'}; font-size: 13px;">
                PKR ${financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <!-- Statement Table -->
          <table class="table-container">
            <thead>
              <tr>
                <th style="width: 13%;">Date & Time</th>
                <th style="width: 10%;">Type</th>
                <th style="width: 13%;">Ref / Invoice #</th>
                <th style="width: 25%;">Particulars / Notes</th>
                <th style="width: 11%; text-align: right;">Invoice Total (Debit)</th>
                <th style="width: 11%; text-align: right;">Paid (Credit)</th>
                <th style="width: 13%; text-align: right;">Invoice Balance (Pending)</th>
                <th style="width: 14%; text-align: right;">Net Running Balance</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr style="background-color: #f1f5f9; font-weight: 800; border-top: 1.5px solid #0f172a;">
                <td colspan="4" style="padding: 7px 8px; text-align: right; text-transform: uppercase; font-size: 9.5px; border-right: 1px solid #cbd5e1;">Totals:</td>
                <td style="padding: 7px 8px; text-align: right; border-right: 1px solid #cbd5e1; font-size: 9.5px;">PKR ${financialTotals.totalInvoiced.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style="padding: 7px 8px; text-align: right; color: #15803d; border-right: 1px solid #cbd5e1; font-size: 9.5px;">PKR ${financialTotals.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style="padding: 7px 8px; text-align: right; color: #b45309; border-right: 1px solid #cbd5e1; font-size: 9.5px;">PKR ${financialTotals.totalPending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style="padding: 7px 8px; text-align: right; font-family: monospace; font-size: 11px; font-weight: 900; ${financialTotals.currentBalance > 0 ? 'color: #991b1b;' : 'color: #065f46;'}">
                  PKR ${financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>

          <!-- Closing Net Account Balance Banner -->
          <div class="net-balance-banner">
            <div>
              <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0a382c;">
                Account Settlement Status
              </div>
              <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 2px;">
                ${financialTotals.currentBalance > 0 ? 'OUTSTANDING BALANCE RECEIVABLE FROM CUSTOMER' : financialTotals.currentBalance < 0 ? 'CREDIT ADVANCE BALANCE IN CUSTOMER ACCOUNT' : 'ACCOUNT FULLY SETTLED / ZERO OUTSTANDING BALANCE'}
              </div>
              <div style="font-size: 10px; color: #475569; margin-top: 3px;">
                Initial Balance (PKR ${initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) + Pending on Invoices (PKR ${financialTotals.totalPending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) - Return Value (PKR ${financialTotals.totalReturnValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0a382c;">
                Net Account Balance
              </div>
              <div style="font-size: 20px; font-weight: 900; font-family: monospace; margin-top: 2px; ${financialTotals.currentBalance > 0 ? 'color: #991b1b;' : 'color: #065f46;'}">
                PKR ${financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <!-- Signatures -->
          <div class="signatures-block">
            <div class="signature-line">
              Authorized Store Signature
            </div>
            <div class="signature-line">
              Customer Acknowledgment Signature
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(statementHtml);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 400);
  };

  return (
    <div 
      id="customer-ledger-view-container"
      className={
        isFullPage
          ? "fixed inset-0 z-50 bg-[#f8faf9] overflow-y-auto p-4 sm:p-6 lg:p-8 flex flex-col space-y-6 animate-in fade-in duration-200"
          : "w-full max-w-full space-y-6 animate-in fade-in duration-200"
      }
    >
      {/* Top Navigation & Action Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
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
        <div className="flex items-center gap-3 w-full lg:w-auto flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={() => setShowReceiveForm(!showReceiveForm)}
            className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0a382c] hover:bg-[#0d4a3b] text-white text-sm font-bold shadow-md shadow-emerald-950/10 transition-all cursor-pointer"
          >
            <Banknote className="w-4 h-4 text-emerald-300" />
            {showReceiveForm ? 'Hide Payment Form' : 'Receive / Settle Payment'}
          </button>
          <button
            type="button"
            onClick={() => setIsFullPage(!isFullPage)}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
              isFullPage
                ? 'bg-emerald-50 text-[#0a382c] border-emerald-200 hover:bg-emerald-100'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
            title={isFullPage ? "Exit Fullscreen (Fit in window)" : "Full Page Mode (Maximize across screen to view all fields)"}
          >
            {isFullPage ? <Minimize2 className="w-4 h-4 text-[#0a382c]" /> : <Maximize2 className="w-4 h-4 text-slate-600" />}
            <span className="whitespace-nowrap">{isFullPage ? 'Exit Full Page' : 'Full Page Mode'}</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors cursor-pointer"
            title="Print Full Customer Ledger Statement"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span className="hidden sm:inline">Print Statement</span>
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
            Initial (PKR {initialBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}) + Pending (PKR {financialTotals.totalPending.toLocaleString('en-US', { maximumFractionDigits: 0 })}) - Returns (PKR {financialTotals.totalReturnValue.toLocaleString('en-US', { maximumFractionDigits: 0 })})
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
              Invoices & Sales History ({sales.length})
            </button>
            <button
              onClick={() => setActiveTab('payments')}
              className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${
                activeTab === 'payments'
                  ? 'bg-[#0a382c] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              Payment Records & Ledger ({payments.length})
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
                              <button
                                type="button"
                                onClick={() => setViewingInvoice(sale)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-600" />
                                View
                              </button>
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
                <table className="w-full min-w-[1050px] divide-y divide-slate-100 text-left text-xs">
                  <thead className="bg-[#f8faf9] text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-4 px-5">Date & Time</th>
                      <th className="py-4 px-5">Transaction Type</th>
                      <th className="py-4 px-5">Reference / Invoice #</th>
                      <th className="py-4 px-5 text-right whitespace-nowrap">Total Billed</th>
                      <th className="py-4 px-5 text-right whitespace-nowrap">Paid / Received</th>
                      <th className="py-4 px-5 text-right whitespace-nowrap">Remaining Balance</th>
                      <th className="py-4 px-5 text-center whitespace-nowrap">Payment Method</th>
                      <th className="py-4 px-5 min-w-[200px]">Notes & Remarks</th>
                      <th className="py-4 px-5 text-center whitespace-nowrap">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredPayments.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-16 text-center text-slate-400 italic">
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

                            {/* Remaining Balance */}
                            <td className="py-4 px-5 text-right whitespace-nowrap font-black text-slate-900 text-sm">
                              {p.pendingAmount !== undefined ? `PKR ${p.pendingAmount.toFixed(2)}` : '—'}
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

                            {/* Receipt Print */}
                            <td className="py-4 px-5 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => printPaymentReceipt(p)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:border-[#0a382c] hover:bg-emerald-50 text-slate-700 hover:text-[#0a382c] text-xs font-semibold transition-colors cursor-pointer"
                                title="Print Payment Voucher / Slip"
                              >
                                <Printer className="w-3.5 h-3.5 text-emerald-700" />
                                <span>Receipt</span>
                              </button>
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
                        <th className="py-4 px-5 text-right whitespace-nowrap">Invoice Balance</th>
                        <th className="py-4 px-5 text-right whitespace-nowrap">Net Running Balance</th>
                        <th className="py-4 px-5 text-center whitespace-nowrap">Mode / Channel</th>
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
                            <td className="py-4 px-5 text-right whitespace-nowrap font-bold">
                              {row.invoiceBalance !== undefined ? (
                                <span className={row.invoiceBalance > 0 ? 'text-amber-700 font-mono' : 'text-slate-500'}>
                                  PKR {row.invoiceBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="py-4 px-5 text-right whitespace-nowrap font-black text-sm">
                              <span className={`font-mono ${row.runningBalance > 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
                                PKR {row.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-center whitespace-nowrap text-slate-600 font-semibold">
                              {row.mode} {row.bankInfo ? `(${row.bankInfo})` : ''}
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
                        <td className="py-4 px-5 text-right text-amber-700 font-mono font-bold">
                          PKR {financialTotals.totalPending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-4 px-5 text-right text-sm font-black font-mono">
                          <span className={financialTotals.currentBalance > 0 ? 'text-rose-700' : 'text-emerald-800'}>
                            PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-center text-slate-400 text-xs">
                          Final Net
                        </td>
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
                      Initial Balance (PKR {initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) + Pending on Invoices (PKR {financialTotals.totalPending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) - Return Value (PKR {financialTotals.totalReturnValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                    </div>
                  </div>
                  <div className="text-left sm:text-right bg-white/10 px-5 py-3 rounded-xl border border-white/15">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                      Net Account Balance
                    </div>
                    <div className="text-2xl font-black font-mono text-white mt-1">
                      PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
          <div className="text-xs text-slate-700 font-bold">
            Net Account Balance: <span className="font-mono font-black text-base text-rose-700 ml-1">PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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

            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingInvoice(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Print Container for Clean A4 Printing */}
      <div id="print-statement-section" className="hidden print:block print:fixed print:inset-0 print:bg-white print:p-8 print:z-[9999]">
        <div className="border-b-2 border-black pb-4 mb-5">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-black">{storeDetails?.name || 'Store Account Ledger'}</h1>
              {storeDetails?.phone && <p className="text-xs text-black font-semibold">Phone: {storeDetails.phone}</p>}
              {storeDetails?.address && <p className="text-xs text-black font-semibold">Address: {storeDetails.address}</p>}
            </div>
            <div className="text-right">
              <h2 className="text-lg font-black uppercase text-black">Customer Account Statement</h2>
              <p className="text-xs text-black font-mono">Date: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>
          </div>
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
              <th className="p-2 border-r border-black text-right">Invoice Balance</th>
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
                <td className="p-2 border-r border-black text-right">
                  {r.invoiceBalance !== undefined ? `PKR ${r.invoiceBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                </td>
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
              <td className="p-2 text-right border-r border-black">PKR {financialTotals.totalPending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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
              Initial Balance (PKR {initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) + Pending on Invoices (PKR {financialTotals.totalPending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-wider">Net Account Balance</div>
            <div className="text-xl font-black font-mono text-black mt-1">
              PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="mt-14 flex justify-between pt-6 text-xs font-bold border-t border-black">
          <div>Authorized Store Signature: _________________________</div>
          <div>Customer Acknowledgment Signature: _________________________</div>
        </div>
      </div>
    </div>
  );
}
