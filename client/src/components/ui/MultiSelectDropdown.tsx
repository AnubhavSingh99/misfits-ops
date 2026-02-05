import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

type IdType = number | string;

interface MultiSelectDropdownProps<T extends IdType = number> {
  label: string;
  options: { id: T; name: string }[];
  selected: T[];
  onChange: (selected: T[]) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  compact?: boolean;
}

export function MultiSelectDropdown<T extends IdType = number>({
  label,
  options,
  selected,
  onChange,
  placeholder,
  icon,
  compact = false,
}: MultiSelectDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter options based on search
  const filteredOptions = options.filter((opt) =>
    opt.name.toLowerCase().includes(search.toLowerCase())
  );

  // Get selected option names for display
  const selectedNames = options
    .filter((opt) => selected.includes(opt.id))
    .map((opt) => opt.name);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Focus search input when opened
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const toggleOption = useCallback(
    (id: T) => {
      if (selected.includes(id)) {
        onChange(selected.filter((s) => s !== id));
      } else {
        onChange([...selected, id]);
      }
    },
    [selected, onChange]
  );

  const selectAll = () => {
    onChange(filteredOptions.map((opt) => opt.id));
  };

  const clearAll = () => {
    onChange([]);
    setSearch('');
  };

  const hasSelection = selected.length > 0;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          group flex items-center gap-1.5
          ${compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'}
          bg-white border rounded-lg
          transition-all duration-200 ease-out
          ${isOpen
            ? 'border-blue-400 ring-2 ring-blue-100 shadow-sm'
            : hasSelection
              ? 'border-blue-200 bg-blue-50/50 hover:border-blue-300'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
          }
        `}
      >
        {icon && (
          <span className={`
            flex-shrink-0 transition-colors duration-200
            ${hasSelection ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'}
          `}>
            {icon}
          </span>
        )}

        <span className={`
          font-medium transition-colors duration-200
          ${hasSelection ? 'text-gray-800' : 'text-gray-600'}
        `}>
          {label}
        </span>

        {hasSelection && (
          <span className="
            flex items-center justify-center
            min-w-[18px] h-[18px] px-1
            text-[10px] font-semibold
            bg-blue-500 text-white
            rounded-full
            animate-in fade-in zoom-in-50 duration-200
          ">
            {selected.length}
          </span>
        )}

        <ChevronDown
          className={`
            w-3.5 h-3.5 ml-0.5
            text-gray-400
            transition-transform duration-200 ease-out
            ${isOpen ? 'rotate-180' : ''}
          `}
        />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="
          absolute top-full left-0 mt-1.5 z-50
          min-w-[220px] max-w-[280px]
          bg-white
          border border-gray-200
          rounded-xl
          shadow-lg shadow-gray-200/50
          animate-in fade-in slide-in-from-top-2 duration-200
          overflow-hidden
        ">
          {/* Search Input */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="
                  w-full pl-8 pr-3 py-1.5
                  text-sm
                  bg-gray-50
                  border border-transparent
                  rounded-lg
                  placeholder:text-gray-400
                  focus:outline-none focus:bg-white focus:border-blue-200 focus:ring-2 focus:ring-blue-50
                  transition-all duration-150
                "
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 bg-gray-50/50">
            <button
              onClick={selectAll}
              className="
                px-2 py-0.5
                text-[11px] font-medium
                text-blue-600 hover:text-blue-700
                hover:bg-blue-50
                rounded
                transition-colors duration-150
              "
            >
              Select all
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={clearAll}
              className="
                px-2 py-0.5
                text-[11px] font-medium
                text-gray-500 hover:text-gray-700
                hover:bg-gray-100
                rounded
                transition-colors duration-150
              "
            >
              Clear
            </button>
            {hasSelection && (
              <span className="ml-auto text-[10px] text-gray-400">
                {selected.length} selected
              </span>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-[200px] overflow-y-auto overscroll-contain">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <p className="text-sm text-gray-400">No matches found</p>
              </div>
            ) : (
              <div className="py-1">
                {filteredOptions.map((option, index) => {
                  const isSelected = selected.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      onClick={() => toggleOption(option.id)}
                      className={`
                        w-full flex items-center gap-2.5 px-3 py-1.5
                        text-left text-sm
                        transition-all duration-100
                        ${isSelected
                          ? 'bg-blue-50/70 text-gray-800'
                          : 'text-gray-600 hover:bg-gray-50'
                        }
                      `}
                      style={{
                        animationDelay: `${index * 15}ms`,
                      }}
                    >
                      {/* Custom Checkbox */}
                      <span className={`
                        flex items-center justify-center
                        w-4 h-4
                        rounded
                        border
                        transition-all duration-150
                        ${isSelected
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-gray-300 bg-white'
                        }
                      `}>
                        {isSelected && (
                          <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                        )}
                      </span>

                      <span className={`
                        flex-1 truncate
                        ${isSelected ? 'font-medium' : ''}
                      `}>
                        {option.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Chips Preview (when items selected) */}
          {hasSelection && selectedNames.length <= 5 && (
            <div className="px-2 py-2 border-t border-gray-100 bg-gray-50/30">
              <div className="flex flex-wrap gap-1">
                {selectedNames.slice(0, 4).map((name) => (
                  <span
                    key={name}
                    className="
                      inline-flex items-center
                      px-1.5 py-0.5
                      text-[10px] font-medium
                      bg-blue-100 text-blue-700
                      rounded
                    "
                  >
                    {name.length > 12 ? name.slice(0, 12) + '...' : name}
                  </span>
                ))}
                {selectedNames.length > 4 && (
                  <span className="text-[10px] text-gray-400 py-0.5">
                    +{selectedNames.length - 4} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MultiSelectDropdown;
