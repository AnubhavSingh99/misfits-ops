// Week-over-Week Tracking with Comments
// Based on PRD v8.1 Section 7.3 - WoW tracking system

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  Clock,
  Target,
  Edit3,
  Save,
  X
} from 'lucide-react';
import { WoWTracking, Meetup, Stage, FilterOptions } from '../types/core';
import { api } from '../services/api';
import { POCFilter } from '../components/POCFilter';

interface WoWTrackingProps {}

export function WoWTrackingPage({}: WoWTrackingProps) {
  const [wowData, setWowData] = useState<WoWTracking[]>([]);
  const [meetups, setMeetups] = useState<Meetup[]>([]);
  const [filters, setFilters] = useState<FilterOptions>({});
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeekNumber());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [commentForm, setCommentForm] = useState({
    comment: '',
    actionTaken: '',
    blocker: '',
    nextSteps: ''
  });

  useEffect(() => {
    loadWoWData();
  }, [filters, selectedWeek, selectedYear]);

  const loadWoWData = async () => {
    setLoading(true);
    try {
      const wowProgress = await api.wow.getWeeklyProgress(selectedWeek, selectedYear, filters);
      setWowData(wowProgress);

      // Load corresponding meetups for context
      const meetupData = await api.meetups.getAll(filters);
      setMeetups(meetupData.meetups);
    } catch (error) {
      console.error('Failed to load WoW data:', error);
      // Fallback to mock data when API is not available
      setWowData([
        {
          id: 'wow-1',
          meetup_id: 'meetup-1',
          week_number: selectedWeek,
          year: selectedYear,
          current_stage: 'stage_2',
          previous_stage: 'stage_1',
          stage_changed: true,
          revenue_this_week: 15000,
          revenue_last_week: 12000,
          revenue_change: 3000,
          revenue_change_percent: 25.0,
          health_this_week: 'green',
          health_last_week: 'yellow',
          health_changed: true,
          comment: 'Great progress this week! Attendance improved significantly.',
          action_taken: 'Improved venue booking and communication.',
          blocker: '',
          next_steps: 'Continue with consistent scheduling'
        },
        {
          id: 'wow-2',
          meetup_id: 'meetup-2',
          week_number: selectedWeek,
          year: selectedYear,
          current_stage: 'stage_1',
          previous_stage: 'stage_1',
          stage_changed: false,
          revenue_this_week: 8000,
          revenue_last_week: 10000,
          revenue_change: -2000,
          revenue_change_percent: -20.0,
          health_this_week: 'yellow',
          health_last_week: 'green',
          health_changed: true,
          comment: 'Attendance dropped due to weather.',
          action_taken: 'Rescheduled and communicated with participants.',
          blocker: 'Weather dependency for outdoor activities',
          next_steps: 'Consider backup indoor venue'
        }
      ]);

      setMeetups([
        {
          id: 'meetup-1',
          name: 'South Delhi Hikers',
          activity: 'Hiking',
          city: 'Delhi',
          area: 'South Delhi',
          stage: 'stage_2',
          health: 'green',
          revenue: 15000,
          poc_name: 'Rahul Kumar',
          created_at: '2024-01-15',
          updated_at: '2024-02-10'
        },
        {
          id: 'meetup-2',
          name: 'Gurgaon Runners',
          activity: 'Running',
          city: 'Gurgaon',
          area: 'Sector 29',
          stage: 'stage_1',
          health: 'yellow',
          revenue: 8000,
          poc_name: 'Priya Sharma',
          created_at: '2024-01-20',
          updated_at: '2024-02-08'
        }
      ] as Meetup[]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilters: FilterOptions) => {
    setFilters(newFilters);
  };

  const handleCommentSubmit = async (meetupId: string) => {
    try {
      await api.wow.addComment(
        meetupId,
        commentForm.comment,
        commentForm.actionTaken,
        commentForm.blocker,
        commentForm.nextSteps
      );

      // Reset form and refresh data
      setCommentForm({
        comment: '',
        actionTaken: '',
        blocker: '',
        nextSteps: ''
      });
      setEditingComment(null);
      await loadWoWData();

    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  const handleEditComment = (wowEntry: WoWTracking) => {
    setEditingComment(wowEntry.id);
    setCommentForm({
      comment: wowEntry.comment,
      actionTaken: wowEntry.action_taken || '',
      blocker: wowEntry.blocker || '',
      nextSteps: wowEntry.next_steps || ''
    });
  };

  const getStageProgressIcon = (current: Stage, previous: Stage) => {
    const stages: Stage[] = ['not_picked', 'stage_1', 'stage_2', 'stage_3', 'realised'];
    const currentIndex = stages.indexOf(current);
    const previousIndex = stages.indexOf(previous);

    if (currentIndex > previousIndex) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (currentIndex < previousIndex) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  const getRevenueChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (change < 0) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  const getHealthChangeIcon = (current: string, previous: string) => {
    const healthValues = { red: 0, yellow: 1, green: 2 };
    const currentValue = healthValues[current as keyof typeof healthValues];
    const previousValue = healthValues[previous as keyof typeof healthValues];

    if (currentValue > previousValue) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (currentValue < previousValue) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
    return `₹${amount}`;
  };

  const getStageColor = (stage: Stage) => {
    switch (stage) {
      case 'not_picked': return 'bg-gray-100 text-gray-800';
      case 'stage_1': return 'bg-blue-100 text-blue-800';
      case 'stage_2': return 'bg-purple-100 text-purple-800';
      case 'stage_3': return 'bg-orange-100 text-orange-800';
      case 'realised': return 'bg-green-100 text-green-800';
    }
  };

  function getCurrentWeekNumber() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 7));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-gray-600 text-lg font-medium">Loading WoW tracking data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6 space-y-8">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <Calendar className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold mb-2">Week-over-Week Tracking</h1>
              <p className="text-indigo-100 text-lg">
                Track progress and add comments for accountability
              </p>
            </div>
          </div>

          {/* Week Selector */}
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm border border-white/20">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Week</label>
                <input
                  type="number"
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
                  min="1"
                  max="53"
                  className="px-3 py-1 rounded bg-white/20 border border-white/30 text-white placeholder-white/70 w-20"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Year</label>
                <input
                  type="number"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  min="2024"
                  max="2030"
                  className="px-3 py-1 rounded bg-white/20 border border-white/30 text-white placeholder-white/70 w-24"
                />
              </div>
              <div className="text-sm text-indigo-200">
                Week {selectedWeek}, {selectedYear}
              </div>
            </div>
          </div>
        </div>

        {/* POC Filter */}
        <div className="flex justify-center">
          <POCFilter onFilterChange={handleFilterChange} currentFilters={filters} />
        </div>

        {/* WoW Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <Target className="h-6 w-6 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Stage Progressions</h3>
            </div>
            <div className="text-3xl font-bold text-blue-600">
              {wowData.filter(item => item.stage_changed).length}
            </div>
            <div className="text-sm text-gray-500">This week</div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="h-6 w-6 text-green-600" />
              <h3 className="font-semibold text-gray-900">Revenue Positive</h3>
            </div>
            <div className="text-3xl font-bold text-green-600">
              {wowData.filter(item => item.revenue_change > 0).length}
            </div>
            <div className="text-sm text-gray-500">Growing meetups</div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <MessageSquare className="h-6 w-6 text-purple-600" />
              <h3 className="font-semibold text-gray-900">Comments Added</h3>
            </div>
            <div className="text-3xl font-bold text-purple-600">
              {wowData.filter(item => item.comment).length}
            </div>
            <div className="text-sm text-gray-500">With updates</div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-red-600" />
              <h3 className="font-semibold text-gray-900">Blockers</h3>
            </div>
            <div className="text-3xl font-bold text-red-600">
              {wowData.filter(item => item.blocker && item.blocker.trim()).length}
            </div>
            <div className="text-sm text-gray-500">Need attention</div>
          </div>
        </div>

        {/* WoW Tracking Table */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Weekly Progress Details</h2>
            <p className="text-gray-600">Track stage changes, revenue movement, and add comments for accountability</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Meetup
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stage Change
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Revenue Change
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Health Change
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Comments & Actions
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {wowData.map((item, index) => {
                  const meetup = meetups.find(m => m.id === item.meetup_id);
                  const isEditing = editingComment === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      {/* Meetup Info */}
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">
                          {meetup?.name || `Meetup ${item.meetup_id}`}
                        </div>
                        <div className="text-sm text-gray-500">
                          Week {item.week_number}, {item.year}
                        </div>
                      </td>

                      {/* Stage Change */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {getStageProgressIcon(item.current_stage, item.previous_stage)}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 rounded-md text-xs font-medium ${getStageColor(item.previous_stage)}`}>
                                {item.previous_stage.replace('_', ' ')}
                              </span>
                              <span className="text-gray-400">→</span>
                              <span className={`px-2 py-1 rounded-md text-xs font-medium ${getStageColor(item.current_stage)}`}>
                                {item.current_stage.replace('_', ' ')}
                              </span>
                            </div>
                            {item.stage_changed && (
                              <div className="text-xs text-green-600 font-medium mt-1">
                                ✓ Progressed
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Revenue Change */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {getRevenueChangeIcon(item.revenue_change)}
                          <div>
                            <div className="font-medium">
                              {formatCurrency(item.revenue_this_week)}
                            </div>
                            <div className={`text-xs ${
                              item.revenue_change > 0 ? 'text-green-600' :
                              item.revenue_change < 0 ? 'text-red-600' : 'text-gray-500'
                            }`}>
                              {item.revenue_change > 0 ? '+' : ''}{formatCurrency(item.revenue_change)}
                              {item.revenue_change_percent !== 0 && (
                                <span className="ml-1">
                                  ({item.revenue_change_percent > 0 ? '+' : ''}{item.revenue_change_percent.toFixed(1)}%)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Health Change */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {getHealthChangeIcon(item.health_this_week, item.health_last_week)}
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="text-lg">
                                {item.health_last_week === 'green' ? '🟢' :
                                 item.health_last_week === 'yellow' ? '🟡' : '🔴'}
                              </span>
                              <span className="text-gray-400">→</span>
                              <span className="text-lg">
                                {item.health_this_week === 'green' ? '🟢' :
                                 item.health_this_week === 'yellow' ? '🟡' : '🔴'}
                              </span>
                            </div>
                            {item.health_changed && (
                              <div className="text-xs font-medium mt-1">
                                Health changed
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Comments */}
                      <td className="px-6 py-4 max-w-md">
                        {isEditing ? (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Comment</label>
                              <textarea
                                value={commentForm.comment}
                                onChange={(e) => setCommentForm({ ...commentForm, comment: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                rows={2}
                                placeholder="What happened this week?"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Action Taken</label>
                              <input
                                type="text"
                                value={commentForm.actionTaken}
                                onChange={(e) => setCommentForm({ ...commentForm, actionTaken: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                placeholder="What was done?"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Blocker</label>
                              <input
                                type="text"
                                value={commentForm.blocker}
                                onChange={(e) => setCommentForm({ ...commentForm, blocker: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                placeholder="What's preventing progress?"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Next Steps</label>
                              <input
                                type="text"
                                value={commentForm.nextSteps}
                                onChange={(e) => setCommentForm({ ...commentForm, nextSteps: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                placeholder="What's planned next?"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {item.comment && (
                              <div className="text-sm text-gray-900">
                                <span className="font-medium">Comment:</span> {item.comment}
                              </div>
                            )}
                            {item.action_taken && (
                              <div className="text-sm text-blue-600">
                                <span className="font-medium">Action:</span> {item.action_taken}
                              </div>
                            )}
                            {item.blocker && (
                              <div className="text-sm text-red-600">
                                <span className="font-medium">Blocker:</span> {item.blocker}
                              </div>
                            )}
                            {item.next_steps && (
                              <div className="text-sm text-green-600">
                                <span className="font-medium">Next:</span> {item.next_steps}
                              </div>
                            )}
                            {!item.comment && !item.action_taken && !item.blocker && (
                              <div className="text-sm text-gray-400 italic">No comments yet</div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleCommentSubmit(item.meetup_id)}
                              className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                            >
                              <Save className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingComment(null);
                                setCommentForm({ comment: '', actionTaken: '', blocker: '', nextSteps: '' });
                              }}
                              className="p-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleEditComment(item)}
                            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {wowData.length === 0 && (
            <div className="p-12 text-center">
              <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-600 mb-2">No WoW data available</h3>
              <p className="text-gray-500">
                No progress tracked for week {selectedWeek}, {selectedYear}
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}