import React from 'react';
import { Activity, Building2, MapPin, Home, Users, X } from 'lucide-react';
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

interface HierarchyFilterBarProps {
  filters: HierarchyFilters;
  onFiltersChange: (filters: HierarchyFilters) => void;
  filterOptions: {
    activities: FilterOption[];
    cities: FilterOption[];
    areas: FilterOption[];
    clubs: FilterOption[];
  };
}

export function HierarchyFilterBar({
  filters,
  onFiltersChange,
  filterOptions
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
