"use strict";
// Shared types for the Misfits Operations Platform
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAY_TYPE_TO_DOW = exports.CAPACITY_BUCKET_OPTIONS = exports.TIME_OF_DAY_OPTIONS = void 0;
// Time of day options configuration
exports.TIME_OF_DAY_OPTIONS = [
    { value: 'early_morning', label: 'Early Morning', time: '5-8 AM', icon: '🌅' },
    { value: 'morning', label: 'Morning', time: '8 AM-12 PM', icon: '☀️' },
    { value: 'afternoon', label: 'Afternoon', time: '12-4 PM', icon: '🌤️' },
    { value: 'evening', label: 'Evening', time: '4-8 PM', icon: '🌆' },
    { value: 'night', label: 'Night', time: '8 PM-12 AM', icon: '🌙' },
    { value: 'all_nighter', label: 'All-Nighter', time: '12-5 AM', icon: '🌃' }
];
exports.CAPACITY_BUCKET_OPTIONS = ['<10', '10-20', '20-30', '30-50', '50-100', '100-200', '200-500', '>500'];
// =====================================================
// AUTO-MATCHING TYPES (Meetup to Target Matching)
// =====================================================
// Day type to day-of-week mapping
exports.DAY_TYPE_TO_DOW = {
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
//# sourceMappingURL=types.js.map