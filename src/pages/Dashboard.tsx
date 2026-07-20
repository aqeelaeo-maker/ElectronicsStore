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
    <div className="glass-panel glass-panel-hover p-6 rounded-2xl shadow-xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</p>
          <p className="mt-2.5 text-3xl font-extrabold text-white tracking-tight">{value}</p>
        </div>
        <div className={`p-3 rounded-xl ${colorClass} shadow-inner`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      {trend && (
        <div className="mt-4 flex items-center text-xs font-semibold">
          <TrendingUp className="w-4 h-4 text-emerald-400 mr-1" />
          <span className="text-emerald-400">{trend}</span>
          <span className="text-slate-500 ml-1.5">vs last month</span>
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
      role === 'Super Admin' 
        ? collection(db, colName) 
        : query(collection(db, colName), where('storeId', '==', storeId));

    // Listen to Sales
    const qSales = role === 'Super Admin' 
      ? query(collection(db, 'sales'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'sales'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'));

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
  }, [storeId, role]);

  const totalSales = useMemo(() => sales.reduce((acc, sale) => acc + (sale.total || 0), 0), [sales]);
  const totalProducts = products.length;
  const totalCustomers = customers.length;
  const lowStockProducts = products.filter(p => p.stock < 10).length;

  const recentSales = sales.slice(0, 4);
  const topProducts = [...products].sort((a, b) => b.salePrice - a.salePrice).slice(0, 3); // using price as mock metric for top selling

  const mockSalesData = [
    { name: 'Jan', sales: 4000, profit: 2400 },
    { name: 'Feb', sales: 3000, profit: 1398 },
    { name: 'Mar', sales: 2000, profit: 9800 },
    { name: 'Apr', sales: 2780, profit: 3908 },
    { name: 'May', sales: 1890, profit: 4800 },
    { name: 'Jun', sales: 2390, profit: 3800 },
    { name: 'Jul', sales: 3490, profit: 4300 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">Real-time overview of your store performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Sales" 
          value={`$${totalSales.toFixed(2)}`} 
          icon={DollarSign} 
          trend="+12.5%"
          colorClass="bg-blue-500/10 text-blue-400 border border-blue-500/20"
        />
        <StatCard 
          title="Total Products" 
          value={totalProducts} 
          icon={Package}
          colorClass="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
        />
        <StatCard 
          title="Total Customers" 
          value={totalCustomers} 
          icon={Users} 
          trend="+5.2%"
          colorClass="bg-purple-500/10 text-purple-400 border border-purple-500/20"
        />
        <StatCard 
          title="Low Stock Items" 
          value={lowStockProducts} 
          icon={AlertTriangle} 
          colorClass="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart */}
        <div className="glass-panel p-6 rounded-2xl shadow-xl">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <span className="w-1.5 h-4 bg-blue-500 rounded-full"></span>
            Sales & Profit Overview
          </h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockSalesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(val) => `$${val}`} />
                <Tooltip 
                  cursor={{ fill: '#1e293b', opacity: 0.3 }}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#f1f5f9' }}
                />
                <Bar dataKey="sales" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Sales" />
                <Bar dataKey="profit" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Profit" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl shadow-xl">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-blue-500 rounded-full"></span>
              Recent Sales
            </h2>
            <div className="space-y-4">
              {recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between pb-4 border-b border-slate-800 last:border-0 last:pb-0">
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                      <ShoppingCart className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-semibold text-white">{sale.invoiceNo}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{sale.customerName}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-slate-200">${sale.total?.toFixed(2)}</span>
                </div>
              ))}
              {recentSales.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-6">No recent sales</p>
              )}
            </div>
          </div>

          <div className="glass-panel p-6 rounded-2xl shadow-xl">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-blue-500 rounded-full"></span>
              Top Products (By Value)
            </h2>
            <div className="space-y-4">
              {topProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between pb-4 border-b border-slate-800 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm font-semibold text-white">{product.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">${product.salePrice?.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                      product.stock < 10 
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {product.stock} in stock
                    </span>
                  </div>
                </div>
              ))}
              {topProducts.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-6">No products available</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
