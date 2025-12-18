// API Configuration for different environments
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:5001';

export { API_URL, WS_URL };