import React, { useState, useEffect } from 'react';
import {
  ChevronDown, ChevronUp, MapPin, Loader2, RefreshCw,
  Phone, User, CheckCircle2, X, ExternalLink, Clock,
  AlertCircle, Pencil, Save, ImageIcon, Plus
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// ── Schema-derived constants ────────────────────────────────────────────────

const VENUE_CATEGORIES = [
  { value: 'STUDIO',          label: 'Studio' },
  { value: 'CAFE',            label: 'Cafe' },
  { value: 'PUB_AND_BAR',    label: 'Pub & Bar' },
  { value: 'SPORTS_VENUE',   label: 'Sports Venue' },
  { value: 'COMMUNITY_SPACE', label: 'Community Space' },
  { value: 'VENUE_OTHER',    label: 'Other' },
];

// Map web-form human-readable strings → enum values
const VENUE_CATEGORY_LABEL_MAP: Record<string, string> = {
  'studio':         'STUDIO',
  'cafe':           'CAFE',
  'pub & bar':      'PUB_AND_BAR',
  'pub and bar':    'PUB_AND_BAR',
  'sports venue':   'SPORTS_VENUE',
  'community space':'COMMUNITY_SPACE',
  'other':          'VENUE_OTHER',
};

function normalizeVenueCategory(raw?: string): string {
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (VENUE_CATEGORIES.some(c => c.value === upper)) return upper;
  return VENUE_CATEGORY_LABEL_MAP[raw.toLowerCase()] || raw;
}

const CAPACITY_OPTIONS = [
  { value: 'LESS_THAN_25', label: 'Less than 25' },
  { value: '25_TO_50',     label: '25 – 50' },
  { value: '50_PLUS',      label: '50+' },
];

const AMENITIES_LIST = [
  'Air Conditioning', 'Parking', 'Parking Available', 'Valet Parking',
  'WiFi', 'Wi-Fi', 'Projector', 'Sound System', 'DJ Setup',
  'Multiple Screens', 'Outdoor Seating', 'Spectator Seating',
  'Changing Rooms', 'Lockers', 'Water Cooler', 'Water Dispenser',
  'Food & Beverages', 'First Aid Kit', 'Board Games',
  'Pool Table', 'Sports Equipment', 'Dart Boards',
];

const SEATING_CATEGORIES = [
  { value: 'INDOOR',  label: 'Indoor' },
  { value: 'OUTDOOR', label: 'Outdoor' },
  { value: 'BOTH',    label: 'Both' },
];

const DAYS_OF_WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

const ACTIVITY_OPTIONS = [
  'Art', 'Badminton', 'Basketball', 'Board Gaming', 'Book Club', 'Bowling',
  'Box Cricket', 'Community Space', 'Content Creation', 'Dance', 'Drama',
  'Films', 'Football', 'Hiking', 'Journaling', 'Mafia', 'Mindfulness',
  'Music', 'Pickleball', 'Quiz', 'Running', 'Yoga'
];

const TIME_SLOTS: Record<string, { label: string; start: { hour: number; minute: number }; end: { hour: number; minute: number }; display: string }> = {
  early_morning: { label: 'Early Morning', start: { hour: 5,  minute: 0 }, end: { hour: 8,  minute: 0 }, display: '5–8 AM'    },
  morning:       { label: 'Morning',       start: { hour: 8,  minute: 0 }, end: { hour: 12, minute: 0 }, display: '8 AM–12 PM' },
  afternoon:     { label: 'Afternoon',     start: { hour: 12, minute: 0 }, end: { hour: 16, minute: 0 }, display: '12–4 PM'   },
  evening:       { label: 'Evening',       start: { hour: 16, minute: 0 }, end: { hour: 20, minute: 0 }, display: '4–8 PM'    },
  night:         { label: 'Night',         start: { hour: 20, minute: 0 }, end: { hour: 0,  minute: 0 }, display: '8 PM–12 AM'},
  all_nighter:   { label: 'All-Nighter',   start: { hour: 0,  minute: 0 }, end: { hour: 5,  minute: 0 }, display: '12–5 AM'  },
};

// ── Types ────────────────────────────────────────────────────────────────────

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
  venue_info: {
    amenities?: string[];
    sitting_size?: string;
    venue_category?: string;
    seating_category?: string;
    chargeable?: boolean;
    reason_for_charge?: string;
    preferred_schedules?: Array<{
      day: string;
      preferred_activity: string;
      start_time?: { hour: number; minute: number };
      end_time?: { hour: number; minute: number };
    }>;
  } | null;
  notes: string | null;
  image: number | null;
  image_url: string | null;
  submitted_by: number | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  location_id: number | null;
  rejection_reason: string | null;
}

