import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { wpAuthedRequest } from '@/lib/wp-authed-request';
import { BottomNav } from '@/components/BottomNav';
import { ThemeToggle } from '@/components/ThemeToggle';
import { WCProduct, WCOrder, WCOrderStatus } from '@/types/woocommerce';
import { purgeCacheAllPlugins } from '@/lib/cache-purge';
import { onProductUpdate, emitProductUpdate } from '@/lib/product-events';
import { onOrderUpdate } from '@/lib/order-events';
import { Package, ShoppingCart, AlertTriangle, TrendingUp, LogOut, RefreshCw, Loader2, PackageX, Clock, CheckCircle, XCircle, PercentSquare, Tag } from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  pending: { label: 'Pending', icon: Clock, color: 'text-yellow-600 bg-yellow-500/10' },
  processing: { label: 'Processing', icon: TrendingUp, color: 'text-blue-600 bg-blue-500/10' },
  'on-hold': { label: 'On Hold', icon: Clock, color: 'text-orange-600 bg-orange-500/10' },
  completed: { label: 'Completed', icon: CheckCircle, color: 'text-green-600 bg-green-500/10' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'text-red-600 bg-red-500/10' },
  refunded: { label: 'Refunded', icon: XCircle, color: 'text-gray-600 bg-gray-500/10' },
  failed: { label: 'Failed', icon: XCircle, color: 'text-red-600 bg-red-500/10' },
};

interface OrderStatusCount {
  slug: string;
  label: string;
  total: number;
}

