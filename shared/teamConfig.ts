// =====================================================
// HARDCODED TEAM CONFIGURATION
// Single source of truth for team assignments
// =====================================================

export interface TeamConfig {
  name: string;
  lead: string;
  members: string[];
  color: {
    bg: string;
    border: string;
    text: string;
    accent: string;
  };
}

export type TeamKey = 'blue' | 'green' | 'yellow';

// Team definitions
export const TEAMS: Record<TeamKey, TeamConfig> = {
  blue: {
    name: 'Blue',
    lead: 'Shashwat',
    members: ['Shashwat', 'New person 1', 'Kar'],
    color: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-700',
      accent: '#3B82F6'
    }
  },
  green: {
    name: 'Green',
    lead: 'Saurabh',
    members: ['Saurabh', 'Riya', 'Tanya'],
    color: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-700',
      accent: '#22C55E'
    }
  },
  yellow: {
    name: 'Yellow',
    lead: 'CD',
    members: ['CD', 'Kriti'],
    color: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-700',
      accent: '#EAB308'
    }
  }
};

// =====================================================
// TEAM-ACTIVITY ASSIGNMENTS (PLATFORM-WIDE)
// =====================================================

// Activity assignments apply to ALL cities platform-wide
// Teams are assigned by activity type, not by geography
export const TEAM_ACTIVITIES: Record<TeamKey, string[]> = {
  blue: ['Board Gaming', 'Football', 'Social Deduction', 'Quiz'],
  yellow: ['Badminton', 'Art', 'Journaling', 'Box Cricket'],
  green: [] // Green handles all OTHER activities not listed above
};

// Legacy constants (kept for backward compatibility, but no longer used in logic)
export const DELHI_NCR_CITIES = [
  'Gurgaon', 'Noida', 'Faridabad', 'Ghaziabad',
  'North Delhi', 'South Delhi', 'West Delhi', 'East Delhi'
];
export const GREEN_EXCLUSIVE_CITIES: string[] = []; // No longer city-exclusive

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Determine team for a club based on activity (platform-wide)
 * City is no longer used for team assignment - all cities follow the same activity-based logic
 */
export function getTeamForClub(activityName: string, _cityName?: string): TeamKey {
  // Activity-based assignment applies platform-wide
  if (TEAM_ACTIVITIES.blue.includes(activityName)) return 'blue';
  if (TEAM_ACTIVITIES.yellow.includes(activityName)) return 'yellow';

  // Default: Green handles all other activities
  return 'green';
}

/**
 * Find team by member name (case-insensitive, with partial matching for team lead names)
 * Handles variations like "CD's Team", "Team CD", "Saurabh's Team", etc.
 */
export function getTeamByMember(memberName: string): TeamKey | null {
  if (!memberName) return null;
  const lowerName = memberName.toLowerCase().trim();

  // First try exact match on member names
  for (const [teamKey, team] of Object.entries(TEAMS)) {
    if (team.members.some(m => m.toLowerCase() === lowerName)) {
      return teamKey as TeamKey;
    }
  }

  // Try partial match - check if any team lead's name is contained in the string
  // This handles cases like "CD's Team", "Team Saurabh", "Shashwat's Team", etc.
  for (const [teamKey, team] of Object.entries(TEAMS)) {
    const leadLower = team.lead.toLowerCase();
    if (lowerName.includes(leadLower) || leadLower.includes(lowerName)) {
      return teamKey as TeamKey;
    }
  }

  return null;
}

/**
 * Get team config by key
 */
export function getTeamConfig(teamKey: TeamKey): TeamConfig {
  return TEAMS[teamKey];
}

/**
 * Get all team names for filters
 */
export const TEAM_NAMES = Object.values(TEAMS).map(t => t.name);

/**
 * Get all team keys
 */
export const TEAM_KEYS: TeamKey[] = ['blue', 'green', 'yellow'];

/**
 * Get all team members (flattened)
 */
export function getAllTeamMembers(): { name: string; team: TeamKey; isLead: boolean }[] {
  const members: { name: string; team: TeamKey; isLead: boolean }[] = [];
  for (const [teamKey, team] of Object.entries(TEAMS)) {
    for (const member of team.members) {
      members.push({
        name: member,
        team: teamKey as TeamKey,
        isLead: member === team.lead
      });
    }
  }
  return members;
}
