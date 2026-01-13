import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, X, ListTodo, ChevronDown, Check, Loader2 } from 'lucide-react';
import type { ScalingTask } from '../../../../shared/types';
import { TEAMS, type TeamKey } from '../../../../shared/teamConfig';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

interface TaskSelectorProps {
  context: {
    activity_id?: number;
    activity_name?: string;
    city_id?: number;
    city_name?: string;
    area_id?: number;
    area_name?: string;
    club_id?: number;
    club_name?: string;
  };
  selectedTasks: ScalingTask[];
  onSelectionsChange: (tasks: ScalingTask[]) => void;
  onCreateTaskClick?: () => void; // Optional - opens task creation modal
}

export function TaskSelector({
  context,
  selectedTasks,
  onSelectionsChange,
  onCreateTaskClick
}: TaskSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ScalingTask[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Use ref to track latest selectedTasks to avoid stale closure issues
  const selectedTasksRef = useRef(selectedTasks);
  selectedTasksRef.current = selectedTasks;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search tasks
  useEffect(() => {
    const searchTasks = async () => {
      if (!showDropdown) return;

      setIsSearching(true);
      try {
        const params = new URLSearchParams();
        if (searchQuery) params.append('q', searchQuery);
        if (context.club_id) params.append('club_id', String(context.club_id));
        if (context.activity_id) params.append('activity_id', String(context.activity_id));
        if (context.city_id) params.append('city_id', String(context.city_id));
        if (context.area_id) params.append('area_id', String(context.area_id));
        params.append('limit', '15');

        const response = await fetch(`${API_BASE}/scaling-tasks/search?${params}`);
        const data = await response.json();
        if (data.success) {
          // Filter to ensure only tasks with valid numeric IDs are displayed
          const validTasks = (data.tasks || []).filter(
            (t: ScalingTask) => t.id && typeof t.id === 'number'
          );
          setSearchResults(validTasks);
        }
      } catch (err) {
        console.error('Task search failed:', err);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchTasks, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, showDropdown, context]);

  // Toggle selection
  const toggleSelection = (task: ScalingTask) => {
    // Validate task has valid ID
    if (!task.id || typeof task.id !== 'number') {
      console.error('Cannot select task with invalid ID:', task);
      return;
    }
    const isSelected = selectedTasks.some(t => t.id === task.id);
    if (isSelected) {
      onSelectionsChange(selectedTasks.filter(t => t.id !== task.id));
    } else {
      onSelectionsChange([...selectedTasks, task]);
    }
  };

  // Remove selected task
  const removeSelection = (taskId: number) => {
    onSelectionsChange(selectedTasks.filter(t => t.id !== taskId));
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      'not_started': 'bg-gray-100 text-gray-600',
      'in_progress': 'bg-blue-100 text-blue-600',
      'completed': 'bg-green-100 text-green-600',
      'cancelled': 'bg-red-100 text-red-600'
    };
    return styles[status] || styles['not_started'];
  };

  const getTeamBadge = (teamColor?: string) => {
    if (!teamColor) return null;
    const team = TEAMS[teamColor as TeamKey];
    if (!team) return null;
    return (
      <span
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: team.color.accent }}
        title={`${team.name} Team`}
      />
    );
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        <ListTodo className="inline h-4 w-4 mr-1" />
        Linked Tasks
      </label>

      {/* Selected Tasks */}
      {selectedTasks.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedTasks.map(task => (
            <div
              key={task.id}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200"
            >
              {task.team_color && getTeamBadge(task.team_color)}
              <ListTodo className="h-3 w-3" />
              <span className="max-w-[150px] truncate">{task.title || 'Unnamed Task'}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${getStatusBadge(task.status || 'not_started')}`}>
                {(task.status || 'not_started').replace('_', ' ')}
              </span>
              <button
                type="button"
                onClick={() => removeSelection(task.id)}
                className="p-0.5 hover:bg-white/50 rounded-full"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search/Add Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowDropdown(true)}
              placeholder="Search tasks to link..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {onCreateTaskClick && (
            <button
              type="button"
              onClick={onCreateTaskClick}
              className="px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1 bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              <Plus className="h-4 w-4" />
              New
            </button>
          )}
        </div>

        {/* Dropdown Results */}
        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
            {isSearching ? (
              <div className="p-4 text-center text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                Searching...
              </div>
            ) : searchResults.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                No tasks found.
                {onCreateTaskClick && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowDropdown(false);
                      onCreateTaskClick();
                    }}
                    className="block mx-auto mt-2 text-blue-600 hover:underline"
                  >
                    Create new task
                  </button>
                )}
              </div>
            ) : (
              <div className="py-1">
                {searchResults.map(task => {
                  const isSelected = selectedTasks.some(t => t.id === task.id);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => toggleSelection(task)}
                      className={`w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2
                        ${isSelected ? 'bg-blue-50' : ''}`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center
                        ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {task.team_color && getTeamBadge(task.team_color)}
                          <span className="text-sm font-medium text-gray-900 truncate">{task.title}</span>
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {[task.activity_name, task.city_name, task.area_name, task.club_name].filter(Boolean).join(' > ')}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(task.status || 'not_started')}`}>
                        {(task.status || 'not_started').replace('_', ' ')}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TaskSelector;
