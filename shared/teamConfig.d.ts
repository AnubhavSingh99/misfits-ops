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
export declare const TEAMS: Record<TeamKey, TeamConfig>;
export declare const DELHI_NCR_CITIES: string[];
export declare const GREEN_EXCLUSIVE_CITIES: string[];
export declare const TEAM_ACTIVITIES: Record<TeamKey, string[]>;
/**
 * Determine team for a club based on activity and city
 */
export declare function getTeamForClub(activityName: string, cityName: string): TeamKey;
/**
 * Find team by member name (case-insensitive, with partial matching for team lead names)
 * Handles variations like "CD's Team", "Team CD", "Saurabh's Team", etc.
 */
export declare function getTeamByMember(memberName: string): TeamKey | null;
/**
 * Get team config by key
 */
export declare function getTeamConfig(teamKey: TeamKey): TeamConfig;
/**
 * Get all team names for filters
 */
export declare const TEAM_NAMES: string[];
/**
 * Get all team keys
 */
export declare const TEAM_KEYS: TeamKey[];
/**
 * Get all team members (flattened)
 */
export declare function getAllTeamMembers(): {
    name: string;
    team: TeamKey;
    isLead: boolean;
}[];
