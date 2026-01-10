import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

export type WeekOption = 'last_completed' | 'current' | 'two_weeks_ago' | 'custom';

interface WeekSelectorProps {
  selectedWeek: WeekOption;
  onWeekChange: (week: WeekOption) => void;
  weekBounds: { start: Date; end: Date };
  onCustomWeekChange?: (start: Date, end: Date) => void;
}

const weekOptions: Array<{ value: WeekOption; label: string; shortLabel: string }> = [
  { value: 'last_completed', label: 'Last Week', shortLabel: 'Last' },
  { value: 'current', label: 'This Week', shortLabel: 'This' },
  { value: 'two_weeks_ago', label: '2 Wks Ago', shortLabel: '2 Ago' },
];

// Get Monday of the week containing the given date
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Get week bounds based on selection
export function getWeekBounds(option: WeekOption, customStart?: Date): { start: Date; end: Date } {
  const now = new Date();
  const currentWeekStart = getWeekStart(now);

  switch (option) {
    case 'last_completed': {
      const start = new Date(currentWeekStart);
      start.setDate(start.getDate() - 7);
      return { start, end: currentWeekStart };
    }
    case 'current': {
      const end = new Date(currentWeekStart);
      end.setDate(end.getDate() + 7);
      return { start: currentWeekStart, end };
    }
    case 'two_weeks_ago': {
      const start = new Date(currentWeekStart);
      start.setDate(start.getDate() - 14);
      const end = new Date(currentWeekStart);
      end.setDate(end.getDate() - 7);
      return { start, end };
    }
    case 'custom': {
      if (customStart) {
        const start = getWeekStart(customStart);
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        return { start, end };
      }
      // Default to last completed if no custom date
      const start = new Date(currentWeekStart);
      start.setDate(start.getDate() - 7);
      return { start, end: currentWeekStart };
    }
  }
}

