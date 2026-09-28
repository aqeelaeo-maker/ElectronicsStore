import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft,
  Receipt, 
  Calendar, 
  Banknote, 
  Globe, 
  FileText, 
  Search, 
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
  Package,
  Copy,
  Check,
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

export interface Vendor {
  id: string;
  name?: string;
  companyName: string;
  contactPerson?: string;
  mobile?: string;
  phone: string;
  email: string;
  city: string;
  balance: number;
  remainingAmount?: number;
  openingBalance?: number;
  initialBalance?: number;
  totalPurchases?: number;
  totalPaid?: number;
  lastPaymentAmount?: number;
  lastPaymentDate?: any;
  lastPurchaseDate?: any;
  storeId?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface VendorPaymentRecord {
  id: string;
  storeId: string;
  vendorId: string;
  vendorName: string;
  type?: 'Stock Purchase' | 'PaymentMade' | 'BillPayment' | string;
  referenceNo?: string;
  referenceNumber?: string;
  productId?: string;
  productName?: string;
  productBrand?: string;
  productModelNumber?: string;
  quantity?: number;
  unit?: string;
  purchasePrice?: number;
  totalAmount?: number;
  paidAmount?: number;
  paymentDone?: number;
  pendingAmount?: number;
  remainingAmount?: number;
  paymentStatus?: 'Paid' | 'Partially Paid' | 'Pending' | string;
  paymentMode: string;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  paymentDate?: string;
  date?: string;
  notes?: string;
  createdAt?: any;
}

export interface VendorPurchaseRecord {
  id: string;
  storeId: string;
  vendorId?: string;
  vendorName?: string;
  referenceNumber?: string;
  productId?: string;
  productName: string;
  productBrand?: string;
  productModelNumber?: string;
  unit?: string;
  quantityAdded: number;
  serialNumbers?: string[];
  purchasePrice?: number;
  totalCost?: number;
  paymentDone?: number;
  remainingAmount?: number;
  paymentStatus?: 'Paid' | 'Partially Paid' | 'Pending' | string;
  paymentMode?: string;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  paymentNotes?: string;
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

interface VendorLedgerViewProps {
  vendor: Vendor;
  storeId: string;
  onBack: () => void;
}

export default function VendorLedgerView({ vendor, storeId, onBack }: VendorLedgerViewProps) {
  const { user } = useAuth();
  const activeStoreId = storeId || auth.currentUser?.uid || user?.uid || vendor?.storeId || '';

  const [activeTab, setActiveTab] = useState<'purchases' | 'payments' | 'statement'>('purchases');
  const [purchases, setPurchases] = useState<VendorPurchaseRecord[]>([]);
  const [payments, setPayments] = useState<VendorPaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeDetails, setStoreDetails] = useState<any>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [currentVendorData, setCurrentVendorData] = useState<Vendor>(vendor);

  // Quick View Modal State for a purchase / stock bill
  const [viewingPurchase, setViewingPurchase] = useState<VendorPurchaseRecord | null>(null);
  const [copiedSerial, setCopiedSerial] = useState<string | null>(null);

  // Filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'month' | 'year'>('all');

