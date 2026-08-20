import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { wpAuthedRequest } from '@/lib/wp-authed-request';
import { onProductUpdate } from '@/lib/product-events';
import { BottomNav } from '@/components/BottomNav';
import { QuickEditModal } from '@/components/QuickEditModal';
import { AddProductModal } from '@/components/AddProductModal';
import { SwipeableItem } from '@/components/SwipeableItem';
import { FilterDropdown, FilterOption } from '@/components/FilterDropdown';
import { ThemeToggle } from '@/components/ThemeToggle';
import { WCProduct } from '@/types/woocommerce';
import { Search, Filter, Loader2, Package, PackageX, AlertTriangle, Check, RefreshCw, Plus, Percent, Layers } from 'lucide-react';

type StockFilter = 'all' | 'instock' | 'low' | 'outofstock' | 'onsale' | 'variable';

export default function Stock() {
  const { session } = useAuth();
  const [products, setProducts] = useState<WCProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<string[]>(['all']);
  const [editingProduct, setEditingProduct] = useState<WCProduct | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  async function fetchProducts() {
    if (!session) {
      setIsLoading(false);
      return;
    }
    try {
      console.log('📦 Fetching products...');
      const data = await wpAuthedRequest<WCProduct[]>(`/wc/v3/products?per_page=100`, session);
      console.log('✅ Products fetched:', data?.length || 0);
      setProducts(data ?? []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
      setProducts([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    if (session) {
      fetchProducts();
    } else {
      setIsLoading(false);
    }
  }, [session]);

  // Listen for product updates from Dashboard (End Discounts)
  useEffect(() => {
    const unsubscribe = onProductUpdate((source) => {
      console.log(`📩 Product update received from ${source}, refreshing Stock...`);
      // If the update came from a modal on this page, we already updated local state!
      // Fetching immediately might get stale cached data.
      if (source === 'quick-edit' || source === 'add-product') {
        return;
      }
      
      if (session) {
        // Add a small delay to allow server cache to clear
        setTimeout(() => fetchProducts(), 2000);
      }
    });
    return unsubscribe;
  }, [session]);

  function handleRefresh() {
    setIsRefreshing(true);
    fetchProducts();
  }

  function handleProductUpdated(updatedProduct: WCProduct) {
    setProducts((prev) => prev.map((p) => (p.id === updatedProduct.id ? updatedProduct : p)));
  }

  function handleProductAdded(product: WCProduct) {
    setProducts((prev) => [product, ...prev]);
  }

  async function handleDeleteProduct(id: number) {
    if (!session || !confirm('Are you sure you want to delete this product?')) return;
    
    // Optimistic UI update
    const previousProducts = [...products];
    setProducts(prev => prev.filter(p => p.id !== id));
    
    try {
      await wpAuthedRequest(`/wc/v3/products/${id}`, session, {
        method: 'DELETE'
      });
    } catch (error) {
      console.error('Failed to delete product', error);
      setProducts(previousProducts);
      alert('Failed to delete product.');
    }
  }

  // Calculate counts for each filter
  const stockCounts = useMemo(() => {
    const counts = { all: products.length, instock: 0, low: 0, outofstock: 0, onsale: 0, variable: 0 };
    products.forEach((p) => {
      if (p.stock_status === 'instock') counts.instock++;
      if (p.stock_status === 'outofstock') counts.outofstock++;
      if (p.type === 'variable') counts.variable++;
      if (p.manage_stock && p.stock_quantity !== null && p.stock_quantity <= 5 && p.stock_quantity > 0) {
        counts.low++;
      }
      // Check for valid sale price (not empty, not "0")
      if (p.sale_price && p.sale_price !== '' && p.sale_price !== '0') {
        const salePrice = parseFloat(p.sale_price);
        if (!isNaN(salePrice) && salePrice > 0) {
          counts.onsale++;
        }
      }
    });
    return counts;
  }, [products]);

  // Build filter options with counts
  const filterOptions: FilterOption[] = useMemo(
    () => [
      { key: 'all', label: 'All Products', icon: Filter, count: stockCounts.all },
      { key: 'instock', label: 'In Stock', icon: Check, count: stockCounts.instock },
      { key: 'low', label: 'Low Stock', icon: AlertTriangle, count: stockCounts.low },
      { key: 'outofstock', label: 'Out of Stock', icon: PackageX, count: stockCounts.outofstock },
      { key: 'onsale', label: 'On Sale', icon: Percent, count: stockCounts.onsale },
      { key: 'variable', label: 'Variable Products', icon: Layers, count: stockCounts.variable },
    ],
    [stockCounts]
  );

  // Filter products based on selected filters and search
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // Search filter
      if (search && !product.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }

      // If "all" is selected or no filters, show all
      if (selectedFilters.includes('all') || selectedFilters.length === 0) {
        return true;
      }

      // Check each selected filter
      for (const filter of selectedFilters) {
        if (filter === 'instock' && product.stock_status === 'instock') return true;
        if (filter === 'outofstock' && product.stock_status === 'outofstock') return true;
        if (filter === 'variable' && product.type === 'variable') return true;
        if (filter === 'low') {
          if (product.manage_stock && product.stock_quantity !== null && product.stock_quantity <= 5 && product.stock_quantity > 0) {
            return true;
          }
        }
        if (filter === 'onsale') {
          if (product.sale_price && product.sale_price !== '' && product.sale_price !== '0') {
            const salePrice = parseFloat(product.sale_price);
            if (!isNaN(salePrice) && salePrice > 0) return true;
          }
        }
      }

      return false;
    });
  }, [products, search, selectedFilters]);

  function getStockBadge(product: WCProduct) {
    if (product.stock_status === 'outofstock') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-600">
          <PackageX className="w-3 h-3" /> Out
        </span>
      );
    }
    if (product.manage_stock && product.stock_quantity !== null && product.stock_quantity <= 5) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-600">
          <AlertTriangle className="w-3 h-3" /> {product.stock_quantity}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-600">
        <Check className="w-3 h-3" />
        {product.manage_stock && product.stock_quantity !== null ? product.stock_quantity : 'In Stock'}
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border safe-area-top">
        <div className="flex items-center justify-between px-4 h-14">
          <h1 className="font-semibold text-foreground">Stock Levels</h1>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button onClick={handleRefresh} disabled={isRefreshing} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <RefreshCw className={`w-5 h-5 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search and Filter Row */}
        <div className="px-4 pb-3 flex gap-2">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* Filter Dropdown */}
          <FilterDropdown options={filterOptions} selected={selectedFilters} onChange={setSelectedFilters} placeholder="Filter" multiple={true} />
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <main className="p-4">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No products found</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredProducts.map((product) => (
                <SwipeableItem key={product.id} onDelete={() => handleDeleteProduct(product.id)}>
                  <button
                    onClick={() => setEditingProduct(product)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border text-left hover:border-primary/50 transition-colors"
                  >
                    <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                      {product.images?.[0]?.src ? (
                        <img src={product.images[0].src} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{product.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-muted-foreground">
                          {product.type === 'variable' ? (
                            <>PKR {product.price || product.regular_price || '0'}</>
                          ) : product.sale_price ? (
                            <>
                              <span className="line-through">PKR {product.regular_price}</span>{' '}
                              <span className="text-foreground font-medium">PKR {product.sale_price}</span>
                            </>
                          ) : (
                            <>PKR {product.regular_price || product.price || '0'}</>
                          )}
                        </span>
                      </div>
                    </div>
                    {getStockBadge(product)}
                  </button>
                </SwipeableItem>
              ))}
            </div>
          )}
        </main>
      )}

      {editingProduct && <QuickEditModal product={editingProduct} onClose={() => setEditingProduct(null)} onSave={handleProductUpdated} />}

      {showAddModal && <AddProductModal onClose={() => setShowAddModal(false)} onSave={handleProductAdded} />}

      {/* Floating Add Button */}
      <button
        onClick={() => setShowAddModal(true)}
        className="fixed right-4 bottom-24 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-105 flex items-center justify-center z-40"
        aria-label="Add product"
      >
        <Plus className="w-6 h-6" />
      </button>

      <BottomNav />
    </div>
  );
}
