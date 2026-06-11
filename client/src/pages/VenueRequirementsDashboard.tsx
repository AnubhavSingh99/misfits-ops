import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  MapPin,
  Loader2,
  RefreshCw,
  Check,
  Clock,
  Pause,
  Activity,
  Building2,
  TrendingUp,
  X,
  Users,
  Edit3,
  Trash2,
  MessageSquare,
  Send,
  CheckCircle,
  UserCheck,
  Calendar,
  Sun,
  HelpCircle,
  Info
} from 'lucide-react';
import type { VenueRequirement, VenueRequirementStatus, CreateRequirementRequest, RequirementComment, TimeOfDay, CapacityBucket } from '../../../shared/types';
import { TIME_OF_DAY_OPTIONS, CAPACITY_BUCKET_OPTIONS } from '../../../shared/types';
import { getTeamForClub, type TeamKey } from '../../../shared/teamConfig';
import { MultiSelectDropdown } from '../components/ui/MultiSelectDropdown';
import { VenueRepository } from '../components/VenueRepository';
import VenueLeads from '../components/VenueLeads';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const VENUE_CATEGORY_OPTIONS = [
  { value: 'CAFE', label: 'Cafe' },
  { value: 'PUB_AND_BAR', label: 'Pub & Bar' },
  { value: 'STUDIO', label: 'Studio' }
];

const VMS_AMENITIES = [
  'Alcohol Served', 'Big Tables', 'Clean Washrooms', 'Comfortable Seating',
  'Disable Friendly', 'First-aid facilities', 'Free Drinking Water', 'Free Wifi',
  'Good Lighting', 'Indoor seating', 'Music System', 'Outdoor seating', 'Smoking Area'
];

// Helper function to calculate TAT (Turn Around Time) in days
function calculateTAT(createdAt: string | undefined | null, completedAt: string | undefined | null): string {
  if (!createdAt || !completedAt) return '-';
  const created = new Date(createdAt);
  const completed = new Date(completedAt);
  const diffMs = completed.getTime() - created.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '<1d';
  if (diffDays === 1) return '1d';
  return `${diffDays}d`;
}

// Hierarchy level types (now includes priority)
type HierarchyLevel = 'activity' | 'city' | 'area' | 'priority';

// Filter options type
interface FilterOption {
  id: number;
  name: string;
}

// Hierarchy filters
interface HierarchyFilters {
  activities: number[];
  cities: number[];
  areas: number[];
  clubs: number[];
  teams: TeamKey[];
}

// Status configuration for venue requirements (6 statuses)
const STATUS_CONFIG = {
  not_picked: {
    label: 'Not Picked',
    shortLabel: 'NP',
    icon: Clock,
    color: {
      bg: 'bg-slate-100',
      text: 'text-slate-600',
      badge: 'bg-slate-50 text-slate-600 border-slate-200',
      accent: '#64748b'
    }
  },
  picked: {
    label: 'Picked',
    shortLabel: 'PK',
    icon: CheckCircle,
    color: {
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      badge: 'bg-blue-50 text-blue-700 border-blue-200',
      accent: '#2563eb'
    }
  },
  venue_aligned: {
    label: 'Venue Aligned',
    shortLabel: 'VA',
    icon: MapPin,
    color: {
      bg: 'bg-teal-100',
      text: 'text-teal-700',
      badge: 'bg-teal-50 text-teal-700 border-teal-200',
      accent: '#0d9488'
    }
  },
  leader_approval: {
    label: 'Leader Approval Pending',
    shortLabel: 'LAP',
    icon: UserCheck,
    color: {
      bg: 'bg-purple-100',
      text: 'text-purple-700',
      badge: 'bg-purple-50 text-purple-700 border-purple-200',
      accent: '#7c3aed'
    }
  },
  done: {
    label: 'Done',
    shortLabel: '✓',
    icon: Check,
    color: {
      bg: 'bg-emerald-100',
      text: 'text-emerald-700',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      accent: '#059669'
    }
  },
  deprioritised: {
    label: 'Deprioritised',
    shortLabel: 'DP',
    icon: Pause,
    color: {
      bg: 'bg-amber-100',
      text: 'text-amber-700',
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      accent: '#d97706'
    }
  }
} as const;

