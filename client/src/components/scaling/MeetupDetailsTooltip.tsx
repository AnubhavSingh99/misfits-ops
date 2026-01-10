import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';

interface MeetupDetail {
  event_id: string;
  event_name: string;
  event_date: string;
  capacity: number;
  price: number;
  total_bookings: number;
  waitlist_count: number;
  revenue: number;
  matched_target: { id: number; name: string | null } | null;
}

interface MeetupDetailsResponse {
  success: boolean;
  club_id: number;
  meetups: MeetupDetail[];
  total_meetups: number;
  total_revenue: number;
  total_waitlist: number;
}

interface MeetupDetailsTooltipProps {
  clubId: number;
  clubName: string;
  currentMeetups: number;
  currentRevenue: number;
  children: React.ReactNode;
  weekLabel?: string;   // e.g., "Jan 6 - Jan 12"
  weekStart?: string;   // ISO date string e.g., "2026-01-06"
  weekEnd?: string;     // ISO date string e.g., "2026-01-13"
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

// Truncate event name
const truncateName = (name: string, maxLen: number = 22): string => {
  if (name.length <= maxLen) return name;
  return name.substring(0, maxLen - 1) + '…';
};

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

  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch meetup details
  const fetchMeetupDetails = useCallback(async () => {
    if (data || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      let url = `/api/targets/clubs/${clubId}/meetup-details`;
      if (weekStart && weekEnd) {
        url += `?week_start=${weekStart}&week_end=${weekEnd}`;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError('Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [clubId, weekStart, weekEnd, data, isLoading]);

  // Calculate position
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 430;
    const tooltipHeight = 260;

    // Calculate ideal centered position
    const idealLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
    let left = idealLeft;
    let top = rect.bottom + 8;

    // Keep within viewport
    if (left < 16) left = 16;
    if (left + tooltipWidth > window.innerWidth - 16) {
      left = window.innerWidth - tooltipWidth - 16;
    }

    // Calculate arrow position relative to tooltip
    // Arrow should point to center of trigger element
    const triggerCenterX = rect.left + rect.width / 2;
    const arrowLeft = Math.max(20, Math.min(tooltipWidth - 20, triggerCenterX - left));

    // If would go below viewport, show above
    if (top + tooltipHeight > window.innerHeight - 16) {
      top = rect.top - tooltipHeight - 8;
    }

    setPosition({ top, left, arrowLeft });
  }, []);

  // Handle mouse enter
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

  // Handle mouse leave
  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    leaveTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100);
  };

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    };
  }, []);

  // Don't show tooltip if no meetups
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
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          {/* Light tooltip matching dashboard style */}
          <div className="w-[430px] bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 truncate max-w-[260px]">
                {truncateName(clubName, 32)}
              </span>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                {weekLabel || 'Last Week'}
              </span>
            </div>

            {/* Content */}
            <div className="max-h-[200px] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  <span className="ml-2 text-xs text-gray-400">Loading...</span>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center py-8 text-xs text-gray-400">
                  {error}
                </div>
              ) : data?.meetups.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-xs text-gray-400">
                  No meetups {weekLabel ? `for ${weekLabel}` : 'last week'}
                </div>
              ) : (
                <>
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_60px_45px_55px_50px_70px] gap-1 px-3 py-1.5 bg-gray-50 border-b border-gray-100 sticky top-0">
                    <span className="text-[10px] font-medium text-gray-400 uppercase">Event</span>
                    <span className="text-[10px] font-medium text-gray-400 uppercase text-center">Date</span>
                    <span className="text-[10px] font-medium text-gray-400 uppercase text-center">Price</span>
                    <span className="text-[10px] font-medium text-gray-400 uppercase text-center">Booked</span>
                    <span className="text-[10px] font-medium text-gray-400 uppercase text-right">Rev</span>
                    <span className="text-[10px] font-medium text-gray-400 uppercase text-right">Target</span>
                  </div>

                  {/* Meetup rows */}
                  <div>
                    {data?.meetups.map((meetup) => (
                      <div
                        key={meetup.event_id}
                        className="grid grid-cols-[1fr_60px_45px_55px_50px_70px] gap-1 px-3 py-2 border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                      >
                        {/* Event name */}
                        <div className="min-w-0">
                          <div className="text-xs text-gray-700 truncate">
                            {truncateName(meetup.event_name, 20)}
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
                                ? 'text-emerald-600'
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

            {/* Footer with subtle totals */}
            {data && data.meetups.length > 0 && (
              <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    <span className="font-medium text-gray-700">{data.total_meetups}</span> meetups
                  </span>
                  <span>
                    <span className="font-medium text-gray-700">{data.meetups.reduce((sum, m) => sum + m.total_bookings, 0)}</span> bookings
                  </span>
                  {data.total_waitlist > 0 && (
                    <span>
                      <span className="font-medium text-amber-600">{data.total_waitlist}</span> waitlist
                    </span>
                  )}
                  <span>
                    <span className="font-medium text-gray-700">{formatCurrency(data.total_revenue)}</span> revenue
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Arrow pointing up */}
          <div
            className="absolute -top-2 w-3 h-3 rotate-45 bg-white border-l border-t border-gray-200"
            style={{ left: position.arrowLeft, transform: 'translateX(-50%)' }}
          />
        </div>,
        document.body
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

export default MeetupDetailsTooltip;
