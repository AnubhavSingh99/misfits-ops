import React, { useState, useEffect } from 'react';
import { Search, Download, RefreshCw, Settings, Filter } from 'lucide-react';

interface POC {
  id: string;
  name: string;
  poc_type: 'activity_head' | 'city_head';
  activities: string[];
  cities: string[];
  team_name: string;
}

interface UniversalFilterProps {
  onFilterChange: (filters: FilterState) => void;
  currentView?: string;
}

interface FilterState {
  viewAs: string;
  pocId?: string;
  activity: string;
  city: string;
  area: string;
  health: string;
  stage: string;
  search: string;
}

// This is the magic component that appears on EVERY screen
export function UniversalFilter({ onFilterChange, currentView }: UniversalFilterProps) {
  const [pocs, setPocs] = useState<POC[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    viewAs: 'All Data',
    activity: 'All',
    city: 'All',
    area: 'All',
    health: 'All',
    stage: 'All',
    search: ''
  });

  // Load POCs from database in real-time
  useEffect(() => {
    const fetchPocs = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/poc/list');
        const pocsData = await response.json();
        setPocs(pocsData);
      } catch (error) {
        console.error('Failed to fetch POCs:', error);
      }
    };

    fetchPocs();

    // WebSocket for real-time POC updates
    const ws = new WebSocket('ws://localhost:5001/realtime');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'poc_updated' || data.type === 'poc_assigned') {
        fetchPocs(); // Refresh POC list
      }
    };

    return () => ws.close();
  }, []);

  // Generate dynamic view options based on real POCs
  const generateViewOptions = () => {
    const options = ['All Data', '--- POC Views ---'];

    // Activity Heads from database
    const activityHeads = pocs.filter(poc => poc.poc_type === 'activity_head');
    activityHeads.forEach(poc => {
      const activities = poc.activities.join(' & ');
      options.push(`${poc.name} - ${activities}`);
    });

    options.push('--- City Views ---');

    // City Heads from database
    const cityHeads = pocs.filter(poc => poc.poc_type === 'city_head');
    cityHeads.forEach(poc => {
      const cities = poc.cities.join(' & ');
      options.push(`${poc.name} - ${cities}`);
    });

    options.push('--- Team Views ---');

    // Teams from database
    const teams = [...new Set(pocs.map(poc => poc.team_name))];
    teams.forEach(team => {
      options.push(`Team ${team}`);
    });

    options.push('--- Special ---', 'Long Tail Only', 'Unassigned', 'My Favorites');

    return options;
  };

  // Handle filter changes and notify parent
  const updateFilter = (key: keyof FilterState, value: string) => {
    const newFilters = { ...filters, [key]: value };

    // Extract POC ID when view changes
    if (key === 'viewAs' && value.includes(' - ')) {
      const pocName = value.split(' - ')[0];
      const poc = pocs.find(p => p.name === pocName);
      newFilters.pocId = poc?.id;
    }

    setFilters(newFilters);
    onFilterChange(newFilters);

    // Update areas based on city selection
    if (key === 'city' && value !== 'All') {
      fetchAreas(value);
    }
  };

  const fetchAreas = async (city: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/areas?city=${city}`);
      const areasData = await response.json();
      setAreas(areasData);
    } catch (error) {
      console.error('Failed to fetch areas:', error);
    }
  };

  const handleExport = () => {
    // Export current filtered data
    const params = new URLSearchParams(filters as any);
    window.open(`http://localhost:3001/api/export?${params}`, '_blank');
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="bg-white border-b border-gray-200 p-4 space-y-4">
      {/* Primary Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* View As Dropdown - The Most Important */}
        <div className="flex-1 min-w-64">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            View As
          </label>
          <select
            value={filters.viewAs}
            onChange={(e) => updateFilter('viewAs', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          >
            {generateViewOptions().map((option, index) => (
              <option
                key={index}
                value={option}
                disabled={option.startsWith('---')}
                className={option.startsWith('---') ? 'font-bold bg-gray-100' : ''}
              >
                {option}
              </option>
            ))}
          </select>
        </div>

        {/* Secondary Filters */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Activity
          </label>
          <select
            value={filters.activity}
            onChange={(e) => updateFilter('activity', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="All">All</option>
            <option value="Running">Running</option>
            <option value="Photography">Photography</option>
            <option value="Books">Books</option>
            <option value="Music">Music</option>
            <option value="Cycling">Cycling</option>
            <option value="Yoga">Yoga</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            City
          </label>
          <select
            value={filters.city}
            onChange={(e) => updateFilter('city', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="All">All</option>
            <option value="Mumbai">Mumbai</option>
            <option value="Delhi">Delhi</option>
            <option value="Bangalore">Bangalore</option>
            <option value="Pune">Pune</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Area
          </label>
          <select
            value={filters.area}
            onChange={(e) => updateFilter('area', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="All">All</option>
            {areas.map(area => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Health
          </label>
          <select
            value={filters.health}
            onChange={(e) => updateFilter('health', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="All">All</option>
            <option value="GREEN">🟢 Green</option>
            <option value="YELLOW">🟡 Yellow</option>
            <option value="RED">🔴 Red</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Stage
          </label>
          <select
            value={filters.stage}
            onChange={(e) => updateFilter('stage', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="All">All</option>
            <option value="not_picked">Not Picked</option>
            <option value="stage_1">Stage 1</option>
            <option value="stage_2">Stage 2</option>
            <option value="stage_3">Stage 3</option>
            <option value="realised">Realised</option>
          </select>
        </div>
      </div>

      {/* Search and Actions */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search clubs, meetups, POCs..."
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Export
          </button>

          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

          <button className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
            <Settings className="h-4 w-4" />
            Columns
          </button>
        </div>
      </div>

      {/* Active Filters Display */}
      {(filters.viewAs !== 'All Data' || filters.activity !== 'All' || filters.city !== 'All') && (
        <div className="flex items-center gap-2 text-sm">
          <Filter className="h-4 w-4 text-gray-500" />
          <span className="text-gray-500">Active filters:</span>

          {filters.viewAs !== 'All Data' && (
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
              {filters.viewAs}
            </span>
          )}

          {filters.activity !== 'All' && (
            <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
              Activity: {filters.activity}
            </span>
          )}

          {filters.city !== 'All' && (
            <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
              City: {filters.city}
            </span>
          )}

          <button
            onClick={() => {
              const resetFilters = {
                viewAs: 'All Data',
                activity: 'All',
                city: 'All',
                area: 'All',
                health: 'All',
                stage: 'All',
                search: ''
              };
              setFilters(resetFilters);
              onFilterChange(resetFilters);
            }}
            className="text-gray-500 hover:text-gray-700 underline"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}