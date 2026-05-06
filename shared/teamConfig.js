"use strict";
// =====================================================
// HARDCODED TEAM CONFIGURATION
// Single source of truth for team assignments
// =====================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEAM_KEYS = exports.TEAM_NAMES = exports.GREEN_EXCLUSIVE_CITIES = exports.DELHI_NCR_CITIES = exports.TEAM_ACTIVITIES = exports.TEAMS = void 0;
exports.getTeamForClub = getTeamForClub;
exports.getTeamByMember = getTeamByMember;
exports.getTeamConfig = getTeamConfig;
exports.getAllTeamMembers = getAllTeamMembers;
// Team definitions
exports.TEAMS = {
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
exports.TEAM_ACTIVITIES = {
    blue: ['Board Gaming', 'Mafia', 'Quiz'],
    yellow: ['Badminton', 'Art', 'Journaling', 'Box Cricket', 'Football'],
    green: [] // Green handles all OTHER activities not listed above
};
// Legacy constants (kept for backward compatibility, but no longer used in logic)
exports.DELHI_NCR_CITIES = [
    'Gurgaon', 'Noida', 'Faridabad', 'Ghaziabad',
    'North Delhi', 'South Delhi', 'West Delhi', 'East Delhi'
];
exports.GREEN_EXCLUSIVE_CITIES = []; // No longer city-exclusive
// =====================================================
// HELPER FUNCTIONS
// =====================================================
/**
 * Determine team for a club based on activity (platform-wide)
 * City is no longer used for team assignment - all cities follow the same activity-based logic
 */
function getTeamForClub(activityName, _cityName) {
    // Activity-based assignment applies platform-wide
    if (exports.TEAM_ACTIVITIES.blue.includes(activityName))
        return 'blue';
    if (exports.TEAM_ACTIVITIES.yellow.includes(activityName))
        return 'yellow';
    // Default: Green handles all other activities
    return 'green';
}
/**
 * Find team by member name (case-insensitive, with partial matching for team lead names)
 * Handles variations like "CD's Team", "Team CD", "Saurabh's Team", etc.
 */
function getTeamByMember(memberName) {
    if (!memberName)
        return null;
    const lowerName = memberName.toLowerCase().trim();
    // First try exact match on member names
    for (const [teamKey, team] of Object.entries(exports.TEAMS)) {
        if (team.members.some(m => m.toLowerCase() === lowerName)) {
            return teamKey;
        }
    }
    // Try partial match - check if any team lead's name is contained in the string
    // This handles cases like "CD's Team", "Team Saurabh", "Shashwat's Team", etc.
    for (const [teamKey, team] of Object.entries(exports.TEAMS)) {
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
function getTeamConfig(teamKey) {
    return exports.TEAMS[teamKey];
}
/**
 * Get all team names for filters
 */
exports.TEAM_NAMES = Object.values(exports.TEAMS).map(t => t.name);
/**
 * Get all team keys
 */
exports.TEAM_KEYS = ['blue', 'green', 'yellow'];
/**
 * Get all team members (flattened)
 */
function getAllTeamMembers() {
    const members = [];
    for (const [teamKey, team] of Object.entries(exports.TEAMS)) {
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
//# sourceMappingURL=teamConfig.js.map
