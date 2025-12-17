#!/bin/bash

# Comprehensive Test Suite for Misfits Operations Platform
# Tests POC allocation, filtering, and real-time data features

BASE_URL="http://localhost:5001"
echo "🧪 Starting Comprehensive System Tests..."
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to run tests
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_pattern="$3"

    echo -e "\n🔍 Testing: $test_name"
    TESTS_RUN=$((TESTS_RUN + 1))

    # Run the test command
    response=$(eval "$test_command" 2>/dev/null)
    exit_code=$?

    if [[ $exit_code -eq 0 ]] && [[ "$response" =~ $expected_pattern ]]; then
        echo -e "  ${GREEN}✅ PASS${NC}: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "  ${RED}❌ FAIL${NC}: $test_name"
        echo -e "  ${YELLOW}Expected pattern:${NC} $expected_pattern"
        echo -e "  ${YELLOW}Actual response:${NC} $response"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Test 1: Basic API Health Check
echo -e "\n📡 BASIC CONNECTIVITY TESTS"
echo "──────────────────────────────"

run_test "API Health Check" \
    "curl -s '$BASE_URL/health'" \
    '"status":"ok"'

run_test "Server Response Time" \
    "time (curl -s '$BASE_URL/health' > /dev/null)" \
    "real"

# Test 2: POC Management Tests
echo -e "\n👥 POC MANAGEMENT TESTS"
echo "─────────────────────────"

run_test "Get POC List" \
    "curl -s '$BASE_URL/api/poc/list'" \
    '"name":"Saurabh"'

run_test "POC Has Music Activity" \
    "curl -s '$BASE_URL/api/poc/list' | jq -r '.[0].activities[0]'" \
    "Music"

run_test "POC Revenue Data Present" \
    "curl -s '$BASE_URL/api/poc/list' | jq -r '.[0].revenue_actual'" \
    "16080.00"

run_test "POC Club Count Correct" \
    "curl -s '$BASE_URL/api/poc/list' | jq -r '.[0].club_count'" \
    "4"

# Test 3: Data Filtering Tests
echo -e "\n🎯 DATA FILTERING TESTS"
echo "──────────────────────────"

run_test "Get Saurabh's Meetups" \
    "curl -s '$BASE_URL/api/poc/1/meetups'" \
    '"totalMeetups":4'

run_test "All Meetups Are Music Activity" \
    "curl -s '$BASE_URL/api/poc/1/meetups' | jq '.meetups[] | select(.activity != \"Music\") | length'" \
    "^$"

run_test "Music POC Specific Endpoint" \
    "curl -s '$BASE_URL/api/poc/saurabh/music'" \
    '"poc":"Saurabh"'

run_test "Music Meetups Have Health Indicators" \
    "curl -s '$BASE_URL/api/poc/saurabh/music' | jq '.meetups[0].health_display'" \
    "🔴|🟡|🟢"

# Test 4: Health Status Tests
echo -e "\n💊 HEALTH STATUS TESTS"
echo "─────────────────────────"

run_test "Health Status Distribution" \
    "curl -s '$BASE_URL/api/poc/saurabh/music' | jq '.summary.healthy_count'" \
    "1"

run_test "Warning Meetups Count" \
    "curl -s '$BASE_URL/api/poc/saurabh/music' | jq '.summary.warning_count'" \
    "2"

run_test "Critical Meetups Count" \
    "curl -s '$BASE_URL/api/poc/saurabh/music' | jq '.summary.critical_count'" \
    "1"

run_test "Meetups Sorted by Health Priority" \
    "curl -s '$BASE_URL/api/poc/saurabh/music' | jq '.meetups[0].health_status'" \
    "RED"

# Test 5: Revenue Tracking Tests
echo -e "\n💰 REVENUE TRACKING TESTS"
echo "────────────────────────────"

run_test "Total Revenue Calculation" \
    "curl -s '$BASE_URL/api/poc/saurabh/music' | jq '.summary.total_revenue'" \
    "16080.00"

run_test "Target Revenue Present" \
    "curl -s '$BASE_URL/api/poc/saurabh/music' | jq '.summary.target_revenue'" \
    "21600.00"

