import React from 'react';
import { Activity, Building2, MapPin, Home, Users, X, Layers, GripVertical, Check } from 'lucide-react';
import { MultiSelectDropdown } from '../ui/MultiSelectDropdown';
import { TEAMS, TEAM_KEYS, type TeamKey } from '../../../../shared/teamConfig';

interface FilterOption {
  id: number;
  name: string;
}

export interface HierarchyFilters {
  activities: number[];
  cities: number[];
  areas: number[];
  clubs: number[];
  teams: TeamKey[];
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
    filters.teams.length > 0;

  const clearAllFilters = () => {
    onFiltersChange({
      activities: [],
      cities: [],
      areas: [],
      clubs: [],
      teams: []
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

        {/* Hierarchy Order Controls */}
        {hierarchyOrder && (
          <>
            <div className="h-6 w-px bg-gray-200" />
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-gray-400">
                <Layers size={14} />
                <span className="text-xs font-medium">Order:</span>
              </div>
              <div className="flex items-center gap-1">
                {hierarchyOrder.hierarchyLevels.map((level) => {
                  const isEnabled = hierarchyOrder.enabledLevels.has(level);
                  const config = levelConfig[level];
                  const Icon = config.icon;

                  const colorStyles = {
                    purple: {
                      enabled: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
                      disabled: 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-150'
                    },
                    blue: {
                      enabled: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
                      disabled: 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-150'
                    },
                    emerald: {
                      enabled: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
                      disabled: 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-150'
                    }
                  };
                  const style = colorStyles[config.color as keyof typeof colorStyles];

                  return (
                    <div
                      key={level}
                      draggable
                      onDragStart={() => hierarchyOrder.onDragStart(level)}
                      onDragEnd={hierarchyOrder.onDragEnd}
                      onDragOver={hierarchyOrder.onDragOver}
                      onDrop={() => hierarchyOrder.onDrop(level)}
                      className={`
                        flex items-center gap-1 px-2 py-1 rounded-md cursor-grab transition-all border text-xs font-medium
                        ${hierarchyOrder.draggingLevel === level ? 'opacity-50 scale-95' : ''}
                        ${isEnabled ? style.enabled : style.disabled}
                      `}
                    >
                      <GripVertical size={10} className="opacity-40" />
                      <Icon size={10} />
                      <span>{config.label}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          hierarchyOrder.onToggleLevel(level);
                        }}
                        className={`ml-0.5 p-0.5 rounded transition-colors ${
                          isEnabled ? 'hover:bg-white/50' : 'hover:bg-gray-200'
                        }`}
                      >
                        {isEnabled ? (
                          <Check size={8} className="text-green-600" />
                        ) : (
                          <X size={8} className="text-gray-400" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
              {hierarchyOrder.isCustomHierarchy && (
                <button
                  onClick={hierarchyOrder.onReset}
                  className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
          </>
        )}

        {/* Clear Filters */}
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
          </div>
        </div>
      )}
    </div>
  );
}

export default HierarchyFilterBar;
