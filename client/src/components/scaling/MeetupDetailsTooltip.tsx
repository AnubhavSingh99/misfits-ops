import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, ChevronDown, TrendingUp, TrendingDown, Minus, AlertTriangle, Calendar, Users, DollarSign, Star, Clock, AlertCircle, Info, Banknote } from 'lucide-react';
import { getWeekBounds, formatWeekLabel, type WeekOption } from './WeekSelector';

interface MeetupDetail {
  event_id: string;
  event_name: string;
  event_date: string;
  capacity: number;
  price: number;
  total_bookings: number;
  waitlist_count: number;
  no_show_count: number;
  revenue: number;
  pending_payment: number;
  matched_target: { id: number; name: string | null } | null;
}

type HealthStatus = 'green' | 'yellow' | 'red' | 'gray';

interface HealthMetric {
  current: number;
  previous: number;
  change: number;
  status: HealthStatus;
}

interface HealthData {
  score: number;
  status: HealthStatus;
  is_new_club: boolean;
  capacity: HealthMetric;
  repeat_rate: HealthMetric;
  rating: HealthMetric;
}

interface SummaryData {
  current: {
    meetups: number;
    bookings: number;
    no_show_pct: number;
    revenue: number;
    pending: number;
    rating: number;
  };
  previous: {
    meetups: number;
    bookings: number;
    no_show_pct: number;
    revenue: number;
    pending: number;
    rating: number;
  };
  change: {
    meetups: number;
    bookings: number;
    no_show_pct: number;
    revenue: number;
    pending: number;
    rating: number;
  };
}

interface MeetupDetailsResponse {
  success: boolean;
  club_id: number;
  meetups: MeetupDetail[];
  summary?: SummaryData;
  l4w_pending_payments?: number;
  total_meetups: number;
  total_revenue: number;
  total_waitlist: number;
  health?: HealthData;
}

interface MeetupDetailsTooltipProps {
  clubId: number;
  clubName: string;
  currentMeetups: number;
  currentRevenue: number;
  children: React.ReactNode;
  weekLabel?: string;
  weekStart?: string;
  weekEnd?: string;
}

// Format currency in compact form
const formatCurrency = (value: number): string => {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${Math.round(value)}`;
};

// Format date to readable format
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
};

// Truncate text with ellipsis
const truncateName = (name: string, maxLen: number = 30): string => {
  if (name.length <= maxLen) return name;
  return name.substring(0, maxLen - 1) + '…';
};

// Format date as YYYY-MM-DD in local timezone
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Week options for dropdown
type ExtendedWeekOption = WeekOption | 'three_weeks_ago' | 'four_weeks_ago';

const weekOptions: Array<{ value: ExtendedWeekOption; label: string }> = [
  { value: 'last_completed', label: 'Last Week' },
  { value: 'current', label: 'This Week' },
  { value: 'two_weeks_ago', label: '2 Wks Ago' },
  { value: 'three_weeks_ago', label: '3 Wks Ago' },
  { value: 'four_weeks_ago', label: '4 Wks Ago' },
];

function getExtendedWeekBounds(option: ExtendedWeekOption): { start: Date; end: Date } {
  if (option === 'three_weeks_ago' || option === 'four_weeks_ago') {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const currentWeekStart = new Date(now);
    currentWeekStart.setDate(diff);
    currentWeekStart.setHours(0, 0, 0, 0);

    if (option === 'three_weeks_ago') {
      const start = new Date(currentWeekStart);
      start.setDate(start.getDate() - 21);
      const end = new Date(currentWeekStart);
      end.setDate(end.getDate() - 14);
      return { start, end };
    } else {
      const start = new Date(currentWeekStart);
      start.setDate(start.getDate() - 28);
      const end = new Date(currentWeekStart);
      end.setDate(end.getDate() - 21);
      return { start, end };
    }
  }
  return getWeekBounds(option as WeekOption);
}

// Health status colors
const statusColors: Record<HealthStatus, { dot: string; bg: string; text: string; border: string }> = {
  green: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  yellow: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  red: { dot: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  gray: { dot: 'bg-gray-400', bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' }
};

// Change indicator component
function ChangeIndicator({ value, isPercentage = false, isCurrency = false, invertColors = false }: {
  value: number;
  isPercentage?: boolean;
  isCurrency?: boolean;
  invertColors?: boolean;
}) {
  if (value === 0) {
    return <span className="text-[10px] text-gray-400 font-medium">—</span>;
  }

  const isPositive = value > 0;
  const colorClass = invertColors
    ? (isPositive ? 'text-red-500' : 'text-emerald-600')
    : (isPositive ? 'text-emerald-600' : 'text-red-500');

  const formatted = isCurrency
    ? formatCurrency(Math.abs(value))
    : isPercentage
      ? `${Math.abs(value).toFixed(1)}%`
      : Math.abs(value).toString();

  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-medium ${colorClass}`}>
      {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {isPositive ? '+' : '-'}{formatted}
    </span>
  );
}