run_test "Revenue Achievement Percentage" \
    "curl -s '$BASE_URL/api/poc/saurabh/music' | jq '.meetups[0].achievement_percentage'" \
    "[0-9]+\.[0-9]+"

# Test 6: Multi-City Distribution Tests
echo -e "\n🌍 MULTI-CITY DISTRIBUTION TESTS"
echo "───────────────────────────────────"

run_test "Mumbai Meetups Present" \
    "curl -s '$BASE_URL/api/poc/1/meetups?city=Mumbai' | jq '.totalMeetups'" \
    "[1-9]+"

run_test "Delhi Meetups Present" \
    "curl -s '$BASE_URL/api/poc/1/meetups?city=Delhi' | jq '.totalMeetups'" \
    "[1-9]+"

run_test "Bangalore Meetups Present" \
    "curl -s '$BASE_URL/api/poc/1/meetups?city=Bangalore' | jq '.totalMeetups'" \
    "[1-9]+"

run_test "City Filtering Works" \
    "curl -s '$BASE_URL/api/poc/1/meetups?city=Mumbai' | jq '.meetups[] | select(.city != \"Mumbai\") | length'" \
    "^$"

# Test 7: Data Isolation Tests
echo -e "\n🔒 DATA ISOLATION TESTS"
echo "──────────────────────────"

# Create a test POC for Photography
curl -s -X POST -H "Content-Type: application/json" \
    "http://localhost:5001/api/test" \
    -d '{"action": "create_test_poc", "name": "Priya", "activity": "Photography"}' > /dev/null 2>&1

run_test "POC Data Isolation" \
    "curl -s '$BASE_URL/api/poc/1/meetups' | jq '.meetups[] | select(.activity_head_name != \"Saurabh\") | length'" \
    "^$"

run_test "Activity Filtering" \
    "curl -s '$BASE_URL/api/poc/1/meetups?activity=Photography' | jq '.totalMeetups'" \
    "0"

# Test 8: Performance Tests
echo -e "\n⚡ PERFORMANCE TESTS"
echo "───────────────────────"

run_test "POC List Response Time < 2s" \
    "timeout 2s curl -s '$BASE_URL/api/poc/list' && echo 'fast'" \
    "fast"

run_test "Meetup Query Response Time < 2s" \
    "timeout 2s curl -s '$BASE_URL/api/poc/1/meetups' && echo 'fast'" \
    "fast"

# Test 9: Error Handling Tests
echo -e "\n🚨 ERROR HANDLING TESTS"
echo "──────────────────────────"

run_test "Invalid POC ID Handling" \
    "curl -s '$BASE_URL/api/poc/999/meetups' | jq '.totalMeetups'" \
    "0"

run_test "Non-existent Endpoint Returns 404" \
    "curl -s -o /dev/null -w '%{http_code}' '$BASE_URL/api/nonexistent'" \
    "404"

# Test 10: Real-time Data Structure Tests
echo -e "\n🔄 REAL-TIME DATA STRUCTURE TESTS"
echo "────────────────────────────────────"

run_test "Last Updated Timestamp Present" \
    "curl -s '$BASE_URL/api/poc/saurabh/music' | jq '.lastUpdated'" \
    "2025-12-09"

run_test "Health Last Calculated Present" \
    "curl -s '$BASE_URL/api/poc/1/meetups' | jq '.meetups[0].health_last_calculated'" \
    "2025-12-09"

run_test "Revenue Achievement Tracking" \
    "curl -s '$BASE_URL/api/poc/1/meetups' | jq '.meetups[0].revenue_achievement'" \
    "1.00"

# Test Summary
echo -e "\n📊 TEST SUMMARY"
echo "════════════════"
echo -e "Tests Run: ${YELLOW}$TESTS_RUN${NC}"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "\n🎉 ${GREEN}ALL TESTS PASSED!${NC}"
    echo -e "✨ The Music POC scenario is working perfectly!"
    echo -e "🚀 System is ready for production use!"
    exit 0
else
    echo -e "\n⚠️  ${RED}$TESTS_FAILED TESTS FAILED${NC}"
    echo -e "💡 Please check the failing tests above"
    exit 1
fi