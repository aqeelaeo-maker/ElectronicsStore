import { useSyncExternalStore } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  Unsubscribe 
} from 'firebase/firestore';
import { db } from './firebase';

export interface StoreDetails {
  name: string;
  logoUrl: string;
  phone: string;
  address: string;
  email: string;
  bankAccounts?: Array<{ 
    bankName: string; 
    accountNumber: string; 
    accountTitle?: string; 
    openingBalance?: number; 
    balance?: number 
  }>;
  termsAndConditions?: string;
  units?: Array<{ name: string; abbreviation: string }>;
  categories?: string[];
}

export interface DataStoreState {
  storeId: string | null;
  sales: any[];
  products: any[];
  customers: any[];
  vendors: any[];
  allSerials: any[];
  quotations: any[];
  inventoryLogs: any[];
  vendorPayments: any[];
  customerPayments: any[];
  storeDetails: StoreDetails;

  salesLoaded: boolean;
  productsLoaded: boolean;
  customersLoaded: boolean;
  vendorsLoaded: boolean;
  serialsLoaded: boolean;
  quotationsLoaded: boolean;
  inventoryLogsLoaded: boolean;
  vendorPaymentsLoaded: boolean;
  customerPaymentsLoaded: boolean;
  storeDetailsLoaded: boolean;

  setStoreId: (storeId: string | null) => void;
  setSales: (sales: any[]) => void;
  setProducts: (products: any[]) => void;
  setCustomers: (customers: any[]) => void;
  setVendors: (vendors: any[]) => void;
  setAllSerials: (serials: any[]) => void;
  setQuotations: (quotations: any[]) => void;
  setInventoryLogs: (logs: any[]) => void;
  setVendorPayments: (payments: any[]) => void;
  setCustomerPayments: (payments: any[]) => void;
  setStoreDetails: (details: Partial<StoreDetails>) => void;
  resetAll: () => void;
}

const defaultStoreDetails: StoreDetails = {
  name: '',
  logoUrl: '',
  phone: '',
  address: '',
  email: '',
  bankAccounts: [],
  termsAndConditions: '',
  units: [
    { name: 'Piece', abbreviation: 'Pcs' },
    { name: 'Box', abbreviation: 'Box' },
    { name: 'Pack', abbreviation: 'Pk' },
    { name: 'Kilogram', abbreviation: 'Kg' },
    { name: 'Gram', abbreviation: 'g' },
    { name: 'Meter', abbreviation: 'Mtr' },
    { name: 'Liter', abbreviation: 'Ltr' },
    { name: 'Dozen', abbreviation: 'Dzn' },
    { name: 'Carton', abbreviation: 'Ctn' }
  ],
  categories: [
    'Electronics',
    'Mobile Phones',
    'Laptops & Computers',
    'Air Conditioners',
    'Refrigerators',
    'LED & Smart TVs',
    'Washing Machines',
    'Microwaves & Ovens',
    'Audio & Speakers',
    'Small Appliances',
    'Accessories',
    'Other'
  ]
};

export const parseInvoiceNumberInfo = (invNo?: string) => {
  if (!invNo) return { year: 0, seq: 0, raw: '' };
  const raw = String(invNo).trim();
  const match = raw.match(/(\d{4})[^\d]+(\d+)/);
  if (match) {
    return {
      year: parseInt(match[1], 10) || 0,
      seq: parseInt(match[2], 10) || 0,
      raw
    };
  }
  const singleMatch = raw.match(/(\d+)/);
  if (singleMatch) {
    return {
      year: 0,
      seq: parseInt(singleMatch[1], 10) || 0,
      raw
    };
  }
  return { year: 0, seq: 0, raw };
};

