import { useState } from 'react';
import { X, Plus, Tag } from 'lucide-react';
import { WCAttribute } from '@/types/woocommerce';
import { useAttributeTerms } from '@/hooks/use-product-options';

export interface AttributeData {
  id: number;
  name: string;
  options: string[];
}

interface AttributesUIProps {
  attributes: AttributeData[];
  onChange: (attrs: AttributeData[]) => void;
  globalAttributes: WCAttribute[];
}

export function AttributesUI({ attributes, onChange, globalAttributes }: AttributesUIProps) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
        <Tag className="w-4 h-4" />
        Product Attributes
      </h3>
      
      <div className="space-y-3">
        {attributes.map((attr, index) => (
          <AttributeItem
            key={index}
            index={index}
            attr={attr}
            globalAttributes={globalAttributes}
            onChange={(updated) => {
              const newAttrs = [...attributes];
              newAttrs[index] = updated;
              onChange(newAttrs);
            }}
            onRemove={() => {
              const newAttrs = [...attributes];
              newAttrs.splice(index, 1);
              onChange(newAttrs);
            }}
          />
        ))}
        
        <button
          type="button"
          onClick={() => onChange([...attributes, { id: 0, name: '', options: [] }])}
          className="w-full py-2 border-2 border-dashed border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Attribute
        </button>
      </div>
    </div>
  );
}

function AttributeItem({ 
  attr, 
  index, 
  onChange, 
  onRemove, 
  globalAttributes 
}: { 
  attr: AttributeData;
  index: number;
  onChange: (attr: AttributeData) => void;
  onRemove: () => void;
  globalAttributes: WCAttribute[];
}) {
  const { terms, isLoading } = useAttributeTerms(attr.id > 0 ? attr.id : null);
  const [optionInput, setOptionInput] = useState('');
  
  const [isNameDropdownOpen, setIsNameDropdownOpen] = useState(false);
  const [isOptionDropdownOpen, setIsOptionDropdownOpen] = useState(false);

  function handleNameChange(name: string) {
    const globalMatch = globalAttributes.find(ga => ga.name.toLowerCase() === name.toLowerCase());
    onChange({
      ...attr,
      name,
      id: globalMatch ? globalMatch.id : 0
    });
  }

  function addOption(e?: React.KeyboardEvent | React.FocusEvent) {
    if (e && 'key' in e && e.key !== 'Enter' && e.key !== ',') return;
    if (e) e.preventDefault();
    
    const trimmed = optionInput.trim();
    if (!trimmed) return;
    
    // Split by comma in case user pastes comma separated list
    const newOptions = trimmed.split(',').map(s => s.trim()).filter(s => s && !attr.options.includes(s));
    
    if (newOptions.length > 0) {
      onChange({ ...attr, options: [...attr.options, ...newOptions] });
    }
    setOptionInput('');
    setIsOptionDropdownOpen(false);
  }

  function removeOption(optToRemove: string) {
    onChange({ ...attr, options: attr.options.filter(o => o !== optToRemove) });
  }

  const filteredAttributes = globalAttributes.filter(ga => 
    ga.name.toLowerCase().includes(attr.name.toLowerCase()) && ga.name.toLowerCase() !== attr.name.toLowerCase()
  );

  const filteredTerms = terms.filter(t => 
    t.name.toLowerCase().includes(optionInput.toLowerCase()) && !attr.options.includes(t.name)
  );

  return (
    <div className="p-3 border border-border rounded-xl bg-muted relative">
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-red-500 z-20"
      >
        <X className="w-4 h-4" />
      </button>
      
      <div className="mb-4 relative pr-6">
        <label className="block text-xs font-medium text-foreground mb-1">Name</label>
        <input
          type="text"
          value={attr.name}
          onChange={(e) => {
            handleNameChange(e.target.value);
            setIsNameDropdownOpen(true);
          }}
          onFocus={() => setIsNameDropdownOpen(true)}
          onBlur={() => setTimeout(() => setIsNameDropdownOpen(false), 200)}
          placeholder="e.g. Size or Color"
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none"
        />
        {isNameDropdownOpen && filteredAttributes.length > 0 && (
          <ul className="absolute z-20 w-full bg-background border border-border rounded-lg mt-1 max-h-40 overflow-auto shadow-lg">
            {filteredAttributes.map(ga => (
              <li
                key={ga.id}
                onClick={() => {
                  onChange({ ...attr, name: ga.name, id: ga.id });
                  setIsNameDropdownOpen(false);
                }}
                className="px-3 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors"
              >
                {ga.name}
              </li>
            ))}
          </ul>
        )}
        {attr.id > 0 && (
          <p className="text-[10px] text-green-600 mt-1">✓ Global Attribute linked</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Options (Press Enter to add)</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {attr.options.map(opt => (
            <span key={opt} className="inline-flex items-center gap-1 px-2 py-1 bg-background border border-border rounded-lg text-xs text-foreground">
              {opt}
              <button type="button" onClick={() => removeOption(opt)} className="text-muted-foreground hover:text-red-500">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="relative">
          <input
            type="text"
            value={optionInput}
            onChange={(e) => {
              setOptionInput(e.target.value);
              setIsOptionDropdownOpen(true);
            }}
            onFocus={() => setIsOptionDropdownOpen(true)}
            onBlur={(e) => addOption(e)}
            onKeyDown={addOption}
            placeholder="Type value and press Enter..."
            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none"
            disabled={isLoading}
          />
          {isOptionDropdownOpen && filteredTerms.length > 0 && (
            <ul className="absolute z-20 w-full bg-background border border-border rounded-lg mt-1 max-h-40 overflow-auto shadow-lg">
              {filteredTerms.map(t => (
                <li
                  key={t.id}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input onBlur from firing first
                    onChange({ ...attr, options: [...attr.options, t.name] });
                    setOptionInput('');
                    setIsOptionDropdownOpen(false);
                  }}
                  className="px-3 py-2 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors"
                >
                  {t.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
