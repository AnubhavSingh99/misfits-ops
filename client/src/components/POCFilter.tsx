// POC Filtering System - Dual Structure Implementation
// Based on PRD v8.1 Section 5.1 - Activity Heads & City Heads

import React, { useState, useEffect } from 'react';
import { ChevronDown, User, MapPin, Activity as ActivityIcon, Users } from 'lucide-react';
import { POC, FilterOptions } from '../types/core';
import { api } from '../services/api';

interface POCFilterProps {
  onFilterChange: (filters: FilterOptions) => void;
  currentFilters: FilterOptions;
  showAllOption?: boolean;
}

// POC Data based on PRD Section 5.1
const POC_DATA: POC[] = [
  // Activity Heads
  {
    id: 'rahul',
    name: 'Rahul',
    type: 'activity_head',
    activities: ['Running', 'Cycling'],
    cities: ['Mumbai', 'Delhi', 'Bangalore', 'Pune'], // All cities
    total_clubs: 35,
    total_revenue: 1800000, // ₹18L
    team: 'phoenix',
    performance_score: 92,
    email: 'rahul@misfits.com',
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 'priya',
    name: 'Priya',
    type: 'activity_head',
    activities: ['Photography', 'Art'],
    cities: ['Mumbai', 'Delhi', 'Bangalore', 'Pune'], // All cities
    total_clubs: 28,
    total_revenue: 1400000, // ₹14L
    team: 'rocket',
    performance_score: 89,
    email: 'priya@misfits.com',
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 'amit',
    name: 'Amit',
    type: 'activity_head',
    activities: ['Books', 'Literature'],
    cities: ['Mumbai', 'Delhi', 'Bangalore', 'Pune'], // All cities
    total_clubs: 22,
    total_revenue: 1100000, // ₹11L
    team: 'support',
    performance_score: 85,
    email: 'amit@misfits.com',
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 'ankit',
    name: 'Ankit',
    type: 'activity_head',
    activities: ['Music', 'Dance', 'Drama', 'Gaming', 'Tech', 'Food', 'Travel', 'Language', 'Finance', 'Wellness', 'Pets', 'Volunteer', 'Crafts', 'Gardening', 'Movies'], // Long tail
    cities: ['Mumbai', 'Delhi', 'Bangalore', 'Pune'], // All cities
    total_clubs: 25,
    total_revenue: 500000, // ₹5L
    team: 'support',
    performance_score: 78,
    email: 'ankit@misfits.com',
    created_at: '2024-01-01T00:00:00Z'
  },

  // City Heads
  {
    id: 'priya_mumbai', // Priya has dual role
    name: 'Priya',
    type: 'city_head',
    activities: ['Running', 'Photography', 'Art', 'Books', 'Cycling', 'Music', 'Dance', 'Drama', 'Gaming', 'Tech'], // All activities
    cities: ['Mumbai'],
    total_clubs: 50,
    total_revenue: 2500000, // ₹25L
    team: 'rocket',
    performance_score: 91,
    email: 'priya@misfits.com',
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 'rakesh',
    name: 'Rakesh',
    type: 'city_head',
    activities: ['Running', 'Photography', 'Art', 'Books', 'Cycling', 'Music', 'Dance', 'Drama', 'Gaming', 'Tech'], // All activities
    cities: ['Delhi'],
    total_clubs: 45,
    total_revenue: 2200000, // ₹22L
    team: 'phoenix',
    performance_score: 87,
    email: 'rakesh@misfits.com',
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 'sunita',
    name: 'Sunita',
    type: 'city_head',
    activities: ['Running', 'Photography', 'Art', 'Books', 'Cycling', 'Music', 'Dance', 'Drama', 'Gaming', 'Tech'], // All activities
    cities: ['Bangalore'],
    total_clubs: 40,
    total_revenue: 2000000, // ₹20L
    team: 'phoenix',
    performance_score: 86,
    email: 'sunita@misfits.com',
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 'vacant_pune',
    name: 'Vacant - Pune',
    type: 'city_head',
    activities: ['Running', 'Photography', 'Art', 'Books', 'Cycling', 'Music', 'Dance', 'Drama', 'Gaming', 'Tech'], // All activities
    cities: ['Pune'],
    total_clubs: 15,
    total_revenue: 800000, // ₹8L
    team: 'support',
    performance_score: 60,
    email: 'pune@misfits.com',
    created_at: '2024-01-01T00:00:00Z'
  }
];

