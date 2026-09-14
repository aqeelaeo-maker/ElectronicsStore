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
  AlertCircle
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  writeBatch, 
  serverTimestamp, 
  getDoc 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'react-toastify';

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string;
  city: string;
  balance: number;
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
    if (!storeId) return;
    const storeRef = doc(db, 'stores', storeId);
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
  }, [storeId]);

  // Fetch customer sales and payment records
  useEffect(() => {
    if (!storeId || !customer) return;

    setLoading(true);

    // Sales query for this customer
    const salesQuery = query(
      collection(db, 'sales'),
      where('storeId', '==', storeId),
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
      where('storeId', '==', storeId),
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
  }, [storeId, customer]);

  // Financial calculations
  const financialTotals = useMemo(() => {
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalPending = 0;

    sales.forEach(sale => {
      totalInvoiced += sale.total || 0;
      const paid = sale.paidAmount !== undefined 
        ? sale.paidAmount 
        : (sale.status === 'Paid' ? sale.total : 0);
      const pending = sale.pendingAmount !== undefined 
        ? sale.pendingAmount 
        : (sale.status === 'Pending' ? sale.total : 0);
      totalPaid += paid;
      totalPending += pending;
    });

    return {
      totalInvoiced,
      totalPaid,
      totalPending,
      currentBalance: customer?.balance ?? totalPending
    };
  }, [sales, customer]);

  // Handle recording manual payment from customer
  const handleReceivePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || !customer) return;

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
      const batch = writeBatch(db);
      const matchedBank = paymentMode === 'Online'
        ? bankAccounts.find(b => b.accountNumber === selectedBankAcc)
        : null;

      // 1. Update customer balance
      const customerRef = doc(db, 'customers', customer.id);
      const custSnap = await getDoc(customerRef);
      const currentCustBal = custSnap.exists() ? (custSnap.data().balance || 0) : customer.balance;
      const newBalance = Number(Math.max(0, currentCustBal - amount).toFixed(2));

      batch.update(customerRef, {
        balance: newBalance,
        updatedAt: serverTimestamp()
      });

      // 2. Add customerPayments entry
      const paymentRecordId = doc(collection(db, 'customerPayments')).id;
      const paymentRef = doc(db, 'customerPayments', paymentRecordId);
      batch.set(paymentRef, {
        id: paymentRecordId,
        storeId,
        customerId: customer.id,
        customerName: customer.name,
        totalAmount: 0,
        paidAmount: amount,
        pendingAmount: newBalance,
        paymentMode,
        bankAccountNumber: paymentMode === 'Online' && matchedBank ? matchedBank.accountNumber : null,
        bankName: paymentMode === 'Online' && matchedBank ? matchedBank.bankName : null,
        paymentDate,
        type: 'PaymentReceived',
        notes: paymentNotes.trim() || `Received PKR ${amount.toFixed(2)} payment against outstanding customer ledger balance`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 3. If online payment, deposit into store bank account
      if (paymentMode === 'Online' && selectedBankAcc) {
        const storeRef = doc(db, 'stores', storeId);
        const storeSnap = await getDoc(storeRef);
        if (storeSnap.exists()) {
          const storeData = storeSnap.data();
          let currentAccounts = Array.isArray(storeData.bankAccounts) ? [...storeData.bankAccounts] : [];
          currentAccounts = currentAccounts.map((acc: any) => {
            const opBal = typeof acc.openingBalance === 'number' ? acc.openingBalance : (parseFloat(acc.openingBalance) || 0);
            const curBal = typeof acc.balance === 'number' ? acc.balance : (parseFloat(acc.balance) || opBal);
            if (acc.accountNumber === selectedBankAcc) {
              return {
                ...acc,
                balance: Number((curBal + amount).toFixed(2))
              };
            }
            return acc;
          });
          batch.update(storeRef, {
            bankAccounts: currentAccounts,
            updatedAt: serverTimestamp()
          });
        }
      }

      await batch.commit();

      toast.success(`Successfully recorded payment of PKR ${amount.toFixed(2)} for ${customer.name}!`);
      setReceivingAmount('');
      setPaymentNotes('');
      setShowReceiveForm(false);
    } catch (err: any) {
      console.error('Error recording payment:', err);
      toast.error('Failed to record payment. Please try again.');
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

  // Combined Running Account Statement
  const statementRows = useMemo(() => {
    type StatementItem = {
      id: string;
      date: string;
      dateObj: Date;
      type: 'Invoice' | 'Payment' | 'Return';
      refNo: string;
      description: string;
      debit: number;  // Increases what customer owes (e.g. invoice)
      credit: number; // Reduces what customer owes (e.g. payment or return)
      mode: string;
      bankInfo?: string;
    };

    const combined: StatementItem[] = [];

    sales.forEach(sale => {
      combined.push({
        id: `sale-${sale.id}`,
        date: sale.date || '',
        dateObj: new Date(sale.date || 0),
        type: 'Invoice',
        refNo: sale.invoiceNo,
        description: `Sales Invoice (${sale.items?.length || 0} item${(sale.items?.length || 0) === 1 ? '' : 's'})`,
        debit: sale.total || 0,
        credit: 0,
        mode: sale.paymentMode || 'Cash',
        bankInfo: sale.bankName ? `${sale.bankName} (${sale.bankAccountNumber})` : undefined
      });
    });

    payments.forEach(payment => {
      const isReturn = payment.type === 'ReturnCredit' || (payment.refundAmount && payment.refundAmount > 0);
      const amount = isReturn ? (payment.refundAmount || 0) : (payment.paidAmount || 0);
      const dateVal = payment.paymentDate || (payment.createdAt?.toMillis ? new Date(payment.createdAt.toMillis()).toISOString() : '');
      
      combined.push({
        id: `pay-${payment.id}`,
        date: dateVal,
        dateObj: new Date(dateVal || 0),
        type: isReturn ? 'Return' : 'Payment',
        refNo: payment.invoiceNo || payment.referenceNo || 'Payment Ref',
        description: payment.notes || (isReturn ? 'Sales Return Refund Credit' : 'Payment Received'),
        debit: 0,
        credit: amount,
        mode: payment.paymentMode || 'Cash',
        bankInfo: payment.bankName ? `${payment.bankName} (${payment.bankAccountNumber})` : undefined
      });
    });

    // Sort chronologically ascending to calculate running balance
    combined.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

    let running = 0;
    return combined.map(item => {
      running = running + item.debit - item.credit;
      return {
        ...item,
        runningBalance: running
      };
    }).reverse(); // Most recent first for table display
  }, [sales, payments]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
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
        <div className="flex items-center gap-3 w-full lg:w-auto">
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
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors cursor-pointer"
            title="Print Full Customer Ledger Statement"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            Print Statement
          </button>
        </div>
      </div>

      {/* Financial Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Invoiced</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            PKR {financialTotals.totalInvoiced.toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-medium">
            Generated across {sales.length} invoice(s)
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Total Paid Amount</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-2">
            PKR {financialTotals.totalPaid.toFixed(2)}
          </div>
          <div className="text-xs text-emerald-600/90 mt-1 font-medium">
            Cleared invoices & payments received
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Pending on Invoices</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-700">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-900 mt-2">
            PKR {financialTotals.totalPending.toFixed(2)}
          </div>
          <div className="text-xs text-amber-700/80 mt-1 font-medium">
            Unpaid / Partial invoice balances
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-300 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Net Account Balance</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black mt-2 ${financialTotals.currentBalance > 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
            PKR {financialTotals.currentBalance.toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-medium">
            {financialTotals.currentBalance > 0 ? 'Customer owes store' : 'Account is fully settled'}
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
              <span className="text-xs text-slate-500 font-medium">Current Balance:</span>
              <div className="text-base font-black text-amber-800">
                PKR {(customer.balance || 0).toFixed(2)}
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
                {(customer.balance || 0) > 0 && (
                  <div className="flex gap-1.5 mt-2">
                    <button
                      type="button"
                      onClick={() => setReceivingAmount(customer.balance.toString())}
                      className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      Full Balance (PKR {customer.balance.toFixed(2)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceivingAmount((customer.balance / 2).toFixed(2))}
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
                <table className="w-full divide-y divide-slate-100 text-left text-xs">
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
                <table className="w-full divide-y divide-slate-100 text-left text-xs">
                  <thead className="bg-[#f8faf9] text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-4 px-5">Date & Time</th>
                      <th className="py-4 px-5">Transaction Type</th>
                      <th className="py-4 px-5">Reference / Invoice #</th>
                      <th className="py-4 px-5 text-right whitespace-nowrap">Total Billed</th>
                      <th className="py-4 px-5 text-right whitespace-nowrap">Paid / Received</th>
                      <th className="py-4 px-5 text-right whitespace-nowrap">Remaining Balance</th>
                      <th className="py-4 px-5 text-center whitespace-nowrap">Payment Method</th>
                      <th className="py-4 px-5 min-w-[220px]">Notes & Remarks</th>
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
              <div className="overflow-x-auto">
                <table className="w-full divide-y divide-slate-100 text-left text-xs">
                  <thead className="bg-[#f8faf9] text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-4 px-5">Date</th>
                      <th className="py-4 px-5">Transaction Type</th>
                      <th className="py-4 px-5">Reference #</th>
                      <th className="py-4 px-5 min-w-[200px]">Particulars / Notes</th>
                      <th className="py-4 px-5 text-right whitespace-nowrap">Debit (Due)</th>
                      <th className="py-4 px-5 text-right whitespace-nowrap">Credit (Paid)</th>
                      <th className="py-4 px-5 text-right whitespace-nowrap">Running Balance</th>
                      <th className="py-4 px-5 text-center whitespace-nowrap">Mode / Channel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {statementRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-16 text-center text-slate-400 italic">
                          No ledger statement history recorded yet for this customer.
                        </td>
                      </tr>
                    ) : (
                      statementRows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-4 px-5 whitespace-nowrap text-slate-700 font-medium">
                            {row.date ? new Date(row.date).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="py-4 px-5 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                              row.type === 'Invoice'
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
                            {row.debit > 0 ? `PKR ${row.debit.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-4 px-5 text-right whitespace-nowrap font-bold text-emerald-700">
                            {row.credit > 0 ? `PKR ${row.credit.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-4 px-5 text-right whitespace-nowrap font-black text-sm">
                            <span className={row.runningBalance > 0 ? 'text-amber-800' : 'text-slate-900'}>
                              PKR {row.runningBalance.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-4 px-5 text-center whitespace-nowrap text-slate-600 font-semibold">
                            {row.mode} {row.bankInfo ? `(${row.bankInfo})` : ''}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
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
            Total Outstanding Balance: <span className="font-mono font-black text-base text-amber-900 ml-1">PKR {(customer.balance || 0).toFixed(2)}</span>
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
        <div className="border-b-2 border-black pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-black">{storeDetails?.name || 'Store Account Ledger'}</h1>
              {storeDetails?.phone && <p className="text-xs text-black font-semibold">Phone: {storeDetails.phone}</p>}
              {storeDetails?.address && <p className="text-xs text-black font-semibold">Address: {storeDetails.address}</p>}
            </div>
            <div className="text-right">
              <h2 className="text-lg font-black uppercase text-black">Customer Statement</h2>
              <p className="text-xs text-black font-mono">Date: {new Date().toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border border-black p-4 mb-6 text-xs">
          <div>
            <h3 className="font-bold uppercase text-[10px] text-black">Customer Details</h3>
            <p className="font-black text-sm text-black">{customer.name}</p>
            <p className="font-semibold">Mobile: {customer.mobile}</p>
            {customer.city && <p className="font-semibold">City: {customer.city}</p>}
          </div>
          <div className="text-right">
            <h3 className="font-bold uppercase text-[10px] text-black">Account Summary</h3>
            <p className="font-semibold">Total Invoiced: PKR {financialTotals.totalInvoiced.toFixed(2)}</p>
            <p className="font-semibold">Total Paid: PKR {financialTotals.totalPaid.toFixed(2)}</p>
            <p className="font-black text-sm text-black mt-1">Outstanding Balance: PKR {(customer.balance || 0).toFixed(2)}</p>
          </div>
        </div>

        <table className="w-full border-collapse border border-black text-xs text-left">
          <thead>
            <tr className="bg-slate-100 border-b border-black font-bold">
              <th className="p-2 border-r border-black">Date</th>
              <th className="p-2 border-r border-black">Type</th>
              <th className="p-2 border-r border-black">Ref #</th>
              <th className="p-2 border-r border-black">Particulars</th>
              <th className="p-2 border-r border-black text-right">Debit</th>
              <th className="p-2 border-r border-black text-right">Credit</th>
              <th className="p-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {statementRows.map((r, i) => (
              <tr key={i} className="border-b border-black">
                <td className="p-2 border-r border-black">{r.date ? new Date(r.date).toLocaleDateString() : ''}</td>
                <td className="p-2 border-r border-black">{r.type}</td>
                <td className="p-2 border-r border-black font-mono">{r.refNo}</td>
                <td className="p-2 border-r border-black">{r.description}</td>
                <td className="p-2 border-r border-black text-right">{r.debit > 0 ? r.debit.toFixed(2) : '—'}</td>
                <td className="p-2 border-r border-black text-right">{r.credit > 0 ? r.credit.toFixed(2) : '—'}</td>
                <td className="p-2 text-right font-bold">{r.runningBalance.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-16 flex justify-between pt-8 text-xs font-bold border-t border-black">
          <div>Authorized Store Signature: _________________________</div>
          <div>Customer Signature: _________________________</div>
        </div>
      </div>
    </div>
  );
}