// Format date range for display
function formatDateRange(start: Date, end: Date): string {
  const endDisplay = new Date(end);
  endDisplay.setDate(endDisplay.getDate() - 1); // Show inclusive end date

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = endDisplay.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endDay = endDisplay.getDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

// Format week label for tooltip display
export function formatWeekLabel(start: Date, end: Date): string {
  const endDisplay = new Date(end);
  endDisplay.setDate(endDisplay.getDate() - 1);

  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDisplay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function WeekSelector({
  selectedWeek,
  onWeekChange,
  weekBounds,
  onCustomWeekChange
}: WeekSelectorProps) {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [isHovered, setIsHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);

  // Staggered entrance animation
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCustomPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get weeks for the picker month
  const getWeeksInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const weeks: Date[] = [];
    let current = getWeekStart(firstDay);

    // Include weeks that have any days in the month
    while (current <= lastDay) {
      weeks.push(new Date(current));
      current = new Date(current);
      current.setDate(current.getDate() + 7);
    }

    return weeks;
  };

  const handleWeekSelect = (weekStart: Date) => {
    if (onCustomWeekChange) {
      const end = new Date(weekStart);
      end.setDate(end.getDate() + 7);
      onCustomWeekChange(weekStart, end);
    }
    onWeekChange('custom');
    setShowCustomPicker(false);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setPickerMonth(prev => {
      const newMonth = new Date(prev);
      newMonth.setMonth(newMonth.getMonth() + (direction === 'next' ? 1 : -1));
      return newMonth;
    });
  };

  // Get active index for slider
  const activeIndex = weekOptions.findIndex(opt => opt.value === selectedWeek);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Main selector container */}
      <div
        className={`
          flex items-center gap-1.5 bg-white/95 backdrop-blur-md
          border border-gray-200/60 rounded-2xl px-3 py-2
          shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]
          transition-all duration-300 ease-out
          ${isHovered ? 'shadow-[0_4px_16px_-4px_rgba(0,0,0,0.12)] border-gray-300/60' : ''}
          ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}
        `}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >

        {/* Calendar icon with subtle pulse on hover */}
        <Calendar
          size={14}
          className={`
            text-gray-400 mr-0.5 flex-shrink-0
            transition-all duration-300
            ${isHovered ? 'text-indigo-400' : ''}
          `}
        />

        {/* Week option pills with sliding background */}
        <div className="relative flex items-center gap-0.5" ref={pillsRef}>
          {/* Sliding active background */}
          {activeIndex >= 0 && (
            <div
              className="absolute h-[26px] bg-gradient-to-r from-indigo-500 to-indigo-600
                rounded-lg shadow-[0_2px_8px_-2px_rgba(99,102,241,0.5)]
                transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
              style={{
                width: '44px',
                left: `${activeIndex * 48 + 2}px`,
              }}
            />
          )}

          {weekOptions.map((option, index) => {
            const isActive = selectedWeek === option.value;
            return (
              <button
                key={option.value}
                onClick={() => onWeekChange(option.value)}
                style={{
                  transitionDelay: mounted ? '0ms' : `${index * 50 + 100}ms`,
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? 'translateY(0)' : 'translateY(4px)',
                }}
                className={`
                  relative z-10 px-2.5 py-1 text-[11px] font-semibold rounded-lg
                  transition-all duration-200 ease-out
                  active:scale-95
                  ${isActive
                    ? 'text-white'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/80'
                  }
                `}
              >
                {option.shortLabel}
              </button>
            );
          })}
        </div>

        {/* Custom/More button */}
        <button
          onClick={() => {
            setShowCustomPicker(!showCustomPicker);
            setPickerMonth(weekBounds.start);
          }}
          className={`
            p-1.5 rounded-lg transition-all duration-200 ease-out
            active:scale-90
            ${showCustomPicker
              ? 'bg-indigo-100 text-indigo-600'
              : selectedWeek === 'custom'
                ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-[0_2px_8px_-2px_rgba(99,102,241,0.5)]'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }
          `}
          title="Pick custom week"
        >
          <ChevronDown
            size={12}
            className={`transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${showCustomPicker ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Divider with fade */}
        <div className="w-px h-4 bg-gradient-to-b from-transparent via-gray-200 to-transparent mx-1" />

        {/* Date range display with subtle animation */}
        <span
          className={`
            text-[10px] text-gray-500 font-medium tracking-tight whitespace-nowrap
            transition-all duration-300
            ${isHovered ? 'text-gray-600' : ''}
          `}
        >
          {formatDateRange(weekBounds.start, weekBounds.end)}
        </span>
      </div>

      {/* Custom week picker dropdown */}
      {showCustomPicker && (
        <div
          className="absolute right-0 top-full mt-2 z-50
            bg-white/98 backdrop-blur-lg rounded-2xl
            shadow-[0_8px_32px_-8px_rgba(0,0,0,0.15)]
            border border-gray-200/60
            p-4 min-w-[280px]
            animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200 ease-out"
        >
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-2 rounded-xl hover:bg-gray-100 transition-all duration-200 active:scale-90"
            >
              <ChevronLeft size={16} className="text-gray-500" />
            </button>
            <span className="text-sm font-semibold text-gray-800 tracking-tight">
              {pickerMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => navigateMonth('next')}
              className="p-2 rounded-xl hover:bg-gray-100 transition-all duration-200 active:scale-90"
            >
              <ChevronRight size={16} className="text-gray-500" />
            </button>
          </div>

          {/* Week list */}
          <div className="space-y-1.5">
            {getWeeksInMonth(pickerMonth).map((weekStart, idx) => {
              const weekEnd = new Date(weekStart);
              weekEnd.setDate(weekEnd.getDate() + 6);

              const isSelected = selectedWeek === 'custom' &&
                weekStart.getTime() === getWeekStart(weekBounds.start).getTime();

              const isFuture = weekStart > new Date();

              return (
                <button
                  key={idx}
                  onClick={() => !isFuture && handleWeekSelect(weekStart)}
                  disabled={isFuture}
                  style={{ animationDelay: `${idx * 30}ms` }}
                  className={`
                    w-full px-3.5 py-2.5 rounded-xl text-left text-xs
                    transition-all duration-200 ease-out
                    animate-in fade-in slide-in-from-left-1
                    ${isSelected
                      ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-[0_2px_8px_-2px_rgba(99,102,241,0.5)]'
                      : isFuture
                        ? 'text-gray-300 cursor-not-allowed opacity-50'
                        : 'hover:bg-gray-50 text-gray-600 hover:text-gray-900 hover:translate-x-1'
                    }
                  `}
                >
                  <span className="font-semibold">
                    {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <span className={isSelected ? 'text-indigo-200' : 'text-gray-400'}> — </span>
                  <span className={isSelected ? 'text-indigo-100' : 'text-gray-500'}>
                    {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick actions */}
          <div className="mt-4 pt-3 border-t border-gray-100/80">
            <button
              onClick={() => {
                onWeekChange('last_completed');
                setShowCustomPicker(false);
              }}
              className="w-full px-3 py-2 text-[11px] font-medium text-gray-500
                hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all duration-200"
            >
              Reset to Last Week
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default WeekSelector;