// Summary metric tile
function SummaryMetricTile({
  label,
  value,
  change,
  icon: Icon,
  isCurrency = false,
  isPercentage = false,
  invertColors = false
}: {
  label: string;
  value: string | number;
  change: number;
  icon: React.ElementType;
  isCurrency?: boolean;
  isPercentage?: boolean;
  invertColors?: boolean;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="text-gray-400 flex-shrink-0" />
        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-base font-bold text-gray-800 tabular-nums">{value}</span>
        <ChangeIndicator value={change} isPercentage={isPercentage} isCurrency={isCurrency} invertColors={invertColors} />
      </div>
    </div>
  );
}

// Health metric card
function HealthMetricCard({
  label,
  value,
  change,
  status,
  isRating = false,
  isNewClub = false,
  isRepeatRate = false
}: {
  label: string;
  value: number;
  change: number;
  status: HealthStatus;
  isRating?: boolean;
  isNewClub?: boolean;
  isRepeatRate?: boolean;
}) {
  const colors = statusColors[status];
  const showChange = !isNewClub || !isRepeatRate;

  return (
    <div className={`flex-1 px-2.5 py-2 rounded-lg border ${colors.border} ${colors.bg}`}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
        <div className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      </div>
      <div className={`text-lg font-bold ${colors.text} leading-tight`}>
        {isRating ? (
          <span className="flex items-baseline gap-0.5">
            {value.toFixed(1)}
            <span className="text-[10px] font-normal text-gray-400">★</span>
          </span>
        ) : (
          <span>{Math.round(value)}%</span>
        )}
      </div>
      {showChange && (
        <div className={`flex items-center gap-0.5 mt-0.5 ${
          change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-500' : 'text-gray-400'
        }`}>
          {change > 0 ? <TrendingUp size={9} /> : change < 0 ? <TrendingDown size={9} /> : <Minus size={9} />}
          <span className="text-[9px] font-medium">
            {change === 0 ? 'No change' : `${change > 0 ? '+' : ''}${isRating ? change.toFixed(1) : `${change}%`}`}
          </span>
        </div>
      )}
      {isNewClub && isRepeatRate && (
        <div className="text-[8px] text-gray-400 mt-0.5 italic">New club</div>
      )}
    </div>
  );
}

