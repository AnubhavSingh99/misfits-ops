"use strict";
// Meetup Defaults - Hardcoded from meetup master.csv
// Used for pre-filling meetup_cost and meetup_capacity in target modals
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEETUP_DEFAULTS = exports.ACTIVITY_NAME_REVERSE = exports.ACTIVITY_NAME_MAP = void 0;
exports.getMeetupDefaults = getMeetupDefaults;
exports.calculateTargetRevenue = calculateTargetRevenue;
// Activity name mapping: CSV format -> Display format
exports.ACTIVITY_NAME_MAP = {
    'ART': 'Art',
    'BADMINTON': 'Badminton',
    'BASKETBALL': 'Basketball',
    'MUSIC': 'Music',
    'BOARDGAMING': 'Board Gaming',
    'BOOK_CLUB': 'Book Club',
    'BOWLING': 'Bowling',
    'HIKING': 'Hiking',
    'SOCIAL_DEDUCTIONS': 'Social Deduction',
    'YOGA': 'Yoga',
    'JOURNALING': 'Journaling',
    'QUIZ': 'Quiz',
    'PICKLEBALL': 'Pickleball',
    'DANCE': 'Dance',
    'BOX_CRICKET': 'Box Cricket',
    'COMMUNITY_SPACE': 'Community Space',
    'CONTENT_CREATION': 'Content Creation',
    'DRAMA': 'Drama',
    'FILMS': 'Films',
    'FOOTBALL': 'Football',
    'MINDFULNESS': 'Mindfulness',
    'RUNNING': 'Running',
};
// Reverse mapping for lookup
exports.ACTIVITY_NAME_REVERSE = Object.fromEntries(Object.entries(exports.ACTIVITY_NAME_MAP).map(([k, v]) => [v.toLowerCase(), k]));
// All 159 rows from meetup master.csv
exports.MEETUP_DEFAULTS = [
    // Gurgaon - GCR Extn.
    { city: 'Gurgaon', area: 'GCR Extn.', activity: 'ART', meetup_cost: 250, meetup_capacity: 18 },
    { city: 'Gurgaon', area: 'GCR Extn.', activity: 'BADMINTON', meetup_cost: 177, meetup_capacity: 9 },
    { city: 'Gurgaon', area: 'GCR Extn.', activity: 'BASKETBALL', meetup_cost: 142, meetup_capacity: 10 },
    { city: 'Gurgaon', area: 'GCR Extn.', activity: 'MUSIC', meetup_cost: 200, meetup_capacity: 30 },
    { city: 'Gurgaon', area: 'GCR Extn.', activity: 'BOARDGAMING', meetup_cost: 150, meetup_capacity: 26 },
    { city: 'Gurgaon', area: 'GCR Extn.', activity: 'BOOK_CLUB', meetup_cost: 200, meetup_capacity: 6 },
    { city: 'Gurgaon', area: 'GCR Extn.', activity: 'BOWLING', meetup_cost: 350, meetup_capacity: 11 },
    { city: 'Gurgaon', area: 'GCR Extn.', activity: 'HIKING', meetup_cost: 300, meetup_capacity: 30 },
    { city: 'Gurgaon', area: 'GCR Extn.', activity: 'SOCIAL_DEDUCTIONS', meetup_cost: 200, meetup_capacity: 42 },
    { city: 'Gurgaon', area: 'GCR Extn.', activity: 'YOGA', meetup_cost: 378, meetup_capacity: 7 },
    { city: 'Gurgaon', area: 'GCR Extn.', activity: 'JOURNALING', meetup_cost: 300, meetup_capacity: 10 },
    { city: 'Gurgaon', area: 'GCR Extn.', activity: 'QUIZ', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'Gurgaon', area: 'GCR Extn.', activity: 'PICKLEBALL', meetup_cost: 350, meetup_capacity: 10 },
    // Gurgaon - Golf Course Road
    { city: 'Gurgaon', area: 'Golf Course Road', activity: 'BOARDGAMING', meetup_cost: 122, meetup_capacity: 27 },
    { city: 'Gurgaon', area: 'Golf Course Road', activity: 'BOOK_CLUB', meetup_cost: 223, meetup_capacity: 11 },
    { city: 'Gurgaon', area: 'Golf Course Road', activity: 'BOWLING', meetup_cost: 377, meetup_capacity: 11 },
    { city: 'Gurgaon', area: 'Golf Course Road', activity: 'HIKING', meetup_cost: 334, meetup_capacity: 30 },
    { city: 'Gurgaon', area: 'Golf Course Road', activity: 'MUSIC', meetup_cost: 185, meetup_capacity: 25 },
    { city: 'Gurgaon', area: 'Golf Course Road', activity: 'PICKLEBALL', meetup_cost: 400, meetup_capacity: 5 },
    { city: 'Gurgaon', area: 'Golf Course Road', activity: 'ART', meetup_cost: 350, meetup_capacity: 15 },
    { city: 'Gurgaon', area: 'Golf Course Road', activity: 'QUIZ', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'Gurgaon', area: 'Golf Course Road', activity: 'SOCIAL_DEDUCTIONS', meetup_cost: 200, meetup_capacity: 20 },
    { city: 'Gurgaon', area: 'Golf Course Road', activity: 'JOURNALING', meetup_cost: 300, meetup_capacity: 10 },
    // Gurgaon - MG Road
    { city: 'Gurgaon', area: 'MG Road', activity: 'ART', meetup_cost: 352, meetup_capacity: 14 },
    { city: 'Gurgaon', area: 'MG Road', activity: 'BADMINTON', meetup_cost: 192, meetup_capacity: 8 },
    { city: 'Gurgaon', area: 'MG Road', activity: 'BOARDGAMING', meetup_cost: 215, meetup_capacity: 31 },
    { city: 'Gurgaon', area: 'MG Road', activity: 'HIKING', meetup_cost: 300, meetup_capacity: 45 },
    { city: 'Gurgaon', area: 'MG Road', activity: 'DANCE', meetup_cost: 353, meetup_capacity: 23 },
    { city: 'Gurgaon', area: 'MG Road', activity: 'QUIZ', meetup_cost: 150, meetup_capacity: 21 },
    { city: 'Gurgaon', area: 'MG Road', activity: 'SOCIAL_DEDUCTIONS', meetup_cost: 132, meetup_capacity: 20 },
    { city: 'Gurgaon', area: 'MG Road', activity: 'MUSIC', meetup_cost: 185, meetup_capacity: 25 },
    { city: 'Gurgaon', area: 'MG Road', activity: 'JOURNALING', meetup_cost: 300, meetup_capacity: 10 },
    { city: 'Gurgaon', area: 'MG Road', activity: 'PICKLEBALL', meetup_cost: 350, meetup_capacity: 10 },
    // Gurgaon - South City
    { city: 'Gurgaon', area: 'South City', activity: 'ART', meetup_cost: 316, meetup_capacity: 17 },
    { city: 'Gurgaon', area: 'South City', activity: 'BADMINTON', meetup_cost: 209, meetup_capacity: 8 },
    { city: 'Gurgaon', area: 'South City', activity: 'BASKETBALL', meetup_cost: 135, meetup_capacity: 9 },
    { city: 'Gurgaon', area: 'South City', activity: 'BOARDGAMING', meetup_cost: 170, meetup_capacity: 37 },
    { city: 'Gurgaon', area: 'South City', activity: 'BOOK_CLUB', meetup_cost: 200, meetup_capacity: 7 },
    { city: 'Gurgaon', area: 'South City', activity: 'BOX_CRICKET', meetup_cost: 420, meetup_capacity: 12 },
    { city: 'Gurgaon', area: 'South City', activity: 'COMMUNITY_SPACE', meetup_cost: 174, meetup_capacity: 4 },
    { city: 'Gurgaon', area: 'South City', activity: 'CONTENT_CREATION', meetup_cost: 100, meetup_capacity: 10 },
    { city: 'Gurgaon', area: 'South City', activity: 'DANCE', meetup_cost: 426, meetup_capacity: 10 },
    { city: 'Gurgaon', area: 'South City', activity: 'DRAMA', meetup_cost: 372, meetup_capacity: 8 },
    { city: 'Gurgaon', area: 'South City', activity: 'FILMS', meetup_cost: 200, meetup_capacity: 9 },
    { city: 'Gurgaon', area: 'South City', activity: 'FOOTBALL', meetup_cost: 256, meetup_capacity: 11 },
    { city: 'Gurgaon', area: 'South City', activity: 'JOURNALING', meetup_cost: 318, meetup_capacity: 9 },
    { city: 'Gurgaon', area: 'South City', activity: 'MINDFULNESS', meetup_cost: 369, meetup_capacity: 7 },
    { city: 'Gurgaon', area: 'South City', activity: 'MUSIC', meetup_cost: 227, meetup_capacity: 27 },
    { city: 'Gurgaon', area: 'South City', activity: 'QUIZ', meetup_cost: 150, meetup_capacity: 35 },
    { city: 'Gurgaon', area: 'South City', activity: 'RUNNING', meetup_cost: 54, meetup_capacity: 16 },
    { city: 'Gurgaon', area: 'South City', activity: 'SOCIAL_DEDUCTIONS', meetup_cost: 200, meetup_capacity: 32 },
    // Noida - Sector 104
    { city: 'Noida', area: 'Sector 104', activity: 'ART', meetup_cost: 450, meetup_capacity: 10 },
    { city: 'Noida', area: 'Sector 104', activity: 'BADMINTON', meetup_cost: 244, meetup_capacity: 10 },
    { city: 'Noida', area: 'Sector 104', activity: 'BOARDGAMING', meetup_cost: 249, meetup_capacity: 18 },
    { city: 'Noida', area: 'Sector 104', activity: 'BOOK_CLUB', meetup_cost: 200, meetup_capacity: 7 },
    { city: 'Noida', area: 'Sector 104', activity: 'DRAMA', meetup_cost: 183, meetup_capacity: 10 },
    { city: 'Noida', area: 'Sector 104', activity: 'JOURNALING', meetup_cost: 400, meetup_capacity: 8 },
    { city: 'Noida', area: 'Sector 104', activity: 'MUSIC', meetup_cost: 214, meetup_capacity: 20 },
    { city: 'Noida', area: 'Sector 104', activity: 'SOCIAL_DEDUCTIONS', meetup_cost: 249, meetup_capacity: 16 },
    { city: 'Noida', area: 'Sector 104', activity: 'PICKLEBALL', meetup_cost: 350, meetup_capacity: 10 },
    // Noida - Sector 62
    { city: 'Noida', area: 'Sector 62', activity: 'BADMINTON', meetup_cost: 199, meetup_capacity: 9 },
    { city: 'Noida', area: 'Sector 62', activity: 'FOOTBALL', meetup_cost: 191, meetup_capacity: 10 },
    { city: 'Noida', area: 'Sector 62', activity: 'MUSIC', meetup_cost: 209, meetup_capacity: 30 },
    { city: 'Noida', area: 'Sector 62', activity: 'QUIZ', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'Noida', area: 'Sector 62', activity: 'SOCIAL_DEDUCTIONS', meetup_cost: 249, meetup_capacity: 16 },
    { city: 'Noida', area: 'Sector 62', activity: 'PICKLEBALL', meetup_cost: 350, meetup_capacity: 10 },
    { city: 'Noida', area: 'Sector 62', activity: 'BOX_CRICKET', meetup_cost: 420, meetup_capacity: 12 },
    { city: 'Noida', area: 'Sector 62', activity: 'JOURNALING', meetup_cost: 400, meetup_capacity: 8 },
    { city: 'Noida', area: 'Sector 62', activity: 'ART', meetup_cost: 450, meetup_capacity: 10 },
    // North Delhi - Pitampura
    { city: 'North Delhi', area: 'Pitampura', activity: 'BADMINTON', meetup_cost: 156, meetup_capacity: 8 },
    { city: 'North Delhi', area: 'Pitampura', activity: 'BOOK_CLUB', meetup_cost: 100, meetup_capacity: 11 },
    { city: 'North Delhi', area: 'Pitampura', activity: 'PICKLEBALL', meetup_cost: 300, meetup_capacity: 11 },
    { city: 'North Delhi', area: 'Pitampura', activity: 'BOARDGAMING', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'North Delhi', area: 'Pitampura', activity: 'MUSIC', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'North Delhi', area: 'Pitampura', activity: 'SOCIAL_DEDUCTIONS', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'North Delhi', area: 'Pitampura', activity: 'ART', meetup_cost: 350, meetup_capacity: 10 },
    { city: 'North Delhi', area: 'Pitampura', activity: 'QUIZ', meetup_cost: 150, meetup_capacity: 15 },
    // South Delhi - Greater Kailash
    { city: 'South Delhi', area: 'Greater Kailash', activity: 'ART', meetup_cost: 399, meetup_capacity: 3 },
    { city: 'South Delhi', area: 'Greater Kailash', activity: 'BOOK_CLUB', meetup_cost: 222, meetup_capacity: 7 },
    { city: 'South Delhi', area: 'Greater Kailash', activity: 'BOX_CRICKET', meetup_cost: 390, meetup_capacity: 17 },
    { city: 'South Delhi', area: 'Greater Kailash', activity: 'HIKING', meetup_cost: 423, meetup_capacity: 20 },
    { city: 'South Delhi', area: 'Greater Kailash', activity: 'RUNNING', meetup_cost: 0, meetup_capacity: 10 },
    { city: 'South Delhi', area: 'Greater Kailash', activity: 'BOARDGAMING', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'South Delhi', area: 'Greater Kailash', activity: 'SOCIAL_DEDUCTIONS', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'South Delhi', area: 'Greater Kailash', activity: 'JOURNALING', meetup_cost: 400, meetup_capacity: 8 },
    { city: 'South Delhi', area: 'Greater Kailash', activity: 'QUIZ', meetup_cost: 150, meetup_capacity: 15 },
    { city: 'South Delhi', area: 'Greater Kailash', activity: 'MUSIC', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'South Delhi', area: 'Greater Kailash', activity: 'BADMINTON', meetup_cost: 200, meetup_capacity: 8 },
    // South Delhi - Malviya Nagar
    { city: 'South Delhi', area: 'Malviya Nagar', activity: 'BADMINTON', meetup_cost: 200, meetup_capacity: 8 },
    { city: 'South Delhi', area: 'Malviya Nagar', activity: 'BOARDGAMING', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'South Delhi', area: 'Malviya Nagar', activity: 'MUSIC', meetup_cost: 181, meetup_capacity: 30 },
    { city: 'South Delhi', area: 'Malviya Nagar', activity: 'PICKLEBALL', meetup_cost: 247, meetup_capacity: 3 },
    { city: 'South Delhi', area: 'Malviya Nagar', activity: 'YOGA', meetup_cost: 154, meetup_capacity: 4 },
    { city: 'South Delhi', area: 'Malviya Nagar', activity: 'QUIZ', meetup_cost: 150, meetup_capacity: 15 },
    { city: 'South Delhi', area: 'Malviya Nagar', activity: 'SOCIAL_DEDUCTIONS', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'South Delhi', area: 'Malviya Nagar', activity: 'JOURNALING', meetup_cost: 400, meetup_capacity: 8 },
    // South Delhi - Vasant Kunj
    { city: 'South Delhi', area: 'Vasant Kunj', activity: 'BOX_CRICKET', meetup_cost: 353, meetup_capacity: 12 },
    { city: 'South Delhi', area: 'Vasant Kunj', activity: 'ART', meetup_cost: 350, meetup_capacity: 10 },
    { city: 'South Delhi', area: 'Vasant Kunj', activity: 'PICKLEBALL', meetup_cost: 300, meetup_capacity: 8 },
    { city: 'South Delhi', area: 'Vasant Kunj', activity: 'BADMINTON', meetup_cost: 200, meetup_capacity: 8 },
    { city: 'South Delhi', area: 'Vasant Kunj', activity: 'BOARDGAMING', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'South Delhi', area: 'Vasant Kunj', activity: 'SOCIAL_DEDUCTIONS', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'South Delhi', area: 'Vasant Kunj', activity: 'JOURNALING', meetup_cost: 400, meetup_capacity: 10 },
    { city: 'South Delhi', area: 'Vasant Kunj', activity: 'MUSIC', meetup_cost: 200, meetup_capacity: 20 },
    { city: 'South Delhi', area: 'Vasant Kunj', activity: 'QUIZ', meetup_cost: 150, meetup_capacity: 15 },
    // West Delhi - Dwarka
    { city: 'West Delhi', area: 'Dwarka', activity: 'ART', meetup_cost: 350, meetup_capacity: 5 },
    { city: 'West Delhi', area: 'Dwarka', activity: 'BOX_CRICKET', meetup_cost: 270, meetup_capacity: 12 },
    { city: 'West Delhi', area: 'Dwarka', activity: 'MUSIC', meetup_cost: 188, meetup_capacity: 20 },
    { city: 'West Delhi', area: 'Dwarka', activity: 'PICKLEBALL', meetup_cost: 209, meetup_capacity: 14 },
    { city: 'West Delhi', area: 'Dwarka', activity: 'SOCIAL_DEDUCTIONS', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'West Delhi', area: 'Dwarka', activity: 'QUIZ', meetup_cost: 150, meetup_capacity: 15 },
    { city: 'West Delhi', area: 'Dwarka', activity: 'JOURNALING', meetup_cost: 400, meetup_capacity: 10 },
    { city: 'West Delhi', area: 'Dwarka', activity: 'BOARDGAMING', meetup_cost: 150, meetup_capacity: 20 },
    // West Delhi - Punjabi Bagh
    { city: 'West Delhi', area: 'Punjabi Bagh', activity: 'BOARDGAMING', meetup_cost: 158, meetup_capacity: 10 },
    { city: 'West Delhi', area: 'Punjabi Bagh', activity: 'ART', meetup_cost: 350, meetup_capacity: 5 },
    { city: 'West Delhi', area: 'Punjabi Bagh', activity: 'BOX_CRICKET', meetup_cost: 270, meetup_capacity: 14 },
    { city: 'West Delhi', area: 'Punjabi Bagh', activity: 'MUSIC', meetup_cost: 188, meetup_capacity: 8 },
    { city: 'West Delhi', area: 'Punjabi Bagh', activity: 'PICKLEBALL', meetup_cost: 209, meetup_capacity: 8 },
    { city: 'West Delhi', area: 'Punjabi Bagh', activity: 'SOCIAL_DEDUCTIONS', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'West Delhi', area: 'Punjabi Bagh', activity: 'QUIZ', meetup_cost: 150, meetup_capacity: 15 },
    { city: 'West Delhi', area: 'Punjabi Bagh', activity: 'JOURNALING', meetup_cost: 400, meetup_capacity: 10 },
    // West Delhi - Punjabi Bagh, Dwarka (combined area for Badminton)
    { city: 'West Delhi', area: 'Punjabi Bagh, Dwarka', activity: 'BADMINTON', meetup_cost: 160, meetup_capacity: 8 },
    // West Delhi - Vikaspuri
    { city: 'West Delhi', area: 'Vikaspuri', activity: 'ART', meetup_cost: 332, meetup_capacity: 7 },
    { city: 'West Delhi', area: 'Vikaspuri', activity: 'BOOK_CLUB', meetup_cost: 111, meetup_capacity: 5 },
    { city: 'West Delhi', area: 'Vikaspuri', activity: 'JOURNALING', meetup_cost: 317, meetup_capacity: 11 },
    { city: 'West Delhi', area: 'Vikaspuri', activity: 'SOCIAL_DEDUCTIONS', meetup_cost: 200, meetup_capacity: 13 },
    { city: 'West Delhi', area: 'Vikaspuri', activity: 'BOARDGAMING', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'West Delhi', area: 'Vikaspuri', activity: 'MUSIC', meetup_cost: 200, meetup_capacity: 20 },
    { city: 'West Delhi', area: 'Vikaspuri', activity: 'PICKLEBALL', meetup_cost: 209, meetup_capacity: 8 },
    // West Delhi - Janakpuri
    { city: 'West Delhi', area: 'Janakpuri', activity: 'BADMINTON', meetup_cost: 160, meetup_capacity: 8 },
    // Noida - Greater Noida
    { city: 'Noida', area: 'Greater Noida', activity: 'BADMINTON', meetup_cost: 160, meetup_capacity: 8 },
    { city: 'Noida', area: 'Greater Noida', activity: 'FOOTBALL', meetup_cost: 250, meetup_capacity: 10 },
    { city: 'Noida', area: 'Greater Noida', activity: 'ART', meetup_cost: 350, meetup_capacity: 8 },
    { city: 'Noida', area: 'Greater Noida', activity: 'BOX_CRICKET', meetup_cost: 400, meetup_capacity: 14 },
    { city: 'Noida', area: 'Greater Noida', activity: 'MUSIC', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'Noida', area: 'Greater Noida', activity: 'PICKLEBALL', meetup_cost: 300, meetup_capacity: 8 },
    { city: 'Noida', area: 'Greater Noida', activity: 'SOCIAL_DEDUCTIONS', meetup_cost: 200, meetup_capacity: 20 },
    { city: 'Noida', area: 'Greater Noida', activity: 'QUIZ', meetup_cost: 200, meetup_capacity: 20 },
    { city: 'Noida', area: 'Greater Noida', activity: 'JOURNALING', meetup_cost: 200, meetup_capacity: 10 },
    { city: 'Noida', area: 'Greater Noida', activity: 'BOARDGAMING', meetup_cost: 200, meetup_capacity: 20 },
    // Ghaziabad - Indirapuram
    { city: 'Ghaziabad', area: 'Indirapuram', activity: 'BADMINTON', meetup_cost: 160, meetup_capacity: 8 },
    { city: 'Ghaziabad', area: 'Indirapuram', activity: 'ART', meetup_cost: 350, meetup_capacity: 8 },
    { city: 'Ghaziabad', area: 'Indirapuram', activity: 'MUSIC', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'Ghaziabad', area: 'Indirapuram', activity: 'PICKLEBALL', meetup_cost: 300, meetup_capacity: 8 },
    { city: 'Ghaziabad', area: 'Indirapuram', activity: 'SOCIAL_DEDUCTIONS', meetup_cost: 200, meetup_capacity: 20 },
    { city: 'Ghaziabad', area: 'Indirapuram', activity: 'QUIZ', meetup_cost: 200, meetup_capacity: 20 },
    { city: 'Ghaziabad', area: 'Indirapuram', activity: 'JOURNALING', meetup_cost: 200, meetup_capacity: 10 },
    { city: 'Ghaziabad', area: 'Indirapuram', activity: 'BOARDGAMING', meetup_cost: 200, meetup_capacity: 20 },
    // Faridabad - Sector 28
    { city: 'Faridabad', area: 'Sector 28', activity: 'BADMINTON', meetup_cost: 160, meetup_capacity: 8 },
    { city: 'Faridabad', area: 'Sector 28', activity: 'ART', meetup_cost: 350, meetup_capacity: 8 },
    { city: 'Faridabad', area: 'Sector 28', activity: 'MUSIC', meetup_cost: 150, meetup_capacity: 20 },
    { city: 'Faridabad', area: 'Sector 28', activity: 'PICKLEBALL', meetup_cost: 300, meetup_capacity: 8 },
    { city: 'Faridabad', area: 'Sector 28', activity: 'SOCIAL_DEDUCTIONS', meetup_cost: 200, meetup_capacity: 20 },
    { city: 'Faridabad', area: 'Sector 28', activity: 'QUIZ', meetup_cost: 200, meetup_capacity: 20 },
    { city: 'Faridabad', area: 'Sector 28', activity: 'JOURNALING', meetup_cost: 200, meetup_capacity: 10 },
    { city: 'Faridabad', area: 'Sector 28', activity: 'BOARDGAMING', meetup_cost: 200, meetup_capacity: 20 },
];
/**
 * Normalize activity name for matching
 * Handles variations like "Board Gaming" -> "BOARDGAMING", "Badminton" -> "BADMINTON"
 */
