import { useLocation, useNavigate } from 'react-router';
import { LayoutDashboard, Package, ShoppingCart } from 'lucide-react';

const navItems = [
{ path: '/dashboard', label: 'Home', icon: LayoutDashboard },
{ path: '/stock', label: 'Stock', icon: Package },
{ path: '/orders', label: 'Orders', icon: ShoppingCart }];


export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav data-ev-id="ev_42c9f3d63b" className="fixed bottom-0 left-0 right-0 bg-card border-t border-border safe-area-bottom">
      <div data-ev-id="ev_3348ad660e" className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path;
          return (
            <button data-ev-id="ev_517f006845"
            key={path}
            onClick={() => navigate(path)}
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
            isActive ?
            'text-primary' :
            'text-muted-foreground hover:text-foreground'}`
            }>

              <Icon className="w-5 h-5" />
              <span data-ev-id="ev_7a0e65c704" className="text-xs font-medium">{label}</span>
            </button>);

        })}
      </div>
    </nav>);

}
