import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
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
  CreditCard 
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
  items?: any[];
  returns?: any[];
  totalRefunded?: number;
}

interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountTitle?: string;
  openingBalance?: number;
  balance?: number;
}

interface CustomerLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  storeId: string;
}

export default function CustomerLedgerModal({
  isOpen,
  onClose,
  customer,
  storeId
}: CustomerLedgerModalProps) {
  const [sales, setSales] = useState<CustomerSaleRecord[]>([]);
  const [payments, setPayments] = useState<CustomerPaymentRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments'>('invoices');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Payment receiving form state
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [receivingAmount, setReceivingAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Online'>('Cash');
  const [selectedBankAcc, setSelectedBankAcc] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Fetch Store Bank Accounts
  useEffect(() => {
    if (!storeId || !isOpen) return;
    const storeRef = doc(db, 'stores', storeId);
    getDoc(storeRef).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        const accs = Array.isArray(data.bankAccounts) ? data.bankAccounts : [];
        setBankAccounts(accs);
        if (accs.length > 0) {
          setSelectedBankAcc(accs[0].accountNumber);
        }
      }
    }).catch(err => console.warn('Could not fetch store bank accounts:', err));
  }, [storeId, isOpen]);

  // Fetch customer sales and payment records
  useEffect(() => {
    if (!storeId || !customer || !isOpen) return;

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
  }, [storeId, customer, isOpen]);

  // Totals calculations
  const totals = useMemo(() => {
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
        notes: paymentNotes.trim() || `Received PKR ${amount.toFixed(2)} payment against outstanding balance`,
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

  const filteredSales = useMemo(() => {
    if (!searchTerm.trim()) return sales;
    const term = searchTerm.toLowerCase();
    return sales.filter(s => 
      s.invoiceNo.toLowerCase().includes(term) ||
      (s.paymentMode && s.paymentMode.toLowerCase().includes(term)) ||
      (s.status && s.status.toLowerCase().includes(term))
    );
  }, [sales, searchTerm]);

  const filteredPayments = useMemo(() => {
    if (!searchTerm.trim()) return payments;
    const term = searchTerm.toLowerCase();
    return payments.filter(p => 
      (p.invoiceNo && p.invoiceNo.toLowerCase().includes(term)) ||
      (p.paymentMode && p.paymentMode.toLowerCase().includes(term)) ||
      (p.notes && p.notes.toLowerCase().includes(term)) ||
      (p.type && p.type.toLowerCase().includes(term))
    );
  }, [payments, searchTerm]);

  if (!isOpen || !customer) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div 
        id="customer-ledger-modal"
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl my-auto overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="bg-[#0a382c] px-6 py-5 text-white flex justify-between items-center relative overflow-hidden">
          <div className="flex items-center gap-3.5 z-10">
            <div className="w-11 h-11 rounded-2xl bg-emerald-800/60 border border-emerald-600/40 flex items-center justify-center text-white shadow-inner">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-tight text-white">{customer.name}</h2>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-700/50 text-emerald-200">
                  Customer Ledger
                </span>
              </div>
              <p className="text-xs text-emerald-200/80 mt-0.5 font-medium flex items-center gap-3">
                <span>📱 {customer.mobile}</span>
                {customer.city && <span>📍 {customer.city}</span>}
                {customer.email && <span>✉️ {customer.email}</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 z-10">
            <button
              type="button"
              onClick={() => setShowReceiveForm(!showReceiveForm)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-[#0a382c] hover:bg-emerald-50 text-xs font-black shadow-md transition-all active:scale-95"
            >
              <PlusCircle className="w-4 h-4 text-emerald-700" />
              {showReceiveForm ? 'Close Payment Form' : 'Receive Payment'}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 text-emerald-100 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Financial Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-5 bg-slate-50 border-b border-slate-200">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Invoiced</div>
            <div className="text-base sm:text-lg font-black text-slate-900 mt-1">
              PKR {totals.totalInvoiced.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">{sales.length} invoice(s) generated</div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-emerald-100 shadow-2xs">
            <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Total Paid</div>
            <div className="text-base sm:text-lg font-black text-emerald-700 mt-1">
              PKR {totals.totalPaid.toFixed(2)}
            </div>
            <div className="text-[10px] text-emerald-600/80 mt-0.5">Cleared customer payments</div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-amber-200 shadow-2xs">
            <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Pending Balance</div>
            <div className="text-base sm:text-lg font-black text-amber-900 mt-1">
              PKR {totals.totalPending.toFixed(2)}
            </div>
            <div className="text-[10px] text-amber-600/90 mt-0.5">Unpaid invoice amounts</div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-300 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Current Account Balance</div>
            <div className={`text-base sm:text-lg font-black mt-1 ${totals.currentBalance > 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
              PKR {totals.currentBalance.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {totals.currentBalance > 0 ? 'Customer owes store' : 'Account is fully settled'}
            </div>
          </div>
        </div>

        {/* Receive Payment Form (Collapsible) */}
        {showReceiveForm && (
          <div className="p-5 bg-emerald-50/60 border-b border-emerald-200 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                <Banknote className="w-4 h-4 text-emerald-700" />
                Receive / Settle Customer Payment
              </h3>
              <span className="text-xs font-bold text-emerald-800">
                Outstanding Balance: PKR {customer.balance?.toFixed(2) || '0.00'}
              </span>
            </div>

            <form onSubmit={handleReceivePayment} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-3">
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Amount (PKR) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={receivingAmount}
                  onChange={(e) => setReceivingAmount(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Payment Mode *
                </label>
                <div className="flex rounded-xl border border-slate-300 overflow-hidden bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMode('Cash')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-colors ${
                      paymentMode === 'Cash' ? 'bg-[#0a382c] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('Online')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-colors ${
                      paymentMode === 'Online' ? 'bg-[#0a382c] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Online
                  </button>
                </div>
              </div>

              {paymentMode === 'Online' && (
                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Store Bank Account *
                  </label>
                  <select
                    value={selectedBankAcc}
                    onChange={(e) => setSelectedBankAcc(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    {bankAccounts.map((acc) => (
                      <option key={acc.accountNumber} value={acc.accountNumber}>
                        {acc.bankName} - {acc.accountNumber}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={paymentMode === 'Online' ? 'sm:col-span-3' : 'sm:col-span-3'}>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Payment Date
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="sm:col-span-9">
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Notes / Reference (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Settle partial balance, Cheque #1234, Bank transfer slip"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="sm:col-span-3 flex justify-end">
                <button
                  type="submit"
                  disabled={submittingPayment}
                  className="w-full py-2 px-4 rounded-xl bg-[#0a382c] hover:bg-[#0d4a3b] text-white text-xs font-bold shadow-md shadow-emerald-950/10 transition-colors disabled:opacity-50"
                >
                  {submittingPayment ? 'Recording...' : 'Confirm Receipt'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tabs & Search */}
        <div className="px-6 py-3 border-b border-slate-200 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('invoices')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'invoices'
                  ? 'bg-[#0a382c] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Invoices & Billing ({sales.length})
            </button>
            <button
              onClick={() => setActiveTab('payments')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'payments'
                  ? 'bg-[#0a382c] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Payment Records & Ledger ({payments.length})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <Search className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search records..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {loading ? (
            <div className="py-16 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a382c] mx-auto"></div>
              <p className="text-xs text-slate-500 mt-2">Loading customer ledger...</p>
            </div>
          ) : activeTab === 'invoices' ? (
            /* Invoices View */
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full divide-y divide-slate-100 text-left text-xs">
                  <thead className="bg-[#f8faf9] text-slate-600 font-bold text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Invoice No</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4 text-right">Total Amount</th>
                      <th className="py-3 px-4 text-right">Paid Amount</th>
                      <th className="py-3 px-4 text-right">Amount Pending</th>
                      <th className="py-3 px-4 text-center">Payment Mode</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredSales.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400 italic">
                          No invoices found for this customer.
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
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                              {sale.invoiceNo}
                            </td>
                            <td className="py-3.5 px-4 text-slate-600 font-medium">
                              {sale.date ? new Date(sale.date).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="py-3.5 px-4 text-right font-black text-slate-900">
                              PKR {sale.total?.toFixed(2)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                              PKR {paid.toFixed(2)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-bold">
                              <span className={pending > 0 ? 'text-amber-800' : 'text-slate-400'}>
                                PKR {pending.toFixed(2)}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                sale.paymentMode === 'Online'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                  : 'bg-amber-50 text-amber-800 border border-amber-100'
                              }`}>
                                {sale.paymentMode === 'Online' ? <Globe className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
                                {sale.paymentMode || 'Cash'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                sale.status === 'Paid'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : sale.status === 'Returned'
                                    ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}>
                                {sale.status || 'Paid'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Payment Records View */
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full divide-y divide-slate-100 text-left text-xs">
                  <thead className="bg-[#f8faf9] text-slate-600 font-bold text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Invoice / Reference</th>
                      <th className="py-3 px-4 text-right">Amount Paid / Credited</th>
                      <th className="py-3 px-4 text-center">Payment Method</th>
                      <th className="py-3 px-4">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredPayments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400 italic">
                          No payment records found for this customer.
                        </td>
                      </tr>
                    ) : (
                      filteredPayments.map((p) => {
                        const isCredit = p.type === 'ReturnCredit' || (p.refundAmount && p.refundAmount > 0);
                        const displayAmount = isCredit ? (p.refundAmount || 0) : (p.paidAmount || 0);

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-4 text-slate-600 font-medium">
                              {p.paymentDate 
                                ? new Date(p.paymentDate).toLocaleDateString() 
                                : (p.createdAt?.toMillis ? new Date(p.createdAt.toMillis()).toLocaleDateString() : 'N/A')}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                p.type === 'ReturnCredit'
                                  ? 'bg-purple-50 text-purple-800 border border-purple-200'
                                  : p.type === 'PaymentReceived'
                                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}>
                                {p.type === 'ReturnCredit' ? (
                                  <>
                                    <RotateCcw className="w-2.5 h-2.5" />
                                    Return Credit
                                  </>
                                ) : p.type === 'PaymentReceived' ? (
                                  <>
                                    <ArrowDownLeft className="w-2.5 h-2.5" />
                                    Payment Received
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                    Invoice Payment
                                  </>
                                )}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                              {p.invoiceNo || p.referenceNo || '—'}
                            </td>
                            <td className="py-3.5 px-4 text-right font-black">
                              <span className={isCredit ? 'text-purple-700' : 'text-emerald-700'}>
                                {isCredit ? '+' : ''}PKR {displayAmount.toFixed(2)}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className="text-[11px] font-bold text-slate-700">
                                {p.paymentMode || 'Cash'}
                                {p.bankName ? ` (${p.bankName})` : ''}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-600 text-[11px] max-w-xs truncate">
                              {p.notes || '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center">
          <div className="text-xs text-slate-500 font-medium">
            Customer ID: <span className="font-mono">{customer.id}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
