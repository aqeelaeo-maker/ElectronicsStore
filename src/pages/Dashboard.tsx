import React, { useState, useEffect, useMemo } from 'react';
import { 
  DollarSign, 
  Package, 
  AlertTriangle, 
  TrendingUp, 
  Users, 
  ShoppingCart,
  Building2,
  Boxes
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
import { cn } from '../lib/utils';

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  icon: React.ElementType;
  cardClass: string;
  iconBadgeClass: string;
  titleClass: string;
  valueClass: string;
  action?: React.ReactNode;
  subtitle?: React.ReactNode;
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  cardClass, 
  iconBadgeClass, 
  titleClass, 
  valueClass, 
  action, 
  subtitle 
}: StatCardProps) {
  return (
    <div className={cn(
      "px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl transition-all duration-200 flex flex-col justify-between shadow-2xs",
      cardClass
    )}>
      <div>
        <div className="flex items-center justify-between gap-1.5 mb-1">
          <p className={cn("text-[10px] sm:text-[10.5px] font-bold uppercase tracking-wider truncate", titleClass)}>
            {title}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {action}
            <div className={cn("w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0", iconBadgeClass)}>
              <Icon className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
        <div className={cn("text-lg sm:text-xl xl:text-[22px] font-black tracking-tight leading-snug font-mono", valueClass)}>
          {value}
        </div>
      </div>
      {subtitle && (
        <div className="mt-1.5 pt-1.5 border-t border-black/5">
          {subtitle}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { storeId, role, isUser, isAdmin } = useAuth();
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockPriceBasis, setStockPriceBasis] = useState<'cost' | 'retail'>('cost');

  useEffect(() => {
    if (!storeId) return;

    const baseQuery = (colName: string) => 
      query(collection(db, colName), where('storeId', '==', storeId));

    // Listen to Sales
    const qSales = query(collection(db, 'sales'), where('storeId', '==', storeId));

    const unsubscribeSales = onSnapshot(qSales, (snapshot) => {
      const data: any[] = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });
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

  const { totalSales, totalRefunds, netSales } = useMemo(() => {
    let gross = 0;
    let refunds = 0;
    sales.forEach(sale => {
      gross += (sale.total || 0);
      refunds += (sale.totalRefunded || 0);
    });
    return {
      totalSales: gross,
      totalRefunds: refunds,
      netSales: Math.max(0, gross - refunds)
    };
  }, [sales]);
  const totalProducts = products.length;
  const totalCustomers = customers.length;
  const lowStockProducts = products.filter(p => (Number(p.stock) || 0) < 10).length;

  // Calculate Total Price of Stock (Cost basis and Retail basis) + Total Units
  const { totalStockCost, totalStockRetail, totalStockUnits } = useMemo(() => {
    let cost = 0;
    let retail = 0;
    let units = 0;

    products.forEach((p) => {
      const stock = Number(p.stock) || 0;
      const purchasePrice = Number(p.purchasePrice) || 0;
      const salePrice = Number(p.salePrice) || 0;

      units += stock;
      cost += stock * purchasePrice;
      retail += stock * salePrice;
    });

    return {
      totalStockCost: cost,
      totalStockRetail: retail,
      totalStockUnits: units
    };
  }, [products]);

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

      const netSale = Math.max(0, (sale.total || 0) - (sale.totalRefunded || 0));
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
        thisMonthTotal += netSale;
      } else if (d.getFullYear() === prevYear && d.getMonth() === prevMonth) {
        lastMonthTotal += netSale;
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isUser ? "Staff POS & operations dashboard" : "Real-time overview of your store performance"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isUser ? (
            <Link
              to="/inventory"
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-all cursor-pointer"
            >
              <Boxes className="w-4 h-4 text-[#0a382c]" />
              <span>Manage Inventory</span>
            </Link>
          ) : (
            <Link
              to="/sales"
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl bg-[#0a382c] text-white hover:bg-[#0e4839] shadow-xs transition-all cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4 text-emerald-300" />
              <span>New Sale / Invoicing</span>
            </Link>
          )}
        </div>
      </div>

      <div className={cn(
        "grid gap-3 sm:gap-3.5",
        isUser 
          ? "grid-cols-1 sm:grid-cols-3 lg:grid-cols-3" 
          : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
      )}>
        {/* Total Sales: Admin only */}
        {!isUser && (
          <StatCard 
            title="Total Sales" 
            value={`PKR ${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
            icon={DollarSign} 
            cardClass="bg-emerald-50/80 hover:bg-emerald-50 border border-emerald-200/90"
            iconBadgeClass="bg-emerald-600 text-white shadow-2xs"
            titleClass="text-emerald-800"
            valueClass="text-emerald-950"
            subtitle={
              <div className="flex items-center justify-between text-[10.5px] font-medium text-emerald-700 truncate">
                <span>Net: PKR {netSales.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                {salesTrend && (
                  <span className="inline-flex items-center text-emerald-900 font-bold">
                    <TrendingUp className="w-3 h-3 mr-0.5" />
                    {salesTrend}
                  </span>
                )}
              </div>
            }
          />
        )}

        {/* Total Price of Products: Admin only */}
        {!isUser && (
          <StatCard 
            title="Total Price of Products" 
            value={`PKR ${(stockPriceBasis === 'cost' ? totalStockCost : totalStockRetail).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
            icon={Boxes} 
            cardClass="bg-indigo-50/80 hover:bg-indigo-50 border border-indigo-200/90"
            iconBadgeClass="bg-indigo-600 text-white shadow-2xs"
            titleClass="text-indigo-800"
            valueClass="text-indigo-950"
            action={
              <div className="flex items-center bg-indigo-100/90 border border-indigo-200/80 p-0.5 rounded-md text-[9px] font-bold">
                <button
                  type="button"
                  onClick={() => setStockPriceBasis('cost')}
                  className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                    stockPriceBasis === 'cost' 
                      ? 'bg-indigo-600 text-white shadow-2xs font-black' 
                      : 'text-indigo-700 hover:text-indigo-950'
                  }`}
                  title="Valued at Purchase Cost"
                >
                  Cost
                </button>
                <button
                  type="button"
                  onClick={() => setStockPriceBasis('retail')}
                  className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                    stockPriceBasis === 'retail' 
                      ? 'bg-indigo-600 text-white shadow-2xs font-black' 
                      : 'text-indigo-700 hover:text-indigo-950'
                  }`}
                  title="Valued at Retail Price"
                >
                  Retail
                </button>
              </div>
            }
            subtitle={
              <div className="flex items-center justify-between text-[10.5px] font-medium text-indigo-700 truncate">
                <span>
                  {stockPriceBasis === 'cost' ? 'Retail' : 'Cost'}: PKR {(stockPriceBasis === 'cost' ? totalStockRetail : totalStockCost).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
                <span className="font-semibold text-indigo-900">
                  {totalStockUnits.toLocaleString()} units
                </span>
              </div>
            }
          />
        )}

        {/* Total Products: Visible to both Admin and User */}
        <StatCard 
          title="Total Products" 
          value={totalProducts} 
          icon={Package} 
          cardClass="bg-sky-50/80 hover:bg-sky-50 border border-sky-200/90"
          iconBadgeClass="bg-sky-600 text-white shadow-2xs"
          titleClass="text-sky-800"
          valueClass="text-sky-950"
          subtitle={
            <div className="flex items-center justify-between text-[10.5px] font-medium text-sky-700 truncate">
              <span>Catalog SKUs</span>
              <span className="font-bold text-sky-900">{totalStockUnits.toLocaleString()} units</span>
            </div>
          }
        />

        {/* Total Customers: Visible to both Admin and User */}
        <StatCard 
          title="Total Customers" 
          value={totalCustomers} 
          icon={Users} 
          cardClass="bg-amber-50/80 hover:bg-amber-50 border border-amber-200/90"
          iconBadgeClass="bg-amber-600 text-white shadow-2xs"
          titleClass="text-amber-800"
          valueClass="text-amber-950"
          subtitle={
            <div className="flex items-center justify-between text-[10.5px] font-medium text-amber-700 truncate">
              <span>Client records</span>
              {customerTrend && (
                <span className="inline-flex items-center text-amber-900 font-bold">
                  <TrendingUp className="w-3 h-3 mr-0.5" />
                  {customerTrend}
                </span>
              )}
            </div>
          }
        />

        {/* Low Item Stock: Visible to both Admin and User */}
        <StatCard 
          title="Low Item Stock" 
          value={lowStockProducts} 
          icon={AlertTriangle} 
          cardClass="bg-rose-50/80 hover:bg-rose-50 border border-rose-200/90"
          iconBadgeClass="bg-rose-600 text-white shadow-2xs"
          titleClass="text-rose-800"
          valueClass="text-rose-950"
          subtitle={
            <div className="text-[10.5px] font-medium text-rose-700 truncate">
              {lowStockProducts > 0 ? `${lowStockProducts} item(s) < 10 units` : 'Inventory healthy'}
            </div>
          }
        />
      </div>

      <div className={cn(
        "grid gap-6",
        isUser ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 lg:grid-cols-2"
      )}>
        {/* Sales & Profit Overview: Admin only */}
        {!isUser && (
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
        )}

        {isUser ? (
          <>
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
                Top Products
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
          </>
        ) : (
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
        )}
      </div>
    </div>
  );
}
