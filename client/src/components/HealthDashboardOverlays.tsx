import React from 'react';
import { createPortal } from 'react-dom';
import { Bell, Clock, MapPin, MessageSquarePlus, Send, Sparkles, Star, X } from 'lucide-react';

export interface HealthClubComment {
  id: string;
  club_pk: number;
  club_id?: string | null;
  club_name: string;
  club_city?: string | null;
  club_area?: string | null;
  club_activity?: string | null;
  health_status?: string | null;
  author_name: string;
  comment_text: string;
  created_at: string;
}

export interface HealthDashboardClub {
  club_pk?: number;
  id: number;
  name: string;
  city: string;
  area: string;
  activity: string;
  health_status: string;
  health_score: number;
  club_created_date?: string | null;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelative(dateStr?: string | null) {
  if (!dateStr) return 'Just now';
  const created = new Date(dateStr);
  const diffMs = Date.now() - created.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

export function HealthDashboardPriorityDrawer({
  visible,
  clubs,
  onClose,
  onAddComment,
  onTogglePriority,
}: {
  visible: boolean;
  clubs: HealthDashboardClub[];
  onClose: () => void;
  onAddComment: (club: HealthDashboardClub) => void;
  onTogglePriority: (club: HealthDashboardClub) => void;
}) {
  if (!visible) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] pointer-events-none">
      <div className="absolute right-4 top-24 w-[min(360px,calc(100vw-32px))] pointer-events-auto rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Bell className="h-4 w-4 text-blue-600" />
              Priority Clubs
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              Clubs you marked for follow-up.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close priority clubs drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto p-3 space-y-2">
          {clubs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
              No clubs marked as priority yet.
            </div>
          ) : (
            clubs.map(club => (
              <div key={club.club_pk ?? club.id} className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">{club.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {club.city}
                      </span>
                      <span className="text-gray-300">•</span>
                      <span>{club.area}</span>
                      <span className="text-gray-300">•</span>
                      <span>{club.activity}</span>
                    </div>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-blue-700">
                    {formatRelative(club.club_created_date)}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="text-[11px] text-gray-500">
                    Health score <span className="font-semibold text-gray-800">{club.health_score}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onAddComment(club)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white px-3 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      Comment
                    </button>
                    <button
                      type="button"
                      onClick={() => onTogglePriority(club)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50"
                    >
                      <Star className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function HealthClubCommentModal({
  visible,
  club,
  comments,
  loading,
  saving,
  authorName,
  commentText,
  onAuthorNameChange,
  onCommentTextChange,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  club: HealthDashboardClub | null;
  comments: HealthClubComment[];
  loading: boolean;
  saving: boolean;
  authorName: string;
  commentText: string;
  onAuthorNameChange: (value: string) => void;
  onCommentTextChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  if (!visible || !club) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Sparkles className="h-5 w-5 text-blue-600" />
              Club Comments
            </div>
            <div className="mt-1 text-sm text-gray-500">
              Track progress, opinions, and follow-up notes for {club.name}.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close club comments"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-0 md:grid-cols-[1.2fr_0.8fr]">
          <div className="border-b border-gray-100 px-5 py-4 md:border-b-0 md:border-r">
            <div className="text-sm font-semibold text-gray-900">{club.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {club.city}
              </span>
              <span className="text-gray-300">•</span>
              <span>{club.area}</span>
              <span className="text-gray-300">•</span>
              <span>{club.activity}</span>
            </div>

            <div className="mt-4 rounded-2xl border border-gray-200">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Comments</div>
                  <div className="text-[11px] text-gray-500">Recent notes from the ops team</div>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700">
                  <Clock className="h-3.5 w-3.5" />
                  {comments.length}
                </div>
              </div>

              <div className="max-h-[320px] overflow-y-auto p-3 space-y-2">
                {loading ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                    Loading comments...
                  </div>
                ) : comments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                    No comments yet.
                  </div>
                ) : (
                  comments.map(comment => (
                    <div key={comment.id} className="rounded-xl border border-gray-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold text-gray-900">{comment.author_name}</div>
                        <div className="text-[11px] text-gray-500">{formatDate(comment.created_at)}</div>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{comment.comment_text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="px-5 py-4">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/30 p-4">
              <div className="text-sm font-semibold text-gray-900">Add a comment</div>
              <div className="mt-1 text-xs text-gray-500">
                Capture progress, blockers, or your opinion.
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Your name</label>
                  <input
                    value={authorName}
                    onChange={(e) => onAuthorNameChange(e.target.value)}
                    placeholder="Ops member name"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Comment</label>
                  <textarea
                    value={commentText}
                    onChange={(e) => onCommentTextChange(e.target.value)}
                    rows={8}
                    placeholder="Add progress updates, decisions, or your opinion about this club..."
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={saving || !commentText.trim() || !authorName.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save comment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