export const getSaleTimestamp = (sale: any): number => {
  if (!sale) return 0;
  if (sale.createdAt?.toMillis && typeof sale.createdAt.toMillis === 'function') {
    return sale.createdAt.toMillis();
  }
  if (sale.createdAt?.seconds) {
    return sale.createdAt.seconds * 1000 + (sale.createdAt.nanoseconds || 0) / 1000000;
  }
  if (typeof sale.createdAt === 'number') {
    return sale.createdAt;
  }
  if (typeof sale.createdAt === 'string') {
    const t = new Date(sale.createdAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (sale.date) {
    if (typeof sale.date === 'string') {
      const t = new Date(sale.date).getTime();
      if (!isNaN(t)) return t;
    } else if (sale.date instanceof Date) {
      return sale.date.getTime();
    } else if (sale.date?.toMillis) {
      return sale.date.toMillis();
    } else if (sale.date?.seconds) {
      return sale.date.seconds * 1000;
    }
  }
  if (sale.updatedAt?.toMillis) return sale.updatedAt.toMillis();
  if (sale.updatedAt?.seconds) return sale.updatedAt.seconds * 1000;
  return 0;
};

// Sort invoices in descending order: latest invoice first
export const compareSalesDescending = (a: any, b: any): number => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const infoA = parseInvoiceNumberInfo(a.invoiceNo);
  const infoB = parseInvoiceNumberInfo(b.invoiceNo);

  // 1. If both have year and sequence (e.g. INV-2026-0005 vs INV-2026-0004)
  if (infoA.year && infoB.year) {
    if (infoB.year !== infoA.year) {
      return infoB.year - infoA.year;
    }
    if (infoB.seq !== infoA.seq) {
      return infoB.seq - infoA.seq;
    }
  }

  // 2. If both have sequence numbers
  if (infoA.seq && infoB.seq && infoB.seq !== infoA.seq) {
    return infoB.seq - infoA.seq;
  }

  // 3. Natural alphanumeric comparison on invoice number
  if (infoA.raw && infoB.raw) {
    const comp = infoB.raw.localeCompare(infoA.raw, undefined, { numeric: true, sensitivity: 'base' });
    if (comp !== 0) return comp;
  }

  // 4. Creation / Sale timestamp descending (most recent date/time first)
  const timeA = getSaleTimestamp(a);
  const timeB = getSaleTimestamp(b);
  if (timeB !== timeA) {
    return timeB - timeA;
  }

  // 5. Document ID fallback
  return (b.id || '').localeCompare(a.id || '');
};

const getTimeMillis = (item: any): number => {
  return getSaleTimestamp(item);
};

type Listener = () => void;

function createStore<T>(initializer: (set: (partial: Partial<T> | ((state: T) => Partial<T>)) => void, get: () => T) => T) {
  let state: T;
  const listeners = new Set<Listener>();

  const getState = () => state;

  const setState = (partial: Partial<T> | ((state: T) => Partial<T>)) => {
    const nextPartial = typeof partial === 'function' ? (partial as (s: T) => Partial<T>)(state) : partial;
    state = Object.assign({}, state, nextPartial);
    listeners.forEach((listener) => {
      try {
        listener();
      } catch (e) {
        console.error('DataStore listener error:', e);
      }
    });
  };

  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  state = initializer(setState, getState);

  const useStore = <U = T>(selector?: (state: T) => U): U => {
    const getSnapshot = () => state;
    const storeState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return selector ? selector(storeState) : (storeState as unknown as U);
  };

  useStore.getState = getState;
  useStore.setState = setState;
  useStore.subscribe = subscribe;

  return useStore;
}

export const useDataStore = createStore<DataStoreState>((set) => ({
  storeId: null,
  sales: [],
  products: [],
  customers: [],
  vendors: [],
  allSerials: [],
  quotations: [],
  inventoryLogs: [],
  vendorPayments: [],
  customerPayments: [],
  storeDetails: defaultStoreDetails,

  salesLoaded: false,
  productsLoaded: false,
  customersLoaded: false,
  vendorsLoaded: false,
  serialsLoaded: false,
  quotationsLoaded: false,
  inventoryLogsLoaded: false,
  vendorPaymentsLoaded: false,
  customerPaymentsLoaded: false,
  storeDetailsLoaded: false,

  setStoreId: (storeId) => set({ storeId }),
  setSales: (sales) => set({ sales: [...sales].sort(compareSalesDescending), salesLoaded: true }),
  setProducts: (products) => set({ products, productsLoaded: true }),
  setCustomers: (customers) => set({ customers, customersLoaded: true }),
  setVendors: (vendors) => set({ vendors, vendorsLoaded: true }),
  setAllSerials: (allSerials) => set({ allSerials, serialsLoaded: true }),
  setQuotations: (quotations) => set({ quotations, quotationsLoaded: true }),
  setInventoryLogs: (inventoryLogs) => set({ inventoryLogs, inventoryLogsLoaded: true }),
  setVendorPayments: (vendorPayments) => set({ vendorPayments, vendorPaymentsLoaded: true }),
  setCustomerPayments: (customerPayments) => set({ customerPayments, customerPaymentsLoaded: true }),
  setStoreDetails: (details) => set((state) => ({
    storeDetails: { ...state.storeDetails, ...details },
    storeDetailsLoaded: true
  })),
  resetAll: () => set({
    sales: [],
    products: [],
    customers: [],
    vendors: [],
    allSerials: [],
    quotations: [],
    inventoryLogs: [],
    vendorPayments: [],
    customerPayments: [],
    storeDetails: defaultStoreDetails,
    salesLoaded: false,
    productsLoaded: false,
    customersLoaded: false,
    vendorsLoaded: false,
    serialsLoaded: false,
    quotationsLoaded: false,
    inventoryLogsLoaded: false,
    vendorPaymentsLoaded: false,
    customerPaymentsLoaded: false,
    storeDetailsLoaded: false
  })
}));

let activeSubscriptions: Unsubscribe[] = [];
let subscribedStoreId: string | null = null;

export const initDataListeners = (storeId: string): (() => void) => {
  if (!storeId) return () => {};

  // If already subscribed to this store, do not tear down or re-subscribe
  if (subscribedStoreId === storeId && activeSubscriptions.length > 0) {
    return () => {};
  }

  // Clear previous subscriptions if switching store
  activeSubscriptions.forEach((unsub) => {
    try { unsub(); } catch {}
  });
  activeSubscriptions = [];
  subscribedStoreId = storeId;
  useDataStore.getState().setStoreId(storeId);

  // 1. Sales query
  const qSales = query(collection(db, 'sales'), where('storeId', '==', storeId));
  const unsubSales = onSnapshot(qSales, (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
    list.sort(compareSalesDescending);
    useDataStore.getState().setSales(list);
  }, (err) => {
    console.warn('DataStore sales error:', err);
    useDataStore.setState({ salesLoaded: true });
  });
  activeSubscriptions.push(unsubSales);

  // 2. Products query
  const qProducts = query(collection(db, 'products'), where('storeId', '==', storeId));
  const unsubProducts = onSnapshot(qProducts, (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => getTimeMillis(b) - getTimeMillis(a));
    useDataStore.getState().setProducts(list);
  }, (err) => {
    console.warn('DataStore products error:', err);
    useDataStore.setState({ productsLoaded: true });
  });
  activeSubscriptions.push(unsubProducts);

  // 3. Customers query
  const qCustomers = query(collection(db, 'customers'), where('storeId', '==', storeId));
  const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => getTimeMillis(b) - getTimeMillis(a));
    useDataStore.getState().setCustomers(list);
  }, (err) => {
    console.warn('DataStore customers error:', err);
    useDataStore.setState({ customersLoaded: true });
  });
  activeSubscriptions.push(unsubCustomers);

  // 4. Vendors query
  const qVendors = query(collection(db, 'vendors'), where('storeId', '==', storeId));
  const unsubVendors = onSnapshot(qVendors, (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => getTimeMillis(b) - getTimeMillis(a));
    useDataStore.getState().setVendors(list);
  }, (err) => {
    console.warn('DataStore vendors error:', err);
    useDataStore.setState({ vendorsLoaded: true });
  });
  activeSubscriptions.push(unsubVendors);

  // 5. Serial Numbers query
  const qSerials = query(collection(db, 'serialNumbers'), where('storeId', '==', storeId));
  const unsubSerials = onSnapshot(qSerials, (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
    useDataStore.getState().setAllSerials(list);
  }, (err) => {
    console.warn('DataStore serials error:', err);
    useDataStore.setState({ serialsLoaded: true });
  });
  activeSubscriptions.push(unsubSerials);

  // 6. Quotations query
  const qQuotations = query(collection(db, 'quotations'), where('storeId', '==', storeId));
  const unsubQuotations = onSnapshot(qQuotations, (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => getTimeMillis(b) - getTimeMillis(a));
    useDataStore.getState().setQuotations(list);
  }, (err) => {
    console.warn('DataStore quotations error:', err);
    useDataStore.setState({ quotationsLoaded: true });
  });
  activeSubscriptions.push(unsubQuotations);

  // 7. Inventory Logs (Purchases / Stock movements)
  const qLogs = query(collection(db, 'inventoryLogs'), where('storeId', '==', storeId));
  const unsubLogs = onSnapshot(qLogs, (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => getTimeMillis(b) - getTimeMillis(a));
    useDataStore.getState().setInventoryLogs(list);
  }, (err) => {
    console.warn('DataStore logs error:', err);
    useDataStore.setState({ inventoryLogsLoaded: true });
  });
  activeSubscriptions.push(unsubLogs);

  // 8. Vendor Payments query
  const qPayments = query(collection(db, 'vendorPayments'), where('storeId', '==', storeId));
  const unsubPayments = onSnapshot(qPayments, (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => getTimeMillis(b) - getTimeMillis(a));
    useDataStore.getState().setVendorPayments(list);
  }, (err) => {
    console.warn('DataStore vendorPayments error:', err);
    useDataStore.setState({ vendorPaymentsLoaded: true });
  });
  activeSubscriptions.push(unsubPayments);

  // 9. Customer Payments query
  const qCustomerPayments = query(collection(db, 'customerPayments'), where('storeId', '==', storeId));
  const unsubCustPayments = onSnapshot(qCustomerPayments, (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => getTimeMillis(b) - getTimeMillis(a));
    useDataStore.getState().setCustomerPayments(list);
  }, (err) => {
    console.warn('DataStore customerPayments error:', err);
    useDataStore.setState({ customerPaymentsLoaded: true });
  });
  activeSubscriptions.push(unsubCustPayments);

  // 10. Store Details & Settings
  const storeRef = doc(db, 'stores', storeId);
  const unsubStore = onSnapshot(storeRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      let loadedAccounts: any[] = [];
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

      let parsedUnits = defaultStoreDetails.units;
      if (Array.isArray(data.units) && data.units.length > 0) {
        parsedUnits = data.units.map((u: any) => {
          if (typeof u === 'string') return { name: u, abbreviation: u };
          return {
            name: u.name || u.abbreviation || 'Unit',
            abbreviation: u.abbreviation || u.name || 'Unit'
          };
        });
      }

      let parsedCategories = defaultStoreDetails.categories;
      if (Array.isArray(data.categories) && data.categories.length > 0) {
        const cats = data.categories
          .map((c: any) => typeof c === 'string' ? c.trim() : (c.name || String(c)).trim())
          .filter(Boolean);
        if (cats.length > 0) parsedCategories = cats;
      }

      useDataStore.getState().setStoreDetails({
        name: data.name || '',
        logoUrl: data.logoUrl || '',
        phone: data.phone || '',
        address: data.address || '',
        email: data.email || '',
        bankAccounts: loadedAccounts,
        termsAndConditions: data.termsAndConditions || '',
        units: parsedUnits,
        categories: parsedCategories
      });
    } else {
      useDataStore.setState({ storeDetailsLoaded: true });
    }
  }, (err) => {
    console.warn('DataStore storeDetails error:', err);
    useDataStore.setState({ storeDetailsLoaded: true });
  });
  activeSubscriptions.push(unsubStore);

  return () => {
    activeSubscriptions.forEach((unsub) => {
      try { unsub(); } catch {}
    });
    activeSubscriptions = [];
    subscribedStoreId = null;
  };
};