export function POCFilter({ onFilterChange, currentFilters, showAllOption = true }: POCFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPOC, setSelectedPOC] = useState<POC | null>(null);
  const [pocList, setPocList] = useState<POC[]>(POC_DATA);

  useEffect(() => {
    // Load POCs from API in production
    loadPOCs();
  }, []);

  const loadPOCs = async () => {
    try {
      // const pocs = await api.poc.getAll();
      // setPocList(pocs);
      // For now, use static data
      setPocList(POC_DATA);
    } catch (error) {
      console.error('Failed to load POCs:', error);
      setPocList(POC_DATA); // Fallback to static data
    }
  };

  const handlePOCSelection = (poc: POC | null) => {
    setSelectedPOC(poc);
    setIsOpen(false);

    if (poc) {
      // Build filters based on POC type and responsibilities
      const filters: FilterOptions = {
        poc_type: poc.type,
        poc_id: poc.id,
      };

      if (poc.type === 'activity_head') {
        // Activity Head sees their activities across all cities
        if (poc.activities && poc.activities.length > 0) {
          filters.activity = poc.activities[0]; // Default to first activity, can be changed
        }
      } else if (poc.type === 'city_head') {
        // City Head sees all activities in their city
        if (poc.cities && poc.cities.length > 0) {
          filters.city = poc.cities[0];
        }
      }

      onFilterChange(filters);
    } else {
      // Clear filters - show all data
      onFilterChange({});
    }
  };

  const formatRevenue = (amount: number): string => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    return `₹${(amount / 1000).toFixed(0)}K`;
  };

  const getDisplayName = (poc: POC) => {
    if (poc.type === 'activity_head') {
      const activities = poc.activities?.join(' & ') || '';
      return `${poc.name} - ${activities}`;
    } else {
      const city = poc.cities?.[0] || '';
      return `${poc.name} - ${city}`;
    }
  };

  const getCurrentDisplayName = () => {
    if (!selectedPOC) return 'All Operations';
    return getDisplayName(selectedPOC);
  };

  // Group POCs by type
  const activityHeads = pocList.filter(poc => poc.type === 'activity_head');
  const cityHeads = pocList.filter(poc => poc.type === 'city_head');

  return (
    <div className="relative">
      {/* Filter Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-6 py-3 bg-white rounded-xl shadow-lg border border-gray-200 hover:shadow-xl transition-all duration-300 min-w-[300px]"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${selectedPOC ?
            selectedPOC.type === 'activity_head' ? 'bg-blue-100' : 'bg-green-100'
            : 'bg-gray-100'
          }`}>
            {selectedPOC ? (
              selectedPOC.type === 'activity_head' ?
                <ActivityIcon className={`h-5 w-5 ${selectedPOC.type === 'activity_head' ? 'text-blue-600' : 'text-green-600'}`} /> :
                <MapPin className="h-5 w-5 text-green-600" />
            ) : (
              <Users className="h-5 w-5 text-gray-600" />
            )}
          </div>
          <div className="text-left">
            <div className="font-semibold text-gray-900">
              {getCurrentDisplayName()}
            </div>
            <div className="text-sm text-gray-500">
              {selectedPOC ? (
                `${selectedPOC.total_clubs} clubs • ${formatRevenue(selectedPOC.total_revenue)}`
              ) : (
                'System-wide view'
              )}
            </div>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${
          isOpen ? 'rotate-180' : ''
        }`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full min-w-[400px] bg-white rounded-xl shadow-2xl border border-gray-200 z-50">
          <div className="p-4">
            {/* All Operations Option */}
            {showAllOption && (
              <div className="mb-4">
                <button
                  onClick={() => handlePOCSelection(null)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all duration-200 ${
                    !selectedPOC ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Users className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">All Operations</div>
                    <div className="text-sm text-gray-500">System-wide view • All POCs</div>
                  </div>
                  {!selectedPOC && (
                    <div className="ml-auto text-blue-600 font-semibold">✓</div>
                  )}
                </button>
              </div>
            )}

            {/* Activity Heads Section */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                <ActivityIcon className="h-4 w-4" />
                Activity Heads
              </h3>
              <div className="space-y-2">
                {activityHeads.map((poc) => (
                  <button
                    key={poc.id}
                    onClick={() => handlePOCSelection(poc)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all duration-200 ${
                      selectedPOC?.id === poc.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <ActivityIcon className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{getDisplayName(poc)}</div>
                      <div className="text-sm text-gray-500">
                        {poc.total_clubs} clubs • {formatRevenue(poc.total_revenue)} • Team {poc.team}
                      </div>
                    </div>
                    {selectedPOC?.id === poc.id && (
                      <div className="text-blue-600 font-semibold">✓</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* City Heads Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                City Heads
              </h3>
              <div className="space-y-2">
                {cityHeads.map((poc) => (
                  <button
                    key={poc.id}
                    onClick={() => handlePOCSelection(poc)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all duration-200 ${
                      selectedPOC?.id === poc.id ? 'bg-green-50 border border-green-200' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="p-2 bg-green-100 rounded-lg">
                      <MapPin className="h-5 w-5 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{getDisplayName(poc)}</div>
                      <div className="text-sm text-gray-500">
                        {poc.total_clubs} clubs • {formatRevenue(poc.total_revenue)} • Team {poc.team}
                      </div>
                    </div>
                    {selectedPOC?.id === poc.id && (
                      <div className="text-green-600 font-semibold">✓</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Quick POC Selector for navigation
export function QuickPOCSelector({ onSelect }: { onSelect: (poc: POC | null) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={() => onSelect(null)}
        className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
      >
        All
      </button>
      {POC_DATA.slice(0, 4).map((poc) => (
        <button
          key={poc.id}
          onClick={() => onSelect(poc)}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            poc.type === 'activity_head'
              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              : 'bg-green-100 text-green-700 hover:bg-green-200'
          }`}
        >
          {poc.name}
        </button>
      ))}
    </div>
  );
}

export default POCFilter;