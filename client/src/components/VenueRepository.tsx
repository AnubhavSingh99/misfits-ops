import React, { useState, useEffect, useMemo } from 'react';
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
  Trash2,
  Upload,
  Check,
  GripVertical,
  Layers,
  Calendar
} from 'lucide-react';
import { MultiSelectDropdown } from './ui/MultiSelectDropdown';

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
  transferred_to_vms?: boolean;
  transferred_at?: string;
  venue_manager_phone?: string;
  available_since?: string;
  added_by?: string;
  sourced_by_team?: 'bau' | 'supply';
  bau_picked?: boolean;
  bau_picked_at?: string;
  completeness?: { status: 'ready' | 'almost' | 'incomplete' | 'not_started'; label: string; missing: string[]; filled: number; total: number };
  vms_status?: 'data_updated' | 'data_pending' | 'not_in_vms';
  image_file_id?: number;
  image_s3_url?: string;
  photos?: Array<{ s3_url: string; file_id?: number | null; uploaded_at?: string }>;
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
  onboarded_transferred: number;
  onboarded_not_transferred: number;
  inactive: number;
  total: number;
  bau_unpicked: number;
}

interface FilterOption {
  id: number;
  name: string;
  city_id?: number;
}

interface CapacityOption {
  id: number;
  name: string;
  label: string;
}

interface FilterOptions {
  cities: FilterOption[];
  areas: FilterOption[];
  activities: FilterOption[];
  capacities: CapacityOption[];
}

