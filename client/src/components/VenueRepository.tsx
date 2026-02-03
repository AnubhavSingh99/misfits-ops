import React, { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  MapPin,
  Loader2,
  RefreshCw,
  Phone,
  User,
  Building2,
  X,
  Edit3,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageSquare,
  Users,
  Trash2
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// Types
interface VenueInfo {
  venue_category?: string;
  seating_category?: string;
  capacity_category?: string;
  amenities?: string[];
  preferred_schedules?: Array<{
    day: string;
    preferred_activity: string;
    start_time?: { hour: number; minute: number };
    end_time?: { hour: number; minute: number };
    notes?: string;
  }>;
  full_address?: string;
  venue_description?: string;
  chargeable?: boolean;
  reason_for_charge?: string;
}

interface Venue {
  id: number;
  name: string;
  url?: string;
  area_id?: number;
  area_name?: string;
  city_name?: string;
  venue_info: VenueInfo;
  status: string;
  contact_name?: string;
  contact_phone?: string;
  contacted_by?: string;
  closed_by?: string;
  rejection_reason?: string;
  notes?: string;
  vms_location_id?: number;
  created_at: string;
  updated_at: string;
}

interface City {
  id: number;
  name: string;
  areas: Array<{ id: number; name: string }>;
}

interface Options {
  statuses: string[];
  venueCategories: string[];
  seatingCategories: string[];
  capacityCategories: string[];
  amenities: string[];
  cities: City[];
}

interface Stats {
  new: number;
  contacted: number;
  interested: number;
  negotiating: number;
  rejected: number;
  onboarded: number;
  total: number;
}

// Status configuration
const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  new: { label: 'New', color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  contacted: { label: 'Contacted', color: 'text-yellow-600', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
  interested: { label: 'Interested', color: 'text-cyan-600', bgColor: 'bg-cyan-50', borderColor: 'border-cyan-200' },
  negotiating: { label: 'Negotiating', color: 'text-purple-600', bgColor: 'bg-purple-50', borderColor: 'border-purple-200' },
  rejected: { label: 'Rejected', color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
  onboarded: { label: 'Onboarded', color: 'text-green-600', bgColor: 'bg-green-50', borderColor: 'border-green-200' }
};

// Capacity label mapping
const CAPACITY_LABELS: Record<string, string> = {
  'LESS_THAN_25': '<25',
  'CAPACITY_25_TO_50': '25-50',
  'CAPACITY_50_PLUS': '50+'
};

// Days of week
const DAYS_OF_WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export function VenueRepository() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [filter, setFilter] = useState({ status: '', search: '' });

  // Fetch options on mount
  useEffect(() => {
    fetchOptions();
    fetchStats();
  }, []);

  // Fetch venues when expanded
  useEffect(() => {
    if (isExpanded && venues.length === 0) {
      fetchVenues();
    }
  }, [isExpanded]);

  const fetchOptions = async () => {
    try {
      const res = await fetch(`${API_BASE}/venue-repository/options`);
      const data = await res.json();
      if (data.success) {
        setOptions(data.options);
      }
    } catch (error) {
      console.error('Error fetching options:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/venue-repository/stats/summary`);
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchVenues = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.status) params.append('status', filter.status);
      if (filter.search) params.append('search', filter.search);
      params.append('limit', '100');

      const res = await fetch(`${API_BASE}/venue-repository?${params}`);
      const data = await res.json();
      if (data.success) {
        setVenues(data.venues);
      }
    } catch (error) {
      console.error('Error fetching venues:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = () => {
    fetchVenues();
  };

  const openCreateModal = () => {
    setEditingVenue(null);
    setShowModal(true);
  };

  const openEditModal = (venue: Venue) => {
    setEditingVenue(venue);
    setShowModal(true);
  };

  const handleSaveVenue = async (venueData: Partial<Venue>) => {
    try {
      const url = editingVenue
        ? `${API_BASE}/venue-repository/${editingVenue.id}`
        : `${API_BASE}/venue-repository`;
      const method = editingVenue ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(venueData)
      });

      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        fetchVenues();
        fetchStats();
      } else {
        alert(data.error || 'Failed to save venue');
      }
    } catch (error) {
      console.error('Error saving venue:', error);
      alert('Failed to save venue');
    }
  };

  const handleDeleteVenue = async (id: number) => {
    if (!confirm('Are you sure you want to delete this venue?')) return;

    try {
      const res = await fetch(`${API_BASE}/venue-repository/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        fetchVenues();
        fetchStats();
      }
    } catch (error) {
      console.error('Error deleting venue:', error);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    const currentVenue = venues.find(v => v.id === id);

    if (newStatus === 'rejected') {
      const reason = prompt('Please enter the rejection reason:');
      if (!reason) return;

      try {
        const res = await fetch(`${API_BASE}/venue-repository/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus, rejection_reason: reason })
        });
        const data = await res.json();
        if (data.success) {
          fetchVenues();
          fetchStats();
        }
      } catch (error) {
        console.error('Error updating status:', error);
      }
    } else if (newStatus === 'contacted' && currentVenue?.status === 'new' && !currentVenue?.contacted_by) {
      // Prompt for who contacted when moving from 'new' to 'contacted'
      const contactedBy = prompt('Who contacted this venue? (Your name)');
      if (!contactedBy) return;

      try {
        const res = await fetch(`${API_BASE}/venue-repository/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus, contacted_by: contactedBy })
        });
        const data = await res.json();
        if (data.success) {
          fetchVenues();
          fetchStats();
        }
      } catch (error) {
        console.error('Error updating status:', error);
      }
    } else {
      try {
        const res = await fetch(`${API_BASE}/venue-repository/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (data.success) {
          fetchVenues();
          fetchStats();
        }
      } catch (error) {
        console.error('Error updating status:', error);
      }
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 mb-6 shadow-sm overflow-hidden">
      {/* Header - Always visible */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Venue Repository</h2>
            <p className="text-sm text-gray-500">
              {stats ? `${stats.total} venues | ${stats.new} new | ${stats.negotiating} negotiating | ${stats.onboarded} onboarded` : 'Track venue sourcing pipeline'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isExpanded && (
            <button
              onClick={(e) => { e.stopPropagation(); openCreateModal(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Venue
            </button>
          )}
          {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-200">
          {/* Stats Row */}
          {stats && (
            <div className="grid grid-cols-6 gap-2 p-4 bg-gray-50 border-b border-gray-200">
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <div
                  key={key}
                  onClick={() => { setFilter(f => ({ ...f, status: f.status === key ? '' : key })); setTimeout(fetchVenues, 0); }}
                  className={`px-3 py-2 rounded-lg cursor-pointer transition-all ${filter.status === key ? `${config.bgColor} ${config.borderColor} border-2` : 'bg-white border border-gray-200 hover:border-gray-300'}`}
                >
                  <div className={`text-xs font-medium ${config.color}`}>{config.label}</div>
                  <div className={`text-xl font-bold ${config.color}`}>{stats[key as keyof Stats]}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3 p-4 border-b border-gray-200">
            <input
              type="text"
              placeholder="Search venues..."
              value={filter.search}
              onChange={(e) => setFilter(f => ({ ...f, search: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleFilterChange()}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={handleFilterChange}
              className="px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {/* Venues List */}
          <div className="max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              </div>
            ) : venues.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No venues found. Add your first venue to get started.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Venue</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Location</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Capacity</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {venues.map((venue) => (
                    <tr key={venue.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{venue.name}</div>
                        {venue.url && (
                          <a
                            href={venue.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" /> Maps
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {venue.area_name && venue.city_name
                          ? `${venue.area_name}, ${venue.city_name}`
                          : venue.city_name || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {venue.venue_info?.capacity_category
                          ? CAPACITY_LABELS[venue.venue_info.capacity_category] || venue.venue_info.capacity_category
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        {venue.contact_name && (
                          <div className="text-gray-900">{venue.contact_name}</div>
                        )}
                        {venue.contact_phone && (
                          <div className="text-xs text-gray-500">{venue.contact_phone}</div>
                        )}
                        {!venue.contact_name && !venue.contact_phone && '-'}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={venue.status}
                          onChange={(e) => handleStatusChange(venue.id, e.target.value)}
                          className={`text-xs px-2 py-1 rounded-full border ${STATUS_CONFIG[venue.status]?.bgColor || 'bg-gray-50'} ${STATUS_CONFIG[venue.status]?.color || 'text-gray-600'} ${STATUS_CONFIG[venue.status]?.borderColor || 'border-gray-200'}`}
                        >
                          {options?.statuses.map((s) => (
                            <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
                          ))}
                        </select>
                        {venue.status === 'rejected' && venue.rejection_reason && (
                          <div className="text-xs text-red-500 mt-1" title={venue.rejection_reason}>
                            {venue.rejection_reason.substring(0, 20)}...
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditModal(venue)}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteVenue(venue.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && options && (
        <VenueModal
          venue={editingVenue}
          options={options}
          onClose={() => setShowModal(false)}
          onSave={handleSaveVenue}
        />
      )}
    </div>
  );
}

// Modal Component
interface VenueModalProps {
  venue: Venue | null;
  options: Options;
  onClose: () => void;
  onSave: (data: Partial<Venue>) => void;
}

function VenueModal({ venue, options, onClose, onSave }: VenueModalProps) {
  const [formData, setFormData] = useState({
    name: venue?.name || '',
    url: venue?.url || '',
    area_id: venue?.area_id || '',
    custom_city: (venue as any)?.custom_city || '',
    custom_area: (venue as any)?.custom_area || '',
    contact_name: venue?.contact_name || '',
    contact_phone: venue?.contact_phone || '',
    contacted_by: venue?.contacted_by || '',
    notes: venue?.notes || '',
    venue_info: {
      venue_category: venue?.venue_info?.venue_category || '',
      seating_category: venue?.venue_info?.seating_category || '',
      capacity_category: venue?.venue_info?.capacity_category || '',
      amenities: venue?.venue_info?.amenities || [],
      full_address: venue?.venue_info?.full_address || '',
      chargeable: venue?.venue_info?.chargeable || false,
      reason_for_charge: venue?.venue_info?.reason_for_charge || '',
      preferred_schedules: venue?.venue_info?.preferred_schedules || []
    }
  });

  const [selectedCity, setSelectedCity] = useState<number | '' | 'custom'>('');
  const [isCustomCity, setIsCustomCity] = useState(false);
  const [isCustomArea, setIsCustomArea] = useState(false);

  // Set initial city based on area_id or custom values
  useEffect(() => {
    if ((venue as any)?.custom_city) {
      setIsCustomCity(true);
      setSelectedCity('custom');
      if ((venue as any)?.custom_area) {
        setIsCustomArea(true);
      }
    } else if (venue?.area_id && options.cities) {
      for (const city of options.cities) {
        if (city.areas.some(a => String(a.id) === String(venue.area_id))) {
          setSelectedCity(Number(city.id));
          break;
        }
      }
    }
  }, [venue, options]);

  const currentCity = options.cities.find(c => String(c.id) === String(selectedCity));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Venue name is required');
      return;
    }
    onSave({
      ...formData,
      area_id: formData.area_id ? Number(formData.area_id) : undefined
    });
  };

  const toggleAmenity = (amenity: string) => {
    setFormData(f => ({
      ...f,
      venue_info: {
        ...f.venue_info,
        amenities: f.venue_info.amenities.includes(amenity)
          ? f.venue_info.amenities.filter(a => a !== amenity)
          : [...f.venue_info.amenities, amenity]
      }
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {venue ? 'Edit Venue' : 'Add New Venue'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Basic Info */}
          <div className="space-y-4 mb-6">
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Basic Info</h4>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Venue Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter venue name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Google Maps URL</label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => setFormData(f => ({ ...f, url: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="https://maps.google.com/..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City
                  {isCustomCity && <span className="text-amber-600 ml-1 text-xs">(New)</span>}
                </label>
                {isCustomCity ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.custom_city}
                      onChange={(e) => setFormData(f => ({ ...f, custom_city: e.target.value, area_id: '' }))}
                      className="flex-1 px-3 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-amber-50"
                      placeholder="Enter new city name"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomCity(false);
                        setIsCustomArea(false);
                        setSelectedCity('');
                        setFormData(f => ({ ...f, custom_city: '', custom_area: '', area_id: '' }));
                      }}
                      className="px-2 py-1 text-gray-500 hover:text-gray-700"
                      title="Switch to dropdown"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <select
                    value={selectedCity}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'custom') {
                        setIsCustomCity(true);
                        setIsCustomArea(true);
                        setSelectedCity('custom');
                        setFormData(f => ({ ...f, area_id: '', custom_city: '', custom_area: '' }));
                      } else {
                        setSelectedCity(val ? Number(val) : '');
                        setFormData(f => ({ ...f, area_id: '', custom_city: '', custom_area: '' }));
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select city</option>
                    {options.cities.map(city => (
                      <option key={city.id} value={city.id}>{city.name}</option>
                    ))}
                    <option value="custom" className="text-amber-600 font-medium">+ Add new city</option>
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Area
                  {isCustomArea && <span className="text-amber-600 ml-1 text-xs">(New)</span>}
                </label>
                {isCustomArea ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.custom_area}
                      onChange={(e) => setFormData(f => ({ ...f, custom_area: e.target.value, area_id: '' }))}
                      className="flex-1 px-3 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-amber-50"
                      placeholder="Enter new area name"
                    />
                    {!isCustomCity && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomArea(false);
                          setFormData(f => ({ ...f, custom_area: '', area_id: '' }));
                        }}
                        className="px-2 py-1 text-gray-500 hover:text-gray-700"
                        title="Switch to dropdown"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <select
                    value={formData.area_id}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'custom') {
                        setIsCustomArea(true);
                        setFormData(f => ({ ...f, area_id: '', custom_area: '' }));
                      } else {
                        setFormData(f => ({ ...f, area_id: val, custom_area: '' }));
                      }
                    }}
                    disabled={!selectedCity || isCustomCity}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                  >
                    <option value="">Select area</option>
                    {currentCity?.areas.map(area => (
                      <option key={area.id} value={area.id}>{area.name}</option>
                    ))}
                    <option value="custom" className="text-amber-600 font-medium">+ Add new area</option>
                  </select>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Address</label>
              <input
                type="text"
                value={formData.venue_info.full_address}
                onChange={(e) => setFormData(f => ({ ...f, venue_info: { ...f.venue_info, full_address: e.target.value } }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Full street address"
              />
            </div>
          </div>

          {/* Venue Details */}
          <div className="space-y-4 mb-6">
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Venue Details</h4>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={formData.venue_info.venue_category}
                  onChange={(e) => setFormData(f => ({ ...f, venue_info: { ...f.venue_info, venue_category: e.target.value } }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select category</option>
                  {options.venueCategories.map(cat => (
                    <option key={cat} value={cat}>{cat.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Seating</label>
                <select
                  value={formData.venue_info.seating_category}
                  onChange={(e) => setFormData(f => ({ ...f, venue_info: { ...f.venue_info, seating_category: e.target.value } }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select seating</option>
                  {options.seatingCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                <select
                  value={formData.venue_info.capacity_category}
                  onChange={(e) => setFormData(f => ({ ...f, venue_info: { ...f.venue_info, capacity_category: e.target.value } }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select capacity</option>
                  {options.capacityCategories.map(cat => (
                    <option key={cat} value={cat}>{CAPACITY_LABELS[cat] || cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Amenities</label>
              <div className="flex flex-wrap gap-2">
                {options.amenities.map(amenity => (
                  <button
                    key={amenity}
                    type="button"
                    onClick={() => toggleAmenity(amenity)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      formData.venue_info.amenities.includes(amenity)
                        ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {amenity}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.venue_info.chargeable}
                  onChange={(e) => setFormData(f => ({ ...f, venue_info: { ...f.venue_info, chargeable: e.target.checked } }))}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Chargeable venue</span>
              </label>
            </div>

            {formData.venue_info.chargeable && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Charge Details</label>
                <input
                  type="text"
                  value={formData.venue_info.reason_for_charge}
                  onChange={(e) => setFormData(f => ({ ...f, venue_info: { ...f.venue_info, reason_for_charge: e.target.value } }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., Cover charge: Rs.100 (Food voucher)"
                />
              </div>
            )}
          </div>

          {/* Contact Info */}
          <div className="space-y-4 mb-6">
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Contact Info</h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue POC Name</label>
                <input
                  type="text"
                  value={formData.contact_name}
                  onChange={(e) => setFormData(f => ({ ...f, contact_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="POC name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue POC Phone</label>
                <input
                  type="tel"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData(f => ({ ...f, contact_phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Phone number"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contacted By</label>
              <input
                type="text"
                value={formData.contacted_by}
                onChange={(e) => setFormData(f => ({ ...f, contacted_by: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Who reached out to this venue?"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Notes</h4>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Any additional notes..."
            />
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {venue ? 'Update Venue' : 'Add Venue'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default VenueRepository;
