export interface MeetupDefault {
    city: string;
    area: string;
    activity: string;
    meetup_cost: number;
    meetup_capacity: number;
}
export interface MeetupDefaultsResponse {
    meetup_cost: number | null;
    meetup_capacity: number | null;
    source: 'exact' | 'city_avg' | 'activity_avg' | 'not_found';
    source_detail?: string;
}
export declare const ACTIVITY_NAME_MAP: Record<string, string>;
export declare const ACTIVITY_NAME_REVERSE: Record<string, string>;
export declare const MEETUP_DEFAULTS: MeetupDefault[];
/**
 * Get meetup defaults with fallback logic:
 * 1. Try exact match (activity + city + area)
 * 2. Fallback to city average (all areas in city for this activity)
 * 3. Fallback to activity average (all cities for this activity)
 * 4. Return null if activity not found
 */
export declare function getMeetupDefaults(activity: string, city: string, area?: string): MeetupDefaultsResponse;
/**
 * Calculate target revenue from meetups, cost, and capacity
 */
export declare function calculateTargetRevenue(targetMeetups: number, meetupCost: number, meetupCapacity: number): number;
//# sourceMappingURL=meetupDefaults.d.ts.map