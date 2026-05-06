import React from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Clock, DollarSign, Loader2, MapPin, Star, Users, X } from 'lucide-react';

export interface ClubMeetupDetail {
  event_id: string;
  event_name: string;
  event_description?: string | null;
  event_date: string;
  area_name?: string | null;
  venue_name?: string | null;
  capacity: number;
  price: number;
  payment_type?: string | null;
  pricing_type?: string | null;
  total_bookings: number;
  waitlist_count?: number;
  open_for_replacement_count?: number;
  no_show_count?: number;
  revenue: number;
  pending_payment?: number;
  rating?: number | null;
  matched_target?: { id: number; name: string | null } | null;
}

export interface ClubMeetupPopupSummary {
  current: {
    meetups: number;
    bookings: number;
    waitlist: number;
    no_show_pct: number;
    revenue: number;
    pending: number;
    rating: number;
  };
  previous?: {
    meetups: number;
    bookings: number;
    waitlist: number;
    no_show_pct: number;
    revenue: number;
    pending: number;
    rating: number;
  };
  change?: {
    meetups: number;
    bookings: number;
    waitlist: number;
    no_show_pct: number;
    revenue: number;
    pending: number;
    rating: number;
  };
}

export interface ClubMeetupPopupHealth {
  score: number;
  status: 'green' | 'yellow' | 'red' | 'gray';
  is_new_club: boolean;
  capacity?: { current: number; previous: number; change: number; status: 'green' | 'yellow' | 'red' | 'gray' };
  repeat_rate?: { current: number; previous: number; change: number; status: 'green' | 'yellow' | 'red' | 'gray' };
  rating?: { current: number; previous: number; change: number; status: 'green' | 'yellow' | 'red' | 'gray' };
}

export interface ClubMeetupPopupData {
  success: boolean;
  meetups: ClubMeetupDetail[];
  total_meetups: number;
  total_revenue: number;
  total_waitlist: number;
  summary?: ClubMeetupPopupSummary;
  health?: ClubMeetupPopupHealth;
}

export interface ClubMeetupPopupPosition {
  top: number;
  left: number;
}

interface ClubMeetupHoverPopupProps {
  visible: boolean;
  position: ClubMeetupPopupPosition | null;
  clubName: string;
  clubCity: string;
  clubArea: string;
  loading: boolean;
  error: string | null;
  data: ClubMeetupPopupData | null;
  weekLabel?: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const formatCurrency = (value: number): string => {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${Math.round(value)}`;
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

const getHealthColor = (status?: ClubMeetupPopupHealth['status']) => {
  switch (status) {
    case 'green':
      return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'yellow':
      return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'red':
      return 'text-red-700 bg-red-50 border-red-200';
    default:
      return 'text-gray-700 bg-gray-50 border-gray-200';
  }
};

function MetricCard({
  label,
  value,
  tone = 'gray',
}: {
  label: string;
  value: string | number;
  tone?: 'gray' | 'emerald' | 'amber' | 'red' | 'blue';
}) {
  const toneMap = {
    gray: 'border-gray-200 bg-gray-50 text-gray-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
  } as const;

  return (
    <div className={`rounded-xl border px-3 py-2 ${toneMap[tone]}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-lg font-semibold leading-none">{value}</div>
    </div>
  );
}

export function ClubMeetupHoverPopup({
  visible,
  position,
  clubName,
  clubCity,
  clubArea,
  loading,
  error,
  data,
  weekLabel = 'Previous week',
  onMouseEnter,
  onMouseLeave,
}: ClubMeetupHoverPopupProps) {
  if (!visible || !position) return null;

  const summary = data?.summary?.current;
  const meetups = data?.meetups || [];
  const health = data?.health;

  return createPortal(
    <div
      className="fixed z-[9999]"
      style={{ top: position.top, left: position.left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="w-[min(460px,calc(100vw-32px))] max-h-[calc(100vh-32px)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-gray-900">{clubName}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                <span>{clubCity}</span>
              </span>
              <span className="text-gray-300">•</span>
              <span>{clubArea}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700">
              <Calendar className="h-3.5 w-3.5" />
              {weekLabel}
            </span>
            <button
              type="button"
              onClick={onMouseLeave}
              className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close meetup popup"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-96px)] overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex min-h-[180px] items-center justify-center text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading meetup details...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : !data ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              No meetup data available for this club.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <MetricCard label="Meetups" value={summary?.meetups ?? data.total_meetups ?? meetups.length} tone="blue" />
                <MetricCard label="Bookings" value={summary?.bookings ?? meetups.reduce((sum, meetup) => sum + (meetup.total_bookings || 0), 0)} tone="emerald" />
                <MetricCard label="Waitlist" value={summary?.waitlist ?? data.total_waitlist ?? 0} tone="amber" />
                <MetricCard label="Revenue" value={formatCurrency(summary?.revenue ?? data.total_revenue ?? 0)} tone="red" />
              </div>

              {health && (
                <div className="grid grid-cols-3 gap-2">
                  <div className={`rounded-xl border px-3 py-2 ${getHealthColor(health.status)}`}>
                    <div className="text-[10px] uppercase tracking-wide opacity-70">Health</div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-base font-semibold leading-none">{health.score}</span>
                      <span className="text-xs font-medium">/100</span>
                    </div>
                  </div>
                  {health.capacity && (
                    <MetricCard label="Cap. Util." value={`${health.capacity.current}%`} tone={health.capacity.status === 'green' ? 'emerald' : health.capacity.status === 'yellow' ? 'amber' : 'red'} />
                  )}
                  {health.repeat_rate && (
                    <MetricCard label="Repeat" value={`${health.repeat_rate.current}%`} tone={health.repeat_rate.status === 'green' ? 'emerald' : health.repeat_rate.status === 'yellow' ? 'amber' : 'red'} />
                  )}
                  {health.rating && (
                    <MetricCard label="Rating" value={`${health.rating.current.toFixed(1)}★`} tone={health.rating.status === 'green' ? 'emerald' : health.rating.status === 'yellow' ? 'amber' : 'red'} />
                  )}
                </div>
              )}

                <div className="rounded-2xl border border-gray-200">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Meetups hosted</div>
                    <div className="text-[11px] text-gray-500">Previous completed week</div>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {meetups.length} {meetups.length === 1 ? 'meetup' : 'meetups'}
                  </div>
                </div>

                {meetups.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-gray-500">No meetups hosted last week.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-3 py-2.5 font-medium">Meetup</th>
                          <th className="px-3 py-2.5 font-medium">Date</th>
                          <th className="px-3 py-2.5 font-medium">Booked</th>
                          <th className="px-3 py-2.5 font-medium">Rev</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {meetups.map((meetup) => (
                          <tr key={meetup.event_id} className="hover:bg-gray-50/80">
                            <td className="px-3 py-2.5">
                              <div className="max-w-[150px] truncate font-medium text-gray-900" title={meetup.event_name}>
                                {meetup.event_name}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-gray-600">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-gray-400" />
                                {formatDate(meetup.event_date)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-900">
                              <span className="inline-flex items-center gap-1">
                                <Users className="h-3.5 w-3.5 text-emerald-500" />
                                {meetup.total_bookings}/{meetup.capacity}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-900">{formatCurrency(meetup.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ClubMeetupHoverPopup;