export default function Dashboard() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [orderStats, setOrderStats] = useState<OrderStatusCount[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [lowStockProducts, setLowStockProducts] = useState<WCProduct[]>([]);
  const [onSaleCount, setOnSaleCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEndingSale, setIsEndingSale] = useState(false);
  const [endSaleProgress, setEndSaleProgress] = useState({ current: 0, total: 0 });
  const [showEndSaleConfirm, setShowEndSaleConfirm] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(0);

  async function fetchData() {
    if (!session) {
      console.log('⚠️ Dashboard: No session, skipping fetch');
      setIsLoading(false);
      return;
    }

    console.log('🔄 Dashboard: Fetching data...');

    try {
      // Fetch orders directly - more reliable than reports endpoint
      let allOrders: WCOrder[] = [];
      try {
        // Fetch recent orders (last 100)
        allOrders = await wpAuthedRequest<WCOrder[]>(`/wc/v3/orders?per_page=100`, session);
        console.log('📦 Dashboard: Fetched orders:', allOrders.length);
      } catch (orderError) {
        console.error('❌ Dashboard: Failed to fetch orders:', orderError);
      }

      // Calculate order stats from actual orders
      const statusCounts: Record<string, number> = {};
      allOrders.forEach((order) => {
        const status = order.status;
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });

      // Convert to array format
      const statsArray: OrderStatusCount[] = Object.entries(statusCounts)
        .map(([slug, total]) => ({
          slug,
          label: STATUS_CONFIG[slug]?.label || slug,
          total,
        }))
        .filter((s) => s.total > 0)
        .sort((a, b) => b.total - a.total);

      console.log('📊 Dashboard: Order stats:', statsArray);
      setOrderStats(statsArray);
      setTotalOrders(allOrders.length);

      // Fetch products for stock alerts and discounts
      let allProducts: WCProduct[] = [];
      try {
        allProducts = await wpAuthedRequest<WCProduct[]>(`/wc/v3/products?per_page=100`, session);
        console.log('📦 Dashboard: Fetched products:', allProducts.length);
      } catch (productError) {
        console.error('❌ Dashboard: Failed to fetch products:', productError);
      }

      // Low stock products (out of stock OR quantity <= 5)
      const lowStock = allProducts.filter((p) => {
        if (p.stock_status === 'outofstock') return true;
        if (p.manage_stock && p.stock_quantity !== null && p.stock_quantity <= 5) return true;
        return false;
      });
      console.log('⚠️ Dashboard: Low stock products:', lowStock.length);
      setLowStockProducts(lowStock);

      // Products with active discounts
      const onSaleProducts = allProducts.filter((p) => {
        if (p.on_sale === true) return true;
        if (!p.sale_price || p.sale_price === '' || p.sale_price === '0') return false;
        const salePrice = parseFloat(p.sale_price);
        const regularPrice = parseFloat(p.regular_price || '0');
        return !isNaN(salePrice) && salePrice > 0 && salePrice < regularPrice;
      });
      console.log('🏷️ Dashboard: On sale products:', onSaleProducts.length);
      setOnSaleCount(onSaleProducts.length);
    } catch (error) {
      console.error('❌ Dashboard: Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  // Fetch on mount and when session changes
  useEffect(() => {
    if (session) {
      console.log('📱 Dashboard: Mounted, fetching data...');
      fetchData();
      setLastFetchTime(Date.now());
    } else {
      setIsLoading(false);
    }
  }, [session]);

  // Re-fetch when navigating back to Dashboard
  useEffect(() => {
    if (session && (location.pathname === '/' || location.pathname === '/dashboard')) {
      const now = Date.now();
      if (now - lastFetchTime > 2000) {
        console.log('📍 Dashboard: Navigation detected, refreshing...');
        fetchData();
        setLastFetchTime(now);
      }
    }
  }, [location.key, session]);

  // Auto-refresh when page becomes visible
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && session) {
        const now = Date.now();
        if (now - lastFetchTime > 5000) {
          console.log('🔄 Dashboard: Page visible, refreshing...');
          fetchData();
          setLastFetchTime(now);
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [session, lastFetchTime]);

  // Listen for product updates
  useEffect(() => {
    const unsubscribe = onProductUpdate((source) => {
      console.log(`📩 Dashboard: Product update received from ${source}, refreshing...`);
      if (source === 'dashboard') return;
      if (session) {
        setTimeout(() => {
          fetchData();
          setLastFetchTime(Date.now());
        }, 2000);
      }
    });
    return unsubscribe;
  }, [session]);

  // Listen for order updates
  useEffect(() => {
    const unsubscribe = onOrderUpdate(() => {
      console.log('📩 Dashboard: Order update received, refreshing...');
      if (session) {
        fetchData();
        setLastFetchTime(Date.now());
      }
    });
    return unsubscribe;
  }, [session]);

  function handleRefresh() {
    setIsRefreshing(true);
    fetchData();
    setLastFetchTime(Date.now());
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  async function handleEndAllSales() {
    if (!session) return;
    setShowEndSaleConfirm(false);
    setIsEndingSale(true);

    try {
      const cacheBust = `_=${Date.now()}`;
      let allProducts: WCProduct[] = [];
      let page = 1;
      let hasMore = true;

      console.log('📦 Fetching all products for discount removal...');

      while (hasMore) {
        const products = await wpAuthedRequest<WCProduct[]>(`/wc/v3/products?per_page=100&page=${page}&${cacheBust}`, session);
        allProducts = [...allProducts, ...products];
        hasMore = products.length === 100;
        page++;
      }

      const allOnSaleProducts = allProducts.filter((p) => {
        if (!p.sale_price || p.sale_price === '' || p.sale_price === '0') return false;
        const salePrice = parseFloat(p.sale_price);
        return !isNaN(salePrice) && salePrice > 0;
      });

      console.log('🏷️ Found discounted products:', allOnSaleProducts.length);

      if (allOnSaleProducts.length === 0) {
        alert('No products currently have discounts.');
        setIsEndingSale(false);
        return;
      }

      setEndSaleProgress({ current: 0, total: allOnSaleProducts.length });

      let successCount = 0;
      for (let i = 0; i < allOnSaleProducts.length; i++) {
        const product = allOnSaleProducts[i];
        console.log(`🔄 Removing discount from: ${product.name} (ID: ${product.id})`);

        try {
          const updated = await wpAuthedRequest<WCProduct>(`/wc/v3/products/${product.id}`, session, {
            method: 'PUT',
            body: JSON.stringify({
              sale_price: '',
              date_on_sale_from: null,
              date_on_sale_to: null,
            }),
          });

          if (!updated.sale_price || updated.sale_price === '') {
            console.log(`✅ Discount removed: ${product.name}`);
            successCount++;
          }
        } catch (err) {
          console.error(`❌ Failed to update: ${product.name}`, err);
        }

        setEndSaleProgress({ current: i + 1, total: allOnSaleProducts.length });
      }

      console.log('🔄 Purging all caches...');
      await purgeCacheAllPlugins(session);

      emitProductUpdate('dashboard');

      alert(`Successfully ended discounts on ${successCount}/${allOnSaleProducts.length} product(s). Cache cleared!`);
      setOnSaleCount(0);
      fetchData();
    } catch (error) {
      console.error('Failed to end sales:', error);
      alert('Failed to end some discounts. Please try again.');
    } finally {
      setIsEndingSale(false);
      setEndSaleProgress({ current: 0, total: 0 });
    }
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border safe-area-top">
        <div className="flex items-center justify-between px-4 h-14">
          <div>
            <h1 className="font-semibold text-foreground">Dashboard</h1>
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{session?.storeUrl.replace(/^https?:\/\//, '')}</p>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button onClick={handleRefresh} disabled={isRefreshing} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <RefreshCw className={`w-5 h-5 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <LogOut className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <main className="p-4 flex flex-col gap-6">
          {/* Quick Actions */}
          <section>
            <h2 className="font-semibold text-foreground mb-3">Quick Actions</h2>
            <div className="flex gap-3">
              <button onClick={() => navigate('/stock')} className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl bg-primary text-primary-foreground font-medium">
                <Tag className="w-5 h-5" />
                Manage Stock
              </button>
              <button
                onClick={() => (onSaleCount > 0 ? setShowEndSaleConfirm(true) : handleRefresh())}
                disabled={isEndingSale}
                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                  onSaleCount > 0 ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground'
                }`}
              >
                {isEndingSale ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {endSaleProgress.total > 0 ? `${endSaleProgress.current}/${endSaleProgress.total}` : 'Loading...'}
                  </>
                ) : (
                  <>
                    <PercentSquare className="w-5 h-5" />
                    {onSaleCount > 0 ? `End Discounts (${onSaleCount})` : 'No Active Discounts'}
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => navigate('/orders')} className="p-4 rounded-2xl bg-card border border-border text-left hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <ShoppingCart className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{totalOrders}</p>
                  <p className="text-xs text-muted-foreground">Total Orders</p>
                </div>
              </div>
            </button>

            <button onClick={() => navigate('/stock')} className="p-4 rounded-2xl bg-card border border-border text-left hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${lowStockProducts.length > 0 ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                  {lowStockProducts.length > 0 ? <AlertTriangle className="w-5 h-5 text-red-500" /> : <Package className="w-5 h-5 text-green-500" />}
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{lowStockProducts.length}</p>
                  <p className="text-xs text-muted-foreground">Stock Alerts</p>
                </div>
              </div>
            </button>
          </div>

          {/* Order Status Breakdown */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-foreground">Orders by Status</h2>
              <button onClick={() => navigate('/orders')} className="text-sm text-primary font-medium">
                View all
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {orderStats.length === 0 ? (
                <div className="text-center py-8 bg-card rounded-xl border border-border">
                  <ShoppingCart className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">No orders found</p>
                  <button onClick={handleRefresh} className="mt-2 text-sm text-primary font-medium">
                    Tap to refresh
                  </button>
                </div>
              ) : (
                orderStats.map((status) => {
                  const config = STATUS_CONFIG[status.slug] || { label: status.label, icon: Clock, color: 'text-gray-600 bg-gray-500/10' };
                  const Icon = config.icon;
                  return (
                    <div key={status.slug} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${config.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="font-medium text-foreground">{config.label}</span>
                      </div>
                      <span className="text-lg font-semibold text-foreground">{status.total}</span>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Low Stock Alerts */}
          {lowStockProducts.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  Stock Alerts
                </h2>
                <button onClick={() => navigate('/stock')} className="text-sm text-primary font-medium">
                  Manage
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {lowStockProducts.slice(0, 3).map((product) => (
                  <div key={product.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                      {product.images?.[0]?.src ? (
                        <img src={product.images[0].src} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <PackageX className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{product.name}</p>
                      <p className="text-sm text-red-500">{product.stock_status === 'outofstock' ? 'Out of stock' : `Only ${product.stock_quantity} left`}</p>
                    </div>
                  </div>
                ))}
                {lowStockProducts.length > 3 && (
                  <button onClick={() => navigate('/stock')} className="w-full py-2 text-sm text-primary font-medium">
                    +{lowStockProducts.length - 3} more alerts
                  </button>
                )}
              </div>
            </section>
          )}
        </main>
      )}

      <BottomNav />

      {/* End Discounts Confirmation Modal */}
      {showEndSaleConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-full bg-red-500/10">
                <PercentSquare className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">End All Discounts?</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              This will remove the discount from{' '}
              <span className="font-semibold text-foreground">
                {onSaleCount} product{onSaleCount !== 1 ? 's' : ''}
              </span>
              . Products will return to their regular prices.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowEndSaleConfirm(false)} className="flex-1 py-3 rounded-xl border border-border text-foreground font-medium hover:bg-muted transition-colors">
                Cancel
              </button>
              <button onClick={handleEndAllSales} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 transition-colors">
                End Discounts
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
