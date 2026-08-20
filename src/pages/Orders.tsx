import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { wpAuthedRequest } from '@/lib/wp-authed-request';
import { purgeLiteSpeedCache, purgeWooCommerceTransients } from '@/lib/cache-purge';
import { emitOrderUpdate } from '@/lib/order-events';
import { BottomNav } from '@/components/BottomNav';
import { FilterDropdown, FilterOption } from '@/components/FilterDropdown';
import { ThemeToggle } from '@/components/ThemeToggle';
import { WCOrder } from '@/types/woocommerce';
import {
  Loader2,
  RefreshCw,
  ShoppingCart,
  Clock,
  TrendingUp,
  CheckCircle,
  XCircle,
  Package,
  User,
  Calendar,
  MoreVertical,
  Check,
  Filter,
} from 'lucide-react';

type OrderFilter = 'all' | 'pending' | 'processing' | 'on-hold' | 'completed' | 'cancelled';

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string; bgColor: string }> = {
  pending: { label: 'Pending', icon: Clock, color: 'text-yellow-600', bgColor: 'bg-yellow-500/10' },
  processing: { label: 'Processing', icon: TrendingUp, color: 'text-blue-600', bgColor: 'bg-blue-500/10' },
  'on-hold': { label: 'On Hold', icon: Clock, color: 'text-orange-600', bgColor: 'bg-orange-500/10' },
  completed: { label: 'Completed', icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-500/10' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-500/10' },
  refunded: { label: 'Refunded', icon: XCircle, color: 'text-gray-600', bgColor: 'bg-gray-500/10' },
  failed: { label: 'Failed', icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-500/10' },
};

const CHANGEABLE_STATUSES = ['pending', 'processing', 'on-hold', 'completed', 'cancelled'];

export default function Orders() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<WCOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<string[]>(['all']);

  // Status change state
  const [statusMenuOrderId, setStatusMenuOrderId] = useState<number | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);

  async function fetchData() {
    if (!session) {
      setIsLoading(false);
      return;
    }
    try {
      console.log('📦 Fetching orders...');
      const ordersData = await wpAuthedRequest<WCOrder[]>(`/wc/v3/orders?per_page=100`, session);
      console.log('✅ Orders fetched:', ordersData?.length || 0);
      setOrders(ordersData ?? []);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      setOrders([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    if (session) {
      fetchData();
    } else {
      setIsLoading(false);
    }
  }, [session]);

  function handleRefresh() {
    setIsRefreshing(true);
    fetchData();
  }

  async function handleStatusChange(orderId: number, newStatus: string) {
    if (!session) return;

    setUpdatingOrderId(orderId);
    setStatusMenuOrderId(null);

    try {
      const updated = await wpAuthedRequest<WCOrder>(`/wc/v3/orders/${orderId}`, session, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });

      console.log(`✅ Order #${orderId} status changed to ${newStatus}`);

      // Update local state immediately
      setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, status: updated.status } : order)));

      // Purge caches
      await Promise.all([purgeLiteSpeedCache(session), purgeWooCommerceTransients(session)]);

      emitOrderUpdate();
    } catch (error) {
      console.error('Failed to update order status:', error);
      alert('Failed to update order status. Please try again.');
    } finally {
      setUpdatingOrderId(null);
    }
  }

  // Calculate counts for each filter
  const orderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: orders.length,
      pending: 0,
      processing: 0,
      'on-hold': 0,
      completed: 0,
      cancelled: 0,
    };
    orders.forEach((order) => {
      if (order.status in counts) {
        counts[order.status]++;
      }
    });
    return counts;
  }, [orders]);

  // Build filter options with counts
  const filterOptions: FilterOption[] = useMemo(
    () => [
      { key: 'all', label: 'All Orders', icon: Filter, count: orderCounts.all },
      { key: 'pending', label: 'Pending', icon: Clock, count: orderCounts.pending },
      { key: 'processing', label: 'Processing', icon: TrendingUp, count: orderCounts.processing },
      { key: 'on-hold', label: 'On Hold', icon: Clock, count: orderCounts['on-hold'] },
      { key: 'completed', label: 'Completed', icon: CheckCircle, count: orderCounts.completed },
      { key: 'cancelled', label: 'Cancelled', icon: XCircle, count: orderCounts.cancelled },
    ],
    [orderCounts]
  );

  // Filter orders based on selected filters
  const filteredOrders = useMemo(() => {
    if (selectedFilters.includes('all') || selectedFilters.length === 0) {
      return orders;
    }
    return orders.filter((order) => selectedFilters.includes(order.status));
  }, [orders, selectedFilters]);

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatCurrency(amount: string, currency: string) {
    return `${currency} ${parseFloat(amount).toLocaleString()}`;
  }

  // Close status menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-status-menu]')) {
        setStatusMenuOrderId(null);
      }
    }

    if (statusMenuOrderId !== null) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [statusMenuOrderId]);

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border safe-area-top">
        <div className="flex items-center justify-between px-4 h-14">
          <div>
            <h1 className="font-semibold text-foreground">Orders</h1>
            <p className="text-xs text-muted-foreground">{orders.length} total orders</p>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button onClick={handleRefresh} disabled={isRefreshing} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <RefreshCw className={`w-5 h-5 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filter Dropdown */}
        <div className="px-4 pb-3">
          <FilterDropdown options={filterOptions} selected={selectedFilters} onChange={setSelectedFilters} placeholder="Filter orders" multiple={true} />
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-12">
          <ShoppingCart className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">{selectedFilters.includes('all') ? 'No orders yet' : 'No orders match the selected filters'}</p>
        </div>
      ) : (
        <main className="p-4 flex flex-col gap-3">
          {filteredOrders.map((order) => {
            const isUpdating = updatingOrderId === order.id;
            const isMenuOpen = statusMenuOrderId === order.id;
            const statusConfig = STATUS_CONFIG[order.status];
            const StatusIcon = statusConfig?.icon || Clock;

            return (
              <div key={order.id} className={`rounded-2xl bg-card border border-border p-4 ${isUpdating ? 'opacity-50' : ''}`}>
                {/* Order Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">#{order.id}</p>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig?.bgColor || 'bg-gray-500/10'} ${statusConfig?.color || 'text-gray-600'}`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig?.label || order.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                      <User className="w-3.5 h-3.5" />
                      <span>
                        {order.billing.first_name} {order.billing.last_name}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground">{formatCurrency(order.total, order.currency)}</p>

                    {/* Status Change Menu */}
                    <div className="relative" data-status-menu>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatusMenuOrderId(isMenuOpen ? null : order.id);
                        }}
                        disabled={isUpdating}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                      >
                        {isUpdating ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <MoreVertical className="w-4 h-4 text-muted-foreground" />}
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                          <div className="p-2 border-b border-border">
                            <p className="text-xs font-medium text-muted-foreground px-2">Change Status</p>
                          </div>
                          <div className="p-1">
                            {CHANGEABLE_STATUSES.map((statusSlug) => {
                              const config = STATUS_CONFIG[statusSlug];
                              const isCurrentStatus = order.status === statusSlug;
                              const OptionIcon = config?.icon || Clock;

                              return (
                                <button
                                  key={statusSlug}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isCurrentStatus) {
                                      handleStatusChange(order.id, statusSlug);
                                    }
                                  }}
                                  disabled={isCurrentStatus}
                                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                                    isCurrentStatus ? 'bg-muted text-foreground cursor-default' : 'hover:bg-muted text-foreground'
                                  }`}
                                >
                                  <OptionIcon className={`w-4 h-4 ${config?.color || 'text-gray-600'}`} />
                                  <span className="flex-1 text-left">{config?.label || statusSlug}</span>
                                  {isCurrentStatus && <Check className="w-4 h-4 text-primary" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Order Meta */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(order.date_created)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" />
                    {order.line_items.length} item{order.line_items.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Line Items */}
                <div className="flex flex-col gap-1 pt-3 border-t border-border">
                  {order.line_items.slice(0, 2).map((item) => (
                    <div key={item.id} className="text-sm text-muted-foreground flex items-center justify-between">
                      <span className="truncate flex-1 mr-2">
                        {item.quantity}× {item.name}
                      </span>
                      <span>
                        {order.currency} {parseFloat(item.total).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {order.line_items.length > 2 && <p className="text-sm text-muted-foreground">+{order.line_items.length - 2} more items</p>}
                </div>
              </div>
            );
          })}
        </main>
      )}

      <BottomNav />
    </div>
  );
}