function normalizeActivity(activity) {
    const normalized = activity.toUpperCase().replace(/\s+/g, '_').replace(/-/g, '_');
    // Handle common variations
    if (normalized === 'BOARD_GAMING')
        return 'BOARDGAMING';
    if (normalized === 'SOCIAL_DEDUCTION')
        return 'SOCIAL_DEDUCTIONS';
    return normalized;
}
/**
 * Normalize city name for matching
 */
function normalizeCity(city) {
    return city.trim();
}
/**
 * Normalize area name for matching
 */
function normalizeArea(area) {
    return area.trim();
}
/**
 * Calculate average of numbers, ignoring nulls/undefined
 */
function average(numbers) {
    if (numbers.length === 0)
        return 0;
    const sum = numbers.reduce((a, b) => a + b, 0);
    return Math.round(sum / numbers.length);
}
/**
 * Get meetup defaults with fallback logic:
 * 1. Try exact match (activity + city + area)
 * 2. Fallback to city average (all areas in city for this activity)
 * 3. Fallback to activity average (all cities for this activity)
 * 4. Return null if activity not found
 */
function getMeetupDefaults(activity, city, area) {
    const normalizedActivity = normalizeActivity(activity);
    const normalizedCity = normalizeCity(city);
    const normalizedArea = area ? normalizeArea(area) : undefined;
    // 1. Try exact match (activity + city + area)
    if (normalizedArea) {
        const exactMatch = exports.MEETUP_DEFAULTS.find(d => d.activity === normalizedActivity &&
            d.city.toLowerCase() === normalizedCity.toLowerCase() &&
            d.area.toLowerCase() === normalizedArea.toLowerCase());
        if (exactMatch) {
            return {
                meetup_cost: exactMatch.meetup_cost,
                meetup_capacity: exactMatch.meetup_capacity,
                source: 'exact',
                source_detail: `${exactMatch.city}, ${exactMatch.area}`
            };
        }
    }
    // 2. Fallback to city average (all areas in city for this activity)
    const cityMatches = exports.MEETUP_DEFAULTS.filter(d => d.activity === normalizedActivity &&
        d.city.toLowerCase() === normalizedCity.toLowerCase());
    if (cityMatches.length > 0) {
        return {
            meetup_cost: average(cityMatches.map(d => d.meetup_cost)),
            meetup_capacity: average(cityMatches.map(d => d.meetup_capacity)),
            source: 'city_avg',
            source_detail: `${normalizedCity} average (${cityMatches.length} areas)`
        };
    }
    // 3. Fallback to activity average (all cities for this activity)
    const activityMatches = exports.MEETUP_DEFAULTS.filter(d => d.activity === normalizedActivity);
    if (activityMatches.length > 0) {
        return {
            meetup_cost: average(activityMatches.map(d => d.meetup_cost)),
            meetup_capacity: average(activityMatches.map(d => d.meetup_capacity)),
            source: 'activity_avg',
            source_detail: `${exports.ACTIVITY_NAME_MAP[normalizedActivity] || activity} average (${activityMatches.length} locations)`
        };
    }
    // 4. Activity not found
    return {
        meetup_cost: null,
        meetup_capacity: null,
        source: 'not_found',
        source_detail: `No defaults for ${activity}`
    };
}
/**
 * Calculate target revenue from meetups, cost, and capacity
 */
function calculateTargetRevenue(targetMeetups, meetupCost, meetupCapacity) {
    return Math.round(targetMeetups * meetupCost * meetupCapacity);
}
//# sourceMappingURL=meetupDefaults.js.map