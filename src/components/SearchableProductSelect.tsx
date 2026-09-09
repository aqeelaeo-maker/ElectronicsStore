import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, X, Check } from 'lucide-react';

export interface ProductItem {
  id: string;
  name: string;
  brand: string;
  category: string;
  modelNumber: string;
  purchasePrice: number;
  salePrice: number;
  stock: number;
}

interface SearchableProductSelectProps {
  products: ProductItem[];
  selectedProductId: string;
  onSelectProduct: (productId: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export const SearchableProductSelect: React.FC<SearchableProductSelectProps> = ({
  products,
  selectedProductId,
  onSelectProduct,
  required = false,
  disabled = false,
  placeholder = 'Type to search or select product...',
  className = ''
}) => {
  const selectedProduct = products.find(p => p.id === selectedProductId);

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Sync search term with selected product when not actively searching
  useEffect(() => {
    if (selectedProduct) {
      setSearchTerm(`${selectedProduct.name} ${selectedProduct.brand ? `(${selectedProduct.brand})` : ''}`);
    } else {
      setSearchTerm('');
    }
  }, [selectedProductId, selectedProduct]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // Reset display text to selected product if closed without choosing
        if (selectedProduct) {
          setSearchTerm(`${selectedProduct.name} ${selectedProduct.brand ? `(${selectedProduct.brand})` : ''}`);
        } else {
          setSearchTerm('');
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedProduct]);

  // Filter products based on search term
  const filteredProducts = products.filter(p => {
    if (!searchTerm.trim()) return true;
    const query = searchTerm.toLowerCase().trim();
    // If search term matches the currently selected product display name, show all products on click
    if (selectedProduct && searchTerm === `${selectedProduct.name} ${selectedProduct.brand ? `(${selectedProduct.brand})` : ''}`) {
      return true;
    }
    return (
      (p.name && p.name.toLowerCase().includes(query)) ||
      (p.brand && p.brand.toLowerCase().includes(query)) ||
      (p.modelNumber && p.modelNumber.toLowerCase().includes(query)) ||
      (p.category && p.category.toLowerCase().includes(query))
    );
  });

  const handleSelect = (productId: string) => {
    onSelectProduct(productId);
    const chosen = products.find(p => p.id === productId);
    if (chosen) {
      setSearchTerm(`${chosen.name} ${chosen.brand ? `(${chosen.brand})` : ''}`);
    }
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectProduct('');
    setSearchTerm('');
    setIsOpen(true);
    setHighlightedIndex(-1);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        return;
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => {
        const next = prev < filteredProducts.length - 1 ? prev + 1 : 0;
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => {
        const next = prev > 0 ? prev - 1 : filteredProducts.length - 1;
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredProducts.length) {
        handleSelect(filteredProducts[highlightedIndex].id);
      } else if (filteredProducts.length > 0) {
        handleSelect(filteredProducts[0].id);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Search Input Box */}
      <div className="relative flex items-center">
        <div className="absolute left-2.5 text-slate-400 pointer-events-none">
          <Search className="w-3.5 h-3.5" />
        </div>

        <input
          ref={inputRef}
          type="text"
          required={required && !selectedProductId}
          disabled={disabled}
          value={searchTerm}
          placeholder={placeholder}
          onFocus={() => {
            setIsOpen(true);
            // Select text on focus for easy replacement
            if (inputRef.current) {
              inputRef.current.select();
            }
          }}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          className="glass-input block w-full rounded-xl py-2 pl-8 pr-14 text-xs font-semibold text-slate-800 bg-white border border-slate-200 focus:border-[#0a382c] transition-all"
        />

        <div className="absolute right-2 flex items-center gap-1">
          {selectedProductId && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors"
              title="Clear selection"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsOpen(!isOpen);
              if (!isOpen && inputRef.current) {
                inputRef.current.focus();
              }
            }}
            className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
            title="Toggle product list"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#0a382c]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Price Display Underneath the Product Selection */}
      <div className="mt-1 px-1">
        {selectedProduct ? (
          <div className="flex items-center justify-between text-xs py-1 px-2.5 rounded-lg bg-emerald-50/90 border border-emerald-200/80 shadow-2xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Price:</span>
              <span className="font-mono font-black text-[#0a382c] text-xs">
                PKR {Number(selectedProduct.salePrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              selectedProduct.stock > 0 
                ? 'bg-white text-emerald-800 border border-emerald-200' 
                : 'bg-rose-100 text-rose-800 border border-rose-200'
            }`}>
              {selectedProduct.stock > 0 ? `${selectedProduct.stock} In Stock` : 'Out of Stock'}
            </span>
          </div>
        ) : (
          <div className="text-[10px] text-slate-400 italic py-0.5 flex items-center justify-between">
            <span>Price: <span className="text-slate-500 font-mono font-semibold">PKR 0.00</span></span>
            <span className="text-slate-400">Type name or brand above</span>
          </div>
        )}
      </div>

      {/* Autocomplete Dropdown List */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            <span>Select Product ({filteredProducts.length})</span>
            <span>Price (PKR)</span>
          </div>

          <ul ref={listRef} className="max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs py-1">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((p, idx) => {
                const isSelected = p.id === selectedProductId;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <li
                    key={p.id}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelect(p.id)}
                    className={`px-3 py-2 cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                      isSelected 
                        ? 'bg-emerald-50/80 text-emerald-950 font-bold' 
                        : isHighlighted 
                        ? 'bg-slate-50 text-slate-900' 
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold truncate text-slate-900">{p.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#0a382c] shrink-0" />}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate flex items-center gap-2 mt-0.5">
                        {p.brand && <span>{p.brand}</span>}
                        {p.modelNumber && <span>• {p.modelNumber}</span>}
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                          p.stock > 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
                        }`}>
                          {p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-slate-900 text-xs">
                        PKR {Number(p.salePrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <span className="text-[10px] text-slate-400">Unit Price</span>
                    </div>
                  </li>
                );
              })
            ) : (
              <li className="px-4 py-4 text-center text-slate-400 text-xs">
                No products found matching "{searchTerm}".
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