// Team colors
const TEAM_COLORS = {
  blue: { bg: 'bg-blue-500', light: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  green: { bg: 'bg-emerald-500', light: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  yellow: { bg: 'bg-amber-500', light: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' }
};

// Hierarchy node from API
interface HierarchyNode {
  type: 'activity' | 'city' | 'area' | 'priority';
  id: string;
  name: string;
  activity_id?: number;
  city_id?: number;
  area_id?: number;
  count: number;
  status_counts: Record<VenueRequirementStatus, number>;
  growth_effort_count: number;
  platform_effort_count: number;
  // Priority fields
  priority_level?: string;
  priority_icon?: string;
  max_priority_level?: string;
  max_priority_order?: number;
  children?: HierarchyNode[];
  requirements?: VenueRequirement[];
}

// Summary data (6 statuses + priority counts)
interface Summary {
  total: number;
  not_picked: number;
  picked: number;
  venue_aligned: number;
  leader_approval: number;
  done: number;
  deprioritised: number;
  // Venue platform team counts
  bau_count: number;
  supply_count: number;
  // TAT statistics
  tat_stats?: {
    average_tat: number;
    total_completed: number;
    within_sla_percent: number;
    day_distribution: { day: number; count: number; percent: number }[];
  };
}

// Context for creating requirement from hierarchy
interface CreateContext {
  activity_id?: number;
  activity_name?: string;
  city_id?: number;
  city_name?: string;
  area_id?: number;
  area_name?: string;
}

export default function VenueRequirementsDashboard() {
  const [hierarchy, setHierarchy] = useState<HierarchyNode[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Multi-select filters
  const [filters, setFilters] = useState<HierarchyFilters>({
    activities: [],
    cities: [],
    areas: [],
    clubs: [],
    teams: []
  });
  const [activeStatusFilters, setActiveStatusFilters] = useState<string[]>(
    ['not_picked', 'picked', 'venue_aligned', 'leader_approval']
  );
  const [showDone, setShowDone] = useState(false);
  const [showDeprioritised, setShowDeprioritised] = useState(false);

  // Venue platform team filter (BAU/Supply)
  const [venuePlatformTeamFilter, setVenuePlatformTeamFilter] = useState<'bau' | 'supply' | null>(null);

  // Filter options from API
  const [filterOptions, setFilterOptions] = useState<{
    activities: FilterOption[];
    cities: FilterOption[];
    areas: FilterOption[];
    clubs: FilterOption[];
  }>({
    activities: [],
    cities: [],
    areas: [],
    clubs: []
  });

  // Hierarchy level ordering (drag-and-drop) - now includes priority
  const [hierarchyLevels] = useState<HierarchyLevel[]>(['priority', 'city', 'activity', 'area']);
  const [enabledLevels] = useState<Set<HierarchyLevel>>(new Set(['priority', 'city', 'activity', 'area']));

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createContext, setCreateContext] = useState<CreateContext>({});

  // Edit modal state
  const [editingRequirement, setEditingRequirement] = useState<VenueRequirement | null>(null);

  // Delete confirmation state
  const [deleteRequirement, setDeleteRequirement] = useState<VenueRequirement | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Venue completion modal state (shown when marking as done)
  const [completionModal, setCompletionModal] = useState<{
    requirement: VenueRequirement;
    venueName: string;
    venueCity: string;
    venueArea: string;
  } | null>(null);

  // Info modal state
  const [showInfoModal, setShowInfoModal] = useState(false);

  // TAT modal state
  const [showTatModal, setShowTatModal] = useState(false);
  const [expandedRequirementGroups, setExpandedRequirementGroups] = useState<Record<string, boolean>>({
    critical: false,
    new: false,
    progress: false,
    closed: false
  });
  const [expandedRequirementLocations, setExpandedRequirementLocations] = useState<Record<string, boolean>>({});

  // Supply-demand state
  const [showSupplyDemandModal, setShowSupplyDemandModal] = useState(false);
  const [supplyDemandData, setSupplyDemandData] = useState<{
    summary: { total_demand: number; supply_done: number; supply_in_progress: number; gap: number };
    hierarchy: Array<{
      name: string; demand: number; supply_done: number; supply_in_progress: number; gap: number;
      cities: Array<{
        name: string; demand: number; supply_done: number; supply_in_progress: number; gap: number;
        areas: Array<{
          name: string; demand: number; demand_launches: number; demand_zero_meetups: number;
          supply_done: number; supply_in_progress: number; gap: number;
        }>;
      }>;
    }>;
  } | null>(null);
  const [expandedSD, setExpandedSD] = useState<Record<string, boolean>>({});

  // Fetch supply-demand data
  useEffect(() => {
    const fetchSupplyDemand = async () => {
      try {
        const res = await fetch(`${API_BASE}/requirements/venues/supply-demand`);
        const data = await res.json();
        if (data.success) setSupplyDemandData(data);
      } catch (err) {
        console.error('Failed to fetch supply-demand:', err);
      }
    };
    fetchSupplyDemand();
  }, []);

  // Fetch filter options
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const res = await fetch(`${API_BASE}/requirements/venues/filter-options`);
        const data = await res.json();
        if (data.success) {
          setFilterOptions(data.options);
        }
      } catch (err) {
        console.error('Failed to fetch filter options:', err);
      }
    };
    fetchFilterOptions();
  }, []);

  // Fetch data
  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      if (filters.activities.length > 0) params.append('activity_ids', filters.activities.join(','));
      if (filters.cities.length > 0) params.append('city_ids', filters.cities.join(','));
      if (filters.areas.length > 0) params.append('area_ids', filters.areas.join(','));
      if (filters.clubs.length > 0) params.append('club_ids', filters.clubs.join(','));
      if (filters.teams.length > 0) params.append('teams', filters.teams.join(','));
      if (venuePlatformTeamFilter) params.append('venue_platform_team', venuePlatformTeamFilter);

      // Pass hierarchy order (only enabled levels)
      const enabledOrder = hierarchyLevels.filter(l => enabledLevels.has(l));
      if (enabledOrder.length > 0) {
        params.append('hierarchy_order', enabledOrder.join(','));
      }

      const response = await fetch(`${API_BASE}/requirements/venues/hierarchy?${params}`);
      const data = await response.json();
      if (data.success) {
        setHierarchy(data.hierarchy || []);
        setSummary(data.summary || null);
      }
    } catch (err) {
      console.error('Failed to fetch venue requirements:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters, hierarchyLevels, enabledLevels, venuePlatformTeamFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Update requirement status
  const updateRequirementStatus = async (id: number, status: VenueRequirementStatus, venueInfo?: { venue_name: string; venue_city: string; venue_area: string }) => {
    try {
      const body: any = { status };
      if (venueInfo) {
        body.venue_name = venueInfo.venue_name;
        body.venue_city = venueInfo.venue_city;
        body.venue_area = venueInfo.venue_area;
      }
      const response = await fetch(`${API_BASE}/requirements/venues/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (response.ok) {
        fetchData(true);
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Handle status change - intercept 'done' to show venue completion modal
  const handleStatusChange = (req: VenueRequirement, newStatus: VenueRequirementStatus) => {
    if (newStatus === 'done') {
      // Show completion modal to collect venue info
      setCompletionModal({
        requirement: req,
        venueName: '',
        venueCity: req.city_name || '',
        venueArea: req.area_name || ''
      });
    } else {
      // Direct status update for other statuses
      updateRequirementStatus(req.id, newStatus);
    }
  };

  // Submit venue completion
  const handleVenueCompletion = async () => {
    if (!completionModal) return;
    if (!completionModal.venueName.trim()) {
      alert('Please enter the venue name');
      return;
    }
    await updateRequirementStatus(
      completionModal.requirement.id,
      'done',
      {
        venue_name: completionModal.venueName,
        venue_city: completionModal.venueCity,
        venue_area: completionModal.venueArea
      }
    );
    setCompletionModal(null);
  };

  // Delete requirement
  const handleConfirmDelete = async () => {
    if (!deleteRequirement) return;
    setDeleting(true);
    try {
      const response = await fetch(`${API_BASE}/requirements/venues/${deleteRequirement.id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchData(true);
        setDeleteRequirement(null);
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to delete requirement');
      }
    } catch (err) {
      console.error('Failed to delete requirement:', err);
      alert('Failed to delete requirement');
    } finally {
      setDeleting(false);
    }
  };

  // Update requirement
  const updateRequirement = async (id: number, data: Partial<VenueRequirement>) => {
    try {
      const response = await fetch(`${API_BASE}/requirements/venues/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (response.ok) {
        fetchData(true);
        setEditingRequirement(null);
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to update requirement');
      }
    } catch (err) {
      console.error('Failed to update requirement:', err);
      alert('Failed to update requirement');
    }
  };

  // Open create modal with context from hierarchy node
  const openCreateModal = (node?: HierarchyNode, parentContext?: CreateContext) => {
    let context: CreateContext = { ...parentContext };

    if (node) {
      if (node.type === 'activity') {
        context = {
          activity_id: node.activity_id,
          activity_name: node.name
        };
      } else if (node.type === 'city') {
        context = {
          ...context,
          city_id: node.city_id,
          city_name: node.name
        };
      } else if (node.type === 'area') {
        context = {
          ...context,
          area_id: node.area_id,
          area_name: node.name
        };
      }
    }

    setCreateContext(context);
    setShowCreateModal(true);
  };

  // Create new requirement
  const createRequirement = async (data: CreateRequirementRequest): Promise<string | null> => {
    try {
      const response = await fetch(`${API_BASE}/requirements/venues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setShowCreateModal(false);
        fetchData(true); // Refresh data, keeps expanded state
        return null;
      } else {
        return result.error || 'Failed to create requirement';
      }
    } catch (err) {
      console.error('Failed to create requirement:', err);
      return 'Failed to create requirement. Please try again.';
    }
  };

  // Helper function to filter hierarchy by status
  const filterHierarchyByStatus = useCallback((
    nodes: HierarchyNode[],
    statuses: VenueRequirementStatus[]
  ): HierarchyNode[] => {
    return nodes.map(node => {
      const filteredNode = { ...node };

      // Filter children recursively
      if (node.children) {
        filteredNode.children = filterHierarchyByStatus(node.children, statuses);
      }

      // Filter requirements to only matching statuses
      if (node.requirements) {
        filteredNode.requirements = node.requirements.filter(
          req => statuses.includes(req.status)
        );
      }

      // Recalculate count
      if (filteredNode.children) {
        filteredNode.count = filteredNode.children.reduce((sum, c) => sum + c.count, 0);
      } else if (filteredNode.requirements) {
        filteredNode.count = filteredNode.requirements.length;
      }

      return filteredNode;
    }).filter(node => node.count > 0); // Remove empty nodes
  }, []);

  // Single displayed hierarchy based on active filters + Done/Deprioritised toggles
  const displayedHierarchy = useMemo(() => {
    const visibleStatuses: VenueRequirementStatus[] = [
      ...(activeStatusFilters as VenueRequirementStatus[]),
      ...(showDone ? ['done' as VenueRequirementStatus] : []),
      ...(showDeprioritised ? ['deprioritised' as VenueRequirementStatus] : [])
    ];
    return filterHierarchyByStatus(hierarchy, visibleStatuses);
  }, [hierarchy, activeStatusFilters, showDone, showDeprioritised, filterHierarchyByStatus]);

  const displayedRequirements = useMemo(() => {
    const byId = new Map<number, VenueRequirement>();
    const collect = (nodes: HierarchyNode[]) => {
      nodes.forEach(node => {
        node.requirements?.forEach(req => byId.set(req.id, req));
        if (node.children) collect(node.children);
      });
    };
    collect(displayedHierarchy);
    return Array.from(byId.values());
  }, [displayedHierarchy]);

  const requirementGroups = useMemo(() => {
    const critical: VenueRequirement[] = [];
    const newRequirements: VenueRequirement[] = [];
    const inProgress: VenueRequirement[] = [];
    const closed: VenueRequirement[] = [];

    displayedRequirements.forEach(req => {
      if (req.status === 'done' || req.status === 'deprioritised') {
        closed.push(req);
      } else if (req.priority_level === 'critical') {
        critical.push(req);
      } else if (req.status === 'not_picked') {
        newRequirements.push(req);
      } else {
        inProgress.push(req);
      }
    });

    const oldestFirst = (a: VenueRequirement, b: VenueRequirement) => (b.age_days || 0) - (a.age_days || 0);
    return [
      { key: 'critical', label: 'Critical', description: 'Needs attention first', color: 'red', requirements: critical.sort(oldestFirst) },
      { key: 'new', label: 'New Requirements', description: 'Not picked yet', color: 'teal', requirements: newRequirements.sort(oldestFirst) },
      { key: 'progress', label: 'In Progress', description: 'Already being worked on', color: 'blue', requirements: inProgress.sort(oldestFirst) },
      { key: 'closed', label: 'Done / Deprioritised', description: 'Shown by filter', color: 'slate', requirements: closed.sort(oldestFirst) }
    ].filter(group => group.requirements.length > 0);
  }, [displayedRequirements]);

  const effectiveSummary = summary;
  const requirementsPanelCount = displayedRequirements.length || supplyDemandData?.summary?.total_demand || 0;

  // Requirement card component with inline comments
  const RequirementRow = ({
    requirement: req,
    onStatusChange,
    onEdit,
    onDelete
  }: {
    requirement: VenueRequirement;
    onStatusChange: (req: VenueRequirement, status: VenueRequirementStatus) => void;
    onEdit: (req: VenueRequirement) => void;
    onDelete: (req: VenueRequirement) => void;
  }) => {
    const statusConfig = STATUS_CONFIG[req.status] || STATUS_CONFIG.not_picked;

    // Comments state
    const [commentsExpanded, setCommentsExpanded] = useState(false);
    const [comments, setComments] = useState<RequirementComment[]>([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [commentsFetched, setCommentsFetched] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const [commentAuthor, setCommentAuthor] = useState('User');

    // Venue suggestions state
    const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [suggestionsFetched, setSuggestionsFetched] = useState(false);
    const [expandedScoreId, setExpandedScoreId] = useState<string | null>(null);

    // Comments tooltip position
    const commentsButtonRef = useRef<HTMLButtonElement>(null);
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Handle hover to show tooltip
    const handleMouseEnter = () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      setCommentsExpanded(true);
    };

    const handleMouseLeave = () => {
      hoverTimeoutRef.current = setTimeout(() => {
        setCommentsExpanded(false);
        setAuthorDropdownOpen(false);
      }, 150);
    };

    // Author dropdown state
    const [assignees, setAssignees] = useState<{ id: number; name: string }[]>([]);
    const [assigneesFetched, setAssigneesFetched] = useState(false);
    const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false);
    const authorButtonRef = useRef<HTMLButtonElement>(null);
    const [authorDropdownPosition, setAuthorDropdownPosition] = useState({ top: 0, left: 0 });

    // Fetch comments and assignees when expanded
    useEffect(() => {
      if (commentsExpanded && !commentsFetched) {
        fetchComments();
      }
      if (commentsExpanded && !assigneesFetched) {
        fetchAssignees();
      }
    }, [commentsExpanded, commentsFetched, assigneesFetched]);

    // Fetch venue suggestions when expanded
    useEffect(() => {
      if (suggestionsExpanded && !suggestionsFetched) {
        fetchSuggestions();
      }
    }, [suggestionsExpanded, suggestionsFetched]);

    const fetchSuggestions = async () => {
      setLoadingSuggestions(true);
      try {
        const response = await fetch(`${API_BASE}/venue-repository/suggestions/${req.id}`);
        const data = await response.json();
        if (data.success) {
          setSuggestions(data.suggestions || []);
        }
      } catch (error) {
        console.error('Error fetching venue suggestions:', error);
      } finally {
        setLoadingSuggestions(false);
        setSuggestionsFetched(true);
      }
    };

    // Update dropdown position when opened
    useEffect(() => {
      if (authorDropdownOpen && authorButtonRef.current) {
        const rect = authorButtonRef.current.getBoundingClientRect();
        setAuthorDropdownPosition({
          top: rect.bottom + 4,
          left: rect.left
        });
      }
    }, [authorDropdownOpen]);

    // Close dropdown on outside click
    useEffect(() => {
      if (!authorDropdownOpen) return;
      const handleClick = (e: MouseEvent) => {
        if (authorButtonRef.current && !authorButtonRef.current.contains(e.target as Node)) {
          const dropdown = document.getElementById(`author-dropdown-venue-${req.id}`);
          if (dropdown && !dropdown.contains(e.target as Node)) {
            setAuthorDropdownOpen(false);
          }
        }
      };
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }, [authorDropdownOpen, req.id]);

    // Update tooltip position when comments expanded
    useEffect(() => {
      if (commentsExpanded && commentsButtonRef.current) {
        const rect = commentsButtonRef.current.getBoundingClientRect();
        const tooltipWidth = 320;
        const tooltipHeight = 280;
        const padding = 8;

        // Position to the left of the button, or right if not enough space
        let left = rect.left - tooltipWidth - padding;
        if (left < padding) {
          left = rect.right + padding;
        }

        // Vertically center on the button, but keep within viewport
        let top = rect.top - tooltipHeight / 2 + rect.height / 2;
        top = Math.max(padding, Math.min(top, window.innerHeight - tooltipHeight - padding));

        setTooltipPosition({ top, left });
      }
    }, [commentsExpanded]);

    // Close comments tooltip on outside click
    useEffect(() => {
      if (!commentsExpanded) return;
      const handleClick = (e: MouseEvent) => {
        const tooltip = document.getElementById(`comments-tooltip-venue-${req.id}`);
        if (commentsButtonRef.current?.contains(e.target as Node)) return;
        if (tooltip?.contains(e.target as Node)) return;
        // Don't close if clicking author dropdown
        const authorDropdown = document.getElementById(`author-dropdown-venue-${req.id}`);
        if (authorDropdown?.contains(e.target as Node)) return;
        setCommentsExpanded(false);
        setAuthorDropdownOpen(false);
      };
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClick);
      }, 0);
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClick);
      };
    }, [commentsExpanded, req.id]);

    const fetchAssignees = async () => {
      try {
        const res = await fetch(`${API_BASE}/scaling-tasks/assignees/list`);
        const data = await res.json();
        if (data.success && data.assignees) {
          setAssignees(data.assignees);
        }
      } catch (err) {
        console.error('Failed to fetch assignees:', err);
      } finally {
        setAssigneesFetched(true);
      }
    };

    const fetchComments = async () => {
      setLoadingComments(true);
      try {
        const response = await fetch(`${API_BASE}/requirements/venues/${req.id}/comments`);
        const data = await response.json();
        if (data.success) {
          setComments(data.comments);
        }
      } catch (error) {
        console.error('Error fetching comments:', error);
      } finally {
        setLoadingComments(false);
        setCommentsFetched(true);
      }
    };

    const handleAddComment = async () => {
      if (!newComment.trim() || submittingComment) return;
      setSubmittingComment(true);
      try {
        const response = await fetch(`${API_BASE}/requirements/venues/${req.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment_text: newComment.trim(), author_name: commentAuthor })
        });
        const data = await response.json();
        if (data.success && data.comment) {
          setComments(prev => [data.comment, ...prev]);
          setNewComment('');
          // Update local count
          (req as any).comments_count = ((req as any).comments_count || 0) + 1;
        }
      } catch (error) {
        console.error('Error adding comment:', error);
      } finally {
        setSubmittingComment(false);
      }
    };

    const formatCommentTime = (dateString: string) => {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const commentsCount = commentsFetched ? comments.length : ((req as any).comments_count || 0);

    // Display name logic: club_name takes priority over custom name
    const displayName = req.club_name || req.name;
    const hasDescription = req.description && req.description.trim().length > 0;

    return (
      <>
        <div className="group rounded-md border border-gray-200 bg-white p-3 shadow-sm transition-colors hover:border-teal-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              {req.status !== 'done' && req.status !== 'deprioritised' && (
                <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                  req.priority_level === 'critical' ? 'bg-red-500' :
                  req.priority_level === 'high' ? 'bg-yellow-400' : 'bg-green-500'
                }`} title={`Priority: ${req.priority_level || 'normal'}`} />
              )}
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-gray-900" title={displayName}>{displayName}</h3>
                {hasDescription && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-gray-500" title={req.description}>{req.description}</p>
                )}
                {req.status === 'done' && (req as any).venue_name && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-emerald-600">
                    <Building2 className="h-3 w-3 flex-shrink-0" />
                    {(req as any).venue_name}
                  </p>
                )}
              </div>
            </div>

            <select
              value={req.status}
              onChange={(e) => onStatusChange(req, e.target.value as VenueRequirementStatus)}
              onClick={(e) => e.stopPropagation()}
              className={`max-w-[140px] flex-shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${statusConfig.color.badge} focus:border-teal-500 focus:ring-2 focus:ring-teal-500`}
            >
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
            {req.activity_name && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">{req.activity_name}</span>}
            {req.area_name && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{req.area_name}</span>}
            {req.venue_categories?.slice(0, 1).map((cat: string) => (
              <span key={cat} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                {cat === 'PUB_AND_BAR' ? 'Pub' : cat === 'CAFE' ? 'Cafe' : 'Studio'}
              </span>
            ))}
            {req.day_type_name && <span className="rounded bg-indigo-50 px-1.5 py-0.5 capitalize text-indigo-600">{req.day_type_name}</span>}
            {req.capacity && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-600">{req.capacity}</span>}
            {req.time_of_day?.slice(0, 1).map((slot: TimeOfDay) => {
              const option = TIME_OF_DAY_OPTIONS.find(o => o.value === slot);
              return <span key={slot} className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">{option?.icon} {option?.time?.split('-')[0]}</span>;
            })}
            {req.amenities_list && req.amenities_list.length > 0 && (
              <span className="rounded bg-gray-50 px-1.5 py-0.5 text-gray-500" title={req.amenities_list.join(', ')}>
                {req.amenities_list.length} amenities
              </span>
            )}
            {req.status !== 'done' && req.status !== 'deprioritised' && (
              <span className={`rounded px-1.5 py-0.5 font-semibold ${
                req.priority_level === 'critical'
                  ? 'bg-red-100 text-red-700'
                  : req.priority_level === 'high'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-green-50 text-green-700'
              }`}>
                Day {req.age_days ?? 0}
              </span>
            )}
            {req.completed_at && (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
                TAT {calculateTAT(req.created_at, req.completed_at)}
              </span>
            )}
            <span className={`rounded px-1.5 py-0.5 font-semibold uppercase ${
              (req as any).venue_platform_team === 'supply'
                ? 'bg-orange-50 text-orange-600'
                : 'bg-gray-50 text-gray-500'
            }`}>
              {(req as any).venue_platform_team === 'supply' ? 'Supply' : 'BAU'}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-end gap-1 border-t border-gray-100 pt-2">
            <div className="flex items-center justify-end gap-1">
              {/* Venues button - shows count after first load */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSuggestionsExpanded(true);
                }}
                className={`px-2 py-1 rounded-md flex items-center gap-1 transition-colors text-xs font-medium ${
                  suggestionsExpanded
                    ? 'bg-indigo-100 text-indigo-600'
                    : suggestionsFetched && suggestions.length > 0
                      ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                      : 'bg-indigo-50 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-600'
                }`}
                title="View venue suggestions"
              >
                <MapPin className="h-3.5 w-3.5" />
                {suggestionsFetched ? (
                  <span>{suggestions.length}</span>
                ) : (
                  <span>Venues</span>
                )}
              </button>
              {/* Comments button - always visible */}
              <button
                ref={commentsButtonRef}
                onClick={(e) => {
                  e.stopPropagation();
                  setCommentsExpanded(!commentsExpanded);
                }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className={`p-1.5 rounded-md flex items-center gap-0.5 transition-colors ${
                  commentsExpanded
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-gray-50 text-gray-400 hover:bg-blue-50 hover:text-blue-600'
                }`}
                title="Comments"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {commentsCount > 0 && (
                  <span className="text-[9px] font-bold">{commentsCount}</span>
                )}
              </button>
              {/* Escalate BAU/Supply button */}
              {req.status !== 'done' && req.status !== 'deprioritised' && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const targetTeam = (req as any).venue_platform_team === 'supply' ? 'bau' : 'supply';
                    try {
                      const res = await fetch(`${API_BASE}/requirements/venues/${req.id}/escalate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ target_team: targetTeam })
                      });
                      const data = await res.json();
                      if (data.success) fetchData(true);
                    } catch (err) {
                      console.error('Error escalating:', err);
                    }
                  }}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                    (req as any).venue_platform_team === 'supply'
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                  }`}
                  title={(req as any).venue_platform_team === 'supply' ? 'Send back to BAU' : 'Escalate to Supply'}
                >
                  {(req as any).venue_platform_team === 'supply' ? 'To BAU' : 'To Supply'}
                </button>
              )}
              {/* Edit/Delete - show on hover */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(req);
                  }}
                  className="p-1.5 rounded-md bg-teal-50 text-teal-600 hover:bg-teal-100 transition-colors"
                  title="Edit"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(req);
                  }}
                  className="p-1.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Venue Suggestions Modal */}
        {suggestionsExpanded && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setSuggestionsExpanded(false)} />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-indigo-600" />
                    Suggested Venues
                    {!loadingSuggestions && suggestions.length > 0 && (
                      <span className="text-sm font-normal text-gray-500">({suggestions.length})</span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {req.city_name}{req.area_name ? ` / ${req.area_name}` : ''}{req.activity_name ? ` / ${req.activity_name}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => setSuggestionsExpanded(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              <div className="p-5 overflow-y-auto max-h-[60vh]">
                {loadingSuggestions ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading suggestions...</span>
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className="text-center py-8">
                    <MapPin className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No venues found in this city</p>
                    <p className="text-sm text-gray-400 mt-1">Try adding venues to the repository</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {suggestions.map((venue, idx) => {
                      const venueKey = `${venue.source}-${venue.id || venue.vms_id || idx}`;
                      const score = venue.score ?? 0;
                      const scoreColor = score >= 10 ? 'bg-green-500' : score >= 5 ? 'bg-yellow-500' : 'bg-gray-400';
                      const isBreakdownOpen = expandedScoreId === venueKey;
                      return (
                        <div key={venueKey} className="rounded-lg border border-gray-200 hover:border-indigo-300 transition-colors overflow-hidden">
                          <div className="flex items-center gap-3 p-3">
                            {/* Score badge - clickable */}
                            <button
                              onClick={() => setExpandedScoreId(isBreakdownOpen ? null : venueKey)}
                              className={`flex-shrink-0 w-10 h-10 rounded-full ${scoreColor} text-white flex items-center justify-center text-sm font-bold cursor-pointer hover:opacity-80 transition-opacity`}
                              title="Click to see score breakdown"
                            >
                              {score}
                            </button>
                            {/* Venue info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-800 truncate">{venue.name}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                                  venue.source === 'vms' ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'
                                }`}>
                                  {venue.source === 'vms' ? 'VMS' : 'Repo'}
                                </span>
                                {venue.source === 'repository' && venue.status && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                                    venue.status === 'new' ? 'bg-blue-100 text-blue-700' :
                                    venue.status === 'contacted' ? 'bg-yellow-100 text-yellow-700' :
                                    venue.status === 'interested' ? 'bg-cyan-100 text-cyan-700' :
                                    venue.status === 'negotiating' ? 'bg-purple-100 text-purple-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {venue.status.charAt(0).toUpperCase() + venue.status.slice(1)}
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-500">
                                {venue.area_name || venue.custom_area || ''}{venue.area_name || venue.custom_area ? ', ' : ''}{venue.city_name || venue.custom_city || ''}
                              </div>
                            </div>
                            {/* Maps link */}
                            {venue.url && (
                              <a
                                href={venue.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 px-2.5 py-1 text-xs text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
                              >
                                Maps ↗
                              </a>
                            )}
                          </div>
                          {/* Score breakdown - expandable */}
                          {isBreakdownOpen && venue.score_breakdown && (
                            <div className="px-3 pb-3 pt-1 border-t border-gray-100 bg-gray-50">
                              <div className="space-y-1">
                                {venue.score_breakdown.map((item: any, i: number) => (
                                  <div key={i} className="flex items-center gap-2 text-xs">
                                    <span className={item.matched ? 'text-green-600' : 'text-gray-400'}>
                                      {item.matched ? '✓' : '✗'}
                                    </span>
                                    <span className="font-medium text-gray-600 w-20">{item.factor}</span>
                                    <span className="text-gray-500 flex-1">{item.detail}</span>
                                    <span className={`font-medium ${item.points > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                      {item.points > 0 ? `+${item.points}` : '0'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Comments Tooltip Portal */}
        {commentsExpanded && createPortal(
          <div
            id={`comments-tooltip-venue-${req.id}`}
            className="fixed bg-white rounded-xl shadow-2xl border border-gray-200/80 w-80 animate-in fade-in zoom-in-95 duration-150"
            style={{
              top: tooltipPosition.top,
              left: tooltipPosition.left,
              zIndex: 9998
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white rounded-t-xl">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-teal-500" />
                <span className="text-xs font-semibold text-gray-700">Comments</span>
                {comments.length > 0 && (
                  <span className="text-[10px] text-gray-400">({comments.length})</span>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCommentsExpanded(false);
                  setAuthorDropdownOpen(false);
                }}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Add Comment Input */}
            <div className="px-3 py-2 border-b border-gray-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                {/* Author Selector */}
                <button
                  ref={authorButtonRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAuthorDropdownOpen(!authorDropdownOpen);
                  }}
                  className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center text-[9px] font-bold text-teal-600 flex-shrink-0 hover:ring-2 hover:ring-teal-200 transition-all"
                  title={`Posting as: ${commentAuthor}`}
                >
                  {commentAuthor.split(' ').map(n => n?.[0] || '').join('').slice(0, 2).toUpperCase() || 'U'}
                </button>

                <div className="flex-1 flex items-center gap-1.5 bg-white rounded-lg border border-gray-200 px-2 py-1.5 focus-within:border-teal-400 transition-all">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                    placeholder={`Comment as ${commentAuthor.split(' ')[0]}...`}
                    className="flex-1 text-xs bg-transparent outline-none placeholder-gray-400"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddComment();
                    }}
                    disabled={!newComment.trim() || submittingComment}
                    className={`
                      p-1 rounded transition-all
                      ${newComment.trim()
                        ? 'bg-teal-600 text-white hover:bg-teal-700'
                        : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                      }
                    `}
                  >
                    <Send className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* Author Dropdown Portal */}
            {authorDropdownOpen && createPortal(
              <div
                id={`author-dropdown-venue-${req.id}`}
                className="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px] max-h-[200px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150"
                style={{
                  top: authorDropdownPosition.top,
                  left: authorDropdownPosition.left,
                  zIndex: 9999
                }}
              >
                <div className="px-2 py-1 text-[9px] text-gray-400 uppercase tracking-wide border-b border-gray-100 mb-1">
                  Post as
                </div>
                {!assigneesFetched ? (
                  <div className="px-3 py-2 text-xs text-gray-400">Loading...</div>
                ) : assignees.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-400">No members found</div>
                ) : (
                  assignees.map((assignee) => (
                    <button
                      key={assignee.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCommentAuthor(assignee.name);
                        setAuthorDropdownOpen(false);
                      }}
                      className={`
                        w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left
                        hover:bg-gray-50 transition-colors
                        ${commentAuthor === assignee.name ? 'bg-teal-50 text-teal-700' : 'text-gray-700'}
                      `}
                    >
                      <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-600">
                        {assignee.name.split(' ').map(n => n?.[0] || '').join('').slice(0, 2).toUpperCase()}
                      </div>
                      <span className="flex-1 truncate">{assignee.name}</span>
                      {commentAuthor === assignee.name && (
                        <Check className="h-3 w-3 text-teal-600" />
                      )}
                    </button>
                  ))
                )}
              </div>,
              document.body
            )}

            {/* Comments List */}
            <div className="px-3 py-2 max-h-56 overflow-y-auto">
              {loadingComments ? (
                <div className="flex items-center justify-center gap-2 text-xs text-gray-400 py-4">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading...
                </div>
              ) : comments.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-4">No comments yet</div>
              ) : (
                <div className="space-y-2">
                  {comments.map((comment, idx) => (
                    <div
                      key={comment.id}
                      className={`flex gap-2 p-2 rounded-lg ${idx === 0 ? 'bg-teal-50/50' : 'bg-slate-50/50'}`}
                    >
                      <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-600 flex-shrink-0">
                        {(comment.author_name || 'U').split(' ').map(n => n?.[0] || '').join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-gray-700">{comment.author_name || 'User'}</span>
                          <span className="text-[9px] text-gray-400">{formatCommentTime(comment.created_at)}</span>
                        </div>
                        <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">{comment.comment_text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/30">
      <div className="max-w-[1500px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl shadow-lg shadow-teal-500/25">
                <MapPin className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Venue Requirements</h1>
                  <button
                    onClick={() => setShowInfoModal(true)}
                    className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors"
                    title="Status & Priority Guide"
                  >
                    <HelpCircle className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">Track venue sourcing across activities and locations</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => fetchData(true)}
                disabled={refreshing}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => openCreateModal()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Add Requirement
              </button>
            </div>
          </div>
        </div>

        {/* Summary Tiles */}
        {effectiveSummary && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-8">
            <SummaryTile
              label="Total"
              count={effectiveSummary.total}
              icon={MapPin}
              color="teal"
            />
            <SummaryTile
              label="Not Picked"
              count={effectiveSummary.not_picked}
              icon={Clock}
              color="slate"
            />
            <SummaryTile
              label="Picked"
              count={effectiveSummary.picked}
              icon={CheckCircle}
              color="blue"
            />
            <SummaryTile
              label="Venue Aligned"
              count={effectiveSummary.venue_aligned}
              icon={MapPin}
              color="cyan"
            />
            <SummaryTile
              label="Leader Approval Pending"
              count={effectiveSummary.leader_approval}
              icon={UserCheck}
              color="purple"
            />
            <SummaryTile
              label="Done"
              count={effectiveSummary.done}
              icon={Check}
              color="emerald"
            />
            <SummaryTile
              label="Deprioritised"
              count={effectiveSummary.deprioritised}
              icon={Pause}
              color="amber"
            />
            {/* TAT Tile - Clickable */}
            <div
              onClick={() => setShowTatModal(true)}
              className="rounded-xl p-4 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-green-600 uppercase tracking-wider">Avg TAT</span>
                <Clock size={16} className="text-green-500" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-green-600">
                  {effectiveSummary.tat_stats?.average_tat || 0}
                </span>
                <span className="text-sm text-green-600">days</span>
              </div>
              <span className="text-[10px] text-green-500">Click for details →</span>
            </div>
            {/* Supply-Demand Tile - Clickable */}
            {supplyDemandData && (
              <div
                onClick={() => setShowSupplyDemandModal(true)}
                className="rounded-xl p-4 bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-orange-600 uppercase tracking-wider">Venue Gap</span>
                  <TrendingUp size={16} className="text-orange-500" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-orange-600">
                    {supplyDemandData.summary.gap}
                  </span>
                  <span className="text-sm text-orange-600">needed</span>
                </div>
                <span className="text-[10px] text-orange-500">
                  {supplyDemandData.summary.total_demand} demand, {supplyDemandData.summary.supply_done} supplied
                </span>
              </div>
            )}
          </div>
        )}

        {/* Requirements Section */}
        <div className="mb-8">
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <MapPin size={17} className="text-teal-600" />
                <h2 className="text-sm font-semibold text-gray-900">Requirements</h2>
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
                  {requirementsPanelCount}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <MultiSelectDropdown
                  label="City"
                  options={filterOptions.cities}
                  selected={filters.cities}
                  onChange={(val) => setFilters(f => ({ ...f, cities: val, areas: [] }))}
                  icon={<Building2 size={14} />}
                  compact
                />
                <MultiSelectDropdown
                  label="Activity"
                  options={filterOptions.activities}
                  selected={filters.activities}
                  onChange={(val) => setFilters(f => ({ ...f, activities: val }))}
                  icon={<Activity size={14} />}
                  compact
                />
                <MultiSelectDropdown
                  label="Area"
                  options={filterOptions.areas}
                  selected={filters.areas}
                  onChange={(val) => setFilters(f => ({ ...f, areas: val }))}
                  icon={<MapPin size={14} />}
                  compact
                />
                <MultiSelectDropdown<string>
                  label="Status"
                  options={[
                    { id: 'not_picked', name: 'Not Picked' },
                    { id: 'picked', name: 'Picked' },
                    { id: 'venue_aligned', name: 'Venue Aligned' },
                    { id: 'leader_approval', name: 'Leader Approval Pending' }
                  ]}
                  selected={activeStatusFilters}
                  onChange={(val) => setActiveStatusFilters(val)}
                  icon={<Clock size={14} />}
                  compact
                />

                <button
                  onClick={() => setShowDone(prev => !prev)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    showDone
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  Done
                </button>
                <button
                  onClick={() => setShowDeprioritised(prev => !prev)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    showDeprioritised
                      ? 'border-amber-300 bg-amber-50 text-amber-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  Deprioritised
                </button>

                {(filters.activities.length > 0 || filters.cities.length > 0 || filters.areas.length > 0 ||
                  activeStatusFilters.length !== 4 || showDone || showDeprioritised) && (
                  <button
                    onClick={() => {
                      setFilters({ activities: [], cities: [], areas: [], clubs: [], teams: [] });
                      setActiveStatusFilters(['not_picked', 'picked', 'venue_aligned', 'leader_approval']);
                      setShowDone(false);
                      setShowDeprioritised(false);
                      setVenuePlatformTeamFilter(null);
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    title="Clear filters"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {effectiveSummary && (
              <div className="grid grid-cols-2 border-b border-gray-200 bg-gray-50/70 sm:grid-cols-4 xl:grid-cols-7">
                {[
                  { key: 'total', label: 'Total', count: effectiveSummary.total, color: 'text-teal-700' },
                  { key: 'not_picked', label: 'Not Picked', count: effectiveSummary.not_picked, color: 'text-slate-700' },
                  { key: 'picked', label: 'Picked', count: effectiveSummary.picked, color: 'text-blue-700' },
                  { key: 'venue_aligned', label: 'Venue Aligned', count: effectiveSummary.venue_aligned, color: 'text-cyan-700' },
                  { key: 'leader_approval', label: 'Approval', count: effectiveSummary.leader_approval, color: 'text-purple-700' },
                  { key: 'done', label: 'Done', count: effectiveSummary.done, color: 'text-emerald-700' },
                  { key: 'deprioritised', label: 'Deprioritised', count: effectiveSummary.deprioritised, color: 'text-amber-700' }
                ].map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      if (item.key === 'total') {
                        setActiveStatusFilters(['not_picked', 'picked', 'venue_aligned', 'leader_approval']);
                        setShowDone(false);
                        setShowDeprioritised(false);
                      } else if (item.key === 'done') {
                        setActiveStatusFilters([]);
                        setShowDone(true);
                        setShowDeprioritised(false);
                      } else if (item.key === 'deprioritised') {
                        setActiveStatusFilters([]);
                        setShowDone(false);
                        setShowDeprioritised(true);
                      } else {
                        setActiveStatusFilters([item.key]);
                        setShowDone(false);
                        setShowDeprioritised(false);
                      }
                    }}
                    className="flex items-center justify-between gap-2 border-b border-r border-gray-200 px-3 py-2 text-left transition-colors hover:bg-white xl:border-b-0"
                  >
                    <span className="truncate text-[10px] font-semibold uppercase text-gray-400">{item.label}</span>
                    <span className={`text-sm font-bold ${item.color}`}>{item.count}</span>
                  </button>
                ))}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 text-teal-500 animate-spin" />
              </div>
            ) : hierarchy.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <MapPin className="h-12 w-12 mb-4 opacity-40" />
                <p className="text-lg font-medium">No venue requirements found</p>
                <p className="text-sm mt-1">Create your first requirement to get started</p>
              </div>
            ) : displayedHierarchy.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <CheckCircle className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">No requirements match current filters</p>
              </div>
            ) : (
              <div className="max-h-[72vh] overflow-y-auto bg-gray-50/60 p-4 space-y-6">
                {requirementGroups.map(group => {
                  const groupStyles: Record<string, { dot: string; text: string }> = {
                    red: { dot: 'bg-red-500', text: 'text-red-700' },
                    teal: { dot: 'bg-teal-500', text: 'text-teal-700' },
                    blue: { dot: 'bg-blue-500', text: 'text-blue-700' },
                    slate: { dot: 'bg-slate-400', text: 'text-slate-600' }
                  };
                  const styles = groupStyles[group.color];
                  const expanded = expandedRequirementGroups[group.key] === true;
                  const locationMap = new Map<string, {
                    key: string;
                    city: string;
                    areas: Set<string>;
                    requirements: VenueRequirement[];
                  }>();

                  group.requirements.forEach(req => {
                    const city = req.city_name || 'Unknown City';
                    const area = req.area_name || 'Unknown Area';
                    const locationKey = `${group.key}:${city}`;
                    const location = locationMap.get(locationKey);
                    if (location) {
                      location.areas.add(area);
                      location.requirements.push(req);
                    } else {
                      locationMap.set(locationKey, {
                        key: locationKey,
                        city,
                        areas: new Set([area]),
                        requirements: [req]
                      });
                    }
                  });

                  const locations = Array.from(locationMap.values()).sort((a, b) => a.city.localeCompare(b.city));

                  return (
                    <section key={group.key}>
                      <button
                        type="button"
                        onClick={() => setExpandedRequirementGroups(current => ({
                          ...current,
                          [group.key]: !expanded
                        }))}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-white ${
                          expanded ? 'mb-3' : ''
                        }`}
                      >
                        {expanded ? (
                          <ChevronDown size={15} className="shrink-0 text-gray-400" />
                        ) : (
                          <ChevronRight size={15} className="shrink-0 text-gray-400" />
                        )}
                        <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} />
                        <h3 className={`text-sm font-semibold ${styles.text}`}>{group.label}</h3>
                        <span className="text-xs font-semibold text-gray-400">{group.requirements.length}</span>
                        <span className="text-xs text-gray-400">{group.description}</span>
                      </button>

                      {expanded && (
                        <div className="space-y-4 pl-2">
                          {locations.map(location => {
                            const locationExpanded = expandedRequirementLocations[location.key] === true;
                            return (
                              <div key={location.key}>
                                <button
                                  type="button"
                                  onClick={() => setExpandedRequirementLocations(current => ({
                                    ...current,
                                    [location.key]: !locationExpanded
                                  }))}
                                  className={`flex w-full items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:bg-gray-50 ${
                                    locationExpanded ? 'mb-3' : ''
                                  }`}
                                >
                                  {locationExpanded ? (
                                    <ChevronDown size={14} className="shrink-0 text-gray-400" />
                                  ) : (
                                    <ChevronRight size={14} className="shrink-0 text-gray-400" />
                                  )}
                                  <Building2 size={14} className="shrink-0 text-gray-400" />
                                  <span className="text-xs font-semibold text-gray-700">{location.city}</span>
                                  <span className="text-gray-300">/</span>
                                  <MapPin size={13} className="shrink-0 text-gray-400" />
                                  <span className="min-w-0 truncate text-xs text-gray-600">
                                    {Array.from(location.areas).sort().join(', ')}
                                  </span>
                                  <span className="ml-auto shrink-0 text-xs font-semibold text-gray-400">
                                    {location.requirements.length}
                                  </span>
                                </button>

                                {locationExpanded && (
                                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                                    {location.requirements.map(req => (
                                      <RequirementRow
                                        key={req.id}
                                        requirement={req}
                                        onStatusChange={handleStatusChange}
                                        onEdit={setEditingRequirement}
                                        onDelete={setDeleteRequirement}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Venue Repository - Collapsible Section */}
        <div className="mt-6">
          <VenueRepository defaultExpanded={false} />
        </div>

        {/* Venue Leads - Collapsible Section */}
        <div className="mt-6">
          <VenueLeads defaultExpanded={false} />
        </div>
      </div>

      {/* Create Requirement Modal */}
      {showCreateModal && (
        <CreateRequirementModal
          context={createContext}
          onClose={() => setShowCreateModal(false)}
          onCreate={createRequirement}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteRequirement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !deleting && setDeleteRequirement(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-red-50">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Trash2 size={20} className="text-red-600" />
                  Delete Requirement
                </h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
              <button
                onClick={() => !deleting && setDeleteRequirement(null)}
                disabled={deleting}
                className="p-1 hover:bg-red-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-700">
                Are you sure you want to delete <span className="font-semibold">{deleteRequirement.name}</span>?
              </p>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setDeleteRequirement(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Venue Completion Modal (shown when marking as done) */}
      {completionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCompletionModal(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-emerald-50">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <CheckCircle size={20} className="text-emerald-600" />
                  Complete Requirement
                </h3>
                <p className="text-sm text-gray-500">Enter venue details for: {completionModal.requirement.name}</p>
              </div>
              <button
                onClick={() => setCompletionModal(null)}
                className="p-1 hover:bg-emerald-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Venue Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={completionModal.venueName}
                  onChange={(e) => setCompletionModal({ ...completionModal, venueName: e.target.value })}
                  placeholder="Enter venue name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue City</label>
                <input
                  type="text"
                  value={completionModal.venueCity}
                  onChange={(e) => setCompletionModal({ ...completionModal, venueCity: e.target.value })}
                  placeholder="Enter city"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue Area</label>
                <input
                  type="text"
                  value={completionModal.venueArea}
                  onChange={(e) => setCompletionModal({ ...completionModal, venueArea: e.target.value })}
                  placeholder="Enter area"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setCompletionModal(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleVenueCompletion}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Mark as Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Requirement Modal */}
      {editingRequirement && (
        <EditRequirementModal
          requirement={editingRequirement}
          onClose={() => setEditingRequirement(null)}
          onSave={(data) => updateRequirement(editingRequirement.id, data)}
        />
      )}

      {/* Info Modal - Status & Priority Guide */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowInfoModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-teal-50 to-cyan-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-100 rounded-lg">
                  <Info size={20} className="text-teal-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Status & Priority Guide</h3>
                  <p className="text-sm text-gray-500">Understanding the venue requirement workflow</p>
                </div>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
              {/* Statuses Section */}
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Requirement Statuses</h4>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold bg-slate-100 text-slate-600">NP</span>
                    <div>
                      <span className="font-medium text-gray-900">Not Picked</span>
                      <span className="text-gray-500 text-sm ml-2">— New requirement, not yet assigned to anyone</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold bg-blue-100 text-blue-700">PK</span>
                    <div>
                      <span className="font-medium text-gray-900">Picked</span>
                      <span className="text-gray-500 text-sm ml-2">— Being actively worked on by the team</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold bg-teal-100 text-teal-700">VA</span>
                    <div>
                      <span className="font-medium text-gray-900">Venue Aligned</span>
                      <span className="text-gray-500 text-sm ml-2">— Venue found, pending final confirmation</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold bg-purple-100 text-purple-700">LAP</span>
                    <div>
                      <span className="font-medium text-gray-900">Leader Approval Pending</span>
                      <span className="text-gray-500 text-sm ml-2">— Awaiting leader sign-off before completion</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold bg-emerald-100 text-emerald-700">✓</span>
                    <div>
                      <span className="font-medium text-gray-900">Done</span>
                      <span className="text-gray-500 text-sm ml-2">— Completed successfully</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold bg-amber-100 text-amber-700">DP</span>
                    <div>
                      <span className="font-medium text-gray-900">Deprioritised</span>
                      <span className="text-gray-500 text-sm ml-2">— On hold or no longer needed</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200 my-5" />

              {/* Priority Section */}
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Priority Levels</h4>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <span className="w-4 h-4 rounded-full bg-red-500 flex-shrink-0"></span>
                    <div>
                      <span className="font-medium text-red-600">Critical</span>
                      <span className="text-gray-500 text-sm ml-2">— Exceeded SLA (more than {4} days old)</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-4 h-4 rounded-full bg-yellow-400 flex-shrink-0"></span>
                    <div>
                      <span className="font-medium text-yellow-600">High</span>
                      <span className="text-gray-500 text-sm ml-2">— Approaching SLA ({(4) - 1}-{4} days old)</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-4 h-4 rounded-full bg-green-500 flex-shrink-0"></span>
                    <div>
                      <span className="font-medium text-green-600">Normal</span>
                      <span className="text-gray-500 text-sm ml-2">— Within SLA (less than {(4) - 1} days old)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SLA Info Box */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
                <div className="flex items-start gap-3">
                  <span className="text-xl">💡</span>
                  <div>
                    <p className="font-medium text-gray-900 mb-1">How Priority Works</p>
                    <p className="text-sm text-gray-600">
                      Priority is calculated automatically based on the age of each requirement.
                      The SLA target is <span className="font-semibold text-blue-600">4 days</span>.
                      {' '}Requirements older than the SLA become <span className="text-red-600 font-medium">Critical</span> priority
                      and should be addressed first.
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                      Use the <span className="font-medium">Priority</span> chip in Hierarchy Order to group requirements by urgency.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowInfoModal(false)}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAT Analysis Modal */}
      {showTatModal && effectiveSummary?.tat_stats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowTatModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Clock size={20} className="text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">📊 TAT Analysis</h3>
                    <p className="text-sm text-green-600">Turn Around Time for completed venues</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowTatModal(false)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              {/* Stats Summary */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-100">
                  <div className="text-2xl font-bold text-green-600">{effectiveSummary.tat_stats.average_tat}</div>
                  <div className="text-xs text-gray-500 mt-1">Average TAT (days)</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-100">
                  <div className="text-2xl font-bold text-blue-600">{effectiveSummary.tat_stats.total_completed}</div>
                  <div className="text-xs text-gray-500 mt-1">Total Completed</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-100">
                  <div className="text-2xl font-bold text-emerald-600">{effectiveSummary.tat_stats.within_sla_percent}%</div>
                  <div className="text-xs text-gray-500 mt-1">Within {4} Days</div>
                </div>
              </div>

              {/* Day-wise Distribution */}
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Day-wise Completion Distribution</h4>
                <div className="space-y-2">
                  {effectiveSummary.tat_stats.day_distribution.map((item, idx) => {
                    const barColors = ['bg-green-500', 'bg-emerald-500', 'bg-cyan-500', 'bg-blue-500', 'bg-amber-500', 'bg-orange-500', 'bg-red-500'];
                    const barColor = item.day === -1 ? 'bg-red-500' : barColors[Math.min(idx, barColors.length - 1)];
                    return (
                      <div key={idx} className="flex items-center gap-3">
                        <span className="w-16 text-xs text-gray-500 text-right">
                          {item.day === -1 ? `>${4} days` : `Day ${item.day}`}
                        </span>
                        <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                          <div
                            className={`h-full ${barColor} flex items-center px-2 transition-all duration-300`}
                            style={{ width: `${Math.max(item.percent, item.count > 0 ? 15 : 0)}%` }}
                          >
                            {item.percent > 10 && (
                              <span className="text-xs font-semibold text-white">{item.percent}%</span>
                            )}
                          </div>
                        </div>
                        <span className="w-20 text-xs text-gray-500">
                          {item.count} venue{item.count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Insight Box */}
              {effectiveSummary.tat_stats.total_completed > 0 && (
                <div className="mt-5 p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-sm text-amber-800">
                    💡 <strong>{effectiveSummary.tat_stats.within_sla_percent}% of venues</strong> are being closed within {4} days (SLA target)
                  </p>
                </div>
              )}

              {effectiveSummary.tat_stats.total_completed === 0 && (
                <div className="mt-5 p-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
                  <p className="text-sm text-gray-500">No completed venues yet to analyze TAT</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowTatModal(false)}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supply-Demand Modal */}
      {showSupplyDemandModal && supplyDemandData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSupplyDemandModal(false)} />
          <div className="relative z-10 bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-amber-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <TrendingUp size={20} className="text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Supply-Demand Analysis</h3>
                    <p className="text-sm text-orange-600">Venue gap by activity, city & area</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSupplyDemandModal(false)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-red-50 rounded-lg p-3 text-center border border-red-100">
                  <div className="text-xl font-bold text-red-600">{supplyDemandData.summary.total_demand}</div>
                  <div className="text-[10px] text-red-500 mt-0.5">Total Demand</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center border border-green-100">
                  <div className="text-xl font-bold text-green-600">{supplyDemandData.summary.supply_done}</div>
                  <div className="text-[10px] text-green-500 mt-0.5">Supplied (Done)</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-100">
                  <div className="text-xl font-bold text-blue-600">{supplyDemandData.summary.supply_in_progress}</div>
                  <div className="text-[10px] text-blue-500 mt-0.5">In Progress</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 text-center border border-orange-100">
                  <div className="text-xl font-bold text-orange-600">{supplyDemandData.summary.gap}</div>
                  <div className="text-[10px] text-orange-500 mt-0.5">Gap</div>
                </div>
              </div>
            </div>

            {/* Hierarchy Table */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {/* Table Header */}
              <div className="grid grid-cols-[1fr_60px_60px_60px_60px] gap-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">
                <span>Activity / City / Area</span>
                <span className="text-center">Demand</span>
                <span className="text-center">Done</span>
                <span className="text-center">WIP</span>
                <span className="text-center">Gap</span>
              </div>

              <div className="space-y-1">
                {supplyDemandData.hierarchy.map((activity) => {
                  const actKey = activity.name;
                  const actExpanded = expandedSD[actKey] ?? false;
                  return (
                    <div key={actKey}>
                      {/* Activity Row */}
                      <div
                        onClick={() => setExpandedSD(prev => ({ ...prev, [actKey]: !actExpanded }))}
                        className="grid grid-cols-[1fr_60px_60px_60px_60px] gap-2 items-center px-2 py-2 rounded-lg bg-orange-50 border border-orange-100 cursor-pointer hover:bg-orange-100 transition-colors"
                      >
                        <div className="flex items-center gap-2 font-semibold text-sm text-gray-800">
                          {actExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          {activity.name}
                        </div>
                        <span className="text-center text-sm font-medium text-red-600">{activity.demand}</span>
                        <span className="text-center text-sm font-medium text-green-600">{activity.supply_done}</span>
                        <span className="text-center text-sm font-medium text-blue-600">{activity.supply_in_progress}</span>
                        <span className="text-center text-sm font-bold text-orange-600">{activity.gap}</span>
                      </div>

                      {/* Cities */}
                      {actExpanded && activity.cities.map((city) => {
                        const cityKey = `${actKey}>${city.name}`;
                        const cityExpanded = expandedSD[cityKey] ?? false;
                        return (
                          <div key={cityKey} className="ml-5">
                            {/* City Row */}
                            <div
                              onClick={() => setExpandedSD(prev => ({ ...prev, [cityKey]: !cityExpanded }))}
                              className="grid grid-cols-[1fr_60px_60px_60px_60px] gap-2 items-center px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-2 text-sm text-gray-700">
                                {cityExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                <Building2 size={12} className="text-gray-400" />
                                {city.name}
                              </div>
                              <span className="text-center text-sm text-red-500">{city.demand}</span>
                              <span className="text-center text-sm text-green-500">{city.supply_done}</span>
                              <span className="text-center text-sm text-blue-500">{city.supply_in_progress}</span>
                              <span className="text-center text-sm font-semibold text-orange-500">{city.gap}</span>
                            </div>

                            {/* Areas */}
                            {cityExpanded && city.areas.map((area) => (
                              <div
                                key={area.name}
                                className="grid grid-cols-[1fr_60px_60px_60px_60px] gap-2 items-center ml-5 px-2 py-1 text-xs text-gray-600"
                              >
                                <div className="flex items-center gap-2">
                                  <MapPin size={10} className="text-gray-300" />
                                  {area.name}
                                  {area.demand_launches > 0 && (
                                    <span className="text-[9px] bg-purple-100 text-purple-600 px-1 rounded">+{area.demand_launches} new</span>
                                  )}
                                  {area.demand_zero_meetups > 0 && (
                                    <span className="text-[9px] bg-yellow-100 text-yellow-600 px-1 rounded">{area.demand_zero_meetups} scale</span>
                                  )}
                                </div>
                                <span className="text-center text-red-400">{area.demand}</span>
                                <span className="text-center text-green-400">{area.supply_done}</span>
                                <span className="text-center text-blue-400">{area.supply_in_progress}</span>
                                <span className="text-center font-semibold text-orange-500">{area.gap}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {supplyDemandData.hierarchy.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm">No supply-demand data available</div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <span className="text-[10px] text-gray-400">
                <span className="bg-purple-100 text-purple-600 px-1 rounded mr-1">new</span> = new club launches
                <span className="bg-yellow-100 text-yellow-600 px-1 rounded mx-1">scale</span> = clubs with 0 meetups
              </span>
              <button
                onClick={() => setShowSupplyDemandModal(false)}
                className="px-4 py-1.5 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Edit Requirement Modal Component
function EditRequirementModal({
  requirement,
  onClose,
  onSave
}: {
  requirement: VenueRequirement;
  onClose: () => void;
  onSave: (data: Partial<VenueRequirement>) => void;
}) {
  const [name, setName] = useState(requirement.name);
  const [description, setDescription] = useState(requirement.description || '');
  const [status, setStatus] = useState<VenueRequirementStatus>(requirement.status);
  const [submitting, setSubmitting] = useState(false);

  // New scheduling fields
  const [dayTypeId, setDayTypeId] = useState<number | undefined>(requirement.day_type_id);
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<TimeOfDay[]>(requirement.time_of_day || []);
  const [amenitiesRequired, setAmenitiesRequired] = useState(requirement.amenities_required || '');
  const [capacity, setCapacity] = useState<CapacityBucket | undefined>(requirement.capacity);

  // Area and Club selection state
  const [selectedAreaId, setSelectedAreaId] = useState<number | undefined>(requirement.area_id);
  const [selectedAreaName, setSelectedAreaName] = useState<string | undefined>(requirement.area_name);
  const [selectedClubId, setSelectedClubId] = useState<number | undefined>(requirement.club_id);
  const [selectedClubName, setSelectedClubName] = useState<string | undefined>(requirement.club_name);
  const [selectedLaunchId, setSelectedLaunchId] = useState<number | undefined>(requirement.launch_id);
  const [selectedTargetId, setSelectedTargetId] = useState<number | undefined>((requirement as any).target_id);

  // Manual area entry mode (for areas not in DB)
  const [isManualArea, setIsManualArea] = useState(!requirement.area_id && !!requirement.area_name);
  const [manualAreaName, setManualAreaName] = useState((!requirement.area_id && requirement.area_name) ? requirement.area_name : '');
  const effectiveAreaName = isManualArea ? manualAreaName : selectedAreaName;

  // Filter options
  const [areas, setAreas] = useState<FilterOption[]>([]);
  const [clubsAndLaunches, setClubsAndLaunches] = useState<Array<{ id: number; name: string; type: 'club' | 'launch' | 'expansion'; targetId?: number }>>([]);

  // Fetch day types
  const [dayTypes, setDayTypes] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    const fetchDayTypes = async () => {
      try {
        const res = await fetch(`${API_BASE}/requirements/venues/day-types`);
        const data = await res.json();
        if (data.success) setDayTypes(data.day_types || []);
      } catch (err) {
        console.error('Failed to fetch day types:', err);
      }
    };
    fetchDayTypes();
  }, []);

  // Fetch areas for the city
  useEffect(() => {
    if (requirement.city_id) {
      const fetchAreas = async () => {
        try {
          const res = await fetch(`${API_BASE}/requirements/venues/areas-by-city/${requirement.city_id}`);
          const data = await res.json();
          if (data.success) setAreas(data.options || []);
        } catch (err) {
          console.error('Failed to fetch areas:', err);
        }
      };
      fetchAreas();
    }
  }, [requirement.city_id]);

  // Fetch clubs and launches when area changes
  useEffect(() => {
    if (requirement.activity_id && requirement.city_id && selectedAreaId) {
      const fetchClubsAndLaunches = async () => {
        try {
          const params = new URLSearchParams();
          params.append('activity_id', String(requirement.activity_id));
          params.append('city_id', String(requirement.city_id));
          params.append('area_id', String(selectedAreaId));
          const res = await fetch(`${API_BASE}/requirements/clubs-and-launches?${params}`);
          const data = await res.json();
          if (data.success) {
            const items = [
              ...(data.clubs || []).map((c: any) => ({ id: c.id, name: c.name, type: 'club' as const })),
              ...(data.launches || []).map((l: any) => ({ id: l.id, name: l.name || `Launch: ${l.activity_name}`, type: 'launch' as const })),
              ...(data.expansionTargets || []).map((e: any) => ({ id: e.club_id || 0, name: e.name, type: 'expansion' as const, targetId: e.target_id }))
            ];
            setClubsAndLaunches(items);
          }
        } catch (err) {
          console.error('Failed to fetch clubs and launches:', err);
        }
      };
      fetchClubsAndLaunches();
    } else {
      setClubsAndLaunches([]);
    }
  }, [requirement.activity_id, requirement.city_id, selectedAreaId]);

  const handleAreaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value ? parseInt(e.target.value) : undefined;
    const area = areas.find(a => String(a.id) === e.target.value);
    setSelectedAreaId(id);
    setSelectedAreaName(area?.name);
    // Reset club/launch selection when area changes
    setSelectedClubId(undefined);
    setSelectedClubName(undefined);
    setSelectedLaunchId(undefined);
    setSelectedTargetId(undefined);
  };

  const handleClubOrLaunchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (!value) {
      setSelectedClubId(undefined);
      setSelectedClubName(undefined);
      setSelectedLaunchId(undefined);
      setSelectedTargetId(undefined);
      return;
    }
    const [type, idStr] = value.split(':');
    const id = parseInt(idStr);
    const item = clubsAndLaunches.find(c => c.type === type && (c.type === 'expansion' ? c.targetId === id : c.id === id));

    if (type === 'club') {
      setSelectedClubId(id);
      setSelectedClubName(item?.name);
      setSelectedLaunchId(undefined);
      setSelectedTargetId(undefined);
    } else if (type === 'launch') {
      setSelectedLaunchId(id);
      setSelectedClubId(undefined);
      setSelectedClubName(item?.name);
      setSelectedTargetId(undefined);
    } else if (type === 'expansion') {
      setSelectedTargetId(id);
      setSelectedClubId(item?.id || undefined);
      setSelectedClubName(item?.name);
      setSelectedLaunchId(undefined);
    }
  };

  const toggleTimeSlot = (slot: TimeOfDay) => {
    setSelectedTimeSlots(prev =>
      prev.includes(slot)
        ? prev.filter(s => s !== slot)
        : [...prev, slot]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    await onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      status,
      // Use dropdown ID if available, otherwise undefined for manual entries
      area_id: isManualArea ? undefined : selectedAreaId,
      area_name: effectiveAreaName,
      club_id: isManualArea ? undefined : selectedClubId,
      club_name: isManualArea ? undefined : selectedClubName,
      launch_id: isManualArea ? undefined : selectedLaunchId,
      target_id: isManualArea ? undefined : selectedTargetId,
      day_type_id: dayTypeId,
      time_of_day: selectedTimeSlots.length > 0 ? selectedTimeSlots : undefined,
      amenities_required: amenitiesRequired.trim() || undefined,
      capacity
    } as any);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 text-center">
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

        <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all w-full max-w-lg">
          {/* Header */}
          <div className="bg-gradient-to-r from-teal-500 to-cyan-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Edit3 className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">Edit Requirement</h3>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <X className="h-5 w-5 text-white" />
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Display Activity and City (read-only) */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Activity</label>
                <div className="text-sm font-medium text-gray-700">{requirement.activity_name || 'N/A'}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                <div className="text-sm font-medium text-gray-700">{requirement.city_name || 'N/A'}</div>
              </div>
            </div>

            {/* Area Selection (Editable with manual entry option) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <MapPin className="inline h-4 w-4 mr-1" />
                Area{isManualArea && <span className="text-amber-600 ml-1 text-xs">(Manual)</span>}
              </label>
              {isManualArea ? (
                <input
                  type="text"
                  value={manualAreaName}
                  onChange={(e) => setManualAreaName(e.target.value)}
                  placeholder="Enter area name..."
                  className="w-full px-3 py-2 border border-amber-400 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm bg-amber-50"
                />
              ) : (
                <select
                  value={selectedAreaId || ''}
                  onChange={handleAreaChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white"
                >
                  <option value="">Select Area</option>
                  {areas.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsManualArea(!isManualArea);
                  if (!isManualArea) {
                    // Switching to manual - clear dropdown selection
                    setSelectedAreaId(undefined);
                    setSelectedAreaName(undefined);
                    // Clear club/launch since they won't apply to manual area
                    setSelectedClubId(undefined);
                    setSelectedClubName(undefined);
                    setSelectedLaunchId(undefined);
                    setSelectedTargetId(undefined);
                  } else {
                    // Switching to dropdown - clear manual entry
                    setManualAreaName('');
                  }
                }}
                className="text-[10px] text-teal-600 hover:text-teal-700 mt-0.5"
              >
                {isManualArea ? '← Back to dropdown' : "Can't find? Add manually"}
              </button>
            </div>

            {/* Club / Launch / Expansion Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Building2 className="inline h-4 w-4 mr-1" />
                Club / Launch / Expansion (Optional)
              </label>
              <select
                value={selectedTargetId ? `expansion:${selectedTargetId}` : selectedClubId ? `club:${selectedClubId}` : selectedLaunchId ? `launch:${selectedLaunchId}` : ''}
                onChange={handleClubOrLaunchChange}
                disabled={!selectedAreaId || isManualArea}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed ${selectedAreaId && clubsAndLaunches.length === 0 && !isManualArea ? 'border-amber-300 text-amber-600' : 'border-gray-300'}`}
              >
                {isManualArea ? (
                  <option value="">N/A for manual locations</option>
                ) : selectedAreaId && clubsAndLaunches.length === 0 ? (
                  <option value="">No clubs, launches, or targets in this area</option>
                ) : (
                  <>
                    <option value="">Select Club, Launch, or Expansion Target</option>
                    {clubsAndLaunches.filter(c => c.type === 'club').length > 0 && (
                      <optgroup label="Clubs">
                        {clubsAndLaunches.filter(c => c.type === 'club').map(c => (
                          <option key={`club:${c.id}`} value={`club:${c.id}`}>{c.name}</option>
                        ))}
                      </optgroup>
                    )}
                    {clubsAndLaunches.filter(c => c.type === 'launch').length > 0 && (
                      <optgroup label="Launches">
                        {clubsAndLaunches.filter(c => c.type === 'launch').map(c => (
                          <option key={`launch:${c.id}`} value={`launch:${c.id}`}>{c.name}</option>
                        ))}
                      </optgroup>
                    )}
                    {clubsAndLaunches.filter(c => c.type === 'expansion').length > 0 && (
                      <optgroup label="Expansion Targets">
                        {clubsAndLaunches.filter(c => c.type === 'expansion').map(c => (
                          <option key={`expansion:${c.targetId}`} value={`expansion:${c.targetId}`}>{c.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as VenueRequirementStatus)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white"
              >
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
            </div>

            {/* Day Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="inline h-4 w-4 mr-1" />
                Day Type
              </label>
              <select
                value={dayTypeId || ''}
                onChange={(e) => setDayTypeId(e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white"
              >
                <option value="">Select Day Type</option>
                {dayTypes.map(dt => (
                  <option key={dt.id} value={dt.id}>{dt.name}</option>
                ))}
              </select>
            </div>

            {/* Time of Day */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Sun className="inline h-4 w-4 mr-1" />
                Time of Day
              </label>
              <div className="flex flex-wrap gap-2">
                {TIME_OF_DAY_OPTIONS.map(option => {
                  const isSelected = selectedTimeSlots.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleTimeSlot(option.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border
                        ${isSelected
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                        }`}
                    >
                      {option.icon} {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amenities */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amenities Required</label>
              <textarea
                value={amenitiesRequired}
                onChange={(e) => setAmenitiesRequired(e.target.value)}
                rows={2}
                placeholder="e.g., Parking, AC, Changing rooms..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm resize-none"
              />
            </div>

            {/* Capacity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Users className="inline h-4 w-4 mr-1" />
                Capacity <span className="text-red-500">*</span>
              </label>
              <select
                value={capacity || ''}
                onChange={(e) => setCapacity(e.target.value as CapacityBucket || undefined)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white
                  ${!capacity ? 'border-gray-300' : 'border-teal-300'}`}
              >
                <option value="">Select capacity...</option>
                {CAPACITY_BUCKET_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || submitting}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Generate default name from context
function generateDefaultName(context: CreateContext): string {
  const parts: string[] = [];

  if (context.activity_name) {
    const actShort = context.activity_name.length > 12
      ? context.activity_name.substring(0, 10)
      : context.activity_name;
    parts.push(actShort);
  }

  if (context.city_name) {
    const cityAbbrev: Record<string, string> = {
      'Gurgaon': 'GGN', 'Gurugram': 'GGN', 'Noida': 'NOI', 'Delhi': 'DEL',
      'Faridabad': 'FBD', 'Ghaziabad': 'GZB', 'Bangalore': 'BLR', 'Mumbai': 'MUM',
      'Hyderabad': 'HYD', 'Chennai': 'CHN', 'Pune': 'PUN', 'Kolkata': 'KOL'
    };
    parts.push(cityAbbrev[context.city_name] || context.city_name.substring(0, 3).toUpperCase());
  }

  if (context.area_name) {
    parts.push(context.area_name);
  }

  return parts.join(' ') || '';
}

// Filter option type
interface FilterOption {
  id: number;
  name: string;
}

// Create Requirement Modal Component
function CreateRequirementModal({
  context,
  onClose,
  onCreate
}: {
  context: CreateContext;
  onClose: () => void;
  onCreate: (data: CreateRequirementRequest) => Promise<string | null>;
}) {
  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New scheduling fields
  const [dayTypeId, setDayTypeId] = useState<number | undefined>(undefined);
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<TimeOfDay[]>([]);
  const amenitiesRequired = '';
  const [capacity, setCapacity] = useState<CapacityBucket | undefined>(undefined);
  const [venueCategories, setVenueCategories] = useState<string[]>([]);
  const [amenitiesList, setAmenitiesList] = useState<string[]>([]);

  // Day types from API
  const [dayTypes, setDayTypes] = useState<{ id: number; name: string }[]>([]);

  // Hierarchy selection state
  const [selectedActivityId, setSelectedActivityId] = useState<number | undefined>(context.activity_id);
  const [selectedActivityName, setSelectedActivityName] = useState<string | undefined>(context.activity_name);
  const [selectedCityId, setSelectedCityId] = useState<number | undefined>(context.city_id);
  const [selectedCityName, setSelectedCityName] = useState<string | undefined>(context.city_name);
  const [selectedAreaId, setSelectedAreaId] = useState<number | undefined>(context.area_id);
  const [selectedAreaName, setSelectedAreaName] = useState<string | undefined>(context.area_name);
  const [selectedClubId, setSelectedClubId] = useState<number | undefined>(undefined);
  const [selectedClubName, setSelectedClubName] = useState<string | undefined>(undefined);
  const [selectedLaunchId, setSelectedLaunchId] = useState<number | undefined>(undefined);

  // Filter options
  const [activities, setActivities] = useState<FilterOption[]>([]);
  const [cities, setCities] = useState<FilterOption[]>([]);
  const [areas, setAreas] = useState<FilterOption[]>([]);
  const [clubsAndLaunches, setClubsAndLaunches] = useState<Array<{ id: number; name: string; type: 'club' | 'launch' | 'expansion'; targetId?: number }>>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<number | undefined>(undefined);

  // Manual entry mode states
  const [isManualActivity, setIsManualActivity] = useState(false);
  const [isManualCity, setIsManualCity] = useState(false);
  const [isManualArea, setIsManualArea] = useState(false);
  const [manualActivityName, setManualActivityName] = useState('');
  const [manualCityName, setManualCityName] = useState('');
  const [manualAreaName, setManualAreaName] = useState('');

  // Calculate team from selection (works with both dropdown and manual entries)
  const effectiveActivityName = isManualActivity ? manualActivityName : selectedActivityName;
  const effectiveCityName = isManualCity ? manualCityName : selectedCityName;
  const effectiveAreaName = isManualArea ? manualAreaName : selectedAreaName;
  const team = effectiveActivityName && effectiveCityName
    ? getTeamForClub(effectiveActivityName, effectiveCityName)
    : undefined;

  // Toggle time slot selection
  const toggleTimeSlot = (slot: TimeOfDay) => {
    setSelectedTimeSlots(prev =>
      prev.includes(slot)
        ? prev.filter(s => s !== slot)
        : [...prev, slot]
    );
  };

  // Generate default name from current selection
  // Format: "Club/Launch/Expansion Name - Area Name"
  const generateName = () => {
    // If a club/launch/expansion is selected, use "ClubName - AreaName" format
    if (selectedClubName) {
      if (effectiveAreaName) {
        return `${selectedClubName} - ${effectiveAreaName}`;
      }
      return selectedClubName;
    }

    // Otherwise, generate from activity/city/area (using effective names for manual entries)
    const parts: string[] = [];
    if (effectiveActivityName) {
      parts.push(effectiveActivityName.length > 12 ? effectiveActivityName.substring(0, 10) : effectiveActivityName);
    }
    if (effectiveCityName) {
      const cityAbbrev: Record<string, string> = {
        'Gurgaon': 'GGN', 'Gurugram': 'GGN', 'Noida': 'NOI', 'Delhi': 'DEL',
        'Faridabad': 'FBD', 'Ghaziabad': 'GZB', 'Bangalore': 'BLR', 'Mumbai': 'MUM',
        'Hyderabad': 'HYD', 'Chennai': 'CHN', 'Pune': 'PUN', 'Kolkata': 'KOL'
      };
      parts.push(cityAbbrev[effectiveCityName] || effectiveCityName.substring(0, 3).toUpperCase());
    }
    if (effectiveAreaName) {
      parts.push(effectiveAreaName);
    }
    return parts.join(' ');
  };

  // Fetch activities, cities, and day types on mount from production database
  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const res = await fetch(`${API_BASE}/scaling-tasks/filters/activities`);
        const data = await res.json();
        if (data.success) {
          setActivities(data.options || []);
        }
      } catch (err) {
        console.error('Failed to fetch activities:', err);
      }
    };
    const fetchCities = async () => {
      try {
        const res = await fetch(`${API_BASE}/scaling-tasks/filters/cities`);
        const data = await res.json();
        if (data.success) {
          setCities(data.options || []);
        }
      } catch (err) {
        console.error('Failed to fetch cities:', err);
      }
    };
    const fetchDayTypes = async () => {
      try {
        const res = await fetch(`${API_BASE}/requirements/venues/day-types`);
        const data = await res.json();
        if (data.success) setDayTypes(data.day_types || []);
      } catch (err) {
        console.error('Failed to fetch day types:', err);
      }
    };
    fetchActivities();
    fetchCities();
    fetchDayTypes();
  }, []);

  // Fetch areas when city changes from production database
  useEffect(() => {
    if (selectedCityId) {
      const fetchAreas = async () => {
        try {
          const res = await fetch(`${API_BASE}/scaling-tasks/filters/areas?city_ids=${selectedCityId}&include_all=true`);
          const data = await res.json();
          if (data.success) setAreas(data.options || []);
        } catch (err) {
          console.error('Failed to fetch areas:', err);
        }
      };
      fetchAreas();
    } else {
      setAreas([]);
    }
  }, [selectedCityId]);

  // Fetch clubs and launches when area changes
  useEffect(() => {
    if (selectedActivityId && selectedCityId && selectedAreaId) {
      const fetchClubsAndLaunches = async () => {
        try {
          const params = new URLSearchParams();
          params.append('activity_id', String(selectedActivityId));
          params.append('city_id', String(selectedCityId));
          params.append('area_id', String(selectedAreaId));
          const res = await fetch(`${API_BASE}/requirements/clubs-and-launches?${params}`);
          const data = await res.json();
          if (data.success) {
            // Combine clubs, launches, and expansion targets into single list
            const items = [
              ...(data.clubs || []).map((c: any) => ({ id: c.id, name: c.name, type: 'club' as const })),
              ...(data.launches || []).map((l: any) => ({ id: l.id, name: l.name || `Launch: ${l.activity_name}`, type: 'launch' as const })),
              ...(data.expansionTargets || []).map((e: any) => ({ id: e.club_id || 0, name: e.name, type: 'expansion' as const, targetId: e.target_id }))
            ];
            setClubsAndLaunches(items);
          }
        } catch (err) {
          console.error('Failed to fetch clubs and launches:', err);
        }
      };
      fetchClubsAndLaunches();
    } else {
      setClubsAndLaunches([]);
    }
  }, [selectedActivityId, selectedCityId, selectedAreaId]);

  // Track the last auto-generated name to detect manual edits
  const [lastGeneratedName, setLastGeneratedName] = useState('');

  // Update default name when selection changes (but NOT for manual entries)
  useEffect(() => {
    // Don't auto-generate name for manual entries - let user type their own
    if (isManualActivity || isManualCity || isManualArea) {
      return;
    }

    const newName = generateName();
    // Update name if: empty, or matches last generated name (not manually edited)
    if (!name || name === lastGeneratedName || name === generateDefaultName(context)) {
      setName(newName);
      setLastGeneratedName(newName);
    }
  }, [effectiveActivityName, effectiveCityName, effectiveAreaName, selectedClubName, isManualActivity, isManualCity, isManualArea]);

  const handleActivityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value ? parseInt(e.target.value) : undefined;
    // API returns id as string, so convert both to string for comparison
    const activity = activities.find(a => String(a.id) === e.target.value);
    setSelectedActivityId(id);
    setSelectedActivityName(activity?.name);
    // Reset cascading selections
    setSelectedCityId(undefined);
    setSelectedCityName(undefined);
    setSelectedAreaId(undefined);
    setSelectedAreaName(undefined);
    setSelectedClubId(undefined);
    setSelectedClubName(undefined);
    setSelectedLaunchId(undefined);
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value ? parseInt(e.target.value) : undefined;
    const city = cities.find(c => String(c.id) === e.target.value);
    setSelectedCityId(id);
    setSelectedCityName(city?.name);
    // Reset cascading selections
    setSelectedAreaId(undefined);
    setSelectedAreaName(undefined);
    setSelectedClubId(undefined);
    setSelectedClubName(undefined);
    setSelectedLaunchId(undefined);
  };

  const handleAreaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value ? parseInt(e.target.value) : undefined;
    const area = areas.find(a => String(a.id) === e.target.value);
    setSelectedAreaId(id);
    setSelectedAreaName(area?.name);
    // Reset club/launch/target selection
    setSelectedClubId(undefined);
    setSelectedClubName(undefined);
    setSelectedLaunchId(undefined);
    setSelectedTargetId(undefined);
  };

  const handleClubOrLaunchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (!value) {
      setSelectedClubId(undefined);
      setSelectedClubName(undefined);
      setSelectedLaunchId(undefined);
      setSelectedTargetId(undefined);
      return;
    }
    // Value format: "club:123", "launch:456", or "expansion:789"
    const [type, idStr] = value.split(':');
    const id = parseInt(idStr);
    const item = clubsAndLaunches.find(c => c.type === type && (c.type === 'expansion' ? c.targetId === id : c.id === id));

    if (type === 'club') {
      setSelectedClubId(id);
      setSelectedClubName(item?.name);
      setSelectedLaunchId(undefined);
      setSelectedTargetId(undefined);
    } else if (type === 'launch') {
      setSelectedLaunchId(id);
      setSelectedClubId(undefined);
      setSelectedClubName(item?.name);
      setSelectedTargetId(undefined);
    } else if (type === 'expansion') {
      setSelectedTargetId(id);
      setSelectedClubId(item?.id || undefined); // expansion targets may have club_id
      setSelectedClubName(item?.name);
      setSelectedLaunchId(undefined);
    }
  };

  // Validation: either dropdown selection OR manual entry for activity/city/area
  const hasActivity = selectedActivityId || (isManualActivity && manualActivityName.trim());
  const hasCity = selectedCityId || (isManualCity && manualCityName.trim());
  const hasArea = selectedAreaId || (isManualArea && manualAreaName.trim());
  const isValid = name.trim() && hasActivity && hasCity && hasArea && dayTypeId && selectedTimeSlots.length > 0 && capacity;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setSubmitting(true);
    setError(null);
    const errorMsg = await onCreate({
      name: name.trim(),
      description: description.trim() || undefined,
      // Use dropdown ID if available, otherwise undefined for manual entries
      activity_id: isManualActivity ? undefined : selectedActivityId,
      activity_name: effectiveActivityName,
      city_id: isManualCity ? undefined : selectedCityId,
      city_name: effectiveCityName,
      area_id: isManualArea ? undefined : selectedAreaId,
      area_name: effectiveAreaName,
      club_id: selectedClubId,
      club_name: selectedClubName,
      launch_id: selectedLaunchId,
      target_id: selectedTargetId,
      day_type_id: dayTypeId,
      time_of_day: selectedTimeSlots,
      amenities_required: amenitiesRequired.trim() || undefined,
      capacity,
      team,
      venue_categories: venueCategories.length > 0 ? venueCategories : undefined,
      amenities_list: amenitiesList.length > 0 ? amenitiesList : undefined,
    });
    if (errorMsg) {
      setError(errorMsg);
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 text-center">
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

        <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all w-full max-w-lg">
          {/* Header */}
          <div className="bg-gradient-to-r from-teal-500 to-cyan-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">New Venue Requirement</h3>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <X className="h-5 w-5 text-white" />
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Error Display */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
            {/* Hierarchy Selection */}
            <div className="grid grid-cols-2 gap-3">
              {/* Activity Field */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Activity *{isManualActivity && <span className="text-amber-600 ml-1">(Manual)</span>}
                </label>
                {isManualActivity ? (
                  <input
                    type="text"
                    value={manualActivityName}
                    onChange={(e) => setManualActivityName(e.target.value)}
                    placeholder="Enter activity name..."
                    className="w-full px-3 py-2 border border-amber-400 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm bg-amber-50"
                  />
                ) : (
                  <select
                    value={selectedActivityId || ''}
                    onChange={handleActivityChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white"
                  >
                    <option value="">Select Activity</option>
                    {activities.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsManualActivity(!isManualActivity);
                    if (!isManualActivity) {
                      // Switching to manual - clear dropdown selection
                      setSelectedActivityId(undefined);
                      setSelectedActivityName(undefined);
                    } else {
                      // Switching to dropdown - clear manual entry
                      setManualActivityName('');
                    }
                  }}
                  className="text-[10px] text-teal-600 hover:text-teal-700 mt-0.5"
                >
                  {isManualActivity ? '← Back to dropdown' : "Can't find? Add manually"}
                </button>
              </div>

              {/* City Field */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  City *{isManualCity && <span className="text-amber-600 ml-1">(Manual)</span>}
                </label>
                {isManualCity ? (
                  <input
                    type="text"
                    value={manualCityName}
                    onChange={(e) => setManualCityName(e.target.value)}
                    placeholder="Enter city name..."
                    className="w-full px-3 py-2 border border-amber-400 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm bg-amber-50"
                  />
                ) : (
                  <select
                    value={selectedCityId || ''}
                    onChange={handleCityChange}
                    disabled={!selectedActivityId && !isManualActivity}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Select City</option>
                    {cities.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsManualCity(!isManualCity);
                    if (!isManualCity) {
                      setSelectedCityId(undefined);
                      setSelectedCityName(undefined);
                      // If city is manual, area should also be manual
                      setIsManualArea(true);
                      setSelectedAreaId(undefined);
                      setSelectedAreaName(undefined);
                    } else {
                      setManualCityName('');
                      setIsManualArea(false);
                      setManualAreaName('');
                    }
                  }}
                  className="text-[10px] text-teal-600 hover:text-teal-700 mt-0.5"
                >
                  {isManualCity ? '← Back to dropdown' : "Can't find? Add manually"}
                </button>
              </div>

              {/* Area Field */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Area *{isManualArea && <span className="text-amber-600 ml-1">(Manual)</span>}
                </label>
                {isManualArea ? (
                  <input
                    type="text"
                    value={manualAreaName}
                    onChange={(e) => setManualAreaName(e.target.value)}
                    placeholder="Enter area name..."
                    className="w-full px-3 py-2 border border-amber-400 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm bg-amber-50"
                  />
                ) : (
                  <select
                    value={selectedAreaId || ''}
                    onChange={handleAreaChange}
                    disabled={!selectedCityId && !isManualCity}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Select Area</option>
                    {areas.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                )}
                {!isManualCity && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsManualArea(!isManualArea);
                      if (!isManualArea) {
                        setSelectedAreaId(undefined);
                        setSelectedAreaName(undefined);
                      } else {
                        setManualAreaName('');
                      }
                    }}
                    className="text-[10px] text-teal-600 hover:text-teal-700 mt-0.5"
                  >
                    {isManualArea ? '← Back to dropdown' : "Can't find? Add manually"}
                  </button>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Club / Launch / Expansion (Optional)</label>
                <select
                  value={selectedTargetId ? `expansion:${selectedTargetId}` : selectedClubId ? `club:${selectedClubId}` : selectedLaunchId ? `launch:${selectedLaunchId}` : ''}
                  onChange={handleClubOrLaunchChange}
                  disabled={!selectedAreaId || isManualArea}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed ${selectedAreaId && clubsAndLaunches.length === 0 && !isManualArea ? 'border-amber-300 text-amber-600' : 'border-gray-300'}`}
                >
                  {isManualArea ? (
                    <option value="">N/A for manual locations</option>
                  ) : selectedAreaId && clubsAndLaunches.length === 0 ? (
                    <option value="">No clubs, launches, or targets in this area</option>
                  ) : (
                    <>
                      <option value="">Select Club, Launch, or Expansion Target</option>
                      {clubsAndLaunches.filter(c => c.type === 'club').length > 0 && (
                        <optgroup label="Clubs">
                          {clubsAndLaunches.filter(c => c.type === 'club').map(c => (
                            <option key={`club:${c.id}`} value={`club:${c.id}`}>{c.name}</option>
                          ))}
                        </optgroup>
                      )}
                      {clubsAndLaunches.filter(c => c.type === 'launch').length > 0 && (
                        <optgroup label="Launches">
                          {clubsAndLaunches.filter(c => c.type === 'launch').map(c => (
                            <option key={`launch:${c.id}`} value={`launch:${c.id}`}>{c.name}</option>
                          ))}
                        </optgroup>
                      )}
                      {clubsAndLaunches.filter(c => c.type === 'expansion').length > 0 && (
                        <optgroup label="Expansion Targets">
                          {clubsAndLaunches.filter(c => c.type === 'expansion').map(c => (
                            <option key={`expansion:${c.targetId}`} value={`expansion:${c.targetId}`}>{c.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* Team Badge (auto-calculated) */}
            {team && (
              <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                <span className="text-xs text-gray-500">Team:</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase
                  ${TEAM_COLORS[team].light} ${TEAM_COLORS[team].text}`}>
                  {team}
                </span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Venue requirement name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional details..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm resize-none"
              />
            </div>

            {/* Day Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="inline h-4 w-4 mr-1" />
                Day Type *
              </label>
              <select
                value={dayTypeId || ''}
                onChange={(e) => setDayTypeId(e.target.value ? parseInt(e.target.value) : undefined)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white
                  ${!dayTypeId ? 'border-gray-300' : 'border-teal-300'}`}
              >
                <option value="">Select Day Type</option>
                {dayTypes.map(dt => (
                  <option key={dt.id} value={dt.id}>{dt.name}</option>
                ))}
              </select>
            </div>

            {/* Time of Day */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Sun className="inline h-4 w-4 mr-1" />
                Time of Day *
              </label>
              <div className="flex flex-wrap gap-2">
                {TIME_OF_DAY_OPTIONS.map(option => {
                  const isSelected = selectedTimeSlots.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleTimeSlot(option.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border
                        ${isSelected
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                        }`}
                    >
                      {option.icon} {option.label}
                    </button>
                  );
                })}
              </div>
              {selectedTimeSlots.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">Select at least one time slot</p>
              )}
            </div>

            {/* Venue Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Venue Category (Optional)</label>
              <div className="flex flex-wrap gap-2">
                {VENUE_CATEGORY_OPTIONS.map(cat => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setVenueCategories(prev =>
                      prev.includes(cat.value) ? prev.filter(c => c !== cat.value) : [...prev, cat.value]
                    )}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      venueCategories.includes(cat.value)
                        ? 'bg-violet-100 text-violet-700 border-violet-300'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Amenities */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amenities Required (Optional)</label>
              <div className="flex flex-wrap gap-1.5">
                {VMS_AMENITIES.map(amenity => (
                  <button
                    key={amenity}
                    type="button"
                    onClick={() => setAmenitiesList(prev =>
                      prev.includes(amenity) ? prev.filter(a => a !== amenity) : [...prev, amenity]
                    )}
                    className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
                      amenitiesList.includes(amenity)
                        ? 'bg-teal-100 text-teal-700 border-teal-300'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {amenity}
                  </button>
                ))}
              </div>
            </div>

            {/* Capacity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Users className="inline h-4 w-4 mr-1" />
                Capacity <span className="text-red-500">*</span>
              </label>
              <select
                value={capacity || ''}
                onChange={(e) => setCapacity(e.target.value as CapacityBucket || undefined)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white
                  ${!capacity ? 'border-gray-300' : 'border-teal-300'}`}
              >
                <option value="">Select capacity...</option>
                {CAPACITY_BUCKET_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isValid || submitting}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Create
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

interface SummaryTileProps {
  label: string;
  count: number;
  icon: React.ElementType;
  color: 'teal' | 'slate' | 'cyan' | 'emerald' | 'amber' | 'blue' | 'purple';
}

function SummaryTile({ label, count, icon: Icon, color }: SummaryTileProps) {
  const colorClasses = {
    teal: { bg: 'bg-teal-50', icon: 'bg-teal-100 text-teal-600', text: 'text-teal-600' },
    slate: { bg: 'bg-slate-50', icon: 'bg-slate-100 text-slate-600', text: 'text-slate-600' },
    cyan: { bg: 'bg-cyan-50', icon: 'bg-cyan-100 text-cyan-600', text: 'text-cyan-600' },
    emerald: { bg: 'bg-emerald-50', icon: 'bg-emerald-100 text-emerald-600', text: 'text-emerald-600' },
    amber: { bg: 'bg-amber-50', icon: 'bg-amber-100 text-amber-600', text: 'text-amber-600' },
    blue: { bg: 'bg-blue-50', icon: 'bg-blue-100 text-blue-600', text: 'text-blue-600' },
    purple: { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-600', text: 'text-purple-600' }
  };

  const classes = colorClasses[color];

  return (
    <div className={`rounded-xl border border-gray-100 p-4 ${classes.bg} hover:shadow-md transition-shadow`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${classes.text}`}>{count}</p>
        </div>
        <div className={`p-2.5 rounded-lg ${classes.icon}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
