// =====================================================
// HARDCODED TEAM CONFIGURATION
// Single source of truth for team assignments
// =====================================================
// Team definitions
export const TEAMS = {
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
// TEAM-ACTIVITY-CITY ASSIGNMENTS
// =====================================================
// Delhi NCR cities
export const DELHI_NCR_CITIES = [
    'Gurgaon', 'Noida', 'Faridabad', 'Ghaziabad',
    'North Delhi', 'South Delhi', 'West Delhi', 'East Delhi'
];
// Green team owns ALL activities in these cities
export const GREEN_EXCLUSIVE_CITIES = ['Jaipur', 'Bangalore'];
// Activity assignments for Delhi NCR
export const TEAM_ACTIVITIES = {
    blue: ['Board Gaming', 'Football', 'Social Deduction', 'Quiz'],
    yellow: ['Badminton', 'Art', 'Journaling', 'Box Cricket'],
    green: [] // Green handles all OTHER activities not listed above (in Delhi NCR)
};
// =====================================================
// HELPER FUNCTIONS
// =====================================================
/**
 * Determine team for a club based on activity and city
 */
export function getTeamForClub(activityName, cityName) {
    // Green owns all activities in Jaipur and Bangalore
    if (GREEN_EXCLUSIVE_CITIES.includes(cityName)) {
        return 'green';
    }
    // For Delhi NCR cities, check activity assignment
    if (TEAM_ACTIVITIES.blue.includes(activityName))
        return 'blue';
    if (TEAM_ACTIVITIES.yellow.includes(activityName))
        return 'yellow';
    // Default: Green handles remaining activities
    return 'green';
}
/**
 * Find team by member name (case-insensitive, with partial matching for team lead names)
 * Handles variations like "CD's Team", "Team CD", "Saurabh's Team", etc.
 */
export function getTeamByMember(memberName) {
    if (!memberName)
        return null;
    const lowerName = memberName.toLowerCase().trim();
    // First try exact match on member names
    for (const [teamKey, team] of Object.entries(TEAMS)) {
        if (team.members.some(m => m.toLowerCase() === lowerName)) {
            return teamKey;
        }
    }
    // Try partial match - check if any team lead's name is contained in the string
    // This handles cases like "CD's Team", "Team Saurabh", "Shashwat's Team", etc.
    for (const [teamKey, team] of Object.entries(TEAMS)) {
        const leadLower = team.lead.toLowerCase();
        if (lowerName.includes(leadLower) || leadLower.includes(lowerName)) {
            return teamKey;
        }
    }
    return null;
}
/**
 * Get team config by key
 */
export function getTeamConfig(teamKey) {
    return TEAMS[teamKey];
}
/**
 * Get all team names for filters
 */
export const TEAM_NAMES = Object.values(TEAMS).map(t => t.name);
/**
 * Get all team keys
 */
export const TEAM_KEYS = ['blue', 'green', 'yellow'];
/**
 * Get all team members (flattened)
 */
export function getAllTeamMembers() {
    const members = [];
    for (const [teamKey, team] of Object.entries(TEAMS)) {
        for (const member of team.members) {
            members.push({
                name: member,
                team: teamKey,
                isLead: member === team.lead
            });
        }
    }
    return members;
}
