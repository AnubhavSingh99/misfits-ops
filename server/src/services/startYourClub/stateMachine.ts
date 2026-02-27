import type { ClubApplicationStatus, ScreeningRatings, RejectionReason } from '../../../../shared/types';

// Valid transitions: from_status -> [to_statuses]
const TRANSITIONS: Record<string, ClubApplicationStatus[]> = {
  LANDED: ['STORY_VIEWED', 'FORM_IN_PROGRESS'],
  STORY_VIEWED: ['NOT_INTERESTED', 'FORM_IN_PROGRESS'],
  FORM_IN_PROGRESS: ['NOT_INTERESTED', 'FORM_ABANDONED', 'FORM_SUBMITTED'],
  FORM_ABANDONED: ['FORM_IN_PROGRESS'],
  NOT_INTERESTED: ['FORM_IN_PROGRESS'],
  FORM_SUBMITTED: ['UNDER_REVIEW', 'INTERVIEW_PENDING', 'REJECTED', 'ON_HOLD'],
  UNDER_REVIEW: ['INTERVIEW_PENDING', 'REJECTED', 'ON_HOLD'],
  ON_HOLD: ['INTERVIEW_PENDING', 'REJECTED'],
  INTERVIEW_PENDING: ['INTERVIEW_SCHEDULED'],
  INTERVIEW_SCHEDULED: ['INTERVIEW_DONE'],
  INTERVIEW_DONE: ['SELECTED', 'REJECTED'],
  SELECTED: ['CLUB_CREATED'],
  // Terminal statuses — no transitions out
  CLUB_CREATED: [],
  REJECTED: [],
};

const TERMINAL_STATUSES: ClubApplicationStatus[] = ['CLUB_CREATED', 'REJECTED'];

// Statuses that require screening_ratings for any admin action
const SCREENING_RATING_REQUIRED_FROM: ClubApplicationStatus[] = ['FORM_SUBMITTED', 'UNDER_REVIEW', 'ON_HOLD'];

interface TransitionRequest {
  from: ClubApplicationStatus;
  to: ClubApplicationStatus;
  actor: 'applicant' | 'admin' | 'system';
  ratings?: ScreeningRatings;
  interviewRatings?: ScreeningRatings;
  rejectionReason?: RejectionReason;
  rejectionNote?: string;
}

interface TransitionResult {
  valid: boolean;
  error?: string;
}

function validateRatings(ratings: ScreeningRatings | undefined, label: string): TransitionResult | null {
  if (!ratings || Object.keys(ratings).length === 0) {
    return { valid: false, error: `${label} are required` };
  }
  for (const [dim, val] of Object.entries(ratings)) {
    if (typeof val !== 'number' || val < 1 || val > 5) {
      return { valid: false, error: `Rating for ${dim} must be between 1 and 5` };
    }
  }
  return null; // valid
}

export function validateTransition(req: TransitionRequest): TransitionResult {
  const { from, to, actor, ratings, interviewRatings, rejectionReason } = req;

  // Admin blanket reject: any non-terminal status -> REJECTED
  if (to === 'REJECTED' && actor === 'admin') {
    if (TERMINAL_STATUSES.includes(from)) {
      return { valid: false, error: `Cannot reject from terminal status ${from}` };
    }
    if (!rejectionReason) {
      return { valid: false, error: 'Rejection reason is required' };
    }
    // If rejecting from review states, require screening ratings
    if (SCREENING_RATING_REQUIRED_FROM.includes(from)) {
      const ratingError = validateRatings(ratings, 'Screening ratings');
      if (ratingError) return ratingError;
    }
    // If rejecting from INTERVIEW_DONE, require interview ratings
    if (from === 'INTERVIEW_DONE') {
      const ratingError = validateRatings(interviewRatings, 'Interview ratings');
      if (ratingError) return ratingError;
    }
    return { valid: true };
  }

  // Check if transition is allowed
  const allowed = TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    return { valid: false, error: `Transition from ${from} to ${to} is not allowed` };
  }

  // Guard: UNDER_REVIEW/ON_HOLD → any action requires screening ratings
  if (SCREENING_RATING_REQUIRED_FROM.includes(from) && actor === 'admin') {
    const ratingError = validateRatings(ratings, 'Screening ratings');
    if (ratingError) return ratingError;
  }

  // Guard: INTERVIEW_DONE → SELECTED requires interview ratings
  if (from === 'INTERVIEW_DONE' && to === 'SELECTED') {
    const ratingError = validateRatings(interviewRatings, 'Interview ratings');
    if (ratingError) return ratingError;
  }

  // Guard: Any -> REJECTED requires reason
  if (to === 'REJECTED' && !rejectionReason) {
    return { valid: false, error: 'Rejection reason is required' };
  }

  return { valid: true };
}

export function isTerminal(status: ClubApplicationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function getAllowedTransitions(status: ClubApplicationStatus): ClubApplicationStatus[] {
  return TRANSITIONS[status] || [];
}