// Status configuration
const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  new: { label: 'New', color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  contacted: { label: 'Contacted', color: 'text-yellow-600', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
  interested: { label: 'Interested', color: 'text-cyan-600', bgColor: 'bg-cyan-50', borderColor: 'border-cyan-200' },
  negotiating: { label: 'Negotiating', color: 'text-purple-600', bgColor: 'bg-purple-50', borderColor: 'border-purple-200' },
  rejected: { label: 'Rejected', color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
  onboarded: { label: 'Onboarded', color: 'text-green-600', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
  inactive: { label: 'Inactive', color: 'text-gray-600', bgColor: 'bg-gray-50', borderColor: 'border-gray-200' }
};

// Capacity label mapping
const CAPACITY_LABELS: Record<string, string> = {
  'LESS_THAN_25': '<25',
  'CAPACITY_25_TO_50': '25-50',
  'CAPACITY_50_PLUS': '50+'
};

// Days of week
const DAYS_OF_WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

// Activity options for preferred schedules (matches VMS activities)
const ACTIVITY_OPTIONS = [
  'Art', 'Badminton', 'Basketball', 'Board Gaming', 'Book Club', 'Bowling',
  'Box Cricket', 'Community Space', 'Content Creation', 'Dance', 'Drama',
  'Films', 'Football', 'Hiking', 'Journaling', 'Mafia', 'Mindfulness',
  'Music', 'Pickleball', 'Quiz', 'Running', 'Yoga'
];

// Time slot presets — matches requirement form's TIME_OF_DAY_OPTIONS from shared/types.ts
const TIME_SLOTS: Record<string, { label: string; icon: string; start: { hour: number; minute: number }; end: { hour: number; minute: number }; display: string }> = {
  early_morning: { label: 'Early Morning', icon: '🌅', start: { hour: 5, minute: 0 },  end: { hour: 8, minute: 0 },  display: '5 AM - 8 AM' },
  morning:       { label: 'Morning',       icon: '☀️', start: { hour: 8, minute: 0 },  end: { hour: 12, minute: 0 }, display: '8 AM - 12 PM' },
  afternoon:     { label: 'Afternoon',     icon: '🌤️', start: { hour: 12, minute: 0 }, end: { hour: 16, minute: 0 }, display: '12 PM - 4 PM' },
  evening:       { label: 'Evening',       icon: '🌆', start: { hour: 16, minute: 0 }, end: { hour: 20, minute: 0 }, display: '4 PM - 8 PM' },
  night:         { label: 'Night',         icon: '🌙', start: { hour: 20, minute: 0 }, end: { hour: 0, minute: 0 },  display: '8 PM - 12 AM' },
  all_nighter:   { label: 'All-Nighter',   icon: '🌃', start: { hour: 0, minute: 0 },  end: { hour: 5, minute: 0 },  display: '12 AM - 5 AM' }
};

// Determine which time slot a schedule entry matches (if any)
function getActiveTimeSlot(start?: { hour: number; minute: number }, end?: { hour: number; minute: number }): string | null {
  if (!start || !end) return null;
  for (const [key, slot] of Object.entries(TIME_SLOTS)) {
    if (start.hour === slot.start.hour && start.minute === slot.start.minute &&
        end.hour === slot.end.hour && end.minute === slot.end.minute) {
      return key;
    }
  }
  return null;
}

function formatTimeObj(t?: { hour: number; minute: number }): string {
  if (!t) return '';
  const h = t.hour % 12 || 12;
  const ampm = t.hour < 12 ? 'AM' : 'PM';
  return t.minute === 0 ? `${h} ${ampm}` : `${h}:${String(t.minute).padStart(2, '0')} ${ampm}`;
}

export function VenueRepository() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [filter, setFilter] = useState({
    search: '',
    cities: [] as number[],
    areas: [] as number[],
    activities: [] as number[],
    capacities: [] as number[],
    notTransferred: false
  });
  const [activeStatusFilters, setActiveStatusFilters] = useState<string[]>(
    ['new', 'contacted', 'interested', 'negotiating', 'rejected']
  );
  const [showOnboardedTransferred, setShowOnboardedTransferred] = useState(false);
  const [showOnboardedNotTransferred, setShowOnboardedNotTransferred] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Expandable detail view
  const [expandedVenueId, setExpandedVenueId] = useState<number | null>(null);

  // BAU workqueue and sourced-by filters
  const [showBauUnpicked, setShowBauUnpicked] = useState(false);
  const [sourcedByFilter, setSourcedByFilter] = useState<'bau' | 'supply' | null>(null);

  // Hierarchy order state (like requirements page)
  type HierarchyLevel = 'city' | 'area';
  const [hierarchyLevels, setHierarchyLevels] = useState<HierarchyLevel[]>(['city', 'area']);
  const [enabledLevels, setEnabledLevels] = useState<Set<HierarchyLevel>>(new Set(['city', 'area']));
  const [draggingLevel, setDraggingLevel] = useState<HierarchyLevel | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const groupByCity = enabledLevels.has('city');
  const groupByArea = enabledLevels.has('area');
  // Determine effective order: only enabled levels, in their drag order
  const effectiveOrder = hierarchyLevels.filter(l => enabledLevels.has(l));

  // Transfer modal state
  const [transferModal, setTransferModal] = useState<{
    venue: Venue;
    managerPhone: string;
    originalPhone: string;
    transferring: boolean;
    showPhoneConfirm: boolean;
  } | null>(null);

  // VMS sync state
  const [syncing, setSyncing] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    cities: [], areas: [], activities: [], capacities: []
  });

  // Computed: filter areas based on selected cities
  const filteredAreaOptions = useMemo(() => {
    if (filter.cities.length === 0) return filterOptions.areas;
    return filterOptions.areas.filter(a => a.city_id && filter.cities.includes(a.city_id));
  }, [filterOptions.areas, filter.cities]);

  // Computed: capacity options with display labels
  const capacityDisplayOptions = useMemo(() =>
    filterOptions.capacities.map(c => ({ id: c.id, name: c.label })),
    [filterOptions.capacities]
  );

  // Compute grouped venue hierarchy
  type VenueGroup = {
    key: string;
    label: string;
    level: 'city' | 'area';
    count: number;
    venues: Venue[];
    children: VenueGroup[];
  };

  const groupedVenues = useMemo((): VenueGroup[] | null => {
    if (effectiveOrder.length === 0) return null; // flat list

    const getField = (v: Venue, level: HierarchyLevel) =>
      level === 'city' ? (v.city_name || 'Unknown City') : (v.area_name || 'Unknown Area');

    const primary = effectiveOrder[0];
    const secondary = effectiveOrder.length > 1 ? effectiveOrder[1] : null;

    const primaryMap = new Map<string, Venue[]>();
    for (const v of venues) {
      const key = getField(v, primary);
      if (!primaryMap.has(key)) primaryMap.set(key, []);
      primaryMap.get(key)!.push(v);
    }

    return Array.from(primaryMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, groupVenues]) => {
        const children: VenueGroup[] = [];
        if (secondary) {
          const secondaryMap = new Map<string, Venue[]>();
          for (const v of groupVenues) {
            const key = getField(v, secondary);
            if (!secondaryMap.has(key)) secondaryMap.set(key, []);
            secondaryMap.get(key)!.push(v);
          }
          for (const [subLabel, subVenues] of Array.from(secondaryMap.entries()).sort(([a], [b]) => a.localeCompare(b))) {
            children.push({
              key: `${label}::${subLabel}`,
              label: subLabel,
              level: secondary,
              count: subVenues.length,
              venues: subVenues,
              children: []
            });
          }
        }
        return {
          key: label,
          label,
          level: primary,
          count: groupVenues.length,
          venues: secondary ? [] : groupVenues,
          children
        };
      });
  }, [venues, effectiveOrder]);

  // Collapse all groups by default on initial data load only
  const hasInitiallyCollapsed = React.useRef(false);
  useEffect(() => {
    if (groupedVenues && groupedVenues.length > 0 && !hasInitiallyCollapsed.current) {
      hasInitiallyCollapsed.current = true;
      const allKeys = new Set<string>();
      for (const group of groupedVenues) {
        allKeys.add(group.key);
        for (const child of group.children) {
          allKeys.add(child.key);
        }
      }
      setCollapsedGroups(allKeys);
    }
  }, [groupedVenues]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Fetch options on mount
  useEffect(() => {
    fetchOptions();
    fetchStats();
    fetchFilterOptions();
  }, []);

  // Fetch venues when expanded
  useEffect(() => {
    if (isExpanded && venues.length === 0) {
      fetchVenues();
    }
  }, [isExpanded]);

  // Auto-refetch when dropdown filters change (only when expanded)
  useEffect(() => {
    if (isExpanded) {
      fetchVenues();
    }
  }, [filter.cities, filter.areas, filter.activities, filter.capacities, filter.notTransferred, activeStatusFilters, showOnboardedTransferred, showOnboardedNotTransferred, showInactive, showBauUnpicked, sourcedByFilter]);

  // Re-fetch when search is cleared so all venues come back
  useEffect(() => {
    if (isExpanded && filter.search === '') {
      fetchVenues();
    }
  }, [filter.search]);

  // Cascading: clear orphaned area selections when city changes
  useEffect(() => {
    if (filter.cities.length > 0 && filter.areas.length > 0) {
      const validAreaIds = filteredAreaOptions.map(a => a.id);
      const cleaned = filter.areas.filter(id => validAreaIds.includes(id));
      if (cleaned.length !== filter.areas.length) {
        setFilter(f => ({ ...f, areas: cleaned }));
      }
    }
  }, [filter.cities]);

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

  const fetchFilterOptions = async () => {
    try {
      const res = await fetch(`${API_BASE}/venue-repository/filter-options`);
      const data = await res.json();
      if (data.success) {
        setFilterOptions(data.options);
      }
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  };

  const fetchVenues = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // Build combined statuses from multi-select + toggle buttons
      const combinedStatuses = [
        ...activeStatusFilters,
        ...((showOnboardedTransferred || showOnboardedNotTransferred) ? ['onboarded'] : []),
        ...(showInactive ? ['inactive'] : [])
      ];
      if (combinedStatuses.length > 0) {
        params.append('statuses', combinedStatuses.join(','));
      }
      // Split onboarded filter
      if (showOnboardedTransferred && !showOnboardedNotTransferred) {
        params.append('onboarded_filter', 'transferred');
      } else if (showOnboardedNotTransferred && !showOnboardedTransferred) {
        params.append('onboarded_filter', 'not_transferred');
      }
      if (filter.search) params.append('search', filter.search);

      // Map selected IDs back to names for API
      if (filter.cities.length > 0) {
        const cityNames = filterOptions.cities
          .filter(c => filter.cities.includes(c.id))
          .map(c => c.name);
        if (cityNames.length > 0) params.append('city_names', cityNames.join(','));
      }
      if (filter.areas.length > 0) {
        const areaNames = filterOptions.areas
          .filter(a => filter.areas.includes(a.id))
          .map(a => a.name);
        if (areaNames.length > 0) params.append('area_names', areaNames.join(','));
      }
      if (filter.activities.length > 0) {
        const actNames = filterOptions.activities
          .filter(a => filter.activities.includes(a.id))
          .map(a => a.name);
        if (actNames.length > 0) params.append('activities', actNames.join(','));
      }
      if (filter.capacities.length > 0) {
        const capNames = filterOptions.capacities
          .filter(c => filter.capacities.includes(c.id))
          .map(c => c.name);
        if (capNames.length > 0) params.append('capacity_categories', capNames.join(','));
      }

      if (filter.notTransferred) {
        params.append('not_transferred', 'true');
      }
      if (showBauUnpicked) {
        params.append('bau_unpicked', 'true');
      }
      if (sourcedByFilter) {
        params.append('sourced_by_team', sourcedByFilter);
      }

      params.append('limit', '10000');

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

  const handleSaveVenue = async (venueData: Partial<Venue>): Promise<number> => {
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
      const venueId = data.venue?.id || editingVenue?.id;
      return venueId;
    } else {
      alert(data.error || 'Failed to save venue');
      throw new Error(data.error || 'Failed to save venue');
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

  // Transfer venue to VMS (or just update venue manager phone if already transferred)
  const handleTransferToVms = async () => {
    if (!transferModal) return;
    // If phone was changed and confirmation not yet shown, show confirmation first
    if (transferModal.managerPhone && transferModal.originalPhone &&
        transferModal.managerPhone !== transferModal.originalPhone && !transferModal.showPhoneConfirm) {
      setTransferModal(prev => prev ? { ...prev, showPhoneConfirm: true } : null);
      return;
    }
    setTransferModal(prev => prev ? { ...prev, transferring: true } : null);
    try {
      const alreadyTransferred = transferModal.venue.transferred_to_vms;

      if (alreadyTransferred) {
        // Already in VMS — just update venue manager phone
        const res = await fetch(`${API_BASE}/venue-repository/${transferModal.venue.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            venue_manager_phone: transferModal.managerPhone || null
          })
        });
        const data = await res.json();
        if (data.success) {
          setTransferModal(null);
          fetchVenues();
          alert('Venue manager phone updated successfully!');
        } else {
          alert(data.error || 'Failed to update venue');
          setTransferModal(prev => prev ? { ...prev, transferring: false } : null);
        }
      } else {
        // Not yet in VMS — do full transfer
        const res = await fetch(`${API_BASE}/venue-repository/${transferModal.venue.id}/transfer-to-vms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            venue_manager_phone: transferModal.managerPhone || undefined
          })
        });
        const data = await res.json();
        if (data.success) {
          setTransferModal(null);
          fetchVenues();
          fetchStats();
          alert(`Venue transferred to VMS successfully!${data.vms_location_id ? ` (VMS ID: ${data.vms_location_id})` : ''}`);
        } else {
          alert(data.error || 'Failed to transfer venue to VMS');
          setTransferModal(prev => prev ? { ...prev, transferring: false } : null);
        }
      }
    } catch (error) {
      console.error('Error transferring to VMS:', error);
      alert('Failed to transfer venue to VMS');
      setTransferModal(prev => prev ? { ...prev, transferring: false } : null);
    }
  };

  // VMS Sync
  const handleVmsSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API_BASE}/venue-repository/vms-sync`);
      const data = await res.json();
      if (data.success) {
        alert(`Synced ${data.synced_count} venues from VMS (${data.total_in_vms} total in VMS, ${data.already_tracked} already tracked)`);
        if (data.synced_count > 0) {
          fetchVenues();
          fetchStats();
          fetchFilterOptions();
        }
      } else {
        alert(data.error || 'Failed to sync from VMS');
      }
    } catch (error) {
      console.error('Error syncing from VMS:', error);
      alert('Failed to sync from VMS');
    } finally {
      setSyncing(false);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    const currentVenue = venues.find(v => v.id === id);

    // Intercept onboarded status to offer VMS transfer / venue manager phone
    if (newStatus === 'onboarded' && currentVenue) {
      // First update the status
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
          // Show transfer modal
          const v = data.venue || { ...currentVenue, status: 'onboarded' };
          const phone = v.contact_phone || '';
          setTransferModal({
            venue: v,
            managerPhone: phone,
            originalPhone: phone,
            transferring: false,
            showPhoneConfirm: false
          });
        }
      } catch (error) {
        console.error('Error updating status:', error);
      }
      return;
    }

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

  const renderVenueRow = (venue: Venue, indented = false) => (
    <React.Fragment key={venue.id}>
    <tr className={`hover:bg-gray-50 ${!venue.bau_picked ? 'border-l-4 border-l-red-400' : ''}`}>
      <td className={`px-4 py-3 break-words ${indented ? 'pl-12' : ''}`}>
        <div className="flex items-start gap-2 flex-wrap">
          <span
            className="font-medium text-gray-900 text-sm cursor-pointer hover:text-indigo-600 hover:underline"
            onClick={() => setExpandedVenueId(expandedVenueId === venue.id ? null : venue.id)}
          >
            {venue.name}
          </span>
          {venue.vms_status === 'data_updated' && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 border border-green-200" title={`In VMS with data filled${venue.vms_location_id ? ` (ID: ${venue.vms_location_id})` : ''}`}>
              <Check className="h-2.5 w-2.5" />
              In VMS - Data Updated
            </span>
          )}
          {venue.vms_status === 'data_pending' && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200" title={`In VMS but data not filled yet${venue.vms_location_id ? ` (ID: ${venue.vms_location_id})` : ''}`}>
              <Clock className="h-2.5 w-2.5" />
              In VMS - Data Pending
            </span>
          )}
          {venue.vms_status === 'not_in_vms' && venue.status === 'onboarded' && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200" title="Not yet transferred to VMS">
              Not in VMS
            </span>
          )}
          {/* Transfer readiness indicator */}
          {venue.completeness && (
            <div className="inline-flex items-center gap-1.5 group/ready relative" title={venue.completeness.missing.length > 0 ? `Missing: ${venue.completeness.missing.join(', ')}` : 'All required fields filled'}>
              {/* Progress bar */}
              <div className="w-12 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${
                  venue.completeness.status === 'ready' ? 'bg-green-500' :
                  venue.completeness.status === 'almost' ? 'bg-amber-400' :
                  venue.completeness.status === 'incomplete' ? 'bg-red-400' : 'bg-gray-300'
                }`} style={{ width: `${Math.round((venue.completeness.filled / venue.completeness.total) * 100)}%` }} />
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap ${
                venue.completeness.status === 'ready' ? 'text-green-600' :
                venue.completeness.status === 'almost' ? 'text-amber-600' :
                venue.completeness.status === 'incomplete' ? 'text-red-500' : 'text-gray-400'
              }`}>
                {venue.completeness.label}
              </span>
              {/* Tooltip with missing fields */}
              {venue.completeness.missing.length > 0 && (
                <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover/ready:block">
                  <div className="bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
                    <div className="font-medium mb-1">Missing for transfer:</div>
                    {venue.completeness.missing.map(m => (
                      <div key={m} className="text-red-300">• {m}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {venue.url && (
          <a href={venue.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
            <ExternalLink className="h-3 w-3" /> Maps
          </a>
        )}
      </td>
      <td className="px-4 py-3 text-gray-600">
        {venue.venue_info?.capacity_category
          ? CAPACITY_LABELS[venue.venue_info.capacity_category] || venue.venue_info.capacity_category
          : '-'}
      </td>
      <td className="px-4 py-3 text-xs text-gray-900">
        {venue.contact_name || <span className="text-gray-400">-</span>}
      </td>
      <td className="px-4 py-3">
        {venue.contact_phone ? (
          <a href={`tel:${venue.contact_phone}`} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5">
            <Phone className="h-3 w-3" />{venue.contact_phone}
          </a>
        ) : <span className="text-gray-400 text-xs">-</span>}
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
          {/* BAU pick-up button */}
          {!venue.bau_picked && (
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`${API_BASE}/venue-repository/${venue.id}/bau-pick`, { method: 'PATCH' });
                  const data = await res.json();
                  if (data.success) { fetchVenues(); fetchStats(); }
                } catch (err) { console.error('Error picking venue:', err); }
              }}
              className="p-1.5 text-red-500 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
              title="Pick up (BAU)"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => openEditModal(venue)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Edit">
            <Edit3 className="h-4 w-4" />
          </button>
          {venue.status === 'onboarded' && (
            <button
              onClick={() => {
                const phone = venue.contact_phone || venue.venue_manager_phone || '';
                setTransferModal({ venue, managerPhone: phone, originalPhone: phone, transferring: false, showPhoneConfirm: false });
              }}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                venue.transferred_to_vms
                  ? 'text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200'
                  : 'text-green-700 bg-green-50 hover:bg-green-100 border border-green-200'
              }`}
              title={venue.transferred_to_vms ? 'Re-transfer to push updates to VMS' : 'Transfer to VMS'}
            >
              <Upload className="h-3 w-3" />
              {venue.transferred_to_vms ? 'Re-transfer' : 'Send to VMS'}
            </button>
          )}
          {venue.status !== 'onboarded' && !venue.transferred_to_vms && (
            <button onClick={() => handleDeleteVenue(venue.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
    {/* Expandable detail panel */}
    {expandedVenueId === venue.id && (
      <tr>
        <td colSpan={7} className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="font-medium text-gray-500 text-xs uppercase mb-2">Venue Details</div>
              <div className="space-y-1.5">
                <div><span className="text-gray-500">Name:</span> <span className="text-gray-900">{venue.name}</span></div>
                <div><span className="text-gray-500">Area:</span> <span className={venue.area_name ? 'text-gray-900' : 'text-red-400 italic'}>{venue.area_name || venue.city_name || 'Not filled'}</span></div>
                <div><span className="text-gray-500">Maps URL:</span> {venue.url ? <a href={venue.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">View</a> : <span className="text-red-400 italic">Not filled</span>}</div>
                <div><span className="text-gray-500">Address:</span> <span className={venue.venue_info?.full_address ? 'text-gray-900' : 'text-red-400 italic'}>{venue.venue_info?.full_address || 'Not filled'}</span></div>
                {venue.available_since && <div><span className="text-gray-500">Available since:</span> <span className="text-gray-900">{new Date(venue.available_since).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>}
                {venue.added_by && <div><span className="text-gray-500">Added by:</span> <span className="text-gray-900">{venue.added_by}</span></div>}
                {venue.sourced_by_team && <div><span className="text-gray-500">Sourced by:</span> <span className={`font-medium ${venue.sourced_by_team === 'supply' ? 'text-orange-600' : 'text-gray-600'}`}>{venue.sourced_by_team === 'supply' ? 'Supply' : 'BAU'}</span></div>}
              </div>
            </div>
            <div>
              <div className="font-medium text-gray-500 text-xs uppercase mb-2">Contact & Category</div>
              <div className="space-y-1.5">
                <div><span className="text-gray-500">Contact:</span> <span className={venue.contact_name ? 'text-gray-900' : 'text-red-400 italic'}>{venue.contact_name || 'Not filled'}</span></div>
                <div><span className="text-gray-500">Phone:</span> <span className={venue.contact_phone ? 'text-gray-900' : 'text-red-400 italic'}>{venue.contact_phone || 'Not filled'}</span></div>
                <div><span className="text-gray-500">Category:</span> <span className={venue.venue_info?.venue_category ? 'text-gray-900' : 'text-red-400 italic'}>{venue.venue_info?.venue_category || 'Not filled'}</span></div>
                <div><span className="text-gray-500">Capacity:</span> <span className={venue.venue_info?.capacity_category ? 'text-gray-900' : 'text-red-400 italic'}>{venue.venue_info?.capacity_category ? (CAPACITY_LABELS[venue.venue_info.capacity_category] || venue.venue_info.capacity_category) : 'Not filled'}</span></div>
                <div><span className="text-gray-500">Seating:</span> <span className={venue.venue_info?.seating_category ? 'text-gray-900' : 'text-red-400 italic'}>{venue.venue_info?.seating_category || 'Not filled'}</span></div>
              </div>
            </div>
            <div>
              <div className="font-medium text-gray-500 text-xs uppercase mb-2">More Info</div>
              <div className="space-y-1.5">
                <div><span className="text-gray-500">Amenities:</span> <span className={venue.venue_info?.amenities?.length ? 'text-gray-900' : 'text-red-400 italic'}>{venue.venue_info?.amenities?.join(', ') || 'Not filled'}</span></div>
                <div><span className="text-gray-500">Schedules:</span> <span className={venue.venue_info?.preferred_schedules?.length ? 'text-gray-900' : 'text-red-400 italic'}>{venue.venue_info?.preferred_schedules?.length ? `${venue.venue_info.preferred_schedules.length} schedules` : 'Not filled'}</span></div>
                {venue.notes && <div><span className="text-gray-500">Notes:</span> <span className="text-gray-900">{venue.notes}</span></div>}
                <div className="pt-2">
                  <button onClick={() => openEditModal(venue)} className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex items-center gap-1">
                    <Edit3 className="h-3 w-3" /> Edit Venue
                  </button>
                </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    )}
    </React.Fragment>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header - Always visible, styled like Done & Deprioritised */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50/80 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-indigo-500" />
          <span className="font-medium text-gray-700">
            Venue Repository ({stats?.total || 0})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isExpanded && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleVmsSync();
                }}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Sync from VMS
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); openCreateModal(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Venue
              </button>
            </>
          )}
          {isExpanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-200">
          {/* Filter Dropdowns */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-white flex-wrap">
            {/* Status Filter Dropdown */}
            <MultiSelectDropdown<string>
              label="Status"
              options={[
                { id: 'new', name: 'New' },
                { id: 'contacted', name: 'Contacted' },
                { id: 'interested', name: 'Interested' },
                { id: 'negotiating', name: 'Negotiating' },
                { id: 'rejected', name: 'Rejected' }
              ]}
              selected={activeStatusFilters}
              onChange={(val) => { setActiveStatusFilters(val); setShowOnboardedTransferred(false); setShowOnboardedNotTransferred(false); setShowInactive(false); }}
              icon={<Clock className="h-3.5 w-3.5" />}
              compact
            />
            {/* Divider */}
            <div className="h-6 w-px bg-gray-200" />
            {/* Onboarded - Transferred toggle */}
            <button
              onClick={() => {
                const turningOn = !showOnboardedTransferred;
                setShowOnboardedTransferred(turningOn);
                setShowOnboardedNotTransferred(false);
                setShowInactive(false);
                setActiveStatusFilters(turningOn ? [] : ['new', 'contacted', 'interested', 'negotiating', 'rejected']);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                showOnboardedTransferred
                  ? 'bg-green-50 text-green-700 border-green-300'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              <CheckCircle2 className="h-3 w-3" />
              Onboarded - Transferred ({stats?.onboarded_transferred || 0})
            </button>
            {/* Onboarded - Not Transferred toggle */}
            <button
              onClick={() => {
                const turningOn = !showOnboardedNotTransferred;
                setShowOnboardedNotTransferred(turningOn);
                setShowOnboardedTransferred(false);
                setShowInactive(false);
                setActiveStatusFilters(turningOn ? [] : ['new', 'contacted', 'interested', 'negotiating', 'rejected']);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                showOnboardedNotTransferred
                  ? 'bg-orange-50 text-orange-700 border-orange-300'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              <Clock className="h-3 w-3" />
              Onboarded - Not Transferred ({stats?.onboarded_not_transferred || 0})
            </button>
            {/* Inactive toggle */}
            <button
              onClick={() => {
                const turningOn = !showInactive;
                setShowInactive(turningOn);
                setShowOnboardedTransferred(false);
                setShowOnboardedNotTransferred(false);
                setActiveStatusFilters(turningOn ? [] : ['new', 'contacted', 'interested', 'negotiating', 'rejected']);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                showInactive
                  ? 'bg-gray-100 text-gray-700 border-gray-400'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              Inactive ({stats?.inactive || 0})
            </button>
            <div className="h-6 w-px bg-gray-200" />
            <MultiSelectDropdown
              label="City"
              options={filterOptions.cities}
              selected={filter.cities}
              onChange={(ids) => setFilter(f => ({ ...f, cities: ids }))}
              icon={<MapPin className="h-3.5 w-3.5" />}
              compact
            />
            <MultiSelectDropdown
              label="Area"
              options={filteredAreaOptions}
              selected={filter.areas}
              onChange={(ids) => setFilter(f => ({ ...f, areas: ids }))}
              icon={<Building2 className="h-3.5 w-3.5" />}
              compact
            />
            <MultiSelectDropdown
              label="Activity"
              options={filterOptions.activities}
              selected={filter.activities}
              onChange={(ids) => setFilter(f => ({ ...f, activities: ids }))}
              icon={<Calendar className="h-3.5 w-3.5" />}
              compact
            />
            <MultiSelectDropdown
              label="Capacity"
              options={capacityDisplayOptions}
              selected={filter.capacities}
              onChange={(ids) => setFilter(f => ({ ...f, capacities: ids }))}
              icon={<Users className="h-3.5 w-3.5" />}
              compact
            />
            <div className="h-6 w-px bg-gray-200" />
            <div className="h-6 w-px bg-gray-200" />

            {/* BAU Workqueue toggle */}
            <button
              onClick={() => setShowBauUnpicked(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                showBauUnpicked
                  ? 'bg-red-50 text-red-700 border-red-300'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              BAU Workqueue ({stats?.bau_unpicked || 0})
            </button>

            {/* Sourced by filter */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSourcedByFilter(prev => prev === 'bau' ? null : 'bau')}
                className={`px-2.5 py-1 text-[10px] font-medium rounded-full transition-all ${
                  sourcedByFilter === 'bau'
                    ? 'bg-gray-700 text-white'
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
                }`}
              >
                BAU sourced
              </button>
              <button
                onClick={() => setSourcedByFilter(prev => prev === 'supply' ? null : 'supply')}
                className={`px-2.5 py-1 text-[10px] font-medium rounded-full transition-all ${
                  sourcedByFilter === 'supply'
                    ? 'bg-orange-500 text-white'
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
                }`}
              >
                Supply sourced
              </button>
            </div>

            {(filter.cities.length > 0 || filter.areas.length > 0 || filter.activities.length > 0 || filter.capacities.length > 0 || filter.notTransferred || showBauUnpicked || sourcedByFilter) && (
              <button
                onClick={() => {
                  setFilter(f => ({ ...f, cities: [], areas: [], activities: [], capacities: [], notTransferred: false }));
                  setShowBauUnpicked(false);
                  setSourcedByFilter(null);
                }}
                className="px-2 py-1 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Search + Hierarchy */}
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
            <div className="h-6 w-px bg-gray-200" />
            <Layers size={14} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-500">Hierarchy Order:</span>
            {hierarchyLevels.map((level, index) => {
              const isEnabled = enabledLevels.has(level);
              const isDragging = draggingLevel === level;
              const isDragTarget = draggingLevel && draggingLevel !== level;
              const config = level === 'city'
                ? { icon: MapPin, color: 'blue', label: 'City', enabled: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100', disabled: 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100' }
                : { icon: Building2, color: 'cyan', label: 'Area', enabled: 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100', disabled: 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100' };
              const Icon = config.icon;
              return (
                <div
                  key={level}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDraggingLevel(level); }}
                  onDragEnd={() => setDraggingLevel(null)}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggingLevel && draggingLevel !== level) {
                      const newLevels = [...hierarchyLevels];
                      const dragIdx = newLevels.indexOf(draggingLevel);
                      const dropIdx = newLevels.indexOf(level);
                      newLevels.splice(dragIdx, 1);
                      newLevels.splice(dropIdx, 0, draggingLevel);
                      setHierarchyLevels(newLevels);
                    }
                  }}
                  style={{
                    transform: isDragging ? 'scale(1.05) rotate(-2deg)' : isDragTarget ? 'scale(0.98)' : 'scale(1)',
                    opacity: isDragging ? 0.7 : 1,
                    boxShadow: isDragging ? '0 8px 20px -4px rgba(0,0,0,0.15)' : 'none'
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-grab active:cursor-grabbing border text-xs font-medium select-none transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${isEnabled ? config.enabled : config.disabled}`}
                >
                  <GripVertical size={12} className={`transition-all ${isDragging ? 'opacity-70' : 'opacity-30'}`} />
                  <Icon size={12} />
                  <span>{config.label}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setEnabledLevels(prev => {
                        const next = new Set(prev);
                        if (next.has(level)) next.delete(level);
                        else next.add(level);
                        return next;
                      });
                    }}
                    className={`ml-0.5 p-0.5 rounded-full transition-all ${isEnabled ? 'bg-green-100/80 hover:bg-green-200 text-green-600' : 'bg-gray-200/80 hover:bg-gray-300 text-gray-400'}`}
                  >
                    {isEnabled ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={2.5} />}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Venues List */}
          <div className="max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              </div>
            ) : venues.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No venues found. Add your first venue to get started.
              </div>
            ) : groupedVenues ? (
              /* Grouped view */
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col className="w-[30%]" />
                  <col className="w-[12%]" />
                  <col className="w-[15%]" />
                  <col className="w-[15%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                </colgroup>
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Venue</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Capacity</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Contact Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Contact Number</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                {groupedVenues.map((group) => {
                  const isCollapsed = collapsedGroups.has(group.key);
                  return (
                    <React.Fragment key={group.key}>
                      {/* City/Area group header */}
                      <tr
                        onClick={() => toggleGroup(group.key)}
                        className={`cursor-pointer ${
                          group.level === 'city'
                            ? 'bg-blue-50/60 hover:bg-blue-50'
                            : 'bg-cyan-50/40 hover:bg-cyan-50/60'
                        }`}
                      >
                        <td colSpan={6} className={`px-4 py-2.5 ${group.level !== 'city' ? 'pl-8' : ''}`}>
                          <div className="flex items-center gap-2">
                            {isCollapsed ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronUp className="h-3.5 w-3.5 text-gray-400" />}
                            {group.level === 'city'
                              ? <MapPin className="h-3.5 w-3.5 text-blue-500" />
                              : <Building2 className="h-3.5 w-3.5 text-cyan-500" />}
                            <span className={`text-sm font-medium ${group.level === 'city' ? 'text-blue-800' : 'text-cyan-800'}`}>
                              {group.label}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              group.level === 'city' ? 'bg-blue-100 text-blue-600' : 'bg-cyan-100 text-cyan-600'
                            }`}>
                              {group.count}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {!isCollapsed && (
                        <>
                          {/* Render children (area sub-groups) */}
                          {group.children.map((child) => {
                            const childCollapsed = collapsedGroups.has(child.key);
                            return (
                              <React.Fragment key={child.key}>
                                <tr
                                  onClick={() => toggleGroup(child.key)}
                                  className="cursor-pointer bg-cyan-50/40 hover:bg-cyan-50/60"
                                >
                                  <td colSpan={6} className="px-4 pl-8 py-2">
                                    <div className="flex items-center gap-2">
                                      {childCollapsed ? <ChevronDown className="h-3 w-3 text-gray-400" /> : <ChevronUp className="h-3 w-3 text-gray-400" />}
                                      <Building2 className="h-3.5 w-3.5 text-cyan-500" />
                                      <span className="text-sm font-medium text-cyan-800">{child.label}</span>
                                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-600">{child.count}</span>
                                    </div>
                                  </td>
                                </tr>
                                {!childCollapsed && child.venues.map((venue) => renderVenueRow(venue, true))}
                              </React.Fragment>
                            );
                          })}
                          {/* Render direct venues (when no area sub-grouping) */}
                          {group.venues.map((venue) => renderVenueRow(venue, true))}
                        </>
                      )}
                    </React.Fragment>
                  );
                })}
                </tbody>
              </table>
            ) : (
              /* Flat table view */
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col className="w-[30%]" />
                  <col className="w-[12%]" />
                  <col className="w-[15%]" />
                  <col className="w-[15%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                </colgroup>
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Venue</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Capacity</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Contact Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Contact Number</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {venues.map((venue) => renderVenueRow(venue))}
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
          onSave={async (data) => {
            const venueId = await handleSaveVenue(data);
            setShowModal(false);
            fetchVenues();
            fetchStats();
            fetchFilterOptions();
            return venueId;
          }}
        />
      )}

      {/* Transfer to VMS Modal */}
      {transferModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-green-50">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Upload className="h-5 w-5 text-green-600" />
                  {transferModal.venue.transferred_to_vms ? 'Update Venue Manager' : 'Transfer to VMS'}
                </h3>
                <p className="text-sm text-gray-500">
                  {transferModal.venue.transferred_to_vms ? 'Venue is already in VMS. Update venue manager phone.' : 'Transfer this venue to production'}
                </p>
              </div>
              <button
                onClick={() => !transferModal.transferring && setTransferModal(null)}
                disabled={transferModal.transferring}
                className="p-1 hover:bg-green-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Venue details preview */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="text-sm font-medium text-gray-900">{transferModal.venue.name}</div>
                {(transferModal.venue.area_name || transferModal.venue.city_name) && (
                  <div className="text-xs text-gray-500">
                    {[transferModal.venue.area_name, transferModal.venue.city_name].filter(Boolean).join(', ')}
                  </div>
                )}
                {transferModal.venue.venue_info?.capacity_category && (
                  <div className="text-xs text-gray-500">
                    Capacity: {CAPACITY_LABELS[transferModal.venue.venue_info.capacity_category] || transferModal.venue.venue_info.capacity_category}
                  </div>
                )}
              </div>

              {/* Missing fields warning (only for new transfers) */}
              {!transferModal.venue.transferred_to_vms && (() => {
                const v = transferModal.venue;
                const info = v.venue_info || {};
                const missing: string[] = [];
                if (!v.area_id && !v.area_name) missing.push('Area');
                if (!v.url) missing.push('Google Maps URL');
                if (!v.contact_name) missing.push('Contact Name');
                if (!v.contact_phone) missing.push('Contact Phone');
                if (!info.venue_category) missing.push('Venue Category');
                if (!info.capacity_category) missing.push('Capacity');
                if (missing.length === 0) return null;
                return (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-red-700">Missing required fields</p>
                        <p className="text-xs text-red-600 mt-1">Please edit the venue and fill in: {missing.join(', ')}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Venue Manager Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Venue Manager Phone {transferModal.originalPhone && <span className="text-gray-400">(pre-filled from contact)</span>}
                </label>
                <input
                  type="tel"
                  value={transferModal.managerPhone}
                  onChange={(e) => setTransferModal(prev => prev ? { ...prev, managerPhone: e.target.value, showPhoneConfirm: false } : null)}
                  placeholder="e.g., 9876543210"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  disabled={transferModal.transferring}
                />
                <p className="text-xs text-gray-400 mt-1">If provided, this person will be assigned as venue manager in VMS</p>
              </div>

              {/* Phone change confirmation */}
              {transferModal.showPhoneConfirm && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-700">POC number changed</p>
                      <p className="text-xs text-amber-600 mt-1">
                        You changed the POC number from <strong>{transferModal.originalPhone}</strong> to <strong>{transferModal.managerPhone}</strong>. Are you sure? This number is used for all venue communication.
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleTransferToVms()}
                          className="px-3 py-1 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700"
                        >
                          Yes, use new number
                        </button>
                        <button
                          onClick={() => setTransferModal(prev => prev ? { ...prev, managerPhone: prev.originalPhone, showPhoneConfirm: false } : null)}
                          className="px-3 py-1 text-xs font-medium text-amber-700 bg-white border border-amber-300 rounded-lg hover:bg-amber-50"
                        >
                          Revert
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setTransferModal(null)}
                disabled={transferModal.transferring}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Skip
              </button>
              <button
                onClick={handleTransferToVms}
                disabled={transferModal.transferring}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {transferModal.transferring ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {transferModal.venue.transferred_to_vms ? 'Saving...' : 'Transferring...'}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {transferModal.venue.transferred_to_vms ? 'Save' : 'Transfer'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Modal Component
interface VenueModalProps {
  venue: Venue | null;
  options: Options;
  onClose: () => void;
  onSave: (data: Partial<Venue>) => Promise<number>;
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
    available_since: venue?.available_since || '',
    added_by: venue?.added_by || '',
    sourced_by_team: venue?.sourced_by_team || 'bau',
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

  const [urlError, setUrlError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedCity, setSelectedCity] = useState<number | '' | 'custom'>('');

  // Image upload state
  const [coverPreview, setCoverPreview] = useState<string | null>(venue?.image_s3_url || null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [photos, setPhotos] = useState<Array<{ s3_url: string; file?: File; isNew?: boolean }>>(
    (venue?.photos || []).map(p => ({ s3_url: p.s3_url }))
  );
  const [uploading, setUploading] = useState(false);
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

  const validateUrl = (url: string): string | null => {
    if (!url) return null;
    const validPatterns = ['maps.google.com', 'maps.app.goo.gl', 'www.google.com/maps', 'google.com/maps', 'goo.gl/maps'];
    if (url.includes('share.google')) {
      return 'Please use a Google Maps URL, not a share.google link. Open the link in Maps first and copy the URL from the address bar.';
    }
    if (!validPatterns.some(p => url.includes(p))) {
      return 'URL must be a Google Maps link (maps.google.com or maps.app.goo.gl)';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Venue name is required');
      return;
    }

    // Validate URL format
    if (formData.url.trim()) {
      const urlErr = validateUrl(formData.url.trim());
      if (urlErr) {
        setUrlError(urlErr);
        alert(urlErr);
        return;
      }
    }

    setSaving(true);
    setUploading(true);
    setUrlError('');
    try {
      const venueId = await onSave({
        ...formData,
        area_id: formData.area_id ? Number(formData.area_id) : undefined
      });
      if (venueId) {
        // Upload cover image if new file selected
        if (coverFile) {
          const fd = new FormData();
          fd.append('image', coverFile);
          const res = await fetch(`${API_BASE}/venue-repository/${venueId}/upload-cover`, { method: 'POST', body: fd });
          const data = await res.json();
          if (!res.ok) alert(`Cover upload failed: ${data.error}`);
        }
        // Upload new additional photos
        for (const photo of photos) {
          if (photo.isNew && photo.file) {
            const fd = new FormData();
            fd.append('image', photo.file);
            const res = await fetch(`${API_BASE}/venue-repository/${venueId}/upload-photo`, { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) alert(`Photo upload failed: ${data.error}`);
          }
        }
      }
    } catch (err: any) {
      // Error is handled by parent
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const validateFile = (file: File): boolean => {
    if (!file.type.startsWith('image/')) { alert('Please select an image file'); return false; }
    if (file.size > 10 * 1024 * 1024) { alert('Image must be under 10MB'); return false; }
    return true;
  };

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !validateFile(file)) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const removeCover = async () => {
    if (venue?.id && venue.image_s3_url) {
      await fetch(`${API_BASE}/venue-repository/${venue.id}/cover`, { method: 'DELETE' });
    }
    setCoverPreview(null);
    setCoverFile(null);
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter(f => validateFile(f));
    const newPhotos = valid.map(f => ({ s3_url: URL.createObjectURL(f), file: f, isNew: true }));
    setPhotos(prev => [...prev, ...newPhotos]);
    e.target.value = '';
  };

  const removePhoto = async (index: number) => {
    const photo = photos[index];
    if (!photo.isNew && venue?.id) {
      await fetch(`${API_BASE}/venue-repository/${venue.id}/photo`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ s3_url: photo.s3_url })
      });
    }
    setPhotos(prev => prev.filter((_, i) => i !== index));
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
          {/* VMS Status Notice */}
          {venue?.vms_status === 'data_updated' && (
            <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
              <strong>In VMS - Data Updated</strong> (ID: {venue.vms_location_id}). This venue already exists in VMS with data filled. Changes here will update the existing venue.
            </div>
          )}
          {venue?.vms_status === 'data_pending' && (
            <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <strong>In VMS - Data Pending</strong> (ID: {venue.vms_location_id}). This venue is in VMS but data (category, amenities, etc.) hasn't been filled yet. Fill in the details and transfer again to update.
            </div>
          )}

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

            {/* Cover Image */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cover Image
                {venue?.image_s3_url && !coverFile && (
                  <span className="ml-2 text-xs text-green-600 font-normal">(existing cover in VMS)</span>
                )}
              </label>
              {coverPreview ? (
                <div className="relative inline-block">
                  <img
                    src={coverPreview}
                    alt="Cover preview"
                    className="w-40 h-28 object-cover rounded-lg border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={removeCover}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-sm"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center w-40 h-28 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors">
                  <div className="text-center">
                    <Upload className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                    <span className="text-xs text-gray-500">Upload cover</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCoverSelect}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {/* Additional Photos */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional Photos
                <span className="ml-1 text-xs text-gray-400 font-normal">({photos.length} added)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {photos.map((photo, idx) => (
                  <div key={idx} className="relative inline-block">
                    <img
                      src={photo.s3_url}
                      alt={`Photo ${idx + 1}`}
                      className="w-24 h-20 object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(idx)}
                      className="absolute -top-1.5 -right-1.5 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-sm"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                    {photo.isNew && (
                      <span className="absolute bottom-0.5 left-0.5 px-1 py-0.5 bg-blue-500/80 text-white text-[9px] rounded">New</span>
                    )}
                  </div>
                ))}
                <label className="flex items-center justify-center w-24 h-20 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors">
                  <div className="text-center">
                    <Plus className="h-4 w-4 text-gray-400 mx-auto" />
                    <span className="text-[10px] text-gray-500">Add photos</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {uploading && (
              <div className="flex items-center gap-2 text-sm text-indigo-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Uploading images...</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Google Maps URL</label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => { setFormData(f => ({ ...f, url: e.target.value })); setUrlError(''); }}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${urlError ? 'border-red-300 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-indigo-500'}`}
                placeholder="https://maps.google.com/..."
              />
              {urlError && (
                <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 flex-shrink-0" />
                  {urlError}
                </p>
              )}
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

          {/* Preferred Schedules */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                <Calendar className="h-4 w-4 text-indigo-500" />
                Preferred Schedules
              </h4>
              <button
                type="button"
                onClick={() => setFormData(f => ({
                  ...f,
                  venue_info: {
                    ...f.venue_info,
                    preferred_schedules: [
                      ...f.venue_info.preferred_schedules,
                      { day: '', preferred_activity: '', start_time: undefined, end_time: undefined }
                    ]
                  }
                }))}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-200"
              >
                <Plus className="h-3 w-3" /> Add Schedule
              </button>
            </div>

            {formData.venue_info.preferred_schedules.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No schedules added. Click "Add Schedule" to specify when this venue is available.</p>
            ) : (
              <div className="space-y-3">
                {formData.venue_info.preferred_schedules.map((sched, idx) => {
                  // Multi-select time slots: use time_slots field, or backward-compat from start_time/end_time
                  const currentTimeSlots: string[] = sched.time_slots
                    ? sched.time_slots.split(', ').filter(Boolean)
                    : (() => { const s = getActiveTimeSlot(sched.start_time, sched.end_time); return s ? [s] : []; })();
                  const currentActivities = sched.preferred_activity
                    ? sched.preferred_activity.split(', ').filter(Boolean)
                    : [];
                  const currentDays = sched.day
                    ? sched.day.split(', ').filter(Boolean)
                    : [];
                  const DAY_OPTIONS = [
                    { value: 'WEEKDAY', label: 'Weekdays', short: 'Wkday' },
                    { value: 'WEEKEND', label: 'Weekends', short: 'Wkend' },
                    ...DAYS_OF_WEEK.map(d => ({ value: d, label: d.charAt(0) + d.slice(1).toLowerCase(), short: d.slice(0, 3) }))
                  ];
                  return (
                    <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                      {/* Row 1: Time slots (multi-select toggles) + remove */}
                      <div className="flex items-center gap-2">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(TIME_SLOTS).map(([key, slot]) => {
                            const isSelected = currentTimeSlots.includes(key);
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => {
                                  const newSlots = isSelected
                                    ? currentTimeSlots.filter(s => s !== key)
                                    : [...currentTimeSlots, key];
                                  const updated = [...formData.venue_info.preferred_schedules];
                                  updated[idx] = { ...updated[idx], time_slots: newSlots.join(', '), start_time: undefined, end_time: undefined };
                                  setFormData(f => ({ ...f, venue_info: { ...f.venue_info, preferred_schedules: updated } }));
                                }}
                                className={`px-2 py-1 text-[10px] font-medium rounded border transition-colors ${
                                  isSelected
                                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                }`}
                                title={slot.display}
                              >
                                {slot.icon} {slot.label}
                              </button>
                            );
                          })}
                        </div>
                        {currentTimeSlots.length > 0 && (
                          <span className="text-[10px] text-gray-500 whitespace-nowrap">
                            {currentTimeSlots.map(s => TIME_SLOTS[s]?.display).filter(Boolean).join(', ')}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const updated = formData.venue_info.preferred_schedules.filter((_, i) => i !== idx);
                            setFormData(f => ({ ...f, venue_info: { ...f.venue_info, preferred_schedules: updated } }));
                          }}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors ml-auto"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Row 2: Days - toggle buttons */}
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[10px] text-gray-500 font-medium w-12">Days:</span>
                        {DAY_OPTIONS.map(opt => {
                          const isSelected = currentDays.includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                const newDays = isSelected
                                  ? currentDays.filter(d => d !== opt.value)
                                  : [...currentDays, opt.value];
                                const updated = [...formData.venue_info.preferred_schedules];
                                updated[idx] = { ...updated[idx], day: newDays.join(', ') };
                                setFormData(f => ({ ...f, venue_info: { ...f.venue_info, preferred_schedules: updated } }));
                              }}
                              className={`px-1.5 py-0.5 text-[10px] font-medium rounded border transition-colors ${
                                isSelected
                                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                                  : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                              }`}
                            >
                              {opt.short}
                            </button>
                          );
                        })}
                      </div>

                      {/* Row 3: Activities - toggle buttons */}
                      <div className="flex items-start gap-1 flex-wrap">
                        <span className="text-[10px] text-gray-500 font-medium w-12 mt-1">Activities:</span>
                        {ACTIVITY_OPTIONS.map(act => {
                          const isSelected = currentActivities.includes(act);
                          return (
                            <button
                              key={act}
                              type="button"
                              onClick={() => {
                                const newActivities = isSelected
                                  ? currentActivities.filter(a => a !== act)
                                  : [...currentActivities, act];
                                const updated = [...formData.venue_info.preferred_schedules];
                                updated[idx] = { ...updated[idx], preferred_activity: newActivities.join(', ') };
                                setFormData(f => ({ ...f, venue_info: { ...f.venue_info, preferred_schedules: updated } }));
                              }}
                              className={`px-1.5 py-0.5 text-[10px] font-medium rounded border transition-colors ${
                                isSelected
                                  ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                                  : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                              }`}
                            >
                              {act}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
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

          {/* Attribution & Availability */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Attribution & Availability</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Available From</label>
                <input
                  type="date"
                  value={formData.available_since}
                  onChange={(e) => setFormData(f => ({ ...f, available_since: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
                <p className="text-[10px] text-gray-400 mt-0.5">When can this venue host meetups?</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Added By</label>
                <input
                  type="text"
                  value={formData.added_by}
                  onChange={(e) => setFormData(f => ({ ...f, added_by: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sourced By</label>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setFormData(f => ({ ...f, sourced_by_team: 'bau' }))}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-all ${
                      formData.sourced_by_team === 'bau'
                        ? 'bg-gray-700 text-white border-gray-700'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    BAU
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(f => ({ ...f, sourced_by_team: 'supply' }))}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-all ${
                      formData.sourced_by_team === 'supply'
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Supply
                  </button>
                </div>
              </div>
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
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {venue ? 'Update Venue' : 'Add Venue'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default VenueRepository;
