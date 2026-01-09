// Shared types for the Misfits Operations Platform
// =====================================================
// AUTO-MATCHING TYPES (Meetup to Target Matching)
// =====================================================
// Day type to day-of-week mapping
export const DAY_TYPE_TO_DOW = {
    1: [1, 2, 3, 4, 5], // weekday (Mon-Fri)
    2: [0, 6], // weekend (Sun, Sat)
    3: [1], // monday
    4: [2], // tuesday
    5: [3], // wednesday
    6: [4], // thursday
    7: [5], // friday
    8: [6], // saturday
    9: [0], // sunday
};