// Info tooltip for pending payments definition
function PendingInfoTooltip() {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleMouseEnter = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
      setShow(true);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShow(false)}
        className="p-0.5 rounded hover:bg-gray-200 transition-colors"
      >
        <Info size={10} className="text-gray-400" />
      </button>
      {show && createPortal(
        <div
          className="fixed z-[10000] pointer-events-none"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="w-56 px-2.5 py-2 rounded-lg bg-gray-900 text-white text-[10px] leading-relaxed shadow-xl">
            <div className="font-semibold mb-1">Pending Payments</div>
            <div className="text-gray-300">
              Amount owed by users who attended (REGISTERED or ATTENDED status) but haven't completed payment yet.
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// Summary section with key metrics
function SummarySection({ summary, l4wPending }: { summary: SummaryData; l4wPending?: number }) {
  return (
    <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-br from-slate-50/80 to-white">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Week Summary</span>
        <span className="text-[9px] text-gray-400">vs previous week</span>
      </div>

      {/* Top row - primary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-3">
        <SummaryMetricTile
          label="Meetups"
          value={summary.current.meetups}
          change={summary.change.meetups}
          icon={Calendar}
        />
        <SummaryMetricTile
          label="Bookings"
          value={summary.current.bookings}
          change={summary.change.bookings}
          icon={Users}
        />
        <SummaryMetricTile
          label="Revenue"
          value={formatCurrency(summary.current.revenue)}
          change={summary.change.revenue}
          icon={DollarSign}
          isCurrency
        />
      </div>

      {/* Bottom row - secondary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 pt-2 border-t border-gray-100/80">
        <SummaryMetricTile
          label="No Show"
          value={`${summary.current.no_show_pct}%`}
          change={summary.change.no_show_pct}
          icon={AlertCircle}
          isPercentage
          invertColors
        />
        <SummaryMetricTile
          label="Pending"
          value={formatCurrency(summary.current.pending)}
          change={summary.change.pending}
          icon={Clock}
          isCurrency
        />
        <SummaryMetricTile
          label="Avg Rating"
          value={summary.current.rating > 0 ? `${summary.current.rating.toFixed(1)}★` : '—'}
          change={summary.change.rating}
          icon={Star}
        />
      </div>

      {/* L4W Pending Payments - highlighted row */}
      {l4wPending !== undefined && l4wPending > 0 && (
        <div className="mt-3 pt-3 border-t border-amber-200/60">
          <div className="flex items-center justify-between px-2 py-2 rounded-lg bg-amber-50/80 border border-amber-200/50">
            <div className="flex items-center gap-2">
              <Banknote size={14} className="text-amber-600" />
              <span className="text-[10px] font-semibold text-amber-800 uppercase tracking-wider">L4W Pending</span>
              <PendingInfoTooltip />
            </div>
            <span className="text-base font-bold text-amber-700 tabular-nums">
              {formatCurrency(l4wPending)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Health section
function HealthSection({ health }: { health: HealthData }) {
  const colors = statusColors[health.status];

  const warnings: string[] = [];
  if (health.capacity.change < -10) warnings.push(`Capacity down ${Math.abs(health.capacity.change)}%`);
  if (health.repeat_rate.change < -5 && !health.is_new_club) warnings.push(`Repeat rate declining`);
  if (health.rating.change < -0.2) warnings.push(`Rating dropped ${Math.abs(health.rating.change).toFixed(1)}`);

  return (
    <div className="border-b border-gray-100">
      <div className="px-4 py-2 flex items-center justify-between bg-gradient-to-r from-gray-50/50 to-white">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Health</span>
          {health.is_new_club && (
            <span className="px-1.5 py-0.5 text-[8px] font-medium bg-blue-100 text-blue-600 rounded-full uppercase">
              New
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
          <span className={`text-sm font-bold ${colors.text}`}>{health.score}</span>
          <span className="text-[10px] text-gray-400">/100</span>
        </div>
      </div>

      <div className="px-4 pb-3 flex gap-2">
        <HealthMetricCard
          label="Capacity"
          value={health.capacity.current}
          change={health.capacity.change}
          status={health.capacity.status}
        />
        <HealthMetricCard
          label="Repeat"
          value={health.repeat_rate.current}
          change={health.repeat_rate.change}
          status={health.repeat_rate.status}
          isNewClub={health.is_new_club}
          isRepeatRate
        />
        <HealthMetricCard
          label="Rating"
          value={health.rating.current}
          change={health.rating.change}
          status={health.rating.status}
          isRating
        />
      </div>

      {warnings.length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-amber-50 border border-amber-100">
            <AlertTriangle size={11} className="text-amber-500 flex-shrink-0" />
            <span className="text-[10px] text-amber-700">{warnings.join(' • ')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function MeetupDetailsTooltip({
  clubId,
  clubName,
  currentMeetups,
  currentRevenue,
  children,
  weekLabel,
  weekStart,
  weekEnd
}: MeetupDetailsTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<MeetupDetailsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, arrowLeft: 0 });
  const [showWeekDropdown, setShowWeekDropdown] = useState(false);
  const [localWeekOption, setLocalWeekOption] = useState<ExtendedWeekOption | null>(null);

  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const prevParentWeekRef = useRef<string | undefined>(weekStart);
  useEffect(() => {
    if (weekStart !== prevParentWeekRef.current) {
      if (localWeekOption === null) setData(null);
      prevParentWeekRef.current = weekStart;
    }
  }, [weekStart, localWeekOption]);

  const useParentWeek = localWeekOption === null && weekStart && weekEnd;
  const effectiveWeekStart = useParentWeek ? weekStart : (localWeekOption ? formatLocalDate(getExtendedWeekBounds(localWeekOption).start) : formatLocalDate(getExtendedWeekBounds('last_completed').start));
  const effectiveWeekEnd = useParentWeek ? weekEnd : (localWeekOption ? formatLocalDate(getExtendedWeekBounds(localWeekOption).end) : formatLocalDate(getExtendedWeekBounds('last_completed').end));
  const effectiveWeekLabel = useParentWeek ? weekLabel : (localWeekOption ? formatWeekLabel(getExtendedWeekBounds(localWeekOption).start, getExtendedWeekBounds(localWeekOption).end) : formatWeekLabel(getExtendedWeekBounds('last_completed').start, getExtendedWeekBounds('last_completed').end));

  const fetchMeetupDetails = useCallback(async (forceRefresh = false) => {
    if ((data && !forceRefresh) || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const url = `/api/targets/clubs/${clubId}/meetup-details?week_start=${effectiveWeekStart}&week_end=${effectiveWeekEnd}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError('Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [clubId, effectiveWeekStart, effectiveWeekEnd, data, isLoading]);

  const handleWeekChange = (option: ExtendedWeekOption) => {
    setLocalWeekOption(option);
    setShowWeekDropdown(false);
    setData(null);
  };

  useEffect(() => {
    if (isVisible && !data && !isLoading) {
      fetchMeetupDetails(true);
    }
  }, [effectiveWeekStart, effectiveWeekEnd, isVisible, data, isLoading]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Responsive width: 550px on desktop, viewport width minus padding on mobile
    const tooltipWidth = Math.min(550, window.innerWidth - 32);
    const tooltipHeight = 420;

    const idealLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
    let left = idealLeft;
    let top = rect.bottom + 8;

    // Ensure tooltip stays within viewport
    if (left < 16) left = 16;
    if (left + tooltipWidth > window.innerWidth - 16) {
      left = window.innerWidth - tooltipWidth - 16;
    }

    const triggerCenterX = rect.left + rect.width / 2;
    const arrowLeft = Math.max(20, Math.min(tooltipWidth - 20, triggerCenterX - left));

    if (top + tooltipHeight > window.innerHeight - 16) {
      top = rect.top - tooltipHeight - 8;
    }

    setPosition({ top, left, arrowLeft });
  }, []);

  const handleMouseEnter = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    hoverTimeoutRef.current = setTimeout(() => {
      updatePosition();
      setIsVisible(true);
      fetchMeetupDetails();
    }, 200);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    leaveTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isVisible) setShowWeekDropdown(false);
  }, [isVisible]);

  if (currentMeetups === 0) {
    return <>{children}</>;
  }

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="cursor-pointer"
      >
        {children}
      </div>

      {isVisible && createPortal(
        <div
          ref={tooltipRef}
          onMouseEnter={() => {
            if (leaveTimeoutRef.current) {
              clearTimeout(leaveTimeoutRef.current);
              leaveTimeoutRef.current = null;
            }
          }}
          onMouseLeave={handleMouseLeave}
          className="fixed z-[9999]"
          style={{
            top: position.top,
            left: position.left,
            animation: 'tooltipFadeIn 0.15s ease-out'
          }}
        >
          <div className="w-[calc(100vw-32px)] sm:w-[550px] max-w-[550px] bg-white rounded-xl shadow-xl border border-gray-200/80 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-white to-gray-50/50">
              <span className="text-sm font-semibold text-gray-800 truncate max-w-[320px]">
                {truncateName(clubName, 40)}
              </span>
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowWeekDropdown(!showWeekDropdown);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg
                    text-[11px] text-gray-600 font-medium
                    bg-gray-100/80 hover:bg-gray-200/80 transition-all"
                >
                  <Calendar size={12} className="text-gray-500" />
                  {effectiveWeekLabel}
                  <ChevronDown size={10} className={`transition-transform ${showWeekDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showWeekDropdown && (
                  <div className="absolute right-0 top-full mt-1 z-10
                    bg-white rounded-lg shadow-lg border border-gray-200
                    py-1 min-w-[120px] animate-in fade-in slide-in-from-top-1 duration-150">
                    {weekOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleWeekChange(option.value);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-[11px] transition-colors
                          ${localWeekOption === option.value
                            ? 'bg-indigo-50 text-indigo-600 font-medium'
                            : 'text-gray-600 hover:bg-gray-50'
                          }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                <span className="ml-2 text-sm text-gray-400">Loading...</span>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-16 text-sm text-gray-400">
                {error}
              </div>
            ) : (
              <>
                {/* Meetups List - First */}
                <div className="max-h-[180px] overflow-y-auto">
                  {data?.meetups.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-sm text-gray-400">
                      No meetups for {effectiveWeekLabel}
                    </div>
                  ) : (
                    <>
                      {/* Section Header */}
                      <div className="px-4 py-2 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Meetups</span>
                        <span className="text-[10px] text-gray-400">{data?.meetups.length} this week</span>
                      </div>

                      {/* Column Headers - wider first column */}
                      <div className="grid grid-cols-[1.5fr_70px_50px_60px_60px_80px] gap-2 px-4 py-1.5 bg-gray-50/60 border-b border-gray-100 sticky top-[33px] z-10">
                        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Meetup</span>
                        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider text-center">Date</span>
                        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider text-center">Price</span>
                        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider text-center">Booked</span>
                        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider text-right">Revenue</span>
                        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider text-right">Target</span>
                      </div>

                      {/* Meetup Rows */}
                      <div>
                        {data?.meetups.map((meetup) => (
                          <div
                            key={meetup.event_id}
                            className="grid grid-cols-[1.5fr_70px_50px_60px_60px_80px] gap-2 px-4 py-2 border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                          >
                            {/* Meetup name - wider */}
                            <div className="min-w-0">
                              <div className="text-xs text-gray-700 truncate" title={meetup.event_name}>
                                {truncateName(meetup.event_name, 32)}
                              </div>
                            </div>

                            {/* Date */}
                            <div className="flex items-center justify-center">
                              <span className="text-[11px] text-gray-500">
                                {formatDate(meetup.event_date).replace(/, /g, ' ')}
                              </span>
                            </div>

                            {/* Price */}
                            <div className="flex items-center justify-center">
                              <span className="text-[11px] text-gray-500 font-mono">
                                ₹{Math.round(meetup.price / 100)}
                              </span>
                            </div>

                            {/* Bookings / Capacity */}
                            <div className="flex items-center justify-center">
                              <span className="text-[11px] font-mono">
                                <span className={
                                  meetup.total_bookings >= meetup.capacity * 0.8
                                    ? 'text-emerald-600 font-medium'
                                    : meetup.total_bookings >= meetup.capacity * 0.5
                                      ? 'text-amber-600'
                                      : 'text-gray-600'
                                }>
                                  {meetup.total_bookings}
                                </span>
                                <span className="text-gray-400">/{meetup.capacity}</span>
                              </span>
                            </div>

                            {/* Revenue */}
                            <div className="flex items-center justify-end">
                              <span className={`text-[11px] font-mono ${
                                meetup.revenue > 0 ? 'text-gray-700' : 'text-gray-400'
                              }`}>
                                {formatCurrency(meetup.revenue)}
                              </span>
                            </div>

                            {/* Target */}
                            <div className="flex items-center justify-end">
                              <span className={`text-[10px] truncate ${
                                meetup.matched_target ? 'text-gray-600' : 'text-gray-300'
                              }`} title={meetup.matched_target?.name || 'Unmatched'}>
                                {meetup.matched_target?.name || '—'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Health Section - Second */}
                {data?.health && <HealthSection health={data.health} />}

                {/* Summary Section - Third */}
                {data?.summary && <SummarySection summary={data.summary} l4wPending={data.l4w_pending_payments} />}
              </>
            )}
          </div>

          {/* Arrow */}
          <div
            className="absolute -top-2 w-3 h-3 rotate-45 bg-white border-l border-t border-gray-200"
            style={{ left: position.arrowLeft, transform: 'translateX(-50%) rotate(45deg)' }}
          />
        </div>,
        document.body
      )}

      <style>{`
        @keyframes tooltipFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

export default MeetupDetailsTooltip;
