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
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Main selector container */}
      <div className="flex items-center gap-1 bg-white/90 backdrop-blur-sm
        border border-gray-200/80 rounded-xl px-2 py-1.5 shadow-sm
        hover:shadow-md transition-shadow duration-200">

        {/* Calendar icon */}
        <Calendar size={14} className="text-gray-400 mr-0.5 flex-shrink-0" />

        {/* Week option pills */}
        {weekOptions.map((option, index) => {
          const isActive = selectedWeek === option.value;
          return (
            <button
              key={option.value}
              onClick={() => onWeekChange(option.value)}
              style={{
                transitionDelay: `${index * 30}ms`,
              }}
              className={`
                px-2 py-1 text-[11px] font-medium rounded-lg
                transition-all duration-200 ease-out
                hover:-translate-y-0.5
                ${isActive
                  ? 'bg-indigo-500 text-white shadow-sm shadow-indigo-500/30 scale-100'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 scale-[0.98]'
                }
              `}
            >
              {option.shortLabel}
            </button>
          );
        })}

        {/* Custom/More button */}
        <button
          onClick={() => {
            setShowCustomPicker(!showCustomPicker);
            setPickerMonth(weekBounds.start);
          }}
          className={`
            p-1 rounded-lg transition-all duration-200 ease-out
            hover:-translate-y-0.5
            ${selectedWeek === 'custom'
              ? 'bg-indigo-500 text-white shadow-sm shadow-indigo-500/30'
              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }
          `}
          title="Pick custom week"
        >
          <ChevronDown
            size={12}
            className={`transition-transform duration-200 ${showCustomPicker ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Divider */}
        <div className="w-px h-4 bg-gray-200 mx-0.5" />

        {/* Date range display */}
        <span className="text-[10px] text-gray-500 font-medium tracking-tight whitespace-nowrap">
          {formatDateRange(weekBounds.start, weekBounds.end)}
        </span>
      </div>

      {/* Custom week picker dropdown */}
      {showCustomPicker && (
        <div
          className="absolute right-0 top-full mt-2 z-50
            bg-white rounded-xl shadow-xl border border-gray-200
            p-3 min-w-[260px]
            animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft size={14} className="text-gray-500" />
            </button>
            <span className="text-sm font-semibold text-gray-700">
              {pickerMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => navigateMonth('next')}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronRight size={14} className="text-gray-500" />
            </button>
          </div>

          {/* Week list */}
          <div className="space-y-1">
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
                  className={`
                    w-full px-3 py-2 rounded-lg text-left text-xs
                    transition-all duration-150 ease-out
                    ${isSelected
                      ? 'bg-indigo-500 text-white shadow-sm'
                      : isFuture
                        ? 'text-gray-300 cursor-not-allowed'
                        : 'hover:bg-gray-50 text-gray-600 hover:text-gray-900'
                    }
                  `}
                >
                  <span className="font-medium">
                    {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <span className={isSelected ? 'text-indigo-100' : 'text-gray-400'}> - </span>
                  <span className={isSelected ? 'text-indigo-100' : 'text-gray-500'}>
                    {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick actions */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onWeekChange('last_completed');
                  setShowCustomPicker(false);
                }}
                className="flex-1 px-2 py-1.5 text-[10px] font-medium text-gray-500
                  hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Reset to Last Week
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WeekSelector;
