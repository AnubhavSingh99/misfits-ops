import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Settings,
  Home,
  X,
  GripVertical,
  Layers,
  Users
} from 'lucide-react';
import type { VenueRequirement, RequirementStatus, CreateRequirementRequest } from '../../../shared/types';
import { getTeamForClub, TEAMS, TEAM_KEYS, type TeamKey } from '../../../shared/teamConfig';
import { MultiSelectDropdown } from '../components/ui/MultiSelectDropdown';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// Hierarchy level types
type HierarchyLevel = 'activity' | 'city' | 'area';

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

// Status configuration
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
  },
  in_progress: {
    label: 'In Progress',
    shortLabel: 'IP',
    icon: TrendingUp,
    color: {
      bg: 'bg-teal-100',
      text: 'text-teal-700',
      badge: 'bg-teal-50 text-teal-700 border-teal-200',
      accent: '#0d9488'
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
  }
} as const;

// Team colors
const TEAM_COLORS = {
  blue: { bg: 'bg-blue-500', light: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  green: { bg: 'bg-emerald-500', light: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  yellow: { bg: 'bg-amber-500', light: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' }
};

type TeamKey = 'blue' | 'green' | 'yellow';

// Hierarchy node from API
interface HierarchyNode {
  type: 'activity' | 'city' | 'area';
  id: string;
  name: string;
  activity_id?: number;
  city_id?: number;
  area_id?: number;
  count: number;
  status_counts: Record<RequirementStatus, number>;
  growth_effort_count: number;
  platform_effort_count: number;
  children?: HierarchyNode[];
  requirements?: VenueRequirement[];
}

// Summary data
interface Summary {
  total: number;
  not_picked: number;
  deprioritised: number;
  in_progress: number;
  done: number;
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
  const [statusFilter, setStatusFilter] = useState<RequirementStatus | null>(null);

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

  // Hierarchy level ordering (drag-and-drop)
  const [hierarchyLevels, setHierarchyLevels] = useState<HierarchyLevel[]>(['activity', 'city', 'area']);
  const [enabledLevels, setEnabledLevels] = useState<Set<HierarchyLevel>>(new Set(['activity', 'city', 'area']));
  const [draggingLevel, setDraggingLevel] = useState<HierarchyLevel | null>(null);

  // Expanded state
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createContext, setCreateContext] = useState<CreateContext>({});

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
      if (statusFilter) params.append('status', statusFilter);

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
  }, [filters, statusFilter, hierarchyLevels, enabledLevels]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Toggle node expansion
  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Expand all
  const expandAll = () => {
    const allIds = new Set<string>();
    const collect = (nodes: HierarchyNode[]) => {
      nodes.forEach(n => {
        allIds.add(n.id);
        if (n.children) collect(n.children);
      });
    };
    collect(hierarchy);
    setExpandedNodes(allIds);
  };

  // Collapse all
  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  // Update requirement status
  const updateRequirementStatus = async (id: number, status: RequirementStatus) => {
    try {
      const response = await fetch(`${API_BASE}/requirements/venues/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (response.ok) {
        fetchData(true);
      }
    } catch (err) {
      console.error('Failed to update status:', err);
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
  const createRequirement = async (data: CreateRequirementRequest) => {
    try {
      const response = await fetch(`${API_BASE}/requirements/venues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (response.ok) {
        setShowCreateModal(false);
        fetchData(true); // Refresh data, keeps expanded state
      }
    } catch (err) {
      console.error('Failed to create requirement:', err);
    }
  };

  // Build context for a node based on its type and parent context
  const buildNodeContext = (node: HierarchyNode, parentContext: CreateContext = {}): CreateContext => {
    let context = { ...parentContext };
    if (node.type === 'activity') {
      context = { activity_id: node.activity_id, activity_name: node.name };
    } else if (node.type === 'city') {
      context = { ...context, city_id: node.city_id, city_name: node.name };
    } else if (node.type === 'area') {
      context = { ...context, area_id: node.area_id, area_name: node.name };
    }
    return context;
  };

  // Status badge component
  const StatusBadge = ({ status, count }: { status: RequirementStatus; count: number }) => {
    if (count === 0) return null;
    const config = STATUS_CONFIG[status];
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${config.color.badge}`}>
        <span className="opacity-70">{config.shortLabel}</span>
        <span className="font-mono">{count}</span>
      </span>
    );
  };

  // Effort badges
  const EffortBadges = ({ growth, platform }: { growth: number; platform: number }) => (
    <div className="flex items-center gap-1.5">
      {growth > 0 && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-600 border border-violet-200">
          <TrendingUp className="h-3 w-3" />
          {growth}
        </span>
      )}
      {platform > 0 && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-50 text-cyan-600 border border-cyan-200">
          <Settings className="h-3 w-3" />
          {platform}
        </span>
      )}
    </div>
  );

  // Hierarchy row component
  const HierarchyRow = ({ node, depth = 0, parentContext = {} }: { node: HierarchyNode; depth?: number; parentContext?: CreateContext }) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = (node.children && node.children.length > 0) || (node.requirements && node.requirements.length > 0);

    const TypeIcon = node.type === 'activity' ? Activity :
                     node.type === 'city' ? Building2 : MapPin;

    const typeColors = {
      activity: 'text-violet-500 bg-violet-50',
      city: 'text-blue-500 bg-blue-50',
      area: 'text-emerald-500 bg-emerald-50'
    };

    // Build context for this node
    const nodeContext = buildNodeContext(node, parentContext);

    return (
      <>
        <tr
          className={`group border-b border-gray-100 hover:bg-gray-50/80 transition-colors cursor-pointer
            ${depth === 0 ? 'bg-white' : depth === 1 ? 'bg-gray-50/30' : 'bg-gray-50/50'}`}
          onClick={() => hasChildren && toggleExpand(node.id)}
        >
          {/* Expand/Name */}
          <td className="py-3 pr-4" style={{ paddingLeft: `${12 + depth * 24}px` }}>
            <div className="flex items-center gap-2">
              {hasChildren ? (
                <button className="p-0.5 hover:bg-gray-200 rounded transition-colors">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              ) : (
                <span className="w-5" />
              )}
              <div className={`p-1.5 rounded-md ${typeColors[node.type]}`}>
                <TypeIcon className="h-3.5 w-3.5" />
              </div>
              <span className="font-medium text-gray-900">{node.name}</span>
              <span className="text-xs text-gray-400 font-mono">({node.count})</span>
            </div>
          </td>

          {/* Status breakdown */}
          <td className="py-3 px-4">
            <div className="flex flex-wrap gap-1">
              <StatusBadge status="not_picked" count={node.status_counts.not_picked} />
              <StatusBadge status="in_progress" count={node.status_counts.in_progress} />
              <StatusBadge status="done" count={node.status_counts.done} />
              <StatusBadge status="deprioritised" count={node.status_counts.deprioritised} />
            </div>
          </td>

          {/* Effort */}
          <td className="py-3 px-4">
            <EffortBadges growth={node.growth_effort_count} platform={node.platform_effort_count} />
          </td>

          {/* Actions */}
          <td className="py-3 px-4 text-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                openCreateModal(node, parentContext);
              }}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md bg-teal-50 text-teal-600 hover:bg-teal-100 transition-all"
            >
              <Plus className="h-4 w-4" />
            </button>
          </td>
        </tr>

        {/* Children */}
        {isExpanded && node.children && node.children.map(child => (
          <HierarchyRow key={child.id} node={child} depth={depth + 1} parentContext={nodeContext} />
        ))}

        {/* Requirements (leaf nodes) */}
        {isExpanded && node.requirements && node.requirements.map(req => (
          <RequirementRow key={req.id} requirement={req} depth={depth + 1} onStatusChange={updateRequirementStatus} />
        ))}
      </>
    );
  };

  // Requirement row component
  const RequirementRow = ({
    requirement: req,
    depth,
    onStatusChange
  }: {
    requirement: VenueRequirement;
    depth: number;
    onStatusChange: (id: number, status: RequirementStatus) => void;
  }) => {
    const statusConfig = STATUS_CONFIG[req.status];

    return (
      <tr className="border-b border-gray-100 hover:bg-teal-50/30 transition-colors">
        {/* Name */}
        <td className="py-2.5 pr-4" style={{ paddingLeft: `${12 + depth * 24 + 20}px` }}>
          <div className="flex items-center gap-2">
            <div className={`p-1 rounded-full ${statusConfig.color.bg}`}>
              <Home className={`h-3 w-3 ${statusConfig.color.text}`} />
            </div>
            <div>
              <span className="text-sm font-medium text-gray-800">{req.name}</span>
              {req.description && (
                <p className="text-xs text-gray-400 truncate max-w-[300px]">{req.description}</p>
              )}
            </div>
          </div>
        </td>

        {/* Status dropdown */}
        <td className="py-2.5 px-4">
          <select
            value={req.status}
            onChange={(e) => onStatusChange(req.id, e.target.value as RequirementStatus)}
            onClick={(e) => e.stopPropagation()}
            className={`px-2.5 py-1 text-xs font-medium rounded-md border cursor-pointer
              ${statusConfig.color.badge} focus:ring-2 focus:ring-teal-500 focus:border-teal-500`}
          >
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>
        </td>

        {/* Effort flags */}
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-1.5">
            {req.growth_team_effort && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-600 border border-violet-200">
                Growth
              </span>
            )}
            {req.platform_team_effort && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-50 text-cyan-600 border border-cyan-200">
                Platform
              </span>
            )}
          </div>
        </td>

        {/* Team */}
        <td className="py-2.5 px-4 text-center">
          {req.team && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${TEAM_COLORS[req.team].light} ${TEAM_COLORS[req.team].text}`}>
              {req.team}
            </span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/30">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl shadow-lg shadow-teal-500/25">
                <MapPin className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Venue Requirements</h1>
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
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <SummaryTile
              label="Total"
              count={summary.total}
              icon={MapPin}
              color="teal"
            />
            <SummaryTile
              label="Not Picked"
              count={summary.not_picked}
              icon={Clock}
              color="slate"
            />
            <SummaryTile
              label="In Progress"
              count={summary.in_progress}
              icon={TrendingUp}
              color="cyan"
            />
            <SummaryTile
              label="Done"
              count={summary.done}
              icon={Check}
              color="emerald"
            />
            <SummaryTile
              label="Deprioritised"
              count={summary.deprioritised}
              icon={Pause}
              color="amber"
            />
          </div>
        )}

        {/* Filters and Hierarchy Controls */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            {/* Multiselect Filters */}
            <MultiSelectDropdown
              label="Activity"
              options={filterOptions.activities}
              selected={filters.activities}
              onChange={(val) => setFilters(f => ({ ...f, activities: val }))}
              icon={<Activity size={14} />}
              compact
            />
            <MultiSelectDropdown
              label="City"
              options={filterOptions.cities}
              selected={filters.cities}
              onChange={(val) => setFilters(f => ({ ...f, cities: val }))}
              icon={<Building2 size={14} />}
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
            <MultiSelectDropdown
              label="Club"
              options={filterOptions.clubs}
              selected={filters.clubs}
              onChange={(val) => setFilters(f => ({ ...f, clubs: val }))}
              icon={<Home size={14} />}
              compact
            />

            <div className="h-6 w-px bg-gray-200" />

            {/* Team Filter Pills */}
            <div className="flex items-center gap-2">
              <Users size={14} className="text-gray-400" />
              <div className="flex items-center gap-1">
                {TEAM_KEYS.map(teamKey => {
                  const team = TEAMS[teamKey];
                  const isActive = filters.teams.includes(teamKey);
                  return (
                    <button
                      key={teamKey}
                      onClick={() => setFilters(f => ({
                        ...f,
                        teams: isActive
                          ? f.teams.filter(t => t !== teamKey)
                          : [...f.teams, teamKey]
                      }))}
                      className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-150 ${
                        isActive
                          ? 'text-white shadow-sm'
                          : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                      }`}
                      style={isActive ? { backgroundColor: team.color.accent } : undefined}
                    >
                      {team.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-6 w-px bg-gray-200" />

            {/* Status Filter */}
            <div className="flex items-center gap-1">
              {(Object.keys(STATUS_CONFIG) as RequirementStatus[]).map(status => {
                const config = STATUS_CONFIG[status];
                const isActive = statusFilter === status;
                return (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(isActive ? null : status)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                      isActive
                        ? `${config.color.bg} ${config.color.text}`
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {config.shortLabel}
                  </button>
                );
              })}
            </div>

            {/* Clear Filters */}
            {(filters.activities.length > 0 || filters.cities.length > 0 || filters.areas.length > 0 ||
              filters.clubs.length > 0 || filters.teams.length > 0 || statusFilter) && (
              <>
                <div className="h-6 w-px bg-gray-200" />
                <button
                  onClick={() => {
                    setFilters({ activities: [], cities: [], areas: [], clubs: [], teams: [] });
                    setStatusFilter(null);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <X size={12} />
                  Clear
                </button>
              </>
            )}
          </div>

          {/* Hierarchy Level Controls */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Layers size={14} className="text-gray-400" />
              <span className="text-xs font-medium text-gray-500">Hierarchy Order:</span>
            </div>
            <div className="flex items-center gap-1">
              {hierarchyLevels.map((level, index) => {
                const isEnabled = enabledLevels.has(level);
                const levelConfig = {
                  activity: { icon: Activity, color: 'teal', label: 'Activity' },
                  city: { icon: Building2, color: 'blue', label: 'City' },
                  area: { icon: MapPin, color: 'cyan', label: 'Area' }
                };
                const config = levelConfig[level];
                const Icon = config.icon;

                return (
                  <div
                    key={level}
                    draggable
                    onDragStart={() => setDraggingLevel(level)}
                    onDragEnd={() => setDraggingLevel(null)}
                    onDragOver={(e) => e.preventDefault()}
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
                    className={`
                      flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-grab transition-all
                      ${draggingLevel === level ? 'opacity-50 scale-95' : ''}
                      ${isEnabled
                        ? 'bg-teal-50 text-teal-700 border border-teal-200'
                        : 'bg-gray-100 text-gray-400 border border-gray-200'
                      }
                    `}
                  >
                    <GripVertical size={12} className="opacity-40" />
                    <Icon size={12} />
                    <span className="text-xs font-medium">{config.label}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEnabledLevels(prev => {
                          const next = new Set(prev);
                          if (next.has(level)) {
                            if (next.size > 1) next.delete(level);
                          } else {
                            next.add(level);
                          }
                          return next;
                        });
                      }}
                      className={`ml-0.5 p-0.5 rounded transition-colors ${
                        isEnabled ? 'hover:bg-white/50' : 'hover:bg-gray-200'
                      }`}
                    >
                      {isEnabled ? (
                        <Check size={10} className="text-green-600" />
                      ) : (
                        <X size={10} className="text-gray-400" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex-1" />

            {/* Expand/Collapse */}
            <div className="flex items-center gap-2">
              <button
                onClick={expandAll}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Expand All
              </button>
              <button
                onClick={collapseAll}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Collapse All
              </button>
            </div>
          </div>
        </div>

        {/* Hierarchy Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Hierarchy
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Effort
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Add/Edit Target
                  </th>
                </tr>
              </thead>
              <tbody>
                {hierarchy.map(node => (
                  <HierarchyRow key={node.id} node={node} />
                ))}
              </tbody>
            </table>
          )}
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
  onCreate: (data: CreateRequirementRequest) => void;
}) {
  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [growthEffort, setGrowthEffort] = useState(false);
  const [platformEffort, setPlatformEffort] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Hierarchy selection state
  const [selectedActivityId, setSelectedActivityId] = useState<number | undefined>(context.activity_id);
  const [selectedActivityName, setSelectedActivityName] = useState<string | undefined>(context.activity_name);
  const [selectedCityId, setSelectedCityId] = useState<number | undefined>(context.city_id);
  const [selectedCityName, setSelectedCityName] = useState<string | undefined>(context.city_name);
  const [selectedAreaId, setSelectedAreaId] = useState<number | undefined>(context.area_id);
  const [selectedAreaName, setSelectedAreaName] = useState<string | undefined>(context.area_name);
  const [selectedClubId, setSelectedClubId] = useState<number | undefined>(undefined);
  const [selectedClubName, setSelectedClubName] = useState<string | undefined>(undefined);

  // Filter options
  const [activities, setActivities] = useState<FilterOption[]>([]);
  const [cities, setCities] = useState<FilterOption[]>([]);
  const [areas, setAreas] = useState<FilterOption[]>([]);
  const [clubs, setClubs] = useState<FilterOption[]>([]);

  // Calculate team from selection
  const team = selectedActivityName && selectedCityName
    ? getTeamForClub(selectedActivityName, selectedCityName)
    : undefined;

  // Generate default name from current selection
  const generateName = () => {
    const parts: string[] = [];
    if (selectedActivityName) {
      parts.push(selectedActivityName.length > 12 ? selectedActivityName.substring(0, 10) : selectedActivityName);
    }
    if (selectedCityName) {
      const cityAbbrev: Record<string, string> = {
        'Gurgaon': 'GGN', 'Gurugram': 'GGN', 'Noida': 'NOI', 'Delhi': 'DEL',
        'Faridabad': 'FBD', 'Ghaziabad': 'GZB', 'Bangalore': 'BLR', 'Mumbai': 'MUM',
        'Hyderabad': 'HYD', 'Chennai': 'CHN', 'Pune': 'PUN', 'Kolkata': 'KOL'
      };
      parts.push(cityAbbrev[selectedCityName] || selectedCityName.substring(0, 3).toUpperCase());
    }
    if (selectedAreaName) {
      parts.push(selectedAreaName);
    }
    return parts.join(' ');
  };

  // Fetch activities on mount
  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const res = await fetch(`${API_BASE}/scaling-tasks/filters/activities`);
        const data = await res.json();
        if (data.success) setActivities(data.options || []);
      } catch (err) {
        console.error('Failed to fetch activities:', err);
      }
    };
    fetchActivities();
  }, []);

  // Fetch cities when activity changes
  useEffect(() => {
    if (selectedActivityId) {
      const fetchCities = async () => {
        try {
          const res = await fetch(`${API_BASE}/scaling-tasks/filters/cities?activity_ids=${selectedActivityId}`);
          const data = await res.json();
          if (data.success) setCities(data.options || []);
        } catch (err) {
          console.error('Failed to fetch cities:', err);
        }
      };
      fetchCities();
    } else {
      setCities([]);
    }
  }, [selectedActivityId]);

  // Fetch areas when city changes
  useEffect(() => {
    if (selectedActivityId && selectedCityId) {
      const fetchAreas = async () => {
        try {
          const res = await fetch(`${API_BASE}/scaling-tasks/filters/areas?activity_ids=${selectedActivityId}&city_ids=${selectedCityId}`);
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
  }, [selectedActivityId, selectedCityId]);

  // Fetch clubs when area changes
  useEffect(() => {
    if (selectedActivityId && selectedCityId && selectedAreaId) {
      const fetchClubs = async () => {
        try {
          const res = await fetch(`${API_BASE}/scaling-tasks/filters/clubs?activity_ids=${selectedActivityId}&city_ids=${selectedCityId}&area_ids=${selectedAreaId}`);
          const data = await res.json();
          if (data.success) setClubs(data.options || []);
        } catch (err) {
          console.error('Failed to fetch clubs:', err);
        }
      };
      fetchClubs();
    } else {
      setClubs([]);
    }
  }, [selectedActivityId, selectedCityId, selectedAreaId]);

  // Update default name when selection changes
  useEffect(() => {
    if (!name || name === generateDefaultName(context)) {
      setName(generateName());
    }
  }, [selectedActivityName, selectedCityName, selectedAreaName]);

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
  };

  const handleAreaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value ? parseInt(e.target.value) : undefined;
    const area = areas.find(a => String(a.id) === e.target.value);
    setSelectedAreaId(id);
    setSelectedAreaName(area?.name);
    // Reset club selection
    setSelectedClubId(undefined);
    setSelectedClubName(undefined);
  };

  const handleClubChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value ? parseInt(e.target.value) : undefined;
    const club = clubs.find(c => String(c.id) === e.target.value);
    setSelectedClubId(id);
    setSelectedClubName(club?.name);
  };

  const isValid = name.trim() && selectedActivityId && selectedCityId && selectedAreaId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setSubmitting(true);
    await onCreate({
      name: name.trim(),
      description: description.trim() || undefined,
      activity_id: selectedActivityId,
      activity_name: selectedActivityName,
      city_id: selectedCityId,
      city_name: selectedCityName,
      area_id: selectedAreaId,
      area_name: selectedAreaName,
      club_id: selectedClubId,
      club_name: selectedClubName,
      growth_team_effort: growthEffort,
      platform_team_effort: platformEffort,
      team
    });
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
            {/* Hierarchy Selection */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Activity *</label>
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
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">City *</label>
                <select
                  value={selectedCityId || ''}
                  onChange={handleCityChange}
                  disabled={!selectedActivityId}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">Select City</option>
                  {cities.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Area *</label>
                <select
                  value={selectedAreaId || ''}
                  onChange={handleAreaChange}
                  disabled={!selectedCityId}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">Select Area</option>
                  {areas.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Club (Optional)</label>
                <select
                  value={selectedClubId || ''}
                  onChange={handleClubChange}
                  disabled={!selectedAreaId}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">Select Club</option>
                  {clubs.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Effort Required</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={growthEffort}
                    onChange={(e) => setGrowthEffort(e.target.checked)}
                    className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
                  />
                  <span className="text-sm text-gray-600">Growth Team</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={platformEffort}
                    onChange={(e) => setPlatformEffort(e.target.checked)}
                    className="w-4 h-4 text-cyan-600 border-gray-300 rounded focus:ring-cyan-500"
                  />
                  <span className="text-sm text-gray-600">Platform Team</span>
                </label>
              </div>
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

// Summary tile component
interface SummaryTileProps {
  label: string;
  count: number;
  icon: React.ElementType;
  color: 'teal' | 'slate' | 'cyan' | 'emerald' | 'amber';
}

function SummaryTile({ label, count, icon: Icon, color }: SummaryTileProps) {
  const colorClasses = {
    teal: { bg: 'bg-teal-50', icon: 'bg-teal-100 text-teal-600', text: 'text-teal-600' },
    slate: { bg: 'bg-slate-50', icon: 'bg-slate-100 text-slate-600', text: 'text-slate-600' },
    cyan: { bg: 'bg-cyan-50', icon: 'bg-cyan-100 text-cyan-600', text: 'text-cyan-600' },
    emerald: { bg: 'bg-emerald-50', icon: 'bg-emerald-100 text-emerald-600', text: 'text-emerald-600' },
    amber: { bg: 'bg-amber-50', icon: 'bg-amber-100 text-amber-600', text: 'text-amber-600' }
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
