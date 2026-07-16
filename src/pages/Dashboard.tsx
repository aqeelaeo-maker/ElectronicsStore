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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`p-3 rounded-full ${colorClass}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      {trend && (
        <div className="mt-4 flex items-center text-sm">
          <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
          <span className="text-green-500 font-medium">{trend}</span>
          <span className="text-gray-500 ml-2">vs last month</span>
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of your store performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Sales" 
          value={`$${totalSales.toFixed(2)}`} 
          icon={DollarSign} 
          trend="+12.5%"
          colorClass="bg-blue-100 text-blue-600"
        />
        <StatCard 
          title="Total Products" 
          value={totalProducts} 
          icon={Package}
          colorClass="bg-green-100 text-green-600"
        />
        <StatCard 
          title="Total Customers" 
          value={totalCustomers} 
          icon={Users} 
          trend="+5.2%"
          colorClass="bg-purple-100 text-purple-600"
        />
        <StatCard 
          title="Low Stock Items" 
          value={lowStockProducts} 
          icon={AlertTriangle} 
          colorClass="bg-yellow-100 text-yellow-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Sales & Profit Overview</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockSalesData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `$${val}`} />
                <Tooltip cursor={{fill: 'transparent'}} />
                <Bar dataKey="sales" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Sales" />
                <Bar dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} name="Profit" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Sales</h2>
            <div className="space-y-4">
              {recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                      <ShoppingCart className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-900">{sale.invoiceNo}</p>
                      <p className="text-xs text-gray-500">{sale.customerName}</p>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-900">${sale.total?.toFixed(2)}</span>
                </div>
              ))}
              {recentSales.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">No recent sales</p>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Top Products (By Value)</h2>
            <div className="space-y-4">
              {topProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{product.name}</p>
                    <p className="text-xs text-gray-500">${product.salePrice?.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      product.stock < 10 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {product.stock} in stock
                    </span>
                  </div>
                </div>
              ))}
              {topProducts.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">No products available</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