  // Pay Vendor Form State
  const [showPayForm, setShowPayForm] = useState(false);
  const [payingAmount, setPayingAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Online'>('Cash');
  const [selectedBankAcc, setSelectedBankAcc] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Edit & Delete modals state for Purchases
  const [editingPurchase, setEditingPurchase] = useState<VendorPurchaseRecord | null>(null);
  const [purchaseEditForm, setPurchaseEditForm] = useState({
    referenceNumber: '',
    quantityAdded: '',
    purchasePrice: '',
    totalCost: '',
    paymentDone: '',
    remainingAmount: '',
    paymentMode: 'Credit',
    bankAccountNumber: '',
    bankName: '',
    paymentStatus: 'Pending',
    notes: ''
  });
  const [deletingPurchase, setDeletingPurchase] = useState<VendorPurchaseRecord | null>(null);

  // Edit & Delete modals state for Vendor Payments
  const [editingPayment, setEditingPayment] = useState<VendorPaymentRecord | null>(null);
  const [paymentEditForm, setPaymentEditForm] = useState({
    paidAmount: '',
    paymentDate: '',
    paymentMode: 'Cash' as 'Cash' | 'Online',
    bankAccountNumber: '',
    bankName: '',
    referenceNo: '',
    notes: ''
  });
  const [deletingPayment, setDeletingPayment] = useState<VendorPaymentRecord | null>(null);
  const [processingAction, setProcessingAction] = useState(false);

  // Listen to vendor document in real-time
  useEffect(() => {
    if (!vendor?.id) return;
    const unsub = onSnapshot(doc(db, 'vendors', vendor.id), (snap) => {
      if (snap.exists()) {
        setCurrentVendorData({ id: snap.id, ...snap.data() } as Vendor);
      }
    });
    return () => unsub();
  }, [vendor?.id]);

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

  // Fetch Purchases (inventoryLogs with this vendorId) and Payments (vendorPayments)
  useEffect(() => {
    if (!activeStoreId || !vendor?.id) return;

    setLoading(true);

    // 1. Inventory Logs query for this vendor's stock purchases
    const purchasesQuery = query(
      collection(db, 'inventoryLogs'),
      where('storeId', '==', activeStoreId),
      where('vendorId', '==', vendor.id)
    );

    const unsubPurchases = onSnapshot(purchasesQuery, (snapshot) => {
      const purchaseList: VendorPurchaseRecord[] = [];
      snapshot.forEach(d => {
        purchaseList.push({ id: d.id, ...d.data() } as VendorPurchaseRecord);
      });
      // Sort newest first
      purchaseList.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });
      setPurchases(purchaseList);
    }, (err) => {
      console.error('Error fetching vendor stock purchases:', err);
    });

    // 2. Payments query for this vendor
    const paymentsQuery = query(
      collection(db, 'vendorPayments'),
      where('storeId', '==', activeStoreId),
      where('vendorId', '==', vendor.id)
    );

    const unsubPayments = onSnapshot(paymentsQuery, (snapshot) => {
      const paymentsList: VendorPaymentRecord[] = [];
      snapshot.forEach(d => {
        paymentsList.push({ id: d.id, ...d.data() } as VendorPaymentRecord);
      });
      // Sort newest first
      paymentsList.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.paymentDate || a.date || 0).getTime());
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.paymentDate || b.date || 0).getTime());
        return timeB - timeA;
      });
      setPayments(paymentsList);
      setLoading(false);
    }, (err) => {
      console.error('Error fetching vendor payments:', err);
      setLoading(false);
    });

    return () => {
      unsubPurchases();
      unsubPayments();
    };
  }, [activeStoreId, vendor?.id]);

  // Calculate or derive the Initial / Opening Balance of vendor account
  const initialBalance = useMemo(() => {
    if (currentVendorData.openingBalance !== undefined && currentVendorData.openingBalance !== null && !isNaN(Number(currentVendorData.openingBalance))) {
      return Number(currentVendorData.openingBalance);
    }
    if (currentVendorData.initialBalance !== undefined && currentVendorData.initialBalance !== null && !isNaN(Number(currentVendorData.initialBalance))) {
      return Number(currentVendorData.initialBalance);
    }
    
    // Derive mathematically if not explicitly set:
    // vendorRemaining = initialBalance + totalPurchased - totalPaid
    // initialBalance = vendorRemaining - totalPurchased + totalPaid
    const totalPurchased = purchases.reduce((sum, p) => {
      const cost = p.totalCost !== undefined ? p.totalCost : ((p.purchasePrice || 0) * (p.quantityAdded || 1));
      return sum + cost;
    }, 0);

    const totalPaid = payments.reduce((sum, pay) => {
      return sum + (pay.paidAmount !== undefined ? pay.paidAmount : (pay.paymentDone || 0));
    }, 0);

    const curBal = currentVendorData.remainingAmount ?? currentVendorData.balance ?? 0;
    const derived = Number((curBal - totalPurchased + totalPaid).toFixed(2));
    if (derived > 0) return derived;
    if (purchases.length === 0 && curBal > 0) return curBal;
    return 0;
  }, [currentVendorData, purchases, payments]);

  // Financial calculations
  const financialTotals = useMemo(() => {
    let totalPurchased = 0;
    let totalPaidFromPurchases = 0;
    let totalPendingFromPurchases = 0;

    purchases.forEach(p => {
      const cost = p.totalCost !== undefined 
        ? p.totalCost 
        : ((p.purchasePrice || 0) * (p.quantityAdded || 1));
      totalPurchased += cost;

      const paid = p.paymentDone !== undefined 
        ? p.paymentDone 
        : (p.paymentStatus === 'Paid' ? cost : 0);
      const pending = p.remainingAmount !== undefined 
        ? p.remainingAmount 
        : Math.max(0, cost - paid);

      totalPaidFromPurchases += paid;
      totalPendingFromPurchases += pending;
    });

    // Also calculate total settlements/payments made
    let totalDisbursed = 0;
    payments.forEach(pay => {
      if (pay.type === 'PaymentMade' || pay.type === 'BillPayment') {
        totalDisbursed += (pay.paidAmount || pay.paymentDone || 0);
      } else {
        totalDisbursed += (pay.paymentDone || pay.paidAmount || 0);
      }
    });

    const netAccountPayable = currentVendorData.remainingAmount !== undefined 
      ? currentVendorData.remainingAmount 
      : (currentVendorData.balance !== undefined 
          ? currentVendorData.balance 
          : Number((initialBalance + totalPurchased - totalDisbursed).toFixed(2)));

    const totalReportedPurchases = currentVendorData.totalPurchases !== undefined && currentVendorData.totalPurchases > 0
      ? currentVendorData.totalPurchases
      : totalPurchased;

    const totalReportedPaid = currentVendorData.totalPaid !== undefined && currentVendorData.totalPaid > 0
      ? currentVendorData.totalPaid
      : totalDisbursed;

    return {
      initialBalance,
      totalPurchased: totalReportedPurchases,
      totalPaid: totalReportedPaid,
      totalPending: totalPendingFromPurchases,
      totalReturnValue: 0,
      currentBalance: netAccountPayable
    };
  }, [purchases, payments, currentVendorData, initialBalance]);

  // Print voucher / receipt for an individual payment to vendor
  const printPaymentVoucher = (payment: VendorPaymentRecord) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.info('Popup blocked. Please allow popups to print payment voucher.');
      return;
    }

    const voucherHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Vendor Payment Voucher - ${payment.referenceNo || payment.referenceNumber || payment.id}</title>
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
            <div class="title">${storeDetails?.name || 'VENDOR PAYMENT VOUCHER'}</div>
            ${storeDetails?.phone ? `<div>Phone: ${storeDetails.phone}</div>` : ''}
            ${storeDetails?.address ? `<div>Address: ${storeDetails.address}</div>` : ''}
            <div class="badge">Vendor Payment Disbursement</div>
          </div>
          
          <div class="divider"></div>
          
          <div class="row">
            <span>Voucher #:</span>
            <span class="font-mono font-bold">${payment.referenceNo || payment.referenceNumber || payment.id.slice(-8).toUpperCase()}</span>
          </div>
          <div class="row">
            <span>Date:</span>
            <span>${payment.paymentDate || payment.date ? new Date(payment.paymentDate || payment.date || '').toLocaleDateString() : new Date().toLocaleDateString()}</span>
          </div>
          <div class="row">
            <span>Paid To:</span>
            <span class="font-bold">${currentVendorData.companyName || currentVendorData.name}</span>
          </div>
          ${currentVendorData.contactPerson ? `
          <div class="row">
            <span>Contact Person:</span>
            <span>${currentVendorData.contactPerson}</span>
          </div>` : ''}
          <div class="row">
            <span>Phone:</span>
            <span>${currentVendorData.phone || currentVendorData.mobile || '—'}</span>
          </div>
          ${currentVendorData.city ? `
          <div class="row">
            <span>City:</span>
            <span>${currentVendorData.city}</span>
          </div>` : ''}
          
          <div class="divider"></div>
          
          <div class="amount-box">
            <div style="font-size: 10px; font-weight: bold; text-transform: uppercase;">Amount Paid</div>
            <div class="amount-val font-mono">PKR ${(payment.paidAmount || payment.paymentDone || 0).toFixed(2)}</div>
            <div style="font-size: 9px;">Mode: ${payment.paymentMode || 'Cash'} ${payment.bankName ? `(${payment.bankName})` : ''}</div>
          </div>

          <div class="row">
            <span>Remaining Balance:</span>
            <span class="font-mono font-bold">PKR ${(payment.pendingAmount !== undefined ? payment.pendingAmount : (payment.remainingAmount !== undefined ? payment.remainingAmount : (currentVendorData.balance || 0))).toFixed(2)}</span>
          </div>
          ${payment.notes ? `
          <div style="margin-top: 4px; font-size: 9.5px;">
            <span class="font-bold">Remarks:</span> ${payment.notes}
          </div>` : ''}

          <div class="sig-line">
            Authorized Store Sign & Stamp
          </div>
          <div class="sig-line">
            Vendor / Receiver Signature
          </div>

          <div class="footer">
            Official Payment Record<br/>
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
    printWindow.document.write(voucherHtml);
    printWindow.document.close();
  };

  // Handle recording payment to vendor
  const handleMakePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor?.id) {
      toast.error('Vendor information is missing.');
      return;
    }

    const effectiveStoreId = activeStoreId;
    if (!effectiveStoreId) {
      toast.error('Store ID could not be determined. Please refresh the page and try again.');
      return;
    }

    const amount = parseFloat(payingAmount);
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

      // 1. Determine vendor current balance safely
      const vendorRef = doc(db, 'vendors', vendor.id);
      let currentVendorBal = (typeof currentVendorData.balance === 'number' && !isNaN(currentVendorData.balance))
        ? currentVendorData.balance
        : (parseFloat(currentVendorData.balance as any) || 0);

      try {
        const vendorSnap = await getDoc(vendorRef);
        if (vendorSnap.exists()) {
          const rawBal = vendorSnap.data().remainingAmount !== undefined ? vendorSnap.data().remainingAmount : vendorSnap.data().balance;
          if (typeof rawBal === 'number' && !isNaN(rawBal)) {
            currentVendorBal = rawBal;
          } else if (rawBal !== undefined && rawBal !== null) {
            currentVendorBal = parseFloat(rawBal) || 0;
          }
        }
      } catch (vReadErr) {
        console.warn('Could not re-fetch vendor balance, using current state:', vReadErr);
      }

      if (currentVendorBal === 0 && financialTotals.currentBalance > 0) {
        currentVendorBal = financialTotals.currentBalance;
      }

      const newBalance = Number(Math.max(0, currentVendorBal - amount).toFixed(2));
      const currentPaid = typeof currentVendorData.totalPaid === 'number' ? currentVendorData.totalPaid : 0;
      const newTotalPaid = Number((currentPaid + amount).toFixed(2));

      // 2. Prepare vendorPayments entry
      const paymentRecordId = doc(collection(db, 'vendorPayments')).id;
      const paymentRef = doc(db, 'vendorPayments', paymentRecordId);
      const voucherNo = `VPAY-${Date.now().toString(36).toUpperCase()}`;

      const safeStoreId = effectiveStoreId || auth.currentUser?.uid || user?.uid || vendor?.storeId || '';

      const paymentRecordPayload = cleanDataForFirestore({
        id: paymentRecordId,
        storeId: safeStoreId,
        vendorId: vendor.id,
        vendorName: currentVendorData.companyName || currentVendorData.name || 'Vendor',
        type: 'PaymentMade',
        referenceNo: voucherNo,
        referenceNumber: voucherNo,
        totalAmount: 0,
        paidAmount: amount,
        paymentDone: amount,
        pendingAmount: newBalance,
        remainingAmount: newBalance,
        paymentMode: paymentMode || 'Cash',
        bankAccountNumber: paymentMode === 'Online' && matchedBank ? (matchedBank.accountNumber || null) : null,
        bankName: paymentMode === 'Online' && matchedBank ? (matchedBank.bankName || null) : null,
        paymentDate: paymentDate || new Date().toISOString(),
        date: paymentDate || new Date().toISOString(),
        notes: paymentNotes.trim() || 'Payment made to vendor',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await setDoc(paymentRef, paymentRecordPayload);

      // Also write to subcollection vendors/{vendorId}/payments
      try {
        const subColRef = doc(collection(db, 'vendors', vendor.id, 'payments'), paymentRecordId);
        await setDoc(subColRef, paymentRecordPayload);
      } catch (subColErr) {
        console.warn('Could not write to vendor payments subcollection (top-level was recorded):', subColErr);
      }

      // 3. Update vendor document directly
      try {
        await updateDoc(vendorRef, {
          balance: newBalance,
          remainingAmount: newBalance,
          totalPaid: newTotalPaid,
          lastPaymentAmount: amount,
          lastPaymentDate: paymentDate || new Date().toISOString(),
          updatedAt: serverTimestamp()
        });
      } catch (vendErr) {
        console.warn('updateDoc failed on vendor, attempting setDoc merge:', vendErr);
        await setDoc(vendorRef, {
          balance: newBalance,
          remainingAmount: newBalance,
          totalPaid: newTotalPaid,
          lastPaymentAmount: amount,
          lastPaymentDate: paymentDate || new Date().toISOString(),
          updatedAt: serverTimestamp(),
          storeId: safeStoreId
        }, { merge: true });
      }

      // 4. FIFO allocate against pending inventory purchases
      try {
        let remainingToAllocate = amount;
        const pendingPurchases = [...purchases]
          .filter(p => (p.remainingAmount || 0) > 0 || p.paymentStatus === 'Pending' || p.paymentStatus === 'Partially Paid')
          .reverse(); // oldest first

        for (const pendingPur of pendingPurchases) {
          if (remainingToAllocate <= 0) break;
          const cost = pendingPur.totalCost !== undefined ? pendingPur.totalCost : ((pendingPur.purchasePrice || 0) * (pendingPur.quantityAdded || 1));
          const curPaid = pendingPur.paymentDone || 0;
          const curPending = pendingPur.remainingAmount !== undefined ? pendingPur.remainingAmount : (cost - curPaid);

          if (curPending <= 0) continue;

          const allocation = Math.min(remainingToAllocate, curPending);
          const newPurPaid = Number((curPaid + allocation).toFixed(2));
          const newPurPending = Number(Math.max(0, curPending - allocation).toFixed(2));
          const newStatus = newPurPending === 0 ? 'Paid' : 'Partially Paid';

          const logRef = doc(db, 'inventoryLogs', pendingPur.id);
          try {
            await updateDoc(logRef, {
              paymentDone: newPurPaid,
              remainingAmount: newPurPending,
              paymentStatus: newStatus,
              updatedAt: serverTimestamp()
            });
          } catch (pUpErr) {
            console.warn(`Could not update inventory log ${pendingPur.id}:`, pUpErr);
          }

          remainingToAllocate = Number((remainingToAllocate - allocation).toFixed(2));
        }
      } catch (allocErr) {
        console.warn('Could not complete purchase allocation (payment was recorded):', allocErr);
      }

      // 5. Update store bank account balance if Online payment
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
                  balance: Number((curBal - amount).toFixed(2)) // Disbursement reduces store bank balance
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
          console.warn('Could not update store bank account balance:', bankErr);
        }
      }

      toast.success(`Successfully recorded payment of PKR ${amount.toFixed(2)} to ${currentVendorData.companyName || currentVendorData.name}!`);
      setPayingAmount('');
      setPaymentNotes('');
      setShowPayForm(false);
    } catch (err: any) {
      console.error('Error recording vendor payment:', err);
      const errorDetail = err?.message ? `: ${err.message}` : '. Please try again.';
      toast.error(`Failed to record payment${errorDetail}`);
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Handlers for Editing & Deleting Purchases
  const handleOpenEditPurchase = (purchase: VendorPurchaseRecord) => {
    const cost = purchase.totalCost !== undefined 
      ? purchase.totalCost 
      : ((purchase.purchasePrice || 0) * (purchase.quantityAdded || 1));
    const paid = purchase.paymentDone !== undefined 
      ? purchase.paymentDone 
      : (purchase.paymentStatus === 'Paid' ? cost : 0);
    const remaining = purchase.remainingAmount !== undefined 
      ? purchase.remainingAmount 
      : Math.max(0, cost - paid);

    setPurchaseEditForm({
      referenceNumber: purchase.referenceNumber || '',
      quantityAdded: (purchase.quantityAdded || 1).toString(),
      purchasePrice: (purchase.purchasePrice || 0).toString(),
      totalCost: cost.toString(),
      paymentDone: paid.toString(),
      remainingAmount: remaining.toString(),
      paymentMode: purchase.paymentMode || 'Credit',
      bankAccountNumber: purchase.bankAccountNumber || '',
      bankName: purchase.bankName || '',
      paymentStatus: purchase.paymentStatus || (remaining === 0 ? 'Paid' : (paid > 0 ? 'Partially Paid' : 'Pending')),
      notes: purchase.paymentNotes || purchase.notes || ''
    });
    setEditingPurchase(purchase);
  };

  const handleSaveEditPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPurchase || !activeStoreId) return;

    const qty = parseFloat(purchaseEditForm.quantityAdded) || 1;
    const price = parseFloat(purchaseEditForm.purchasePrice) || 0;
    const cost = parseFloat(purchaseEditForm.totalCost) || (qty * price);
    const paid = parseFloat(purchaseEditForm.paymentDone) || 0;

    if (cost < 0 || price < 0 || qty <= 0) {
      toast.error('Please enter valid quantities and costs');
      return;
    }
    if (paid > cost) {
      toast.error('Payment amount cannot exceed total bill cost');
      return;
    }

    const remaining = Math.max(0, Number((cost - paid).toFixed(2)));
    const calculatedStatus = remaining === 0 ? 'Paid' : (paid > 0 ? 'Partially Paid' : 'Pending');

    const matchedBank = purchaseEditForm.paymentMode === 'Online'
      ? bankAccounts.find(b => b.accountNumber === purchaseEditForm.bankAccountNumber)
      : null;

    setProcessingAction(true);
    try {
      const oldCost = editingPurchase.totalCost !== undefined 
        ? editingPurchase.totalCost 
        : ((editingPurchase.purchasePrice || 0) * (editingPurchase.quantityAdded || 1));
      const oldPaid = editingPurchase.paymentDone !== undefined 
        ? editingPurchase.paymentDone 
        : (editingPurchase.paymentStatus === 'Paid' ? oldCost : 0);
      const oldRemaining = editingPurchase.remainingAmount !== undefined 
        ? editingPurchase.remainingAmount 
        : Math.max(0, oldCost - oldPaid);

      const remDelta = remaining - oldRemaining;

      // Reconcile store bank account balance if Online payment
      const wasOnline = editingPurchase.paymentMode === 'Online';
      const isOnline = purchaseEditForm.paymentMode === 'Online';

      if (activeStoreId && (wasOnline || isOnline)) {
        try {
          const storeRef = doc(db, 'stores', activeStoreId);
          const storeSnap = await getDoc(storeRef);
          if (storeSnap.exists()) {
            const storeData = storeSnap.data();
            let currentAccounts = Array.isArray(storeData.bankAccounts) ? [...storeData.bankAccounts] : [];
            let changed = false;

            // Vendor payments deduct from bank balance, so re-crediting old paid
            if (wasOnline && editingPurchase.bankAccountNumber && oldPaid > 0) {
              currentAccounts = currentAccounts.map((acc: any) => {
                if (acc.accountNumber === editingPurchase.bankAccountNumber) {
                  changed = true;
                  const curBal = typeof acc.balance === 'number' ? acc.balance : (parseFloat(acc.balance) || 0);
                  return { ...acc, balance: Number((curBal + oldPaid).toFixed(2)) };
                }
                return acc;
              });
            }

            // Deduct new paid amount
            if (isOnline && purchaseEditForm.bankAccountNumber && paid > 0) {
              currentAccounts = currentAccounts.map((acc: any) => {
                if (acc.accountNumber === purchaseEditForm.bankAccountNumber) {
                  changed = true;
                  const curBal = typeof acc.balance === 'number' ? acc.balance : (parseFloat(acc.balance) || 0);
                  return { ...acc, balance: Number((curBal - paid).toFixed(2)) };
                }
                return acc;
              });
            }

            if (changed) {
              await updateDoc(storeRef, { bankAccounts: currentAccounts, updatedAt: serverTimestamp() });
            }
          }
        } catch (bErr) {
          console.warn('Bank account update error on purchase edit:', bErr);
        }
      }

      // Update inventoryLogs document
      const purRef = doc(db, 'inventoryLogs', editingPurchase.id);
      await updateDoc(purRef, cleanDataForFirestore({
        referenceNumber: purchaseEditForm.referenceNumber.trim() || editingPurchase.referenceNumber || null,
        quantityAdded: qty,
        purchasePrice: price,
        totalCost: cost,
        paymentDone: paid,
        remainingAmount: remaining,
        paymentStatus: calculatedStatus,
        paymentMode: purchaseEditForm.paymentMode,
        bankAccountNumber: isOnline && matchedBank ? matchedBank.accountNumber : null,
        bankName: isOnline && matchedBank ? matchedBank.bankName : null,
        paymentNotes: purchaseEditForm.notes.trim() || null,
        updatedAt: serverTimestamp()
      }));

      // Update vendor balance
      if (vendor?.id && Math.abs(remDelta) > 0.001) {
        try {
          const vRef = doc(db, 'vendors', vendor.id);
          const curBal = typeof currentVendorData.balance === 'number' ? currentVendorData.balance : (parseFloat(currentVendorData.balance as any) || 0);
          const newBal = Math.max(0, Number((curBal + remDelta).toFixed(2)));
          await updateDoc(vRef, {
            balance: newBal,
            remainingAmount: newBal,
            updatedAt: serverTimestamp()
          });
        } catch (vErr) {
          console.warn('Vendor balance update error on purchase edit:', vErr);
        }
      }

      toast.success(`Purchase record ${editingPurchase.referenceNumber || editingPurchase.id} updated successfully!`);
      setEditingPurchase(null);
    } catch (err: any) {
      console.error('Error updating purchase:', err);
      toast.error(`Failed to update purchase: ${err.message || 'Unknown error'}`);
    } finally {
      setProcessingAction(false);
    }
  };

  const handleExecuteDeletePurchase = async () => {
    if (!deletingPurchase || !activeStoreId) return;

    setProcessingAction(true);
    try {
      const cost = deletingPurchase.totalCost !== undefined 
        ? deletingPurchase.totalCost 
        : ((deletingPurchase.purchasePrice || 0) * (deletingPurchase.quantityAdded || 1));
      const paid = deletingPurchase.paymentDone !== undefined 
        ? deletingPurchase.paymentDone 
        : (deletingPurchase.paymentStatus === 'Paid' ? cost : 0);
      const remaining = deletingPurchase.remainingAmount !== undefined 
        ? deletingPurchase.remainingAmount 
        : Math.max(0, cost - paid);

      // Revert store bank account if Online
      if (deletingPurchase.paymentMode === 'Online' && deletingPurchase.bankAccountNumber && paid > 0 && activeStoreId) {
        try {
          const storeRef = doc(db, 'stores', activeStoreId);
          const storeSnap = await getDoc(storeRef);
          if (storeSnap.exists()) {
            const storeData = storeSnap.data();
            let currentAccounts = Array.isArray(storeData.bankAccounts) ? [...storeData.bankAccounts] : [];
            currentAccounts = currentAccounts.map((acc: any) => {
              if (acc.accountNumber === deletingPurchase.bankAccountNumber) {
                const curBal = typeof acc.balance === 'number' ? acc.balance : (parseFloat(acc.balance) || 0);
                return { ...acc, balance: Number((curBal + paid).toFixed(2)) };
              }
              return acc;
            });
            await updateDoc(storeRef, { bankAccounts: currentAccounts, updatedAt: serverTimestamp() });
          }
        } catch (bErr) {
          console.warn('Bank balance restore error on purchase delete:', bErr);
        }
      }

      // Deduct remaining debt from vendor
      if (vendor?.id && remaining > 0) {
        try {
          const vRef = doc(db, 'vendors', vendor.id);
          const curBal = typeof currentVendorData.balance === 'number' ? currentVendorData.balance : (parseFloat(currentVendorData.balance as any) || 0);
          const newBal = Math.max(0, Number((curBal - remaining).toFixed(2)));
          await updateDoc(vRef, {
            balance: newBal,
            remainingAmount: newBal,
            updatedAt: serverTimestamp()
          });
        } catch (vErr) {
          console.warn('Vendor balance update error on purchase delete:', vErr);
        }
      }

      await deleteDoc(doc(db, 'inventoryLogs', deletingPurchase.id));
      toast.success(`Purchase record ${deletingPurchase.referenceNumber || deletingPurchase.id} deleted successfully!`);
      setDeletingPurchase(null);
    } catch (err: any) {
      console.error('Error deleting purchase:', err);
      toast.error(`Failed to delete purchase: ${err.message || 'Unknown error'}`);
    } finally {
      setProcessingAction(false);
    }
  };

  // Handlers for Editing & Deleting Payments
  const handleOpenEditPayment = (payment: VendorPaymentRecord) => {
    const amt = payment.paidAmount !== undefined ? payment.paidAmount : (payment.paymentDone || 0);
    const dateVal = payment.paymentDate 
      ? payment.paymentDate.split('T')[0] 
      : (payment.createdAt?.toMillis ? new Date(payment.createdAt.toMillis()).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);

    setPaymentEditForm({
      paidAmount: amt.toString(),
      paymentDate: dateVal,
      paymentMode: (payment.paymentMode === 'Online' ? 'Online' : 'Cash'),
      bankAccountNumber: payment.bankAccountNumber || '',
      bankName: payment.bankName || '',
      referenceNo: payment.referenceNo || payment.referenceNumber || '',
      notes: payment.notes || ''
    });
    setEditingPayment(payment);
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
      const oldAmount = editingPayment.paidAmount !== undefined ? editingPayment.paidAmount : (editingPayment.paymentDone || 0);
      const delta = newAmount - oldAmount; // paying more reduces vendor debt, paying less increases debt

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
                  return { ...acc, balance: Number((curBal + oldAmount).toFixed(2)) };
                }
                return acc;
              });
            }

            if (isOnline && paymentEditForm.bankAccountNumber && newAmount > 0) {
              currentAccounts = currentAccounts.map((acc: any) => {
                if (acc.accountNumber === paymentEditForm.bankAccountNumber) {
                  changed = true;
                  const curBal = typeof acc.balance === 'number' ? acc.balance : (parseFloat(acc.balance) || 0);
                  return { ...acc, balance: Number((curBal - newAmount).toFixed(2)) };
                }
                return acc;
              });
            }

            if (changed) {
              await updateDoc(storeRef, { bankAccounts: currentAccounts, updatedAt: serverTimestamp() });
            }
          }
        } catch (bErr) {
          console.warn('Bank balance reconcile error on vendor payment edit:', bErr);
        }
      }

      const paymentRef = doc(db, 'vendorPayments', editingPayment.id);
      const updatePayload = cleanDataForFirestore({
        paidAmount: newAmount,
        paymentDone: newAmount,
        paymentDate: paymentEditForm.paymentDate,
        date: paymentEditForm.paymentDate,
        paymentMode: paymentEditForm.paymentMode,
        bankAccountNumber: isOnline && matchedBank ? matchedBank.accountNumber : null,
        bankName: isOnline && matchedBank ? matchedBank.bankName : null,
        referenceNo: paymentEditForm.referenceNo.trim() || editingPayment.referenceNo || null,
        notes: paymentEditForm.notes.trim() || null,
        updatedAt: serverTimestamp()
      });

      await updateDoc(paymentRef, updatePayload);

      if (vendor?.id) {
        try {
          const subColRef = doc(collection(db, 'vendors', vendor.id, 'payments'), editingPayment.id);
          await updateDoc(subColRef, updatePayload).catch(() => {});
        } catch (_) {}
      }

      // Update vendor balance
      if (vendor?.id && Math.abs(delta) > 0.001) {
        try {
          const vRef = doc(db, 'vendors', vendor.id);
          const curBal = typeof currentVendorData.balance === 'number' ? currentVendorData.balance : (parseFloat(currentVendorData.balance as any) || 0);
          const newBal = Math.max(0, Number((curBal - delta).toFixed(2)));
          const curPaid = typeof currentVendorData.totalPaid === 'number' ? currentVendorData.totalPaid : 0;
          const newTotalPaid = Math.max(0, Number((curPaid + delta).toFixed(2)));
          await updateDoc(vRef, {
            balance: newBal,
            remainingAmount: newBal,
            totalPaid: newTotalPaid,
            updatedAt: serverTimestamp()
          });
        } catch (vErr) {
          console.warn('Vendor balance update error on payment edit:', vErr);
        }
      }

      toast.success('Vendor payment voucher updated successfully!');
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
      const paid = deletingPayment.paidAmount !== undefined ? deletingPayment.paidAmount : (deletingPayment.paymentDone || 0);

      // Restore vendor balance (adding back paid amount to debt)
      if (vendor?.id && paid > 0) {
        try {
          const vRef = doc(db, 'vendors', vendor.id);
          const curBal = typeof currentVendorData.balance === 'number' ? currentVendorData.balance : (parseFloat(currentVendorData.balance as any) || 0);
          const newBal = Number((curBal + paid).toFixed(2));
          const curPaid = typeof currentVendorData.totalPaid === 'number' ? currentVendorData.totalPaid : 0;
          const newTotalPaid = Math.max(0, Number((curPaid - paid).toFixed(2)));
          await updateDoc(vRef, {
            balance: newBal,
            remainingAmount: newBal,
            totalPaid: newTotalPaid,
            updatedAt: serverTimestamp()
          });
        } catch (vErr) {
          console.warn('Vendor balance update error on payment delete:', vErr);
        }
      }

      // Revert store bank account if Online
      if (deletingPayment.paymentMode === 'Online' && deletingPayment.bankAccountNumber && paid > 0 && activeStoreId) {
        try {
          const storeRef = doc(db, 'stores', activeStoreId);
          const storeSnap = await getDoc(storeRef);
          if (storeSnap.exists()) {
            const storeData = storeSnap.data();
            let currentAccounts = Array.isArray(storeData.bankAccounts) ? [...storeData.bankAccounts] : [];
            currentAccounts = currentAccounts.map((acc: any) => {
              if (acc.accountNumber === deletingPayment.bankAccountNumber) {
                const curBal = typeof acc.balance === 'number' ? acc.balance : (parseFloat(acc.balance) || 0);
                return { ...acc, balance: Number((curBal + paid).toFixed(2)) };
              }
              return acc;
            });
            await updateDoc(storeRef, { bankAccounts: currentAccounts, updatedAt: serverTimestamp() });
          }
        } catch (bErr) {
          console.warn('Bank balance restore error on payment delete:', bErr);
        }
      }

      await deleteDoc(doc(db, 'vendorPayments', deletingPayment.id));
      if (vendor?.id) {
        try {
          const subColRef = doc(collection(db, 'vendors', vendor.id, 'payments'), deletingPayment.id);
          await deleteDoc(subColRef).catch(() => {});
        } catch (_) {}
      }

      toast.success(`Payment voucher ${deletingPayment.referenceNo || deletingPayment.referenceNumber || deletingPayment.id} deleted successfully!`);
      setDeletingPayment(null);
    } catch (err: any) {
      console.error('Error deleting payment:', err);
      toast.error(`Failed to delete payment: ${err.message || 'Unknown error'}`);
    } finally {
      setProcessingAction(false);
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

  // Filtered Purchases
  const filteredPurchases = useMemo(() => {
    return purchases.filter(p => {
      const dateVal = p.createdAt?.toMillis ? new Date(p.createdAt.toMillis()).toISOString() : '';
      const matchesDate = filterByDate(dateVal);
      if (!matchesDate) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const matchRef = p.referenceNumber?.toLowerCase().includes(term);
      const matchProduct = p.productName?.toLowerCase().includes(term) || p.productBrand?.toLowerCase().includes(term) || p.productModelNumber?.toLowerCase().includes(term);
      const matchMode = p.paymentMode?.toLowerCase().includes(term);
      const matchStatus = p.paymentStatus?.toLowerCase().includes(term);
      const matchSerials = p.serialNumbers?.some(sn => sn.toLowerCase().includes(term));
      return matchRef || matchProduct || matchMode || matchStatus || matchSerials;
    });
  }, [purchases, searchTerm, dateFilter]);

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const dateVal = p.paymentDate || p.date || (p.createdAt?.toMillis ? new Date(p.createdAt.toMillis()).toISOString() : '');
      const matchesDate = filterByDate(dateVal);
      if (!matchesDate) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        (p.referenceNo && p.referenceNo.toLowerCase().includes(term)) ||
        (p.referenceNumber && p.referenceNumber.toLowerCase().includes(term)) ||
        (p.paymentMode && p.paymentMode.toLowerCase().includes(term)) ||
        (p.notes && p.notes.toLowerCase().includes(term)) ||
        (p.type && p.type.toLowerCase().includes(term)) ||
        (p.productName && p.productName.toLowerCase().includes(term)) ||
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
    type: 'Initial Balance' | 'Purchase' | 'Payment';
    refNo: string;
    description: string;
    credit: number;      // Increases what we owe to vendor (Purchases)
    debit: number;       // Decreases what we owe to vendor (Payments)
    billBalance: number; // Balance remaining on this specific bill (or initial balance)
    runningBalance: number; // Cumulative net account balance payable
    mode: string;
    bankInfo?: string;
    rawPurchase?: VendorPurchaseRecord;
    rawPayment?: VendorPaymentRecord;
  };

  // Combined Running Account Statement
  const statementRows = useMemo(() => {
    const combined: (Omit<StatementRowItem, 'runningBalance'>)[] = [];

    // Earliest date for Initial Balance row
    let earliestDate: Date;
    if (currentVendorData.createdAt?.toMillis) {
      earliestDate = new Date(currentVendorData.createdAt.toMillis());
    } else if (purchases.length > 0) {
      const firstPurchase = purchases[purchases.length - 1];
      const pDate = firstPurchase.createdAt?.toMillis ? firstPurchase.createdAt.toMillis() : new Date().getTime();
      earliestDate = new Date(pDate - 86400000);
    } else {
      earliestDate = new Date();
    }

    // 1. Initial / Opening Balance Row (reflecting starting account balance)
    combined.push({
      id: 'initial-vendor-bal-row',
      date: earliestDate.toISOString(),
      dateObj: earliestDate,
      sortOrder: 0,
      type: 'Initial Balance',
      refNo: 'INITIAL-BAL',
      description: 'Account Opening / Initial Balance Payable',
      credit: initialBalance > 0 ? initialBalance : 0,
      debit: 0,
      billBalance: initialBalance,
      mode: 'Opening'
    });

    // 2. Stock Purchases (Credit - we owe vendor)
    purchases.forEach(p => {
      const dateVal = p.createdAt?.toMillis ? new Date(p.createdAt.toMillis()).toISOString() : new Date().toISOString();
      const cost = p.totalCost !== undefined ? p.totalCost : ((p.purchasePrice || 0) * (p.quantityAdded || 1));
      const paid = p.paymentDone !== undefined ? p.paymentDone : (p.paymentStatus === 'Paid' ? cost : 0);
      const pending = p.remainingAmount !== undefined ? p.remainingAmount : Math.max(0, cost - paid);

      combined.push({
        id: `pur-${p.id}`,
        date: dateVal,
        dateObj: new Date(dateVal),
        sortOrder: 1,
        type: 'Purchase',
        refNo: p.referenceNumber || `PUR-${p.id.slice(-6).toUpperCase()}`,
        description: `Stock Intake: ${p.productName || 'Product'} (${p.quantityAdded || 1} ${p.unit || 'units'} @ PKR ${p.purchasePrice || 0})`,
        credit: cost,
        debit: 0,
        billBalance: pending,
        mode: p.paymentMode || 'Credit',
        bankInfo: p.bankName ? `${p.bankName} (${p.bankAccountNumber})` : undefined,
        rawPurchase: p
      });
    });

    // 3. Payments Made to Vendor (Debit - reduces what we owe)
    payments.forEach(p => {
      const isPurchaseInitialPayment = p.type === 'Stock Purchase';
      const amount = p.paidAmount !== undefined ? p.paidAmount : (p.paymentDone || 0);
      if (amount <= 0 && isPurchaseInitialPayment) return;

      const dateVal = p.paymentDate || p.date || (p.createdAt?.toMillis ? new Date(p.createdAt.toMillis()).toISOString() : new Date().toISOString());
      combined.push({
        id: `pay-${p.id}`,
        date: dateVal,
        dateObj: new Date(dateVal),
        sortOrder: 2,
        type: 'Payment',
        refNo: p.referenceNo || p.referenceNumber || `VPAY-${p.id.slice(-6).toUpperCase()}`,
        description: p.notes || (isPurchaseInitialPayment ? `Payment on Stock Purchase (${p.productName || 'Stock'})` : (p.referenceNumber ? `Payment against Bill #${p.referenceNumber}` : 'Vendor Account Settlement Payment')),
        credit: 0,
        debit: amount,
        billBalance: 0,
        mode: p.paymentMode || 'Cash',
        bankInfo: p.bankName ? `${p.bankName} (${p.bankAccountNumber})` : undefined,
        rawPayment: p
      });
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
      running = Number((running + item.credit - item.debit).toFixed(2));
      return {
        ...item,
        runningBalance: running
      };
    });
  }, [purchases, payments, currentVendorData, initialBalance]);

  // Generate Statement HTML for Printing and PDF Download
  const generateVendorLedgerHtml = (): string => {
    const rowsHtml = statementRows.length > 0 ? statementRows.map((r) => `
      <tr style="border-bottom: 1px solid #cbd5e1; ${r.type === 'Initial Balance' ? 'background-color: #f1f5f3; font-weight: bold;' : ''}">
        <td style="padding: 6px 5px; border-right: 1px solid #e2e8f0; font-size: 9.5px; white-space: nowrap;">
          ${r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
        </td>
        <td style="padding: 6px 4px; border-right: 1px solid #e2e8f0; text-align: center;">
          <span style="display: inline-block; padding: 2px 5px; font-size: 8.5px; font-weight: 700; border-radius: 4px; white-space: nowrap; ${
            r.type === 'Initial Balance' ? 'background-color: #d1e7dd; color: #0a382c;' :
            r.type === 'Purchase' ? 'background-color: #f3e8ff; color: #6b21a8;' :
            'background-color: #dcfce7; color: #15803d;'
          }">${r.type}</span>
        </td>
        <td style="padding: 6px 5px; border-right: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; font-size: 9.5px; word-break: break-all;">${r.refNo}</td>
        <td style="padding: 6px 5px; border-right: 1px solid #e2e8f0; font-size: 9.5px; word-break: break-word; overflow-wrap: break-word; line-height: 1.35;">${r.description}</td>
        <td style="padding: 6px 5px; border-right: 1px solid #e2e8f0; text-align: right; font-weight: bold; font-size: 9.5px; white-space: nowrap;">${r.credit > 0 ? 'PKR ' + r.credit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
        <td style="padding: 6px 5px; border-right: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #15803d; font-size: 9.5px; white-space: nowrap;">${r.debit > 0 ? 'PKR ' + r.debit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
        <td style="padding: 6px 5px; border-right: 1px solid #e2e8f0; text-align: right; font-weight: bold; font-size: 9.5px; color: ${r.billBalance > 0 ? '#b45309' : '#475569'}; white-space: nowrap;">
          ${r.billBalance !== undefined ? 'PKR ' + r.billBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
        </td>
        <td style="padding: 6px 5px; text-align: right; font-weight: 900; font-family: monospace; font-size: 9.5px; white-space: nowrap; ${r.runningBalance > 0 ? 'color: #991b1b;' : 'color: #065f46;'}">
          PKR ${r.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
      </tr>
    `).join('') : `
      <tr>
        <td colspan="8" style="padding: 24px 8px; text-align: center; color: #64748b; font-style: italic; font-size: 11px;">
          No transactions or ledger entries recorded for this vendor account.
        </td>
      </tr>
    `;

    const statementHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Vendor Account Statement - ${currentVendorData.companyName || currentVendorData.name}</title>
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
                  VENDOR ACCOUNT STATEMENT
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

          <!-- Vendor Details & Account Reference -->
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; background: #fafafa; border-radius: 6px; margin-bottom: 12px;">
            <tr>
              <td style="padding: 9px 12px; vertical-align: top; text-align: left;">
                <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b;">Vendor / Supplier Information</div>
                <div style="font-size: 14px; font-weight: 900; color: #0f172a; margin-top: 2px;">${currentVendorData.companyName || currentVendorData.name}</div>
                ${currentVendorData.contactPerson ? `<div style="font-size: 10px; color: #334155; margin-top: 2px;">Contact Person: <strong>${currentVendorData.contactPerson}</strong></div>` : ''}
                <div style="font-size: 10px; color: #334155; margin-top: 2px;">Phone / Mobile: <strong>${currentVendorData.mobile || currentVendorData.phone || '—'}</strong></div>
                ${currentVendorData.email ? `<div style="font-size: 10px; color: #334155;">Email: ${currentVendorData.email}</div>` : ''}
                ${currentVendorData.city ? `<div style="font-size: 10px; color: #334155;">City: ${currentVendorData.city}</div>` : ''}
              </td>
              <td style="padding: 9px 12px; vertical-align: top; text-align: right; width: 220px;">
                <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b;">Account Reference</div>
                <div style="font-family: monospace; font-size: 11px; font-weight: 700; color: #0f172a; margin-top: 2px;">ID: ${currentVendorData.id}</div>
                <div style="font-size: 10px; color: #334155; margin-top: 2px;">Total Stock Bills: <strong>${purchases.length}</strong></div>
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
                <div class="summary-val">PKR ${(financialTotals.totalPurchased || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
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
                <th style="width: 10%;">Date & Time</th>
                <th style="width: 7%;">Type</th>
                <th style="width: 10%;">Ref / Bill #</th>
                <th style="width: 25%;">Particulars / Notes</th>
                <th style="width: 12%; text-align: right;">Purchases / Bills (Cr)</th>
                <th style="width: 12%; text-align: right;">Paid (Dr)</th>
                <th style="width: 12%; text-align: right;">Bill Balance</th>
                <th style="width: 12%; text-align: right;">Net Running Bal</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr style="background-color: #f1f5f9; font-weight: 800; border-top: 1.5px solid #0f172a;">
                <td colspan="4" style="padding: 6px 5px; text-align: right; text-transform: uppercase; font-size: 9px; border-right: 1px solid #cbd5e1;">Totals:</td>
                <td style="padding: 6px 5px; text-align: right; border-right: 1px solid #cbd5e1; font-size: 9.5px; white-space: nowrap;">PKR ${(financialTotals.totalPurchased || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style="padding: 6px 5px; text-align: right; color: #15803d; border-right: 1px solid #cbd5e1; font-size: 9.5px; white-space: nowrap;">PKR ${(financialTotals.totalPaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style="padding: 6px 5px; text-align: right; color: #b45309; border-right: 1px solid #cbd5e1; font-size: 9.5px; white-space: nowrap;">PKR ${(financialTotals.totalPending || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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
                  ${financialTotals.currentBalance > 0 ? 'OUTSTANDING BALANCE PAYABLE TO VENDOR' : financialTotals.currentBalance < 0 ? 'DEBIT ADVANCE BALANCE OVERPAID TO VENDOR' : 'ACCOUNT FULLY SETTLED / ZERO OUTSTANDING PAYABLE'}
                </div>
                <div style="font-size: 10px; color: #475569; margin-top: 3px;">
                  Initial Balance: PKR ${(initialBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + Purchases: PKR ${(financialTotals.totalPurchased || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - Paid: PKR ${(financialTotals.totalPaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </td>
              <td style="vertical-align: middle; text-align: right; width: 260px;">
                <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0a382c;">
                  Net Account Balance
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
                    Vendor / Supplier Signature
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
      const statementHtml = generateVendorLedgerHtml();
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
      const vendorName = currentVendorData.companyName || currentVendorData.name || 'Vendor';
      toast.info(`Preparing PDF for ${vendorName}'s Ledger Statement...`);
      const statementHtml = generateVendorLedgerHtml();
      const dateStr = new Date().toISOString().split('T')[0];
      const safeVendorName = vendorName.replace(/[^a-zA-Z0-9_-]/g, '_');
      await downloadHtmlAsPdf(
        statementHtml, 
        `Vendor_Ledger_${safeVendorName}_${dateStr}`,
        { orientation: 'landscape', margin: [6, 6, 6, 6] }
      );
      toast.success('Vendor Ledger downloaded successfully!');
    } catch (err) {
      console.error('Failed to download vendor ledger PDF:', err);
      toast.error('Failed to download vendor ledger PDF');
    } finally {
      setIsDownloadingLedger(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSerial(text);
    setTimeout(() => setCopiedSerial(null), 2000);
  };

  return (
    <div 
      id="vendor-ledger-view-container"
      className="w-full max-w-full space-y-6 animate-in fade-in duration-200"
    >
      {/* Top Navigation & Action Header */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
            title="Back to Vendors List"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                {currentVendorData.companyName || currentVendorData.name}
              </h1>
              <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-[#0a382c]">
                Vendor Account Ledger
              </span>
              {financialTotals.currentBalance > 0 ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Payable
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Account Cleared
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-500 mt-1.5 flex-wrap">
              {currentVendorData.contactPerson && (
                <span className="flex items-center gap-1 font-semibold text-slate-700">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  {currentVendorData.contactPerson}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                {currentVendorData.mobile || currentVendorData.phone || '—'}
              </span>
              {currentVendorData.email && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  {currentVendorData.email}
                </span>
              )}
              {currentVendorData.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {currentVendorData.city}
                </span>
              )}
              <span className="text-slate-400 font-mono text-[11px]">
                ID: {currentVendorData.id}
              </span>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => setShowPayForm(!showPayForm)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0a382c] hover:bg-[#0d4a3b] text-white text-xs sm:text-sm font-bold shadow-md shadow-emerald-950/10 transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <Banknote className="w-4 h-4 text-emerald-300 shrink-0" />
            <span className="whitespace-nowrap">{showPayForm ? 'Hide Payment Form' : 'Pay / Settle Payment'}</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
            title="Print Full Vendor Ledger Statement"
          >
            <Printer className="w-4 h-4 text-slate-600 shrink-0" />
            <span className="whitespace-nowrap">Print Statement</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadLedger}
            disabled={isDownloadingLedger}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            title="Download Vendor Ledger Statement as PDF"
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

      {/* Financial Metrics Summary Cards (5-Column Grid with Initial Balance) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Initial Balance</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
              <FileText className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900 mt-2">
            PKR {initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">
            Starting balance payable
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Purchases</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
              <Package className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900 mt-2">
            PKR {financialTotals.totalPurchased.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">
            Supplied across {purchases.length} stock batch(es)
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-emerald-100 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Total Paid</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-emerald-700 mt-2">
            PKR {financialTotals.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-600/90 mt-1 font-medium">
            Total payments disbursed
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-amber-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Pending on Bills</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-700">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-amber-900 mt-2">
            PKR {financialTotals.totalPending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-amber-700/80 mt-1 font-medium">
            Unsettled purchase bills
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-300 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Net Account Balance</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
              <CreditCard className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className={`text-xl font-black mt-2 ${financialTotals.currentBalance > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
            PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">
            {financialTotals.currentBalance > 0 ? 'Payable to vendor' : 'Account fully settled'}
          </div>
        </div>
      </div>

      {/* Pay Vendor Form Panel */}
      {showPayForm && (
        <div className="bg-white p-6 rounded-2xl border-2 border-[#0a382c]/20 shadow-md animate-in slide-in-from-top-3 duration-200">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Banknote className="w-5 h-5 text-emerald-700" />
                Pay & Settle Vendor Balance
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Record a payment disbursed to {currentVendorData.companyName || currentVendorData.name} to reduce vendor payable balance and update store bank accounts.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 font-medium">Current Payable:</span>
              <div className="text-base font-black text-amber-800">
                PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <form onSubmit={handleMakePayment} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Payment Amount */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Amount to Pay (PKR) *
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
                    value={payingAmount}
                    onChange={(e) => setPayingAmount(e.target.value)}
                    className="w-full pl-12 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0a382c]"
                  />
                </div>
                {/* Quick Presets */}
                {financialTotals.currentBalance > 0 && (
                  <div className="flex gap-1.5 mt-2">
                    <button
                      type="button"
                      onClick={() => setPayingAmount(financialTotals.currentBalance.toString())}
                      className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                    >
                      Full (PKR {financialTotals.currentBalance.toFixed(2)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayingAmount((financialTotals.currentBalance / 2).toFixed(2))}
                      className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
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
                    className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      paymentMode === 'Cash' ? 'bg-white text-[#0a382c] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('Online')}
                    className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
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
                          {acc.bankName} - {acc.accountNumber} {acc.accountTitle ? `(${acc.accountTitle})` : ''} {typeof acc.balance === 'number' ? `[Bal: PKR ${acc.balance.toFixed(2)}]` : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Disbursement Channel
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
                Notes / Reference / Cheque / Bank Transfer Details (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Cheque #44921, Online IBFT ref #89812, Settlement for PO Batch #902"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#0a382c]"
              />
            </div>

            {/* Submit / Cancel Buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowPayForm(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingPayment}
                className="px-6 py-2 rounded-xl bg-[#0a382c] hover:bg-[#0d4a3b] text-white text-xs font-bold shadow-md shadow-emerald-950/10 transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {submittingPayment ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                    Recording Payment...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    Confirm Vendor Payment
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
              onClick={() => setActiveTab('purchases')}
              className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${
                activeTab === 'purchases'
                  ? 'bg-[#0a382c] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              Purchases & Stock Bills ({purchases.length})
            </button>
            <button
              onClick={() => setActiveTab('payments')}
              className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${
                activeTab === 'payments'
                  ? 'bg-[#0a382c] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              Payment Records & Vouchers ({payments.length})
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
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${dateFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                All Time
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('month')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${dateFilter === 'month' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('year')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${dateFilter === 'year' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                This Year
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search ref, product, mode..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0a382c] bg-white"
              />
            </div>
          </div>
        </div>

        {/* TAB 1: PURCHASES & STOCK BILLS */}
        {activeTab === 'purchases' && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] divide-y divide-slate-100 text-left text-xs">
              <thead className="bg-[#f8faf9] text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-6 py-4">Ref / Batch #</th>
                  <th className="px-6 py-4">Date & Time</th>
                  <th className="px-6 py-4">Product Details</th>
                  <th className="px-6 py-4 text-center">Qty & Unit</th>
                  <th className="px-6 py-4 text-right">Purchase Price</th>
                  <th className="px-6 py-4 text-right">Total Bill</th>
                  <th className="px-6 py-4 text-right">Paid</th>
                  <th className="px-6 py-4 text-right">Remaining</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#0a382c] mx-auto mb-2"></div>
                      Loading stock purchases...
                    </td>
                  </tr>
                ) : filteredPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-slate-400 italic">
                      No stock purchases found for this vendor.
                    </td>
                  </tr>
                ) : (
                  filteredPurchases.map((purchase) => {
                    const cost = purchase.totalCost !== undefined ? purchase.totalCost : ((purchase.purchasePrice || 0) * (purchase.quantityAdded || 1));
                    const paid = purchase.paymentDone !== undefined ? purchase.paymentDone : (purchase.paymentStatus === 'Paid' ? cost : 0);
                    const pending = purchase.remainingAmount !== undefined ? purchase.remainingAmount : (cost - paid);
                    const dateStr = purchase.createdAt?.toMillis ? new Date(purchase.createdAt.toMillis()).toLocaleString() : '—';

                    return (
                      <tr key={purchase.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-md text-[11px]">
                            {purchase.referenceNumber || `PUR-${purchase.id.slice(-6).toUpperCase()}`}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-600 font-medium">
                          {dateStr}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900">{purchase.productName || 'Product'}</div>
                          <div className="text-[11px] text-slate-500">
                            {[purchase.productBrand, purchase.productModelNumber].filter(Boolean).join(' • ')}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="font-mono font-bold text-slate-800 bg-emerald-50 text-[#0a382c] px-2 py-0.5 rounded-md border border-emerald-100">
                            {purchase.quantityAdded} {purchase.unit || 'pcs'}
                          </span>
                          {purchase.serialNumbers && purchase.serialNumbers.length > 0 && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {purchase.serialNumbers.length} Serial(s)
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-medium text-slate-700">
                          PKR {(purchase.purchasePrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-extrabold text-slate-900">
                          PKR {cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-bold text-emerald-700">
                          PKR {paid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-bold text-amber-800">
                          PKR {pending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {pending === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              Paid
                            </span>
                          ) : paid > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                              <Clock className="w-3 h-3" />
                              Partial
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              <AlertCircle className="w-3 h-3" />
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setViewingPurchase(purchase)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                              title="Quick View Purchase Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditPurchase(purchase)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors cursor-pointer border border-blue-200"
                              title="Edit Purchase Record"
                            >
                              <Edit className="w-3.5 h-3.5 text-blue-600" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingPurchase(purchase)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors cursor-pointer border border-rose-200"
                              title="Delete Purchase Record"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              Delete
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

        {/* TAB 2: PAYMENT RECORDS & VOUCHERS */}
        {activeTab === 'payments' && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] divide-y divide-slate-100 text-left text-xs">
              <thead className="bg-[#f8faf9] text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-6 py-4">Date & Time</th>
                  <th className="px-6 py-4">Voucher / Ref #</th>
                  <th className="px-6 py-4">Payment Type</th>
                  <th className="px-6 py-4 text-right">Amount Paid</th>
                  <th className="px-6 py-4 text-right">Remaining Balance</th>
                  <th className="px-6 py-4">Payment Mode</th>
                  <th className="px-6 py-4">Notes / Bank Details</th>
                  <th className="px-6 py-4 text-right">Voucher</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#0a382c] mx-auto mb-2"></div>
                      Loading payments...
                    </td>
                  </tr>
                ) : filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400 italic">
                      No payment records found for this vendor.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((payment) => {
                    const paidAmt = payment.paidAmount !== undefined ? payment.paidAmount : (payment.paymentDone || 0);
                    const remainingAmt = payment.pendingAmount !== undefined ? payment.pendingAmount : (payment.remainingAmount !== undefined ? payment.remainingAmount : 0);
                    const dateVal = payment.paymentDate || payment.date || (payment.createdAt?.toMillis ? new Date(payment.createdAt.toMillis()).toLocaleString() : '—');
                    const isDirectSettlement = payment.type === 'PaymentMade' || payment.type === 'BillPayment';

                    return (
                      <tr key={payment.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-slate-600 font-medium">
                          {typeof dateVal === 'string' && dateVal.includes('T') ? new Date(dateVal).toLocaleString() : dateVal}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-md text-[11px]">
                            {payment.referenceNo || payment.referenceNumber || payment.id.slice(-8).toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {isDirectSettlement ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-[#0a382c] border border-emerald-200 uppercase">
                              Vendor Settlement
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                              Stock Purchase Payment
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-black text-emerald-700 text-sm">
                          PKR {paidAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-bold text-slate-700">
                          PKR {remainingAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-800">
                            {payment.paymentMode === 'Online' ? <Globe className="w-3.5 h-3.5 text-sky-600" /> : <Banknote className="w-3.5 h-3.5 text-emerald-600" />}
                            {payment.paymentMode || 'Cash'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600 max-w-xs truncate">
                          {payment.bankName && (
                            <div className="font-bold text-slate-800 text-[11px]">
                              {payment.bankName} {payment.bankAccountNumber ? `(${payment.bankAccountNumber})` : ''}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-500 truncate">
                            {payment.notes || '—'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => printPaymentVoucher(payment)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#0a382c] font-bold transition-colors cursor-pointer border border-emerald-200 text-xs"
                              title="Print Voucher"
                            >
                              <Printer className="w-3.5 h-3.5 text-emerald-700" />
                              Print
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditPayment(payment)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold transition-colors cursor-pointer border border-blue-200 text-xs"
                              title="Edit Payment Voucher"
                            >
                              <Edit className="w-3.5 h-3.5 text-blue-600" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingPayment(payment)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold transition-colors cursor-pointer border border-rose-200 text-xs"
                              title="Delete Payment Voucher"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              Delete
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

        {/* TAB 3: RUNNING BALANCE STATEMENT */}
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
                    Vendor / Supplier Account Ledger Statement
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
            <table className="w-full min-w-[1100px] divide-y divide-slate-100 text-left text-xs">
              <thead className="bg-[#f8faf9] text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-6 py-4">Date & Time</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Ref #</th>
                  <th className="px-6 py-4">Description / Particulars</th>
                  <th className="px-6 py-4 text-right">Purchases / Bills (Cr)</th>
                  <th className="px-6 py-4 text-right">Payments Made (Dr)</th>
                  <th className="px-6 py-4 text-right">Bill Balance (Pending)</th>
                  <th className="px-6 py-4 text-right">Running Balance (Payable)</th>
                  <th className="px-6 py-4">Mode / Channel</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#0a382c] mx-auto mb-2"></div>
                      Generating running statement...
                    </td>
                  </tr>
                ) : statementRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-slate-400 italic">
                      No account transactions found for this vendor.
                    </td>
                  </tr>
                ) : (
                  statementRows.map((row) => (
                    <tr key={row.id} className={`hover:bg-slate-50/70 transition-colors ${row.type === 'Initial Balance' ? 'bg-[#f8faf9]/80 font-medium' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600 font-medium">
                        {row.date ? new Date(row.date).toLocaleString() : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {row.type === 'Initial Balance' ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-[#0a382c] border border-emerald-200 uppercase">
                            Initial Balance
                          </span>
                        ) : row.type === 'Purchase' ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-purple-50 text-purple-800 border border-purple-200 uppercase">
                            Purchase Bill
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-[#0a382c] border border-emerald-200 uppercase">
                            Payment (Dr)
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-md text-[11px]">
                          {row.refNo}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-800 font-medium max-w-sm">
                        {row.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-bold text-slate-900">
                        {row.credit > 0 ? `PKR ${row.credit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-bold text-emerald-700">
                        {row.debit > 0 ? `PKR ${row.debit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-bold text-amber-800">
                        {row.billBalance !== undefined ? `PKR ${row.billBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-black text-sm text-slate-900">
                        PKR {row.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100">
                          {row.mode} {row.bankInfo ? `• ${row.bankInfo}` : ''}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {row.type === 'Purchase' && row.rawPurchase ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setViewingPurchase(row.rawPurchase!)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                              title="Quick View Purchase Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditPurchase(row.rawPurchase!)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors cursor-pointer border border-blue-200"
                              title="Edit Purchase Record"
                            >
                              <Edit className="w-3.5 h-3.5 text-blue-600" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingPurchase(row.rawPurchase!)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors cursor-pointer border border-rose-200"
                              title="Delete Purchase Record"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              Delete
                            </button>
                          </div>
                        ) : row.type === 'Payment' && row.rawPayment ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => printPaymentVoucher(row.rawPayment!)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#0a382c] font-bold transition-colors cursor-pointer border border-emerald-200 text-xs"
                              title="Print Voucher"
                            >
                              <Printer className="w-3.5 h-3.5 text-emerald-700" />
                              Print
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditPayment(row.rawPayment!)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold transition-colors cursor-pointer border border-blue-200 text-xs"
                              title="Edit Payment Voucher"
                            >
                              <Edit className="w-3.5 h-3.5 text-blue-600" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingPayment(row.rawPayment!)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold transition-colors cursor-pointer border border-rose-200 text-xs"
                              title="Delete Payment Voucher"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              Delete
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs font-bold">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {statementRows.length > 0 && (
                <tfoot className="bg-slate-50/90 font-bold border-t-2 border-slate-200">
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-right uppercase tracking-wider text-[11px] text-slate-600">
                      Statement Totals:
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-extrabold text-slate-900">
                      PKR {financialTotals.totalPurchased.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-extrabold text-emerald-700">
                      PKR {financialTotals.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-extrabold text-amber-800">
                      PKR {financialTotals.totalPending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={`px-6 py-4 text-right font-mono font-black text-base ${financialTotals.currentBalance > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
                      PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td></td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Closing Net Account Balance Banner Card */}
            <div className="m-6 p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#0a382c]">
                  Closing Statement Summary
                </span>
                <h4 className="text-base font-black text-slate-900 mt-1">
                  {financialTotals.currentBalance > 0 
                    ? 'Outstanding Balance Payable to Vendor' 
                    : financialTotals.currentBalance < 0 
                    ? 'Debit Advance Balance with Vendor' 
                    : 'Account Fully Settled (Zero Outstanding Balance)'}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Initial Balance (PKR {initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) + Purchases (PKR {financialTotals.totalPurchased.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) - Total Paid (PKR {financialTotals.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                </p>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Net Account Balance
                </span>
                <span className={`text-2xl font-black font-mono ${financialTotals.currentBalance > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
                  PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-slate-600 font-bold tracking-tight mt-0.5 whitespace-nowrap">
                  Software developed by 0332-5059526
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Footer Summary Bar */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 rounded-b-2xl">
          <div className="text-xs text-slate-500 font-medium">
            Vendor / Supplier Account ID: <span className="font-mono text-slate-800">{currentVendorData.id}</span>
          </div>
          <div className="flex flex-col sm:items-end gap-1">
            <div className="text-xs text-slate-700 font-bold">
              Net Account Balance: <span className={`font-mono font-black text-base ml-1 ${financialTotals.currentBalance > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="text-[11px] text-slate-600 font-bold tracking-tight whitespace-nowrap">
              Software developed by 0332-5059526
            </div>
          </div>
        </div>
      </div>

      {/* QUICK VIEW PURCHASE MODAL */}
      {viewingPurchase && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#0a382c] flex items-center justify-center font-bold">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Stock Purchase Details</h3>
                  <p className="text-xs text-slate-500 font-mono">Ref: {viewingPurchase.referenceNumber || viewingPurchase.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingPurchase(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Product Info Grid */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[10px]">Product Name</span>
                  <span className="font-bold text-slate-900 text-sm">{viewingPurchase.productName || 'Product'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[10px]">Brand / Model</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {[viewingPurchase.productBrand, viewingPurchase.productModelNumber].filter(Boolean).join(' • ') || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[10px]">Quantity Supplied</span>
                  <span className="font-bold text-slate-900 text-sm">{viewingPurchase.quantityAdded} {viewingPurchase.unit || 'pcs'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[10px]">Purchase Unit Price</span>
                  <span className="font-bold text-slate-900 text-sm font-mono">PKR {(viewingPurchase.purchasePrice || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Serials List if available */}
              {viewingPurchase.serialNumbers && viewingPurchase.serialNumbers.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Serialized Items ({viewingPurchase.serialNumbers.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(viewingPurchase.serialNumbers?.join('\n') || '')}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedSerial ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedSerial ? 'Copied All Serials' : 'Copy All Serials'}
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {viewingPurchase.serialNumbers.map((sn, idx) => (
                      <div
                        key={idx}
                        onClick={() => copyToClipboard(sn)}
                        className="bg-white px-2 py-1 rounded-md border border-slate-200 text-xs font-mono text-slate-800 hover:border-emerald-400 cursor-pointer flex items-center justify-between"
                        title="Click to copy serial"
                      >
                        <span className="truncate">{sn}</span>
                        {copiedSerial === sn ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-300" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Financial Breakdown */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between font-extrabold text-slate-900 text-sm">
                  <span>Total Purchase Cost:</span>
                  <span className="font-mono">
                    PKR {(viewingPurchase.totalCost !== undefined ? viewingPurchase.totalCost : ((viewingPurchase.purchasePrice || 0) * (viewingPurchase.quantityAdded || 1))).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-emerald-800">
                  <span>Paid Amount:</span>
                  <span className="font-mono">
                    PKR {(viewingPurchase.paymentDone || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between font-black text-slate-900 border-t border-slate-200 pt-2">
                  <span>Remaining Due:</span>
                  <span className={`font-mono font-black ${(viewingPurchase.remainingAmount || 0) > 0 ? 'text-amber-800' : 'text-slate-900'}`}>
                    PKR {(viewingPurchase.remainingAmount || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 pt-1">
                  <span>Payment Mode:</span>
                  <span className="font-bold">{viewingPurchase.paymentMode || 'Credit'} {viewingPurchase.bankName ? `(${viewingPurchase.bankName})` : ''}</span>
                </div>
                {viewingPurchase.paymentNotes && (
                  <div className="text-slate-600 pt-1 border-t border-slate-200 mt-2">
                    <span className="font-bold block text-slate-700">Notes:</span>
                    <span>{viewingPurchase.paymentNotes}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const toEdit = viewingPurchase;
                  setViewingPurchase(null);
                  handleOpenEditPurchase(toEdit);
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Edit className="w-3.5 h-3.5" />
                Edit Purchase
              </button>
              <button
                type="button"
                onClick={() => setViewingPurchase(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PURCHASE MODAL */}
      {editingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-6 py-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <Edit className="w-5 h-5 text-blue-200" />
                <div>
                  <h3 className="font-bold text-base text-white">Edit Stock Purchase Bill</h3>
                  <p className="text-xs text-blue-100 font-mono">
                    Ref: {editingPurchase.referenceNumber || `PUR-${editingPurchase.id.slice(-6).toUpperCase()}`} • {editingPurchase.productName || 'Product'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setEditingPurchase(null)}
                className="p-1.5 rounded-full hover:bg-white/10 text-blue-100 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditPurchase} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Bill / Reference #
                  </label>
                  <input
                    type="text"
                    value={purchaseEditForm.referenceNumber}
                    onChange={(e) => setPurchaseEditForm({ ...purchaseEditForm, referenceNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Payment Status
                  </label>
                  <select
                    value={purchaseEditForm.paymentStatus}
                    onChange={(e) => setPurchaseEditForm({ ...purchaseEditForm, paymentStatus: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Partially Paid">Partially Paid</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Quantity Added
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    value={purchaseEditForm.quantityAdded}
                    onChange={(e) => {
                      const newQty = e.target.value;
                      const p = parseFloat(purchaseEditForm.purchasePrice) || 0;
                      const q = parseFloat(newQty) || 0;
                      setPurchaseEditForm({
                        ...purchaseEditForm,
                        quantityAdded: newQty,
                        totalCost: (q * p).toString()
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Unit Purchase Price (PKR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={purchaseEditForm.purchasePrice}
                    onChange={(e) => {
                      const newPrice = e.target.value;
                      const q = parseFloat(purchaseEditForm.quantityAdded) || 0;
                      const p = parseFloat(newPrice) || 0;
                      setPurchaseEditForm({
                        ...purchaseEditForm,
                        purchasePrice: newPrice,
                        totalCost: (q * p).toString()
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Total Bill Cost (PKR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={purchaseEditForm.totalCost}
                    onChange={(e) => setPurchaseEditForm({ ...purchaseEditForm, totalCost: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Payment Done / Paid (PKR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={purchaseEditForm.paymentDone}
                    onChange={(e) => setPurchaseEditForm({ ...purchaseEditForm, paymentDone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 text-emerald-700"
                  />
                </div>
              </div>

              {/* Live Remaining Balance Calculation */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center text-xs">
                <span className="font-bold text-slate-600">Remaining Due to Vendor:</span>
                <span className="font-mono font-black text-sm text-amber-800">
                  PKR {Math.max(0, (parseFloat(purchaseEditForm.totalCost) || 0) - (parseFloat(purchaseEditForm.paymentDone) || 0)).toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Payment Mode
                  </label>
                  <select
                    value={purchaseEditForm.paymentMode}
                    onChange={(e) => setPurchaseEditForm({ ...purchaseEditForm, paymentMode: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                  >
                    <option value="Credit">Credit / Pay Later</option>
                    <option value="Cash">Cash</option>
                    <option value="Online">Online / Bank Transfer</option>
                  </select>
                </div>
                {purchaseEditForm.paymentMode === 'Online' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Store Bank Account
                    </label>
                    <select
                      value={purchaseEditForm.bankAccountNumber}
                      onChange={(e) => {
                        const acc = bankAccounts.find(b => b.accountNumber === e.target.value);
                        setPurchaseEditForm({
                          ...purchaseEditForm,
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
                  Purchase Notes & Remarks
                </label>
                <textarea
                  rows={2}
                  value={purchaseEditForm.notes}
                  onChange={(e) => setPurchaseEditForm({ ...purchaseEditForm, notes: e.target.value })}
                  placeholder="Notes, consignment info, remarks..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="bg-slate-50 -mx-6 -mb-6 px-6 py-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingPurchase(null)}
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

      {/* DELETE PURCHASE CONFIRMATION MODAL */}
      {deletingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-rose-600 px-6 py-4 text-white flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Delete Purchase Record?</h3>
                <p className="text-xs text-rose-100 font-mono">
                  Ref: {deletingPurchase.referenceNumber || `PUR-${deletingPurchase.id.slice(-6).toUpperCase()}`}
                </p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to permanently delete purchase record <span className="font-bold text-slate-900">{deletingPurchase.referenceNumber || deletingPurchase.id}</span> ({deletingPurchase.productName || 'Stock'})?
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Total Bill Cost:</span>
                  <span className="font-bold text-slate-900 font-mono">
                    PKR {(deletingPurchase.totalCost !== undefined ? deletingPurchase.totalCost : ((deletingPurchase.purchasePrice || 0) * (deletingPurchase.quantityAdded || 1))).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Paid Amount:</span>
                  <span className="font-bold text-emerald-700 font-mono">
                    PKR {(deletingPurchase.paymentDone || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Remaining Due:</span>
                  <span className="font-bold text-amber-800 font-mono">
                    PKR {(deletingPurchase.remainingAmount || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Deleting this purchase will deduct PKR {(deletingPurchase.remainingAmount || 0).toFixed(2)} remaining payable from the vendor balance.
                </span>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingPurchase(null)}
                  disabled={processingAction}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDeletePurchase}
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
                  <h3 className="font-bold text-base text-white">Edit Vendor Payment Voucher</h3>
                  <p className="text-xs text-emerald-100 font-mono">Ref: {editingPayment.referenceNo || editingPayment.referenceNumber || editingPayment.id}</p>
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
                    Amount Paid (PKR)
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
                    Voucher / Reference #
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
                    Disbursing Bank Account
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
                  {processingAction ? 'Saving Changes...' : 'Save Voucher'}
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
                <p className="text-xs text-rose-100 font-mono">Ref: {deletingPayment.referenceNo || deletingPayment.referenceNumber || deletingPayment.id}</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to permanently delete this payment voucher to vendor <span className="font-bold text-slate-900">{currentVendorData.companyName || currentVendorData.name}</span>?
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Amount Paid:</span>
                  <span className="font-bold text-rose-700 font-mono text-sm">
                    PKR {(deletingPayment.paidAmount !== undefined ? deletingPayment.paidAmount : (deletingPayment.paymentDone || 0)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Payment Mode:</span>
                  <span className="font-bold text-slate-800">{deletingPayment.paymentMode || 'Cash'}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Payment Date:</span>
                  <span className="font-semibold text-slate-700">
                    {deletingPayment.paymentDate ? new Date(deletingPayment.paymentDate).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Deleting this payment will add PKR {(deletingPayment.paidAmount !== undefined ? deletingPayment.paidAmount : (deletingPayment.paymentDone || 0)).toFixed(2)} back to the outstanding payable balance owed to this vendor.
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
      <div id="print-vendor-statement-section" className="hidden print:block print:fixed print:inset-0 print:bg-white print:p-8 print:z-[9999]">
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
                Vendor / Supplier Account Ledger Statement
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

        <div className="grid grid-cols-2 gap-4 border border-black p-4 mb-6 text-xs">
          <div>
            <h3 className="font-bold uppercase text-[10px] text-black">Vendor Details</h3>
            <p className="font-black text-sm text-black">{currentVendorData.companyName || currentVendorData.name}</p>
            {currentVendorData.contactPerson && <p className="font-semibold">Contact Person: {currentVendorData.contactPerson}</p>}
            <p className="font-semibold">Phone: {currentVendorData.mobile || currentVendorData.phone || '—'}</p>
            {currentVendorData.city && <p className="font-semibold">City: {currentVendorData.city}</p>}
          </div>
          <div className="text-right">
            <h3 className="font-bold uppercase text-[10px] text-black">Account Financial Summary</h3>
            <p className="font-semibold">Initial Balance: PKR {initialBalance.toFixed(2)}</p>
            <p className="font-semibold">Total Purchases: PKR {financialTotals.totalPurchased.toFixed(2)}</p>
            <p className="font-semibold">Total Paid: PKR {financialTotals.totalPaid.toFixed(2)}</p>
            <p className="font-semibold">Pending on Bills: PKR {financialTotals.totalPending.toFixed(2)}</p>
            <p className="font-black text-sm text-black mt-1">Net Account Balance: PKR {financialTotals.currentBalance.toFixed(2)}</p>
          </div>
        </div>

        <table className="w-full border-collapse border border-black text-xs text-left">
          <thead>
            <tr className="bg-slate-100 border-b border-black font-bold">
              <th className="p-2 border-r border-black">Date</th>
              <th className="p-2 border-r border-black">Type</th>
              <th className="p-2 border-r border-black">Ref #</th>
              <th className="p-2 border-r border-black">Particulars</th>
              <th className="p-2 border-r border-black text-right">Credit (Purchases)</th>
              <th className="p-2 border-r border-black text-right">Debit (Paid)</th>
              <th className="p-2 border-r border-black text-right">Bill Balance</th>
              <th className="p-2 text-right">Net Running Balance</th>
            </tr>
          </thead>
          <tbody>
            {statementRows.map((r, i) => (
              <tr key={i} className={`border-b border-black ${r.type === 'Initial Balance' ? 'bg-slate-50 font-bold' : ''}`}>
                <td className="p-2 border-r border-black">{r.date ? new Date(r.date).toLocaleDateString() : ''}</td>
                <td className="p-2 border-r border-black">{r.type}</td>
                <td className="p-2 border-r border-black font-mono">{r.refNo}</td>
                <td className="p-2 border-r border-black">{r.description}</td>
                <td className="p-2 border-r border-black text-right">{r.credit > 0 ? r.credit.toFixed(2) : '—'}</td>
                <td className="p-2 border-r border-black text-right">{r.debit > 0 ? r.debit.toFixed(2) : '—'}</td>
                <td className="p-2 border-r border-black text-right font-semibold">{r.billBalance !== undefined ? r.billBalance.toFixed(2) : '—'}</td>
                <td className="p-2 text-right font-bold">{r.runningBalance.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold border-t-2 border-black">
              <td colSpan={4} className="p-2 text-right uppercase border-r border-black">Totals:</td>
              <td className="p-2 text-right border-r border-black">PKR {financialTotals.totalPurchased.toFixed(2)}</td>
              <td className="p-2 text-right border-r border-black">PKR {financialTotals.totalPaid.toFixed(2)}</td>
              <td className="p-2 text-right border-r border-black">PKR {financialTotals.totalPending.toFixed(2)}</td>
              <td className="p-2 text-right font-black">PKR {financialTotals.currentBalance.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Closing Net Account Balance Banner in Print Section */}
        <div className="mt-6 border-2 border-black p-4 flex justify-between items-center text-xs">
          <div>
            <div className="font-bold uppercase text-[10px] text-black">Account Settlement Status</div>
            <div className="font-extrabold text-sm text-black mt-1">
              {financialTotals.currentBalance > 0 ? 'OUTSTANDING BALANCE PAYABLE TO VENDOR' : financialTotals.currentBalance < 0 ? 'DEBIT ADVANCE BALANCE OVERPAID' : 'ACCOUNT FULLY SETTLED'}
            </div>
            <div className="text-[10px] text-black mt-1">
              Initial Balance (PKR {initialBalance.toFixed(2)}) + Purchases (PKR {financialTotals.totalPurchased.toFixed(2)}) - Paid (PKR {financialTotals.totalPaid.toFixed(2)})
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold uppercase text-[10px] text-black">Closing Net Account Balance</div>
            <div className="font-black text-lg font-mono text-black mt-1">
              PKR {financialTotals.currentBalance.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="mt-16 flex justify-between pt-8 text-xs font-bold border-t border-black">
          <div>Authorized Store Signature: _________________________</div>
          <div>Vendor / Supplier Signature: _________________________</div>
        </div>
        <div className="text-right text-[10px] font-bold text-slate-700 pt-2 pb-1 whitespace-nowrap">
          Software developed by 0332-5059526
        </div>
      </div>
    </div>
  );
}
