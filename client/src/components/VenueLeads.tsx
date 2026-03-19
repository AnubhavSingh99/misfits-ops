import React, { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  MapPin,
  Loader2,
  RefreshCw,
  Phone,
  User,
  Building2,
  CheckCircle2,
  X,
  ExternalLink,
  Clock,
  AlertCircle
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

interface VenueLead {
  id: number;
  created_at: string;
  updated_at: string;
  venue_name: string;
  address: string;
  city: string;
  area: string;
  google_maps_link: string;
  lat: number | null;
  lng: number | null;
  contact_name: string;
  contact_phone: string;
  sport_facilities: string[];
  notes: string | null;
  image: number | null;
  submitted_by: number | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  location_id: number | null;
  rejection_reason: string | null;
}

interface Stats {
  PENDING: number;
  APPROVED: number;
  REJECTED: number;
  total: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  PENDING: { label: 'Pending', color: 'text-yellow-600', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
  APPROVED: { label: 'Approved', color: 'text-green-600', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
  REJECTED: { label: 'Rejected', color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200' }
};

function timeAgo(dateStr: string): string {
  if (!dateStr) return '-';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function VenueLeads() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState<VenueLead[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('PENDING');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (isExpanded && leads.length === 0 && !error) {
      fetchLeads();
    }
  }, [isExpanded]);

  useEffect(() => {
    if (isExpanded && !error) {
      fetchLeads();
    }
  }, [activeFilter]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/venue-leads/stats`);
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching venue lead stats:', error);
    }
  };

  const fetchLeads = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = activeFilter ? `?status=${activeFilter}` : '';
      const res = await fetch(`${API_BASE}/venue-leads${params}`);
      const data = await res.json();
      if (data.success) {
        setLeads(data.leads || []);
      } else {
        setError(data.error || 'Failed to fetch venue leads');
      }
    } catch (err) {
      console.error('Error fetching venue leads:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    if (!confirm('Approve this venue lead? This will create a new location in the system.')) return;
    setActionLoading(id);
    try {
      const res = await fetch(`${API_BASE}/venue-leads/${id}/approve`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`Approved! Location ID: ${data.location_id}`);
        fetchLeads();
        fetchStats();
      } else {
        alert(data.error || 'Failed to approve');
      }
    } catch (error) {
      console.error('Error approving venue lead:', error);
      alert('Failed to approve venue lead');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: number) => {
    const reason = prompt('Please enter the rejection reason:');
    if (reason === null) return;
    setActionLoading(id);
    try {
      const res = await fetch(`${API_BASE}/venue-leads/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (data.success) {
        fetchLeads();
        fetchStats();
      } else {
        alert(data.error || 'Failed to reject');
      }
    } catch (error) {
      console.error('Error rejecting venue lead:', error);
      alert('Failed to reject venue lead');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header - same style as VenueRepository */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50/80 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-emerald-500" />
          <span className="font-medium text-gray-700">
            Venue Leads ({stats?.total || 0})
          </span>
          {stats && stats.PENDING > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
              {stats.PENDING} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isExpanded && (
            <button
              onClick={(e) => { e.stopPropagation(); fetchLeads(); fetchStats(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          )}
          {isExpanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-200">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-white">
            {(['PENDING', 'APPROVED', 'REJECTED'] as const).map(status => {
              const config = STATUS_CONFIG[status];
              const count = stats?.[status] || 0;
              const isActive = activeFilter === status;
              return (
                <button
                  key={status}
                  onClick={() => setActiveFilter(isActive ? '' : status)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                    isActive
                      ? `${config.bgColor} ${config.color} ${config.borderColor}`
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {config.label} ({count})
                </button>
              );
            })}
            <button
              onClick={() => setActiveFilter('')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                activeFilter === ''
                  ? 'bg-gray-100 text-gray-700 border-gray-400'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              All ({stats?.total || 0})
            </button>
          </div>

          {/* Table */}
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <AlertCircle className="h-6 w-6 text-red-400" />
              <p className="text-sm text-red-500">{error}</p>
              <button onClick={() => fetchLeads()} className="text-xs text-indigo-500 hover:underline">Retry</button>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No venue leads found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-2.5 font-medium text-gray-500">Venue</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Location</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Contact</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Sports</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Status</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Submitted</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leads.map(lead => {
                    const config = STATUS_CONFIG[lead.status];
                    const isActioning = actionLoading === lead.id;
                    return (
                      <tr key={lead.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{lead.venue_name}</div>
                          <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{lead.address}</div>
                          {lead.google_maps_link && (
                            <a
                              href={lead.google_maps_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 mt-0.5"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Maps
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-gray-700">{lead.city}</div>
                          <div className="text-xs text-gray-400">{lead.area}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-gray-700">
                            <User className="h-3.5 w-3.5 text-gray-400" />
                            {lead.contact_name}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                            <Phone className="h-3 w-3" />
                            {lead.contact_phone}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(lead.sport_facilities || []).map(sport => (
                              <span key={sport} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                                {sport}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border ${config.bgColor} ${config.color} ${config.borderColor}`}>
                            {lead.status === 'PENDING' && <Clock className="h-3 w-3" />}
                            {lead.status === 'APPROVED' && <CheckCircle2 className="h-3 w-3" />}
                            {lead.status === 'REJECTED' && <AlertCircle className="h-3 w-3" />}
                            {config.label}
                          </span>
                          {lead.status === 'APPROVED' && lead.location_id && (
                            <div className="text-xs text-green-600 mt-1">Location #{lead.location_id}</div>
                          )}
                          {lead.status === 'REJECTED' && lead.rejection_reason && (
                            <div className="text-xs text-red-400 mt-1 truncate max-w-[150px]" title={lead.rejection_reason}>
                              {lead.rejection_reason}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-gray-400">{timeAgo(lead.created_at)}</div>
                        </td>
                        <td className="px-4 py-3">
                          {lead.status === 'PENDING' && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleApprove(lead.id)}
                                disabled={isActioning}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                              >
                                {isActioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                Approve
                              </button>
                              <button
                                onClick={() => handleReject(lead.id)}
                                disabled={isActioning}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                                Reject
                              </button>
                            </div>
                          )}
                          {lead.notes && (
                            <div className="text-xs text-gray-400 mt-1 truncate max-w-[150px]" title={lead.notes}>
                              {lead.notes}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
