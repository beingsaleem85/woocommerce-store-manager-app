import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

export interface FilterOption {
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  count?: number;
}

interface FilterDropdownProps {
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  multiple?: boolean;
}

export function FilterDropdown({
  options,
  selected,
  onChange,
  placeholder = 'Filter',
  multiple = true,
}: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isOpen]);

  function toggleOption(key: string) {
    if (multiple) {
      if (key === 'all') {
        // If selecting "all", clear other selections
        onChange(['all']);
      } else {
        // Remove "all" if selecting specific filters
        const withoutAll = selected.filter((s) => s !== 'all');

        if (selected.includes(key)) {
          // Remove this filter
          const newSelected = withoutAll.filter((s) => s !== key);
          // If nothing selected, default to "all"
          onChange(newSelected.length === 0 ? ['all'] : newSelected);
        } else {
          // Add this filter
          onChange([...withoutAll, key]);
        }
      }
    } else {
      // Single select mode
      onChange([key]);
      setIsOpen(false);
    }
  }

  function clearFilters() {
    onChange(['all']);
  }

  // Get display text for button
  const getButtonText = () => {
    if (selected.length === 0 || (selected.length === 1 && selected[0] === 'all')) {
      return placeholder;
    }

    if (selected.length === 1) {
      const option = options.find((o) => o.key === selected[0]);
      return option?.label || selected[0];
    }

    return `${selected.length} filters`;
  };

  const hasActiveFilters = selected.length > 0 && !(selected.length === 1 && selected[0] === 'all');

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
          hasActiveFilters
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-card border-border text-foreground hover:border-primary/50'
        }`}
      >
        <span>{getButtonText()}</span>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearFilters();
            }}
            className="p-0.5 rounded-full hover:bg-white/20 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-72 max-w-sm bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="p-1 max-h-64 overflow-y-auto">
            {options.map((option) => {
              const isSelected = selected.includes(option.key);
              const Icon = option.icon;

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => toggleOption(option.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isSelected
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {/* Checkbox indicator */}
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-primary border-primary' : 'border-border'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>

                  {/* Icon */}
                  {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}

                  {/* Label */}
                  <span className="flex-1 text-left">{option.label}</span>

                  {/* Count badge */}
                  {option.count !== undefined && (
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                      {option.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer with clear action */}
          {multiple && hasActiveFilters && (
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={clearFilters}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-1 transition-colors"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
