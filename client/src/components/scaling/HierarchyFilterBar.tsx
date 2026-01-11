import React from 'react';
import { Activity, Building2, MapPin, Home, Users, X, Layers, GripVertical, Check, Heart } from 'lucide-react';
import { MultiSelectDropdown } from '../ui/MultiSelectDropdown';
import { TEAMS, TEAM_KEYS, type TeamKey } from '../../../../shared/teamConfig';

interface FilterOption {
  id: number;
  name: string;
}

export type HealthFilter = 'green' | 'yellow' | 'red' | 'gray';

const HEALTH_OPTIONS: { key: HealthFilter; label: string; color: string; bg: string; border: string }[] = [
  { key: 'green', label: 'Healthy', color: '#10b981', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { key: 'yellow', label: 'At Risk', color: '#f59e0b', bg: 'bg-amber-50', border: 'border-amber-200' },
  { key: 'red', label: 'Critical', color: '#ef4444', bg: 'bg-red-50', border: 'border-red-200' },
  { key: 'gray', label: 'Dormant', color: '#9ca3af', bg: 'bg-gray-100', border: 'border-gray-300' },
];

export interface HierarchyFilters {
  activities: number[];
  cities: number[];
  areas: number[];
  clubs: number[];
  teams: TeamKey[];
  health: HealthFilter[];
}

export type HierarchyLevel = 'activity' | 'city' | 'area';

interface HierarchyOrderProps {
  hierarchyLevels: HierarchyLevel[];
  enabledLevels: Set<HierarchyLevel>;
  draggingLevel: HierarchyLevel | null;
  isCustomHierarchy: boolean;
  onDragStart: (level: HierarchyLevel) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (targetLevel: HierarchyLevel) => void;
  onToggleLevel: (level: HierarchyLevel) => void;
  onReset: () => void;
}

interface HierarchyFilterBarProps {
  filters: HierarchyFilters;
  onFiltersChange: (filters: HierarchyFilters) => void;
  filterOptions: {
    activities: FilterOption[];
    cities: FilterOption[];
    areas: FilterOption[];
    clubs: FilterOption[];
  };
  hierarchyOrder?: HierarchyOrderProps;
}

const levelConfig: Record<HierarchyLevel, { icon: typeof Activity; color: string; label: string }> = {
  activity: { icon: Activity, color: 'purple', label: 'Activity' },
  city: { icon: Building2, color: 'blue', label: 'City' },
  area: { icon: MapPin, color: 'emerald', label: 'Area' }
};

export function HierarchyFilterBar({
  filters,
  onFiltersChange,
  filterOptions,
  hierarchyOrder
}: HierarchyFilterBarProps) {
  const hasActiveFilters =
    filters.activities.length > 0 ||
    filters.cities.length > 0 ||
    filters.areas.length > 0 ||
    filters.clubs.length > 0 ||
    filters.teams.length > 0 ||
    (filters.health && filters.health.length > 0);

  const clearAllFilters = () => {
    onFiltersChange({
      activities: [],
      cities: [],
      areas: [],
      clubs: [],
      teams: [],
      health: []
    });
  };

  const updateFilter = <K extends keyof HierarchyFilters>(
    key: K,
    value: HierarchyFilters[K]
  ) => {
    onFiltersChange({
      ...filters,
      [key]: value
    });
  };

  const toggleTeam = (teamKey: TeamKey) => {
    const newTeams = filters.teams.includes(teamKey)
      ? filters.teams.filter(t => t !== teamKey)
      : [...filters.teams, teamKey];
    updateFilter('teams', newTeams);
  };

  const toggleHealth = (healthKey: HealthFilter) => {
    const newHealth = filters.health.includes(healthKey)
      ? filters.health.filter(h => h !== healthKey)
      : [...filters.health, healthKey];
    updateFilter('health', newHealth);
  };

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        {/* Hierarchy Filters */}
        <MultiSelectDropdown
          label="Activity"
          options={filterOptions.activities}
          selected={filters.activities}
          onChange={(val) => updateFilter('activities', val)}
          icon={<Activity size={14} />}
          compact
        />

        <MultiSelectDropdown
          label="City"
          options={filterOptions.cities}
          selected={filters.cities}
          onChange={(val) => updateFilter('cities', val)}
          icon={<Building2 size={14} />}
          compact
        />

        <MultiSelectDropdown
          label="Area"
          options={filterOptions.areas}
          selected={filters.areas}
          onChange={(val) => updateFilter('areas', val)}
          icon={<MapPin size={14} />}
          compact
        />

        <MultiSelectDropdown
          label="Club"
          options={filterOptions.clubs}
          selected={filters.clubs}
          onChange={(val) => updateFilter('clubs', val)}
          icon={<Home size={14} />}
          compact
        />

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200" />

        {/* Team Filter - Pill Buttons */}
        <div className="flex items-center gap-2">
          <Users size={14} className="text-gray-400" />
          <div className="flex items-center gap-1">
            {TEAM_KEYS.map(teamKey => {
              const team = TEAMS[teamKey];
              const isActive = filters.teams.includes(teamKey);
              return (
                <button
                  key={teamKey}
                  onClick={() => toggleTeam(teamKey)}
                  className={`
                    px-3 py-1 text-xs font-medium rounded-full transition-all duration-150
                    ${isActive
                      ? 'text-white shadow-sm'
                      : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                    }
                  `}
                  style={isActive ? { backgroundColor: team.color.accent } : undefined}
                >
                  {team.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200" />

        {/* Health Filter - Pill Buttons with colored dots */}
        <div className="flex items-center gap-2">
          <Heart size={14} className="text-gray-400" />
          <div className="flex items-center gap-1">
            {HEALTH_OPTIONS.map(option => {
              const isActive = filters.health.includes(option.key);
              return (
                <button
                  key={option.key}
                  onClick={() => toggleHealth(option.key)}
                  className={`
                    flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full
                    transition-all duration-150
                    ${isActive
                      ? `${option.bg} ${option.border} border shadow-sm`
                      : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                    }
                  `}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: option.color }}
                  />
                  <span className={isActive ? '' : 'text-gray-500'}>
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Clear Filters - moved before hierarchy order */}
        {hasActiveFilters && (
          <>
            <div className="h-6 w-px bg-gray-200" />
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <X size={12} />
              Clear filters
            </button>
          </>
        )}
      </div>

      {/* Hierarchy Order Controls - always on its own line */}
      {hierarchyOrder && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-1.5 text-gray-400">
                <Layers size={14} />
                <span className="text-xs font-medium">Order:</span>
              </div>
              <div className="flex items-center gap-1.5">
                {hierarchyOrder.hierarchyLevels.map((level, index) => {
                  const isEnabled = hierarchyOrder.enabledLevels.has(level);
                  const isDragging = hierarchyOrder.draggingLevel === level;
                  const isDragTarget = hierarchyOrder.draggingLevel && hierarchyOrder.draggingLevel !== level;
                  const config = levelConfig[level];
                  const Icon = config.icon;

                  // Enhanced color styles with better transitions
                  const colorStyles = {
                    purple: {
                      enabled: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 hover:border-purple-300 hover:shadow-purple-100',
                      disabled: 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                    },
                    blue: {
                      enabled: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300 hover:shadow-blue-100',
                      disabled: 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                    },
                    emerald: {
                      enabled: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 hover:shadow-emerald-100',
                      disabled: 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                    }
                  };
                  const style = colorStyles[config.color as keyof typeof colorStyles];

                  return (
                    <div
                      key={level}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        hierarchyOrder.onDragStart(level);
                      }}
                      onDragEnd={hierarchyOrder.onDragEnd}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={() => hierarchyOrder.onDrop(level)}
                      style={{
                        transitionDelay: `${index * 20}ms`,
                        transform: isDragging
                          ? 'scale(1.05) rotate(-2deg)'
                          : isDragTarget
                            ? 'scale(0.98)'
                            : 'scale(1) rotate(0deg)',
                        opacity: isDragging ? 0.7 : 1,
                        boxShadow: isDragging
                          ? '0 8px 20px -4px rgba(0,0,0,0.15), 0 4px 8px -2px rgba(0,0,0,0.1)'
                          : 'none'
                      }}
                      className={`
                        flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-grab active:cursor-grabbing
                        border text-xs font-medium select-none
                        transition-all duration-200 ease-out
                        hover:shadow-md hover:-translate-y-0.5
                        ${isEnabled ? style.enabled : style.disabled}
                      `}
                    >
                      <GripVertical
                        size={12}
                        className={`
                          transition-all duration-200
                          ${isDragging ? 'opacity-70 scale-110' : 'opacity-30 group-hover:opacity-50'}
                        `}
                      />
                      <Icon
                        size={12}
                        className={`
                          transition-transform duration-200
                          ${isEnabled ? '' : 'opacity-50'}
                        `}
                      />
                      <span className={`transition-opacity duration-200 ${isEnabled ? '' : 'opacity-60'}`}>
                        {config.label}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          hierarchyOrder.onToggleLevel(level);
                        }}
                        className={`
                          ml-1 p-1 rounded-full
                          transition-all duration-200 ease-out
                          hover:scale-110 active:scale-95
                          ${isEnabled
                            ? 'bg-green-100/80 hover:bg-green-200 text-green-600'
                            : 'bg-gray-200/80 hover:bg-gray-300 text-gray-400'
                          }
                        `}
                      >
                        <div
                          className="transition-transform duration-200"
                          style={{
                            transform: isEnabled ? 'rotate(0deg) scale(1)' : 'rotate(180deg) scale(0.9)'
                          }}
                        >
                          {isEnabled ? (
                            <Check size={10} strokeWidth={3} />
                          ) : (
                            <X size={10} strokeWidth={2.5} />
                          )}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
          {hierarchyOrder.isCustomHierarchy && (
            <button
              onClick={hierarchyOrder.onReset}
              className="
                text-xs text-gray-400 hover:text-gray-600
                px-2 py-1 rounded-md
                transition-all duration-200 ease-out
                hover:bg-gray-100 hover:shadow-sm
                active:scale-95
              "
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* Active Filters Summary */}
      {hasActiveFilters && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="font-medium">Filtering:</span>
            {filters.activities.length > 0 && (
              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded">
                {filters.activities.length} {filters.activities.length === 1 ? 'Activity' : 'Activities'}
              </span>
            )}
            {filters.cities.length > 0 && (
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                {filters.cities.length} {filters.cities.length === 1 ? 'City' : 'Cities'}
              </span>
            )}
            {filters.areas.length > 0 && (
              <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded">
                {filters.areas.length} {filters.areas.length === 1 ? 'Area' : 'Areas'}
              </span>
            )}
            {filters.clubs.length > 0 && (
              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded">
                {filters.clubs.length} {filters.clubs.length === 1 ? 'Club' : 'Clubs'}
              </span>
            )}
            {filters.teams.length > 0 && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                {filters.teams.map(t => TEAMS[t].name).join(', ')}
              </span>
            )}
            {filters.health && filters.health.length > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-50 text-gray-700 rounded">
                {filters.health.map(h => {
                  const option = HEALTH_OPTIONS.find(o => o.key === h);
                  return (
                    <span key={h} className="flex items-center gap-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: option?.color }}
                      />
                      <span>{option?.label}</span>
                    </span>
                  );
                })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default HierarchyFilterBar;
