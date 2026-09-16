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
  Check
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
  isModal?: boolean;
}

export default function VendorLedgerView({ vendor, storeId, onBack, isModal = false }: VendorLedgerViewProps) {
  const { user } = useAuth();
  const activeStoreId = storeId || auth.currentUser?.uid || user?.uid || vendor?.storeId || '';

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

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
        bankInfo: p.bankName ? `${p.bankName} (${p.bankAccountNumber})` : undefined
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
        bankInfo: p.bankName ? `${p.bankName} (${p.bankAccountNumber})` : undefined
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
            r.type === 'Purchase' ? 'background-color: #f3e8ff; color: #6b21a8;' :
            'background-color: #dcfce7; color: #15803d;'
          }">${r.type}</span>
        </td>
        <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; font-size: 10px;">${r.refNo}</td>
        <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0; font-size: 10px;">${r.description}</td>
        <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0; text-align: right; font-weight: bold; font-size: 10px;">${r.credit > 0 ? 'PKR ' + r.credit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
        <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #15803d; font-size: 10px;">${r.debit > 0 ? 'PKR ' + r.debit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
        <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0; text-align: right; font-weight: bold; font-size: 10px; color: ${r.billBalance > 0 ? '#b45309' : '#475569'};">
          ${r.billBalance !== undefined ? 'PKR ' + r.billBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
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
          <title>Vendor Account Statement - ${currentVendorData.companyName || currentVendorData.name}</title>
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
              grid-template-columns: repeat(5, 1fr);
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
              <div class="store-name">${storeDetails?.name || 'STORE VENDOR LEDGER'}</div>
              ${storeDetails?.address ? `<div style="font-size: 10px; color: #334155;">${storeDetails.address}</div>` : ''}
              ${storeDetails?.phone ? `<div style="font-size: 10px; color: #334155;">Phone: ${storeDetails.phone}</div>` : ''}
              ${storeDetails?.email ? `<div style="font-size: 10px; color: #334155;">Email: ${storeDetails.email}</div>` : ''}
            </div>
            <div>
              <div class="statement-title">Vendor Account Statement</div>
              <div style="font-size: 10px; color: #475569; text-align: right; margin-top: 3px;">
                Statement Date: <strong>${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
              </div>
              <div style="font-size: 10px; color: #475569; text-align: right;">
                Issue Time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          <!-- Vendor Details & Account Reference -->
          <div style="display: flex; justify-content: space-between; border: 1px solid #cbd5e1; background: #fafafa; padding: 9px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div>
              <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b;">Vendor / Supplier Information</div>
              <div style="font-size: 14px; font-weight: 900; color: #0f172a; margin-top: 2px;">${currentVendorData.companyName || currentVendorData.name}</div>
              ${currentVendorData.contactPerson ? `<div style="font-size: 10px; color: #334155; margin-top: 2px;">Contact Person: <strong>${currentVendorData.contactPerson}</strong></div>` : ''}
              <div style="font-size: 10px; color: #334155; margin-top: 2px;">Phone / Mobile: <strong>${currentVendorData.mobile || currentVendorData.phone || '—'}</strong></div>
              ${currentVendorData.email ? `<div style="font-size: 10px; color: #334155;">Email: ${currentVendorData.email}</div>` : ''}
              ${currentVendorData.city ? `<div style="font-size: 10px; color: #334155;">City: ${currentVendorData.city}</div>` : ''}
            </div>
            <div style="text-align: right;">
              <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b;">Account Reference</div>
              <div style="font-family: monospace; font-size: 11px; font-weight: 700; color: #0f172a; margin-top: 2px;">ID: ${currentVendorData.id}</div>
              <div style="font-size: 10px; color: #334155; margin-top: 2px;">Total Stock Bills: <strong>${purchases.length}</strong></div>
              <div style="font-size: 10px; color: #334155;">Total Transactions: <strong>${statementRows.length}</strong></div>
            </div>
          </div>

          <!-- Summary Cards Grid (Initial Balance, Purchases, Paid, Pending on Bills, Net Balance) -->
          <div class="summary-cards-grid">
            <div class="summary-card">
              <div class="summary-label">Initial Balance</div>
              <div class="summary-val">PKR ${initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Total Purchases</div>
              <div class="summary-val">PKR ${financialTotals.totalPurchased.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Total Paid</div>
              <div class="summary-val" style="color: #15803d;">PKR ${financialTotals.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Pending on Bills</div>
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
                <th style="width: 13%;">Ref / Bill #</th>
                <th style="width: 25%;">Particulars / Notes</th>
                <th style="width: 11%; text-align: right;">Purchases / Bills (Cr)</th>
                <th style="width: 11%; text-align: right;">Paid (Dr)</th>
                <th style="width: 13%; text-align: right;">Bill Balance (Pending)</th>
                <th style="width: 14%; text-align: right;">Net Running Balance</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr style="background-color: #f1f5f9; font-weight: 800; border-top: 1.5px solid #0f172a;">
                <td colspan="4" style="padding: 7px 8px; text-align: right; text-transform: uppercase; font-size: 9.5px; border-right: 1px solid #cbd5e1;">Totals:</td>
                <td style="padding: 7px 8px; text-align: right; border-right: 1px solid #cbd5e1; font-size: 9.5px;">PKR ${financialTotals.totalPurchased.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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
                ${financialTotals.currentBalance > 0 ? 'OUTSTANDING BALANCE PAYABLE TO VENDOR' : financialTotals.currentBalance < 0 ? 'DEBIT ADVANCE BALANCE OVERPAID TO VENDOR' : 'ACCOUNT FULLY SETTLED / ZERO OUTSTANDING PAYABLE'}
              </div>
              <div style="font-size: 10px; color: #475569; margin-top: 3px;">
                Initial Balance: PKR ${initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + Purchases: PKR ${financialTotals.totalPurchased.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - Paid: PKR ${financialTotals.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              Vendor / Supplier Signature
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
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
            title={isModal ? "Close Ledger Modal" : "Back to Vendors List"}
          >
            {isModal ? <X className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
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
        <div className="flex items-center gap-3 w-full lg:w-auto flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={() => setShowPayForm(!showPayForm)}
            className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0a382c] hover:bg-[#0d4a3b] text-white text-sm font-bold shadow-md shadow-emerald-950/10 transition-all cursor-pointer"
          >
            <Banknote className="w-4 h-4 text-emerald-300" />
            {showPayForm ? 'Hide Payment Form' : 'Pay / Settle Payment'}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors cursor-pointer"
            title="Print Full Vendor Ledger Statement"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span className="hidden sm:inline">Print Statement</span>
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
                          <button
                            type="button"
                            onClick={() => setViewingPurchase(purchase)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer mr-2"
                            title="Quick View Purchase Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
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
                          <button
                            type="button"
                            onClick={() => printPaymentVoucher(payment)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#0a382c] font-bold transition-colors cursor-pointer border border-emerald-200"
                            title="Print Voucher"
                          >
                            <Printer className="w-3.5 h-3.5 text-emerald-700" />
                            Print
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

        {/* TAB 3: RUNNING BALANCE STATEMENT */}
        {activeTab === 'statement' && (
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#0a382c] mx-auto mb-2"></div>
                      Generating running statement...
                    </td>
                  </tr>
                ) : statementRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-slate-400 italic">
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
                  </tr>
                </tfoot>
              )}
            </table>

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
              <div className="text-right">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Net Account Balance
                </span>
                <span className={`text-2xl font-black font-mono ${financialTotals.currentBalance > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
                  PKR {financialTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        )}
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

            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
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

      {/* Hidden Print Container for Clean A4 Printing */}
      <div id="print-vendor-statement-section" className="hidden print:block print:fixed print:inset-0 print:bg-white print:p-8 print:z-[9999]">
        <div className="border-b-2 border-black pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-black">{storeDetails?.name || 'Store Vendor Ledger'}</h1>
              {storeDetails?.phone && <p className="text-xs text-black font-semibold">Phone: {storeDetails.phone}</p>}
              {storeDetails?.address && <p className="text-xs text-black font-semibold">Address: {storeDetails.address}</p>}
            </div>
            <div className="text-right">
              <h2 className="text-lg font-black uppercase text-black">Vendor Statement</h2>
              <p className="text-xs text-black font-mono">Date: {new Date().toLocaleDateString()}</p>
            </div>
          </div>
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
      </div>
    </div>
  );
}
