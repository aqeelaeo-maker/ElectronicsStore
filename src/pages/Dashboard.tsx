import React, { useState, useEffect, useMemo } from 'react';
import { 
  DollarSign, 
  Package, 
  AlertTriangle, 
  TrendingUp, 
  Users, 
  ShoppingCart,
  Building2
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

function StatCard({ title, value, icon: Icon, trend, colorClass }: any) {
  return (
    <div className="glass-panel glass-panel-hover p-6 rounded-2xl shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</p>
          <p className="mt-2.5 text-3xl font-black text-slate-900 tracking-tight">{value}</p>
        </div>
        <div className={`p-3 rounded-xl ${colorClass} flex items-center justify-center`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      {trend && (
        <div className="mt-4 flex items-center text-xs font-semibold">
          <TrendingUp className="w-4 h-4 text-emerald-600 mr-1" />
          <span className="text-emerald-700 font-bold">{trend}</span>
          <span className="text-slate-400 ml-1.5">vs last month</span>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { storeId, role } = useAuth();
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;

    const baseQuery = (colName: string) => 
      query(collection(db, colName), where('storeId', '==', storeId));

    // Listen to Sales
    const qSales = query(collection(db, 'sales'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'));

    const unsubscribeSales = onSnapshot(qSales, (snapshot) => {
      const data: any[] = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
      setSales(data);
    });

    // Listen to Products
    const unsubscribeProducts = onSnapshot(baseQuery('products'), (snapshot) => {
      const data: any[] = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
      setProducts(data);
    });

    // Listen to Customers
    const unsubscribeCustomers = onSnapshot(baseQuery('customers'), (snapshot) => {
      const data: any[] = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
      setCustomers(data);
      setLoading(false);
    });

    return () => {
      unsubscribeSales();
      unsubscribeProducts();
      unsubscribeCustomers();
    };
  }, [storeId]);

  const totalSales = useMemo(() => sales.reduce((acc, sale) => acc + (sale.total || 0), 0), [sales]);
  const totalProducts = products.length;
  const totalCustomers = customers.length;
  const lowStockProducts = products.filter(p => p.stock < 10).length;

  const recentSales = sales.slice(0, 4);

  // Calculate top products based on actual total value sold from real invoices
  const topProducts = useMemo(() => {
    const productSalesMap: Record<string, { product: any; qtySold: number; valSold: number }> = {};
    
    sales.forEach(sale => {
      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach((item: any) => {
          if (!productSalesMap[item.productId]) {
            productSalesMap[item.productId] = {
              product: products.find(p => p.id === item.productId) || {
                id: item.productId,
                name: item.productName,
                salePrice: item.salePrice || 0,
                stock: 0
              },
              qtySold: 0,
              valSold: 0
            };
          }
          productSalesMap[item.productId].qtySold += (item.quantity || 0);
          productSalesMap[item.productId].valSold += (item.subtotal || 0);
        });
      }
    });

    const aggregated = Object.values(productSalesMap);
    if (aggregated.length > 0) {
      return aggregated
        .sort((a, b) => b.valSold - a.valSold)
        .slice(0, 3)
        .map(item => ({
          id: item.product.id || Math.random().toString(),
          name: item.product.name,
          salePrice: item.product.salePrice,
          stock: item.product.stock ?? 0,
          valSold: item.valSold,
          qtySold: item.qtySold
        }));
    }

    // Fallback to highest priced products if no sales have been recorded yet
    return [...products].sort((a, b) => b.salePrice - a.salePrice).slice(0, 3);
  }, [sales, products]);

  // Calculate real month-over-month sales trend
  const salesTrend = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    let thisMonthTotal = 0;
    let lastMonthTotal = 0;

    sales.forEach(sale => {
      if (!sale.date) return;
      const d = new Date(sale.date);
      if (isNaN(d.getTime())) return;

      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
        thisMonthTotal += sale.total || 0;
      } else if (d.getFullYear() === prevYear && d.getMonth() === prevMonth) {
        lastMonthTotal += sale.total || 0;
      }
    });

    if (lastMonthTotal === 0) {
      return thisMonthTotal > 0 ? '+100.0%' : '0.0%';
    }

    const diff = ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;
    return `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
  }, [sales]);

  // Calculate real customer signup trend
  const customerTrend = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    let thisMonthCount = 0;
    let lastMonthCount = 0;

    customers.forEach(cust => {
      if (!cust.createdAt) return;
      const d = typeof cust.createdAt.toDate === 'function'
        ? cust.createdAt.toDate()
        : new Date(cust.createdAt?.seconds * 1000 || cust.createdAt);
        
      if (isNaN(d.getTime())) return;

      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
        thisMonthCount++;
      } else if (d.getFullYear() === prevYear && d.getMonth() === prevMonth) {
        lastMonthCount++;
      }
    });

    if (lastMonthCount === 0) {
      return thisMonthCount > 0 ? '+100.0%' : '0.0%';
    }

    const diff = ((thisMonthCount - lastMonthCount) / lastMonthCount) * 100;
    return `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
  }, [customers]);

  // Dynamically group real sales and profit into the last 7 months
  const salesData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const result: { name: string; yearMonth: string; sales: number; profit: number }[] = [];
    
    const now = new Date();
    // Create sliding window of last 7 months including current month
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mName = months[d.getMonth()];
      const year = d.getFullYear();
      const yearMonth = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      result.push({
        name: `${mName} ${year % 100}`,
        yearMonth,
        sales: 0,
        profit: 0
      });
    }

    sales.forEach(sale => {
      if (!sale.date) return;
      const saleDate = new Date(sale.date);
      if (isNaN(saleDate.getTime())) return;
      
      const yearMonth = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
      const bucket = result.find(b => b.yearMonth === yearMonth);
      if (bucket) {
        const totalSale = sale.total || 0;
        bucket.sales += totalSale;
        
        let saleProfit = 0;
        if (sale.items && Array.isArray(sale.items)) {
          sale.items.forEach((item: any) => {
            const prod = products.find(p => p.id === item.productId);
            const purchasePrice = prod ? (prod.purchasePrice || 0) : 0;
            const itemSubtotal = item.subtotal ?? ((item.quantity * item.salePrice) - (item.discount || 0));
            const itemCost = item.quantity * purchasePrice;
            saleProfit += (itemSubtotal - itemCost);
          });
        } else {
          // Default fallback to 30% profit margin if items aren't stored
          saleProfit = totalSale * 0.3;
        }
        bucket.profit += saleProfit;
      }
    });

    return result.map(({ name, sales, profit }) => ({
      name,
      sales: Math.round(sales),
      profit: Math.round(profit)
    }));
  }, [sales, products]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Real-time overview of your store performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Sales" 
          value={`PKR ${totalSales.toFixed(2)}`} 
          icon={DollarSign} 
          trend={salesTrend}
          colorClass="bg-emerald-50 text-emerald-700 border border-emerald-100"
        />
        <StatCard 
          title="Total Products" 
          value={totalProducts} 
          icon={Package} 
          colorClass="bg-amber-50 text-amber-700 border border-amber-100"
        />
        <StatCard 
          title="Total Customers" 
          value={totalCustomers} 
          icon={Users} 
          trend={customerTrend}
          colorClass="bg-blue-50 text-blue-700 border border-blue-100"
        />
        <StatCard 
          title="Low Stock Items" 
          value={lowStockProducts} 
          icon={AlertTriangle} 
          colorClass="bg-rose-50 text-rose-700 border border-rose-100"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart */}
        <div className="glass-panel p-6 rounded-2xl shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <span className="w-1.5 h-4 bg-[#0a382c] rounded-full"></span>
            Sales & Profit Overview
          </h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(val) => `PKR ${val}`} />
                <Tooltip 
                  cursor={{ fill: '#f4f7f6', opacity: 0.5 }}
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', color: '#0f172a', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                />
                <Bar dataKey="sales" fill="#0a382c" radius={[4, 4, 0, 0]} name="Sales" />
                <Bar dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} name="Profit" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-[#0a382c] rounded-full"></span>
              Recent Sales
            </h2>
            <div className="space-y-4">
              {recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                      <ShoppingCart className="w-5 h-5 text-[#0a382c]" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-semibold text-slate-950">{sale.invoiceNo}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{sale.customerName}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-slate-900">PKR {sale.total?.toFixed(2)}</span>
                </div>
              ))}
              {recentSales.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">No recent sales</p>
              )}
            </div>
          </div>

          <div className="glass-panel p-6 rounded-2xl shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-[#0a382c] rounded-full"></span>
              Top Products (By Value)
            </h2>
            <div className="space-y-4">
              {topProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{product.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">PKR {product.salePrice?.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                      product.stock < 10 
                        ? 'bg-rose-50 text-rose-600 border border-rose-100' 
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    }`}>
                      {product.stock} in stock
                    </span>
                  </div>
                </div>
              ))}
              {topProducts.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">No products available</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
