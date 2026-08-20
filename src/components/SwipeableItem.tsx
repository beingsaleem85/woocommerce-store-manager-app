import { useState, useRef, ReactNode, TouchEvent } from 'react';
import { Trash2 } from 'lucide-react';

interface SwipeableItemProps {
  children: ReactNode;
  onDelete: () => void;
}

export function SwipeableItem({ children, onDelete }: SwipeableItemProps) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const currentX = useRef(0);
  const isSwiping = useRef(false);

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    startX.current = e.touches[0].clientX;
    isSwiping.current = true;
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (!isSwiping.current) return;
    currentX.current = e.touches[0].clientX;
    const diff = currentX.current - startX.current;
    
    // Only allow left swipe
    if (diff < 0) {
      setOffset(Math.max(diff, -100)); // Max swipe distance 100px
    } else {
      setOffset(0);
    }
  };

  const handleTouchEnd = () => {
    isSwiping.current = false;
    if (offset < -60) {
      // Trigger delete if swiped past threshold
      onDelete();
      // Snap open momentarily then reset, or just reset depending on UX
      setOffset(0);
    } else {
      // Snap back
      setOffset(0);
    }
  };

  return (
    <div className="relative overflow-hidden w-full rounded-xl group">
      {/* Background Delete Action */}
      <div className="absolute top-0 right-0 h-full w-24 bg-red-500/10 flex items-center justify-end pr-5 rounded-xl border border-red-500/20">
        <Trash2 className="w-5 h-5 text-red-500" />
      </div>
      
      {/* Foreground Content */}
      <div 
        className="relative transition-transform bg-background w-full"
        style={{ 
          transform: `translateX(${offset}px)`,
          transitionDuration: isSwiping.current ? '0ms' : '300ms'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