interface EditForm {
  venue_name: string;
  address: string;
  city: string;
  area: string;
  google_maps_link: string;
  lat: string;
  lng: string;
  contact_name: string;
  contact_phone: string;
  notes: string;
  venue_category: string;
  sitting_size: string;
  amenities: string[];
  seating_category: string;
  chargeable: boolean;
  reason_for_charge: string;
  preferred_schedules: Array<{
    day: string;
    preferred_activity: string;
    start_time?: { hour: number; minute: number };
    end_time?: { hour: number; minute: number };
  }>;
}

interface Stats { PENDING: number; APPROVED: number; REJECTED: number; total: number; }

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  PENDING:  { label: 'Pending',  color: 'text-yellow-600', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
  APPROVED: { label: 'Approved', color: 'text-green-600',  bgColor: 'bg-green-50',  borderColor: 'border-green-200'  },
  REJECTED: { label: 'Rejected', color: 'text-red-600',    bgColor: 'bg-red-50',    borderColor: 'border-red-200'    },
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
  return days < 30 ? `${days}d ago` : new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function leadToForm(lead: VenueLead): EditForm {
  return {
    venue_name:     lead.venue_name     || '',
    address:        lead.address        || '',
    city:           lead.city           || '',
    area:           lead.area           || '',
    google_maps_link: lead.google_maps_link || '',
    lat:            lead.lat  != null ? String(lead.lat)  : '',
    lng:            lead.lng  != null ? String(lead.lng)  : '',
    contact_name:   lead.contact_name   || '',
    contact_phone:  lead.contact_phone  || '',
    notes:          lead.notes          || '',
    venue_category: normalizeVenueCategory(lead.venue_info?.venue_category),
    sitting_size:   lead.venue_info?.sitting_size        || '',
    amenities:      lead.venue_info?.amenities           || [],
    seating_category:   lead.venue_info?.seating_category   || '',
    chargeable:         lead.venue_info?.chargeable         ?? false,
    reason_for_charge:  lead.venue_info?.reason_for_charge  || '',
    preferred_schedules: lead.venue_info?.preferred_schedules || [],
  };
}

function emptyForm(): EditForm {
  return {
    venue_name: '', address: '', city: '', area: '',
    google_maps_link: '', lat: '', lng: '',
    contact_name: '', contact_phone: '', notes: '',
    venue_category: '', sitting_size: '', amenities: [],
    seating_category: '', chargeable: false, reason_for_charge: '',
    preferred_schedules: [],
  };
}

const LBL  = 'block text-xs font-medium text-gray-500 mb-1';
const INP  = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400';
const SEL  = `${INP} bg-white`;

// ── Component ────────────────────────────────────────────────────────────────

export function VenueLeads() {
  const [isExpanded, setIsExpanded]   = useState(false);
  const [loading, setLoading]         = useState(false);
  const [leads, setLeads]             = useState<VenueLead[]>([]);
  const [stats, setStats]             = useState<Stats | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('PENDING');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError]             = useState<string | null>(null);

  // Edit / create state
  const [editingLead, setEditingLead] = useState<VenueLead | null>(null);
  const [editForm, setEditForm]       = useState<EditForm | null>(null);
  const [editSaving, setEditSaving]   = useState(false);
  const [editError, setEditError]     = useState<string | null>(null);
  const [isCreating, setIsCreating]   = useState(false);

  // Image state
  const [imageFile, setImageFile]       = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // City / area lookup state
  const [cities, setCities]           = useState<{ id: number; name: string }[]>([]);
  const [areas, setAreas]             = useState<{ id: number; name: string }[]>([]);
  const [citySearch, setCitySearch]   = useState('');
  const [areaSearch, setAreaSearch]   = useState('');
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [areasLoading, setAreasLoading]   = useState(false);

  const [customAmenity, setCustomAmenity] = useState('');

  useEffect(() => { fetchStats(); }, []);
  useEffect(() => { if (isExpanded && leads.length === 0 && !error) fetchLeads(); }, [isExpanded]);
  useEffect(() => { if (isExpanded) fetchLeads(); }, [activeFilter]);

  const fetchStats = async () => {
    try {
      const res  = await fetch(`${API_BASE}/venue-leads/stats`);
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch { /* silent */ }
  };

  const fetchLeads = async () => {
    setLoading(true); setError(null);
    try {
      const params = activeFilter ? `?status=${activeFilter}` : '';
      const res  = await fetch(`${API_BASE}/venue-leads${params}`);
      const data = await res.json();
      if (data.success) setLeads(data.leads || []);
      else setError(data.error || 'Failed to fetch venue leads');
    } catch { setError('Failed to connect to server'); }
    finally { setLoading(false); }
  };

  const handleApprove = async (id: number) => {
    if (!confirm('Approve this venue lead? This will create a new location in the system.')) return;
    setActionLoading(id);
    try {
      const res  = await fetch(`${API_BASE}/venue-leads/${id}/approve`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        alert(data?.error || `Failed to approve venue lead${res.status ? ` (${res.status})` : ''}`);
        return;
      }
      alert(`Approved! Location ID: ${data.location_id}`);
      fetchLeads();
      fetchStats();
    } catch {
      alert('Failed to approve venue lead');
    }
    finally { setActionLoading(null); }
  };

  const handleReject = async (id: number) => {
    const reason = prompt('Please enter the rejection reason:');
    if (reason === null) return;
    setActionLoading(id);
    try {
      const res  = await fetch(`${API_BASE}/venue-leads/${id}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (data.success) { fetchLeads(); fetchStats(); }
      else alert(data.error || 'Failed to reject');
    } catch { alert('Failed to reject venue lead'); }
    finally { setActionLoading(null); }
  };

  const fetchCities = async () => {
    setCitiesLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/venue-leads/cities`);
      const data = await res.json();
      if (data.success) setCities(data.cities);
    } catch { /* silent */ }
    finally { setCitiesLoading(false); }
  };

  const fetchAreas = async (cityName: string) => {
    if (!cityName) { setAreas([]); return; }
    setAreasLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/venue-leads/areas?city=${encodeURIComponent(cityName)}`);
      const data = await res.json();
      if (data.success) setAreas(data.areas);
      else setAreas([]);
    } catch { setAreas([]); }
    finally { setAreasLoading(false); }
  };

  const openEdit = (lead: VenueLead) => {
    setEditingLead(lead);
    setEditForm(leadToForm(lead));
    setEditError(null);
    setIsCreating(false);
    setCitySearch('');
    setAreaSearch('');
    fetchCities();
    if (lead.city) fetchAreas(lead.city);
  };

  const openCreate = () => {
    setEditingLead(null);
    setEditForm(emptyForm());
    setEditError(null);
    setIsCreating(true);
    setCitySearch('');
    setAreaSearch('');
    fetchCities();
  };

  const closeEdit = () => {
    setEditingLead(null); setEditForm(null);
    setEditError(null);
    setIsCreating(false);
    setCustomAmenity('');
    setCities([]); setAreas([]);
    setCitySearch(''); setAreaSearch('');
    setImageFile(null); setImagePreview(null);
  };

  const uploadImage = async (leadId: number, file: File): Promise<void> => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`${API_BASE}/venue-leads/${leadId}/image`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to upload image');
  };

  const addCustomAmenity = () => {
    const trimmed = customAmenity.trim();
    if (!trimmed || !editForm) return;
    if (!editForm.amenities.includes(trimmed)) {
      setField('amenities', [...editForm.amenities, trimmed]);
    }
    setCustomAmenity('');
  };

  const setField = (field: keyof EditForm, value: string | string[] | boolean | EditForm['preferred_schedules']) =>
    setEditForm(prev => prev ? { ...prev, [field]: value } : prev);

  const addSchedule = () => {
    if (!editForm) return;
    setField('preferred_schedules', [
      ...editForm.preferred_schedules,
      { day: 'MONDAY', preferred_activity: '' },
    ]);
  };

  const removeSchedule = (index: number) => {
    if (!editForm) return;
    setField('preferred_schedules', editForm.preferred_schedules.filter((_, i) => i !== index));
  };

  const updateSchedule = (index: number, updates: Partial<EditForm['preferred_schedules'][0]>) => {
    if (!editForm) return;
    setField('preferred_schedules', editForm.preferred_schedules.map((s, i) =>
      i === index ? { ...s, ...updates } : s
    ));
  };

  const toggleAmenity = (a: string) => {
    if (!editForm) return;
    const current = editForm.amenities;
    setField('amenities', current.includes(a) ? current.filter(x => x !== a) : [...current, a]);
  };

  const handleEditSave = async () => {
    if (!editForm) return;
    setEditSaving(true); setEditError(null);
    try {
      const body = {
        venue_name:       editForm.venue_name,
        address:          editForm.address,
        city:             editForm.city,
        area:             editForm.area,
        google_maps_link: editForm.google_maps_link,
        lat:  editForm.lat  !== '' ? parseFloat(editForm.lat)  : null,
        lng:  editForm.lng  !== '' ? parseFloat(editForm.lng)  : null,
        contact_name:  editForm.contact_name,
        contact_phone: editForm.contact_phone,
        notes:         editForm.notes || null,
        venue_info: {
          venue_category:    editForm.venue_category   || undefined,
          sitting_size:      editForm.sitting_size     || undefined,
          amenities:         editForm.amenities,
          seating_category:  editForm.seating_category || undefined,
          chargeable:        editForm.chargeable       || undefined,
          reason_for_charge: editForm.reason_for_charge || undefined,
          preferred_schedules: editForm.preferred_schedules.length > 0 ? editForm.preferred_schedules : undefined,
        },
      };

      if (isCreating) {
        const res = await fetch(`${API_BASE}/venue-leads`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.success) {
          if (imageFile) {
            try { await uploadImage(data.lead.id, imageFile); } catch { /* image upload failure is non-fatal */ }
          }
          closeEdit(); fetchLeads(); fetchStats();
        } else setEditError(data.error || 'Failed to create');
      } else {
        if (!editingLead) return;
        const res = await fetch(`${API_BASE}/venue-leads/${editingLead.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.success) {
          if (imageFile) {
            try { await uploadImage(editingLead.id, imageFile); } catch { /* image upload failure is non-fatal */ }
          }
          closeEdit(); fetchLeads();
        } else setEditError(data.error || 'Failed to save');
      }
    } catch { setEditError('Failed to connect to server'); }
    finally { setEditSaving(false); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Widget ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between bg-gray-50/80 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-emerald-500" />
            <span className="font-medium text-gray-700">Venue Leads ({stats?.total || 0})</span>
            {stats && stats.PENDING > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
                {stats.PENDING} pending
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isExpanded && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); openCreate(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="h-4 w-4" /> Add Venue Lead
                </button>
                <button
                  onClick={e => { e.stopPropagation(); fetchLeads(); fetchStats(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" /> Refresh
                </button>
              </>
            )}
            {isExpanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
          </div>
        </button>

        {isExpanded && (
          <div className="border-t border-gray-200">
            {/* Filter Tabs */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-white">
              {(['PENDING', 'APPROVED', 'REJECTED'] as const).map(status => {
                const cfg = STATUS_CONFIG[status];
                const isActive = activeFilter === status;
                return (
                  <button key={status}
                    onClick={() => setActiveFilter(isActive ? '' : status)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      isActive ? `${cfg.bgColor} ${cfg.color} ${cfg.borderColor}` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {cfg.label} ({stats?.[status] || 0})
                  </button>
                );
              })}
              <button
                onClick={() => setActiveFilter('')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  activeFilter === '' ? 'bg-gray-100 text-gray-700 border-gray-400' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
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
                <button onClick={fetchLeads} className="text-xs text-indigo-500 hover:underline">Retry</button>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : leads.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No venue leads found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-4 py-2.5 font-medium text-gray-500">Venue</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">Location</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">Contact</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">Venue Info</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">Status</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">Submitted</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {leads.map(lead => {
                      const cfg = STATUS_CONFIG[lead.status];
                      const isActioning = actionLoading === lead.id;
                      return (
                        <tr key={lead.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3">
                            <div className="flex items-start gap-2">
                              {lead.image_url ? (
                                <img src={lead.image_url} alt={lead.venue_name}
                                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-gray-100" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                  <ImageIcon className="h-4 w-4 text-gray-300" />
                                </div>
                              )}
                              <div>
                                <div className="font-medium text-gray-900">{lead.venue_name}</div>
                                <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{lead.address}</div>
                                {lead.google_maps_link && (
                                  <a href={lead.google_maps_link} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 mt-0.5">
                                    <ExternalLink className="h-3 w-3" />Maps
                                  </a>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-gray-700">{lead.city}</div>
                            <div className="text-xs text-gray-400">{lead.area}</div>
                            {lead.lat && lead.lng && (
                              <div className="text-xs text-gray-300 mt-0.5">{lead.lat.toFixed(4)}, {lead.lng.toFixed(4)}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 text-gray-700">
                              <User className="h-3.5 w-3.5 text-gray-400" />{lead.contact_name}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                              <Phone className="h-3 w-3" />{lead.contact_phone}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {lead.venue_info?.venue_category && (
                              <div className="text-xs font-medium text-gray-700 mb-1">
                                {VENUE_CATEGORIES.find(c => c.value === lead.venue_info?.venue_category)?.label || lead.venue_info.venue_category}
                              </div>
                            )}
                            {lead.venue_info?.sitting_size && (
                              <div className="text-xs text-blue-600 mb-1">
                                {CAPACITY_OPTIONS.find(c => c.value === lead.venue_info?.sitting_size)?.label || lead.venue_info.sitting_size} seats
                              </div>
                            )}
                            {lead.venue_info?.seating_category && (
                              <div className="text-xs text-gray-500 mb-1">
                                {SEATING_CATEGORIES.find(c => c.value === lead.venue_info?.seating_category)?.label || lead.venue_info.seating_category}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1">
                              {(lead.venue_info?.amenities || []).slice(0, 3).map(a => (
                                <span key={a} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">{a}</span>
                              ))}
                              {(lead.venue_info?.amenities || []).length > 3 && (
                                <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-400 rounded">
                                  +{(lead.venue_info?.amenities || []).length - 3}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border ${cfg.bgColor} ${cfg.color} ${cfg.borderColor}`}>
                              {lead.status === 'PENDING'  && <Clock        className="h-3 w-3" />}
                              {lead.status === 'APPROVED' && <CheckCircle2 className="h-3 w-3" />}
                              {lead.status === 'REJECTED' && <AlertCircle  className="h-3 w-3" />}
                              {cfg.label}
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
                            <div className="flex flex-col gap-1.5">
                              {lead.status === 'PENDING' && (
                                <div className="flex items-center gap-1.5">
                                  <button onClick={() => handleApprove(lead.id)} disabled={isActioning}
                                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
                                    {isActioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                    Approve
                                  </button>
                                  <button onClick={() => handleReject(lead.id)} disabled={isActioning}
                                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50">
                                    <X className="h-3.5 w-3.5" />Reject
                                  </button>
                                </div>
                              )}
                              <button onClick={() => openEdit(lead)}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 w-fit">
                                <Pencil className="h-3.5 w-3.5" />Edit
                              </button>
                            </div>
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

      {/* ── Edit / Create Modal ── */}
      {editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {isCreating ? 'Add Venue Lead' : 'Edit Venue Lead'}
                </h2>
                {!isCreating && editingLead && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    ID #{editingLead.id} ·{' '}
                    <span className={STATUS_CONFIG[editingLead.status].color}>{editingLead.status}</span>
                  </p>
                )}
              </div>
              <button onClick={closeEdit} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              {/* ── Image ── */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Venue Image</p>
                <div className="flex items-start gap-4">
                  <div className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-200 overflow-hidden flex items-center justify-center bg-gray-50 flex-shrink-0">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (!isCreating && editingLead?.image_url) ? (
                      <img src={editingLead.image_url} alt="Current" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setImageFile(file);
                            setImagePreview(URL.createObjectURL(file));
                          }
                        }}
                      />
                      <span className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer w-fit">
                        <ImageIcon className="h-4 w-4" />
                        {imagePreview || (!isCreating && editingLead?.image_url) ? 'Change Image' : 'Upload Image'}
                      </span>
                    </label>
                    {imageFile && (
                      <p className="text-xs text-gray-500 mt-2 truncate max-w-[200px]">{imageFile.name}</p>
                    )}
                    {imageFile && (
                      <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }}
                        className="text-xs text-red-400 hover:text-red-600 mt-1">
                        Remove
                      </button>
                    )}
                    <p className="text-xs text-gray-400 mt-1">Max 10MB · JPG, PNG, GIF</p>
                  </div>
                </div>
              </div>

              {/* ── Venue Details ── */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Venue Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className={LBL}>Venue Name</label>
                    <input className={INP} value={editForm.venue_name}
                      onChange={e => setField('venue_name', e.target.value)} placeholder="Venue name" />
                  </div>
                  <div className="col-span-2">
                    <label className={LBL}>Address</label>
                    <input className={INP} value={editForm.address}
                      onChange={e => setField('address', e.target.value)} placeholder="Full address" />
                  </div>
                  <div className="relative">
                    <label className={LBL}>City</label>
                    <div className="relative">
                      <input
                        className={INP}
                        value={citySearch || editForm.city}
                        onChange={e => {
                          setCitySearch(e.target.value);
                          setField('city', e.target.value);
                          setAreas([]); setAreaSearch(''); setField('area', '');
                        }}
                        placeholder={citiesLoading ? 'Loading…' : 'Search or type city'}
                      />
                      {citiesLoading && (
                        <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-gray-400" />
                      )}
                    </div>
                    {cities.length > 0 && citySearch && (() => {
                      const filtered = cities.filter(c =>
                        c.name.toLowerCase().includes(citySearch.toLowerCase())
                      );
                      return filtered.length > 0 ? (
                        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto text-sm">
                          {filtered.map(c => (
                            <li key={c.id}>
                              <button type="button"
                                className="w-full text-left px-3 py-2 hover:bg-indigo-50 hover:text-indigo-700"
                                onClick={() => {
                                  setField('city', c.name);
                                  setCitySearch('');
                                  setAreas([]); setAreaSearch(''); setField('area', '');
                                  fetchAreas(c.name);
                                }}
                              >{c.name}</button>
                            </li>
                          ))}
                        </ul>
                      ) : null;
                    })()}
                  </div>
                  <div className="relative">
                    <label className={LBL}>Area</label>
                    <div className="relative">
                      <input
                        className={INP}
                        value={areaSearch || editForm.area}
                        onChange={e => {
                          setAreaSearch(e.target.value);
                          setField('area', e.target.value);
                        }}
                        placeholder={areasLoading ? 'Loading…' : areas.length > 0 ? 'Search or type area' : 'Select city first or type'}
                      />
                      {areasLoading && (
                        <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-gray-400" />
                      )}
                    </div>
                    {areas.length > 0 && areaSearch && (() => {
                      const filtered = areas.filter(a =>
                        a.name.toLowerCase().includes(areaSearch.toLowerCase())
                      );
                      return filtered.length > 0 ? (
                        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto text-sm">
                          {filtered.map(a => (
                            <li key={a.id}>
                              <button type="button"
                                className="w-full text-left px-3 py-2 hover:bg-indigo-50 hover:text-indigo-700"
                                onClick={() => {
                                  setField('area', a.name);
                                  setAreaSearch('');
                                }}
                              >{a.name}</button>
                            </li>
                          ))}
                        </ul>
                      ) : null;
                    })()}
                  </div>
                  <div className="col-span-2">
                    <label className={LBL}>Google Maps Link</label>
                    <input className={INP} value={editForm.google_maps_link}
                      onChange={e => setField('google_maps_link', e.target.value)} placeholder="https://maps.app.goo.gl/..." />
                  </div>
                  <div>
                    <label className={LBL}>Latitude</label>
                    <input className={INP} type="number" step="any" value={editForm.lat}
                      onChange={e => setField('lat', e.target.value)} placeholder="e.g. 28.6139" />
                  </div>
                  <div>
                    <label className={LBL}>Longitude</label>
                    <input className={INP} type="number" step="any" value={editForm.lng}
                      onChange={e => setField('lng', e.target.value)} placeholder="e.g. 77.2090" />
                  </div>
                </div>
              </div>

              {/* ── Contact ── */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Contact</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LBL}>Contact Name</label>
                    <input className={INP} value={editForm.contact_name}
                      onChange={e => setField('contact_name', e.target.value)} placeholder="Full name" />
                  </div>
                  <div>
                    <label className={LBL}>Contact Phone</label>
                    <input className={INP} value={editForm.contact_phone}
                      onChange={e => setField('contact_phone', e.target.value)} placeholder="+91 XXXXX XXXXX" />
                  </div>
                </div>
              </div>

              {/* ── Venue Info ── */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Venue Info</p>
                <div className="grid grid-cols-2 gap-4">
                  {/* Category dropdown */}
                  <div>
                    <label className={LBL}>Venue Category</label>
                    <select className={SEL} value={editForm.venue_category}
                      onChange={e => setField('venue_category', e.target.value)}>
                      <option value="">— Select category —</option>
                      {VENUE_CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  {/* Seating Type */}
                  <div>
                    <label className={LBL}>Seating Type</label>
                    <select className={SEL} value={editForm.seating_category}
                      onChange={e => setField('seating_category', e.target.value)}>
                      <option value="">— Select type —</option>
                      {SEATING_CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  {/* Capacity dropdown */}
                  <div>
                    <label className={LBL}>Seating Capacity</label>
                    <select className={SEL} value={editForm.sitting_size}
                      onChange={e => setField('sitting_size', e.target.value)}>
                      <option value="">— Select capacity —</option>
                      {CAPACITY_OPTIONS.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  {/* Chargeable */}
                  <div className="flex flex-col justify-end">
                    <label className={LBL}>Chargeable</label>
                    <label className="flex items-center gap-2 cursor-pointer mt-1">
                      <input
                        type="checkbox"
                        checked={editForm.chargeable}
                        onChange={e => setField('chargeable', e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">Venue charges a fee</span>
                    </label>
                  </div>
                  {editForm.chargeable && (
                    <div className="col-span-2">
                      <label className={LBL}>Reason for Charge</label>
                      <input className={INP} value={editForm.reason_for_charge}
                        onChange={e => setField('reason_for_charge', e.target.value)}
                        placeholder="Describe the charge details..." />
                    </div>
                  )}
                </div>

                {/* Amenities checkboxes */}
                <div className="mt-4">
                  <label className={LBL}>Amenities</label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {AMENITIES_LIST.map(a => {
                      const checked = editForm.amenities.includes(a);
                      return (
                        <label key={a}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs transition-all ${
                            checked
                              ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleAmenity(a)} />
                          <span className={`w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center ${
                            checked ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300'
                          }`}>
                            {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                              <path stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M1 4l3 3 5-6"/>
                            </svg>}
                          </span>
                          {a}
                        </label>
                      );
                    })}
                  </div>

                  {/* Custom amenity chips */}
                  {editForm.amenities.filter(a => !AMENITIES_LIST.includes(a)).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {editForm.amenities.filter(a => !AMENITIES_LIST.includes(a)).map(a => (
                        <span key={a}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 rounded-full"
                        >
                          {a}
                          <button type="button" onClick={() => toggleAmenity(a)}
                            className="hover:text-purple-900 ml-0.5">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Add custom amenity input */}
                  <div className="flex gap-2 mt-3">
                    <input
                      className={`${INP} flex-1`}
                      value={customAmenity}
                      onChange={e => setCustomAmenity(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomAmenity(); } }}
                      placeholder="Add custom amenity…"
                    />
                    <button
                      type="button"
                      onClick={addCustomAmenity}
                      disabled={!customAmenity.trim()}
                      className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 whitespace-nowrap"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Preferred Schedules ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Preferred Schedules</p>
                  <button type="button" onClick={addSchedule}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
                    <Plus className="h-3.5 w-3.5" />Add Schedule
                  </button>
                </div>
                {editForm.preferred_schedules.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-lg">
                    No schedules added. Click "Add Schedule" to add preferred time slots.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {editForm.preferred_schedules.map((schedule, index) => (
                      <div key={index} className="p-3 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-600">Schedule {index + 1}</span>
                          <button type="button" onClick={() => removeSchedule(index)}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={LBL}>Day</label>
                            <select className={SEL} value={schedule.day}
                              onChange={e => updateSchedule(index, { day: e.target.value })}>
                              <option value="WEEKDAY">Weekday</option>
                              <option value="WEEKEND">Weekend</option>
                              {DAYS_OF_WEEK.map(d => (
                                <option key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={LBL}>Activity</label>
                            <select className={SEL} value={schedule.preferred_activity}
                              onChange={e => updateSchedule(index, { preferred_activity: e.target.value })}>
                              <option value="">— Select activity —</option>
                              {ACTIVITY_OPTIONS.map(a => (
                                <option key={a} value={a}>{a}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className={LBL}>Time Slot</label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {Object.entries(TIME_SLOTS).map(([key, slot]) => {
                              const active = schedule.start_time?.hour === slot.start.hour &&
                                schedule.start_time?.minute === slot.start.minute;
                              return (
                                <button key={key} type="button"
                                  onClick={() => updateSchedule(index, {
                                    start_time: active ? undefined : slot.start,
                                    end_time:   active ? undefined : slot.end,
                                  })}
                                  className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                                    active
                                      ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                                  }`}
                                >
                                  {slot.label} <span className="text-gray-400 text-[10px]">{slot.display}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Notes ── */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Notes</p>
                <textarea className={`${INP} resize-none`} rows={3} value={editForm.notes}
                  onChange={e => setField('notes', e.target.value)} placeholder="Any additional notes..." />
              </div>

              {editError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />{editError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 flex-shrink-0">
              <button onClick={closeEdit}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                Cancel
              </button>
              <button onClick={handleEditSave} disabled={editSaving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : isCreating ? <Plus className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                {isCreating ? 'Create Lead' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
