# Start Your Club (SYC) — Comprehensive Test Cases

**Version:** 1.0
**Date:** 2026-03-02
**Total Test Cases:** 163
**Covers:** Frontend UI, Backend API, Admin Dashboard, Status Machine, Analytics, Calendly, Flutter WebView

---

## How to Use This Document

Each test case has:
- **ID**: Unique identifier (e.g., TC-EXIT-01)
- **Scenario**: What to test
- **Preconditions**: Setup required before testing
- **Steps**: Exact steps to execute
- **Expected Result**: What should happen
- **Pass/Fail**: Mark during testing

**Status Legend:**
- ACTIVE = User is filling out the form
- ABANDONED = User clicked "Will come back later" (exit_type=interested)
- NOT_INTERESTED = User clicked "Yes, I want to exit" or "Not sure, I'd like to join" (exit_type=not_interested)
- SUBMITTED = User completed and submitted the application
- UNDER_REVIEW = Admin opened the application for review
- ON_HOLD = Admin put application on hold
- INTERVIEW_PENDING = Admin selected for interview (Calendly link sent)
- INTERVIEW_SCHEDULED = Calendly webhook confirmed booking
- INTERVIEW_DONE = Admin marked interview as completed
- SELECTED = Admin selected the applicant
- CLUB_CREATED = All milestones completed (auto-transition from SELECTED)
- REJECTED = Admin rejected at any stage

**Current Flow:** Loading -> Story (3 slides + decision) -> Login -> OTP -> Name -> City/Activity -> Questionnaire -> Submit -> Progress

---

# SECTION A: New User — Complete Happy Path

## TC-FLOW-01: Full new user journey (link source)

**Preconditions:** Fresh browser, no localStorage, opened via direct link (not app)

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `/start-your-club` | Loading screen appears (Misfits logo animation) |
| 2 | Wait ~2s | Loading completes, Story screen slide 0 appears |
| 3 | Observe slide 0 | Pill fades in (400ms), then heading (1000ms), then subtext (1700ms), then tap hint (2500ms) |
| 4 | Tap before heading appears (<1s) | Nothing happens (soft-gate blocks) |
| 5 | Tap after heading appears (>1s) | Advances to slide 1 |
| 6 | Tap through slide 1 (after gate) | Advances to slide 2 |
| 7 | Tap through slide 2 (after gate) | Advances to Decision screen (slide 3) |
| 8 | Decision screen shows two buttons | "Yes, I want to lead a club" and "Not sure, I'd like to join a club" visible |
| 9 | Tap "Yes, I want to lead" | Login screen appears |
| 10 | Enter valid phone number | OTP sent, OTP screen appears |
| 11 | Enter correct OTP | Verification succeeds |
| 12 | If user has no name | Name Capture screen appears |
| 13 | Enter name "Test User" | Name saved to localStorage, proceeds |
| 14 | City/Activity screen appears | City dropdown and activity list visible |
| 15 | Select city and activity | Questionnaire screen appears |
| 16 | Answer all required questions | Submit button becomes enabled |
| 17 | Tap Submit | Application submitted, Progress screen appears |
| 18 | Progress screen | Shows "Application submitted" with status badge |

**Backend verification:**
- `club_applications` row created with `status=SUBMITTED`, `source=link`, `submitted_at` set
- `club_application_events` has transitions: (none)->ACTIVE, ACTIVE->SUBMITTED
- `analytics_events` has: page_landed, form_submitted

---

## TC-FLOW-02: Full new user journey (app source)

**Preconditions:** Opened from Flutter app via WebView (`?source=app`)

| Step | Action | Expected Result |
|------|--------|----------------|
| 1-17 | Same as TC-FLOW-01 | Same results |
| 18 | Check DB | `source=app` in club_applications |
| 19 | Back button on Progress | FlutterBridge.postMessage("close") called (closes WebView) |

---

## TC-FLOW-03: New user — skip story

**Preconditions:** Fresh browser, no localStorage

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `/start-your-club`, wait for Story | Story screen appears |
| 2 | Tap X (close) button on Story | Exit modal appears |
| 3 | Tap "Skip to application form" | Modal closes, Login screen appears |
| 4 | Complete login + OTP + name | City/Activity screen appears |
| 5 | Check DB | `story_viewed` may be true (set by handleSkipStory) |

---

## TC-FLOW-04: New user — "Not sure, I'd like to join"

**Preconditions:** Fresh browser, no localStorage, unauthorized

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `/start-your-club`, go through Story | Decision screen appears |
| 2 | Tap "Not sure, I'd like to join a club" | Redirects to misfits.net.in (link source) or FlutterBridge closes (app source) |
| 3 | Check DB | No application created (user was unauthorized) |

---

# SECTION B: Exit Modal — All 4 Buttons x Auth States

## Unauthorized User (no token, no application)

### TC-EM-01: Continue — unauthorized

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Story screen -> tap X | Exit modal appears |
| 2 | Tap "Continue" | Modal closes, returns to Story screen |
| 3 | Check | No API call made, no DB changes |

### TC-EM-02: Skip to application form — unauthorized

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Story screen -> tap X | Exit modal appears |
| 2 | Tap "Skip to application form" | Modal closes, goes to Login screen |
| 3 | Check | `storyViewed=true` set in state, no API call |

### TC-EM-03: Will come back later — unauthorized

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Story screen -> tap X | Exit modal appears |
| 2 | Tap "Will come back later" | Modal closes |
| 3 | Check landing | Redirects to `misfits.net.in` (link) or FlutterBridge close (app) |
| 4 | Check | No API call made, no DB changes |

### TC-EM-04: Yes, I want to exit — unauthorized

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Story screen -> tap X | Exit modal appears |
| 2 | Tap "Yes, I want to exit" | Modal closes |
| 3 | Check landing | Redirects to `misfits.net.in` (link) or FlutterBridge close (app) |
| 4 | Check | No API call made, no DB changes |

## Authorized User (has token + active application)

### TC-EM-05: Continue — authorized

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | On Questionnaire screen -> tap X | Exit modal appears |
| 2 | Tap "Continue" | Modal closes, returns to Questionnaire (exact question preserved) |
| 3 | Check | No API call made, no DB changes |

### TC-EM-06: Skip to application form — authorized

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Story screen (after WelcomeBack -> Start New) -> tap X | Exit modal appears |
| 2 | Tap "Skip to application form" | Goes to Login screen (NOTE: Bug #3 — should skip Login for authenticated users) |
| 3 | Check | No API call made |

### TC-EM-07: Will come back later — authorized, from Story

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Story screen (authenticated) -> tap X | Exit modal appears |
| 2 | Tap "Will come back later" | Modal closes |
| 3 | Check API | `POST /exit` called with `type=interested`, `tracking={last_screen: "story", last_story_slide: N}` |
| 4 | Check DB | `status=ABANDONED`, `exit_type=interested`, `abandoned_at=NOW()`, `last_screen=story`, `reminder_state` initialized |
| 5 | Check landing | FlutterBridge close or `window.history.back()` |

### TC-EM-08: Will come back later — authorized, from Questionnaire Q5

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Questionnaire Q5 of 12 -> tap X | Exit modal appears |
| 2 | Tap "Will come back later" | Modal closes |
| 3 | Check API | `POST /exit` with `type=interested`, tracking includes `last_question_index=5`, `last_question_section`, `total_questions=12` |
| 4 | Check DB | `status=ABANDONED`, `exit_type=interested`, `last_screen=questionnaire`, `last_question_index=5`, `abandoned_at=NOW()`, `reminder_state` initialized |

### TC-EM-09: Yes, I want to exit — authorized, from Story

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Story screen (authenticated) -> tap X | Exit modal appears |
| 2 | Tap "Yes, I want to exit" | Modal closes |
| 3 | Check API | `POST /exit` with `type=not_interested`, tracking data sent |
| 4 | Check DB | `status=NOT_INTERESTED`, `exit_type=not_interested`, `last_screen=story`. NO `abandoned_at`, NO `reminder_state` |
| 5 | Check landing | FlutterBridge close or `window.history.back()` |

### TC-EM-10: Yes, I want to exit — authorized, from Questionnaire

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Questionnaire Q5 of 12 -> tap X | Exit modal appears |
| 2 | Tap "Yes, I want to exit" | Modal closes |
| 3 | Check DB | `status=NOT_INTERESTED`, `last_screen=questionnaire`, `last_question_index=5`, `last_question_section`, `total_questions=12`. NO `abandoned_at`, NO `reminder_state` |

### TC-EM-11: Yes, I want to exit — authorized, API fails

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Disconnect network, then "Yes, I want to exit" | Modal closes |
| 2 | Check | Error caught silently, user still redirected |
| 3 | Check DB | No changes (app stays in previous status) |

### TC-EM-12: Tap overlay (outside modal) — Bug #1 Fix

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Exit modal is open | Modal visible with overlay |
| 2 | Tap the dark overlay area (outside the modal card) | **Nothing happens** — modal stays open |
| 3 | Must use one of the 4 buttons to dismiss | Buttons work normally |

---

# SECTION C: Silent Exit (beforeunload)

### TC-SILENT-01: Close tab during Story (authorized)

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Authenticated user on Story screen | Application exists in DB |
| 2 | Close browser tab (Cmd+W) | `beforeunload` fires |
| 3 | Check | keepalive `fetch` sends `PATCH /exit` with `{exit_type: "silent", last_screen: "story", last_story_slide: N}` |
| 4 | Check DB | Backend processes silent exit (status update, NO reminder_state for silent) |

### TC-SILENT-02: Close tab during Questionnaire (authorized)

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Authenticated user on Questionnaire Q7 | Application exists |
| 2 | Close tab | `beforeunload` fires |
| 3 | Check payload | `{exit_type: "silent", last_screen: "questionnaire", last_question_index: 7, last_question_section: "...", total_questions: N}` |

### TC-SILENT-03: Close tab on Progress screen (authorized)

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Authenticated user on Progress screen | Application SUBMITTED |
| 2 | Close tab | `beforeunload` fires but **skips** API call (Progress is excluded) |
| 3 | Check | No exit API call made |

### TC-SILENT-04: Close tab after explicit exit (no double-fire)

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | User clicks "Yes, I want to exit" | `hasExited.current = true` |
| 2 | Page unloads (redirect) | `beforeunload` fires but `hasExited.current` is true → skips |
| 3 | Check | Only ONE exit API call made (not two) |

### TC-SILENT-05: Close tab — unauthorized

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | No token in localStorage | User on Story screen |
| 2 | Close tab | `beforeunload` checks `loadUser()` → null → skips |
| 3 | Check | No API call made |

---

# SECTION D: Story Navigation & Soft-Gate

### TC-STORY-01: Full stagger reveal sequence

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Land on Story slide 0 | Screen is blank/dark initially |
| 2 | Wait 400ms | Pill fades in ("Imagine this" or similar) |
| 3 | Wait 1000ms | Bold heading appears (fade in + slide up) |
| 4 | Wait 1700ms | Subtext appears (fade in + slide up, lighter color) |
| 5 | Wait 2500ms | "Tap anywhere to continue" hint appears + shake animation |

### TC-STORY-02: Soft-gate blocks tap before heading

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Slide 0 appears | Pill visible but heading not yet |
| 2 | Tap at 500ms (before heading) | Nothing happens — `canTap=false` |
| 3 | Wait until 1000ms+ | Heading appears, `canTap=true` |
| 4 | Tap | Advances to slide 1 |

### TC-STORY-03: Soft-gate resets on new slide

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Advance from slide 0 to slide 1 | `canTap` resets to `false` |
| 2 | Immediately tap | Nothing happens |
| 3 | Wait 1000ms for heading | `canTap=true`, tap works |

### TC-STORY-04: Minimum time through all 3 story slides

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Tap as soon as enabled each slide | 3 slides x ~1s gate = ~3 seconds minimum |
| 2 | All 3 headings were visible | User saw the hook text for each slide |

### TC-STORY-05: Back button on slide 0

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | On slide 0, tap back (<) | `onClose()` fires → exit modal appears |

### TC-STORY-06: Back button on slide 1

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | On slide 1, tap back (<) | Goes to slide 0 |

### TC-STORY-07: Back button on slide 2

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | On slide 2, tap back (<) | Goes to slide 1 |

### TC-STORY-08: Back from Decision screen

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | On Decision screen (slide 3), tap back (<) | Goes to slide 2 |

### TC-STORY-09: Back from slide 2 after returning from Decision (Bug #2 fix)

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Go to Decision screen (slide 3) | Decision visible |
| 2 | Tap back | Goes to slide 2 |
| 3 | Tap back again | **Goes to slide 1** (NOT exit modal) |

### TC-STORY-10: X (close) button during soft-gate

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | During soft-gate (heading not yet visible) | X button in header |
| 2 | Tap X | Exit modal appears (X is NOT gated) |

### TC-STORY-11: Back button during soft-gate

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | During soft-gate on slide 1 | Back button visible |
| 2 | Tap back | Goes to slide 0 (back is NOT gated) |

---

# SECTION E: Returning User Flows

### TC-RETURN-01: Returning user — ACTIVE with city+activity

**Preconditions:** User has token in localStorage, app status=ACTIVE, city and activity saved

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `/start-your-club` | Loading screen |
| 2 | Loading completes | `checkExistingUser` called with stored token |
| 3 | API returns ACTIVE app with city+activity | Goes directly to Questionnaire (skips Story, Login, CityActivity) |
| 4 | Previous answers prefilled | Questionnaire data from `application.questionnaire_data` |

### TC-RETURN-02: Returning user — ACTIVE without city/activity

**Preconditions:** User has token, app status=ACTIVE, no city/activity saved

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `/start-your-club` | Loading -> CityActivity screen |

### TC-RETURN-03: Returning user — ABANDONED (interested)

**Preconditions:** User previously exited with "Will come back later"

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `/start-your-club` | Loading screen |
| 2 | `checkExistingUser` returns ABANDONED app | Resumes: city+activity exists → Questionnaire, else → CityActivity |
| 3 | Check DB on resume | Backend transitions ABANDONED → ACTIVE when questionnaire endpoint called |

### TC-RETURN-04: Returning user — NOT_INTERESTED

**Preconditions:** User previously exited with "Yes, I want to exit"

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `/start-your-club` | Loading screen |
| 2 | `checkExistingUser` returns NOT_INTERESTED app | Resumes: city+activity exists → Questionnaire, else → CityActivity |
| 3 | Check DB | NOT_INTERESTED → ACTIVE on resume |

### TC-RETURN-05: Returning user — SUBMITTED

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `/start-your-club` | Loading -> Progress screen |
| 2 | Progress shows | "Application submitted" status, timeline |

### TC-RETURN-06: Returning user — UNDER_REVIEW / INTERVIEW_PENDING / INTERVIEW_SCHEDULED / SELECTED

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `/start-your-club` | Loading -> Progress screen (all non-terminal, non-journey statuses) |

### TC-RETURN-07: Returning user — REJECTED

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `/start-your-club` | Loading -> WelcomeBack screen |
| 2 | WelcomeBack shows | Past application listed, "Start New" button available |

### TC-RETURN-08: Returning user — CLUB_CREATED

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `/start-your-club` | Loading -> WelcomeBack screen |
| 2 | WelcomeBack shows | Past application listed as completed |

### TC-RETURN-09: Returning user — expired token (401)

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `/start-your-club` with expired JWT in localStorage | Loading screen |
| 2 | `checkExistingUser` gets 401 | localStorage cleared, user set to null |
| 3 | Redirect | Story screen (fresh start) |

### TC-RETURN-10: WelcomeBack — Start New

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | On WelcomeBack screen, tap "Start New" | All state resets: application=null, storyViewed=false, city="", activity="" |
| 2 | Screen | Story screen (starts fresh journey) |

---

# SECTION F: Back Button Navigation (All Screens)

### TC-NAV-01: Back on Login

| Step | Action | Expected |
|------|--------|---------|
| 1 | Login screen, tap back | Goes to Story |

### TC-NAV-02: Back on OTP

| Step | Action | Expected |
|------|--------|---------|
| 1 | OTP screen, tap back / "Change phone" | Goes to Login |

### TC-NAV-03: Back on Name

| Step | Action | Expected |
|------|--------|---------|
| 1 | Name screen, tap back | Goes to OTP |

### TC-NAV-04: Back on CityActivity

| Step | Action | Expected |
|------|--------|---------|
| 1 | CityActivity screen, tap back | Goes to Name |

### TC-NAV-05: Back on Questionnaire

| Step | Action | Expected |
|------|--------|---------|
| 1 | Questionnaire screen, tap back | Goes to CityActivity |

### TC-NAV-06: Back on Progress / WelcomeBack / ThankYou / Loading

| Step | Action | Expected |
|------|--------|---------|
| 1 | Any terminal screen, tap back | FlutterBridge.postMessage("close") or `window.history.back()` |

### TC-NAV-07: Android hardware back on Story

| Step | Action | Expected |
|------|--------|---------|
| 1 | Story screen, press Android hardware back | Story/Questionnaire handle their own internal back (no action from main handler) |

### TC-NAV-08: Android hardware back on Login

| Step | Action | Expected |
|------|--------|---------|
| 1 | Login screen, press hardware back | Goes to Story |

### TC-NAV-09: Android hardware back on root screens

| Step | Action | Expected |
|------|--------|---------|
| 1 | Loading/Progress/WelcomeBack/ThankYou, press hardware back | FlutterBridge.postMessage("close") or `window.history.back()` |

---

# SECTION G: Input Validation

### TC-INPUT-01: Login — invalid phone number

| Step | Action | Expected |
|------|--------|---------|
| 1 | Enter "123" in phone field | Error shown, cannot proceed |

### TC-INPUT-02: OTP — wrong code

| Step | Action | Expected |
|------|--------|---------|
| 1 | Enter incorrect OTP | Error message shown, stays on OTP screen |

### TC-INPUT-03: Name — empty field

| Step | Action | Expected |
|------|--------|---------|
| 1 | Leave name empty, try to submit | Submit disabled or error shown |

### TC-INPUT-04: City — not selected

| Step | Action | Expected |
|------|--------|---------|
| 1 | Try to proceed without selecting city | Submit disabled |

### TC-INPUT-05: Activity — not selected

| Step | Action | Expected |
|------|--------|---------|
| 1 | Try to proceed without selecting activity | Submit disabled |

### TC-INPUT-06: Questionnaire — skip required question

| Step | Action | Expected |
|------|--------|---------|
| 1 | Skip a required question, try to proceed | Cannot advance past that question |

---

# SECTION H: Status Machine Transitions

## Applicant-Triggered

| ID | From | To | Trigger | DB Writes |
|----|------|----|---------|-----------|
| TC-SM-01 | (none) | ACTIVE | `POST /start` | CreateClubApplication + Analytics("page_landed") |
| TC-SM-02 | ACTIVE | ABANDONED | Exit type=interested | Status event + UpdateStatus + exit tracking + abandoned_at + reminder_state |
| TC-SM-03 | ACTIVE | NOT_INTERESTED | Exit type=not_interested | Status event + UpdateStatus + exit tracking (NO abandoned_at, NO reminder_state) |
| TC-SM-04 | ACTIVE | SUBMITTED | `POST /submit` | Status event + UpdateStatus + submitted_at + Analytics("form_submitted") |
| TC-SM-05 | ABANDONED | ACTIVE | User returns, calls questionnaire | Status event (ABANDONED->ACTIVE) + UpdateStatus |
| TC-SM-06 | NOT_INTERESTED | ACTIVE | User returns, calls questionnaire | Status event (NOT_INTERESTED->ACTIVE) + UpdateStatus |

## Admin-Triggered

| ID | From | To | Trigger | Requires |
|----|------|----|---------|----------|
| TC-SM-07 | SUBMITTED | UNDER_REVIEW | Admin opens for review | - |
| TC-SM-08 | UNDER_REVIEW | INTERVIEW_PENDING | Admin: select_interview | 5-dim screening ratings |
| TC-SM-09 | UNDER_REVIEW | REJECTED | Admin: reject | rejection_reason |
| TC-SM-10 | UNDER_REVIEW | ON_HOLD | Admin: on_hold | - |
| TC-SM-11 | ON_HOLD | INTERVIEW_PENDING | Admin: select_interview | 5-dim ratings |
| TC-SM-12 | ON_HOLD | REJECTED | Admin: reject | rejection_reason |
| TC-SM-13 | INTERVIEW_DONE | SELECTED | Admin: select | split_template_id |
| TC-SM-14 | INTERVIEW_DONE | REJECTED | Admin: reject | rejection_reason |
| TC-SM-15 | SELECTED | CLUB_CREATED | marketing_launched=true (auto) | all milestones done |
| TC-SM-16 | Any non-terminal | REJECTED | Admin: blanket reject | rejection_reason |

## System-Triggered

| ID | From | To | Trigger |
|----|------|----|---------|
| TC-SM-17 | INTERVIEW_PENDING | INTERVIEW_SCHEDULED | Calendly webhook `invitee.created` |
| TC-SM-18 | INTERVIEW_SCHEDULED | INTERVIEW_PENDING | Calendly webhook `invitee.canceled` |

## Invalid Transitions (Should Fail)

| ID | From | To | Expected |
|----|------|----|----------|
| TC-SM-19 | REJECTED | anything | 400 error — terminal status |
| TC-SM-20 | CLUB_CREATED | anything | 400 error — terminal status |
| TC-SM-21 | ACTIVE | SELECTED | 400 error — invalid transition |
| TC-SM-22 | SUBMITTED | CLUB_CREATED | 400 error — invalid transition |

---

# SECTION I: Questionnaire-Specific

### TC-Q-01: Save + restore partial answers

| Step | Action | Expected |
|------|--------|---------|
| 1 | Answer Q1-Q5, then exit (ABANDONED) | `saveQuestionnaire` called, `data` JSONB saved |
| 2 | Return later | Questionnaire pre-fills answers from `application.questionnaire_data` |

### TC-Q-02: Change city/activity after partial questionnaire

| Step | Action | Expected |
|------|--------|---------|
| 1 | Answer Q1-Q5, go back to CityActivity | CityActivity screen |
| 2 | Select different activity | New activity's questions shown (different per activity) |

### TC-Q-03: Submit with all required fields

| Step | Action | Expected |
|------|--------|---------|
| 1 | Complete all questions | Submit button enabled |
| 2 | Tap submit | `submitApplication` succeeds, status=SUBMITTED |

### TC-Q-04: Auto-save on each answer

| Step | Action | Expected |
|------|--------|---------|
| 1 | Answer each question | `saveQuestionnaire` called after each answer change |
| 2 | Network failure during auto-save | Silent fail, user continues |

### TC-Q-05: Submit with null application (edge case)

| Step | Action | Expected |
|------|--------|---------|
| 1 | Application creation failed earlier, user reaches questionnaire end | `handleQuestionnaireComplete` tries `startApplication` first |
| 2 | If 409 conflict | Uses existing application |
| 3 | If total failure | Alert shown, back to CityActivity |

---

# SECTION J: Admin Dashboard

## Tab Structure

| Tab | Statuses | Subsections |
|-----|----------|-------------|
| Follow Up | ACTIVE, ABANDONED | Active (in-progress), Screening (last_screen=questionnaire), Engagement (all others) |
| Submitted | SUBMITTED, UNDER_REVIEW | New (SUBMITTED), Reviewing (UNDER_REVIEW) |
| Interview Phase | INTERVIEW_PENDING, INTERVIEW_SCHEDULED, INTERVIEW_DONE, ON_HOLD | Pending, Scheduled, Done, On Hold |
| Selected | SELECTED, CLUB_CREATED | Onboarding (SELECTED), Club Created (CLUB_CREATED) |
| Dropped | NOT_INTERESTED, REJECTED | Not Interested, Rejected |

### TC-ADMIN-01: Follow Up tab shows ACTIVE users

| Step | Action | Expected |
|------|--------|---------|
| 1 | Open admin dashboard, go to Follow Up tab | Shows ACTIVE and ABANDONED applications |
| 2 | "Last Seen" column for ACTIVE app | Shows `updated_at` + "in progress" badge (blue) |
| 3 | "Last Seen" column for ABANDONED (interested) app | Shows `abandoned_at` + "will return" badge (orange) |
| 4 | "Last Seen" column for ABANDONED (silent) app | Shows `abandoned_at` or `updated_at` + "silent" badge (gray) |

### TC-ADMIN-02: Funnel card for Follow Up

| Step | Action | Expected |
|------|--------|---------|
| 1 | Check Follow Up tab header | Shows count = active_journey + abandoned |
| 2 | Tooltip/breakdown | Shows individual counts for active and abandoned |

### TC-ADMIN-03: Submitted tab — screening workflow

| Step | Action | Expected |
|------|--------|---------|
| 1 | Click on a SUBMITTED application | Detail view opens |
| 2 | Rate on 5 screening dimensions (1-5 each) | Ratings saved as `screening_ratings` JSONB |
| 3 | Click "Select for Interview" | Status → INTERVIEW_PENDING |
| 4 | Click "Reject" | Status → REJECTED, requires rejection_reason |
| 5 | Click "Put on Hold" | Status → ON_HOLD |

### TC-ADMIN-04: Interview phase — Calendly integration

| Step | Action | Expected |
|------|--------|---------|
| 1 | App is INTERVIEW_PENDING | Calendly link available |
| 2 | Applicant books via Calendly | Webhook fires, status → INTERVIEW_SCHEDULED |
| 3 | Check DB | `interview_scheduled_at`, `calendly_event_uri`, `calendly_meet_link` saved |
| 4 | Applicant cancels | Webhook fires, status → INTERVIEW_PENDING, calendly fields cleared |

### TC-ADMIN-05: Selected tab — milestones

| Step | Action | Expected |
|------|--------|---------|
| 1 | App is SELECTED | Milestone toggles visible |
| 2 | Toggle first_call_done | Saved, status stays SELECTED |
| 3 | Toggle venue_sorted | Saved, status stays SELECTED |
| 4 | Toggle marketing_launched (all prior done) | Auto-transition: SELECTED → CLUB_CREATED |
| 5 | Toggle marketing_launched (first_call NOT done) | Milestone saved, NO auto-transition |

### TC-ADMIN-06: Dropped tab — NOT_INTERESTED with tracking

| Step | Action | Expected |
|------|--------|---------|
| 1 | View NOT_INTERESTED app | `last_screen` and tracking columns visible |
| 2 | Check `abandoned_at` | Should be NULL (only ABANDONED gets this) |
| 3 | Check `reminder_state` | Should be NULL (only ABANDONED gets this) |

### TC-ADMIN-07: Info modal

| Step | Action | Expected |
|------|--------|---------|
| 1 | Click Info button | Modal opens with "Status Definitions" tab |
| 2 | All 12 statuses listed | Correct badges, grouped into 3 layers |
| 3 | Switch to "Dashboard SOP" tab | 5 numbered steps with instructions |
| 4 | Close via X or overlay | Modal closes |

### TC-ADMIN-08: Search and filters

| Step | Action | Expected |
|------|--------|---------|
| 1 | Search by applicant name | Matching rows shown |
| 2 | Filter by city | Only matching city apps shown |
| 3 | Filter by activity | Only matching activity apps shown |
| 4 | Combine filters | Intersection of all filters |
| 5 | Clear all filters | All apps in current tab shown |
| 6 | Switch tabs | Filters reset |

### TC-ADMIN-09: Bulk archive

| Step | Action | Expected |
|------|--------|---------|
| 1 | Select multiple apps, click Archive | All selected archived |
| 2 | Try to archive ON_HOLD app | ON_HOLD is protected — excluded or error |
| 3 | Empty selection, click Archive | No action |

### TC-ADMIN-10: Add lead

| Step | Action | Expected |
|------|--------|---------|
| 1 | Click "Add Lead" | Form appears (name + phone + city) |
| 2 | Fill and submit | New application created with `admin_created=true`, status ACTIVE |

### TC-ADMIN-11: Timeline

| Step | Action | Expected |
|------|--------|---------|
| 1 | View app with multiple transitions | All transitions shown chronologically |
| 2 | Exit events | Show "ACTIVE → NOT_INTERESTED (applicant)" format |
| 3 | Admin actions | Show "SUBMITTED → UNDER_REVIEW (admin)" format |
| 4 | Calendly events | Show "INTERVIEW_PENDING → INTERVIEW_SCHEDULED (system)" format |

---

# SECTION K: Calendly Webhook Tests

### TC-CAL-01: invitee.created — valid

| Step | Action | Expected |
|------|--------|---------|
| 1 | Calendly fires `invitee.created` webhook | Backend receives POST |
| 2 | App is INTERVIEW_PENDING | Status → INTERVIEW_SCHEDULED |
| 3 | DB | `interview_scheduled_at`, `calendly_event_uri`, `calendly_invitee_uri`, `calendly_meet_link` saved |

### TC-CAL-02: invitee.canceled — valid

| Step | Action | Expected |
|------|--------|---------|
| 1 | Calendly fires `invitee.canceled` webhook | Backend receives POST |
| 2 | App is INTERVIEW_SCHEDULED | Status → INTERVIEW_PENDING |
| 3 | DB | Calendly fields cleared |

### TC-CAL-03: Webhook for non-existent app

| Step | Action | Expected |
|------|--------|---------|
| 1 | Webhook fires with unknown app ID | 404 error, no DB changes |

### TC-CAL-04: Duplicate webhook

| Step | Action | Expected |
|------|--------|---------|
| 1 | Same `invitee.created` fires twice | Second is idempotent — already in INTERVIEW_SCHEDULED |

### TC-CAL-05: Webhook missing required fields

| Step | Action | Expected |
|------|--------|---------|
| 1 | Webhook payload missing event URI | 400 error, no DB changes |

---

# SECTION L: Analytics Events

| ID | Event | When | Metadata |
|----|-------|------|----------|
| TC-AE-01 | `page_landed` | App created (POST /start) | `{source: "app"/"link"}` |
| TC-AE-02 | `story_completed` | Story viewed before auth | `{pre_auth: "true"}` |
| TC-AE-03 | `form_autosaved` | Questionnaire data saved | `{}` |
| TC-AE-04 | `form_submitted` | Application submitted | `{}` |
| TC-AE-05 | `form_exit_not_interested` | "Yes, I want to exit" (auth) | `{}` |
| TC-AE-06 | `form_exit_interested` | "Will come back later" (auth) | `{}` |
| TC-AE-07 | `form_exit_silent` | Silent/browser close | `{}` |
| TC-AE-08 | `admin_rated` | Admin screens applicant | `{ratings: {...}}` |
| TC-AE-09 | `applicant_rejected` | Admin rejects | `{reason: "..."}` |
| TC-AE-10 | `applicant_selected` | Admin selects | `{split_template_id: N}` |
| TC-AE-11 | `milestone_marked` | Admin toggles milestone | `{type: "first_call_done"}` |
| TC-AE-12 | `club_created` | marketing_launched auto-transition | `{}` |

**Verification:** For each event, check `analytics_events` table has a row with correct `event_type`, `application_pk`, and `metadata` JSONB.

---

# SECTION M: Edge Cases & Race Conditions

### TC-EDGE-01: Two tabs, exit in both

| Step | Action | Expected |
|------|--------|---------|
| 1 | Open SYC in two tabs (same user) | Both show same screen |
| 2 | Exit in Tab 1 | Status changes (e.g., ACTIVE → NOT_INTERESTED) |
| 3 | Exit in Tab 2 | API may fail (invalid transition from NOT_INTERESTED) — caught silently, user redirected |

### TC-EDGE-02: Exit → return → exit cycle

| Step | Action | Expected |
|------|--------|---------|
| 1 | ACTIVE → exit "will come back" | ABANDONED |
| 2 | Return | ABANDONED → ACTIVE |
| 3 | Exit "yes exit" | ACTIVE → NOT_INTERESTED |
| 4 | Return | NOT_INTERESTED → ACTIVE |
| 5 | Timeline | Shows full history of all transitions |

### TC-EDGE-03: Admin rejects while user is mid-questionnaire

| Step | Action | Expected |
|------|--------|---------|
| 1 | User is filling questionnaire | App is ACTIVE |
| 2 | Admin rejects (ACTIVE → REJECTED) | Status changes in DB |
| 3 | User submits questionnaire | Backend rejects submit (REJECTED is terminal) → error shown |

### TC-EDGE-04: Token expires mid-session

| Step | Action | Expected |
|------|--------|---------|
| 1 | User is on questionnaire, JWT expires | Next API call returns 401 |
| 2 | Frontend behavior | Should catch 401 and route to Story (fresh start) |
| 3 | Note | `checkExistingUser` handles 401, but mid-flow calls (e.g., `saveQuestionnaire`) may not handle 401 gracefully |

### TC-EDGE-05: Rapid double-click on "Yes, I want to exit"

| Step | Action | Expected |
|------|--------|---------|
| 1 | Double-click fast on exit button | First click: modal closes + API + redirect |
| 2 | Check | Second click: modal already gone, no-op. Only ONE API call. |

### TC-EDGE-06: Submit with null application

| Step | Action | Expected |
|------|--------|---------|
| 1 | Application creation failed (startApplication errored) | `application` state is null |
| 2 | User reaches end of questionnaire | `handleQuestionnaireComplete` attempts to create app |
| 3 | If 409 | Uses existing app from error response |
| 4 | If total failure | Alert + back to CityActivity |

### TC-EDGE-07: Browser back button (not in-app)

| Step | Action | Expected |
|------|--------|---------|
| 1 | On SYC in browser, press browser back | No popstate listener → navigates away from SPA |
| 2 | Check | No exit API call. App stays in current DB status. |

---

# SECTION N: Security & Auth

### TC-SEC-01: Expired JWT

| Step | Action | Expected |
|------|--------|---------|
| 1 | Use expired token on any API call | 401 response |
| 2 | Frontend | Clears localStorage, routes to Story |

### TC-SEC-02: Invalid JWT (malformed)

| Step | Action | Expected |
|------|--------|---------|
| 1 | Send garbage token | 401 response |

### TC-SEC-03: Access another user's application

| Step | Action | Expected |
|------|--------|---------|
| 1 | Valid JWT for User A, try to access User B's app | 403 Forbidden |

### TC-SEC-04: Admin endpoint without admin auth

| Step | Action | Expected |
|------|--------|---------|
| 1 | Call `/admin/all` without admin token | 401 or 403 |

### TC-SEC-05: XSS in questionnaire answers

| Step | Action | Expected |
|------|--------|---------|
| 1 | Enter `<script>alert('xss')</script>` in text answer | Stored as-is in JSONB, but React escapes on render |

---

# SECTION O: localStorage & Persistence

### TC-LS-01: Fresh browser — no localStorage

| Step | Action | Expected |
|------|--------|---------|
| 1 | No SYC_USER in localStorage | user=null → Story after loading |

### TC-LS-02: Valid user in localStorage

| Step | Action | Expected |
|------|--------|---------|
| 1 | SYC_USER exists with valid token | checkExistingUser called → routes by app status |

### TC-LS-03: Corrupted JSON in localStorage

| Step | Action | Expected |
|------|--------|---------|
| 1 | SYC_USER = "not-json" | `loadUser()` catches JSON.parse error → null → fresh start |

### TC-LS-04: localStorage disabled (private browsing)

| Step | Action | Expected |
|------|--------|---------|
| 1 | localStorage.setItem throws | User not persisted, each reload = fresh start |

---

# SECTION P: Flutter WebView

### TC-FLUTTER-01: FlutterBridge close (app source, authorized)

| Step | Action | Expected |
|------|--------|---------|
| 1 | Back on Progress screen in WebView | `FlutterBridge.postMessage("close")` called |
| 2 | Result | WebView closes, returns to Flutter app |

### TC-FLUTTER-02: FlutterBridge open_clubs

| Step | Action | Expected |
|------|--------|---------|
| 1 | "Not sure, I'd like to join" in WebView (authorized) | `FlutterBridge.postMessage("open_clubs")` called |
| 2 | Result | Flutter app navigates to all clubs section |

### TC-FLUTTER-03: nativeBack event

| Step | Action | Expected |
|------|--------|---------|
| 1 | Android hardware back on Login screen | `nativeBack` event dispatched by Flutter |
| 2 | Event handler | Routes to Story |

### TC-FLUTTER-04: No FlutterBridge (link source)

| Step | Action | Expected |
|------|--------|---------|
| 1 | All exit/back actions via link (no FlutterBridge) | Falls back to `window.history.back()` or `misfits.net.in` redirect |

---

# SECTION Q: Responsive & Mobile UI

### TC-UI-01: Story on 320px width

| Step | Action | Expected |
|------|--------|---------|
| 1 | View Story on narrow screen | Text readable, no overflow, buttons tappable |

### TC-UI-02: Exit modal on small screen

| Step | Action | Expected |
|------|--------|---------|
| 1 | View exit modal on narrow screen | All 4 buttons visible without scrolling |

### TC-UI-03: Stagger animation performance

| Step | Action | Expected |
|------|--------|---------|
| 1 | Watch Story animation on low-end device | No jank (CSS transitions use transform + opacity = GPU-accelerated) |

### TC-UI-04: FlutterBridge WebView

| Step | Action | Expected |
|------|--------|---------|
| 1 | All screens in Flutter WebView | Render correctly, no viewport issues |

---

# SECTION R: Bugs Fixed

### BUG-01: Name not saved to backend — FIXED

**Was:** NameCapture only saved name to localStorage. Backend pulled name from `users` table (often empty/wrong).
**Fix:** `name` field added to `StartApplicationRequest`. Frontend sends name in `startApplication()` call. Backend prefers request name, falls back to users table.
**Verify:** Create new application after NameCapture → check `club_applications.name` has the entered name.

### BUG-03: "Skip to application form" for authenticated users — FIXED

**Was:** Authenticated user on Story → X → "Skip to application form" → went to Login unnecessarily.
**Fix:** `handleSkipStory` now checks `user?.token` — if authenticated, calls `handlePostAuth(user)` directly.
**Verify:** Authenticated user → WelcomeBack → Start New → Story → X → "Skip to application form" → should go to CityActivity/Questionnaire (NOT Login).

---

# SECTION S: DB Verification Queries

Use these queries to verify test results:

```sql
-- Check application status and tracking
SELECT pk, status, exit_type, last_screen, last_question_index,
       last_question_section, total_questions, abandoned_at, reminder_state,
       source, submitted_at, created_at, updated_at
FROM club_applications
WHERE user_id = '<user_id>'
ORDER BY created_at DESC;

-- Check status transitions (timeline)
SELECT id, application_pk, from_status, to_status, actor, created_at
FROM club_application_events
WHERE application_pk = <app_pk>
ORDER BY created_at;

-- Check analytics events
SELECT id, application_pk, event_type, metadata, created_at
FROM analytics_events
WHERE application_pk = <app_pk>
ORDER BY created_at;

-- Funnel counts
SELECT status, COUNT(*)
FROM club_applications
WHERE archived = false
GROUP BY status
ORDER BY status;

-- NOT_INTERESTED with tracking (verify Section H tests)
SELECT pk, status, exit_type, last_screen, last_question_index,
       abandoned_at, reminder_state
FROM club_applications
WHERE status = 'NOT_INTERESTED'
ORDER BY updated_at DESC;
```

---

# Summary

| Section | Test Cases | Priority |
|---------|-----------|----------|
| A. New User Happy Path | 4 | P0 |
| B. Exit Modal (all buttons x auth) | 12 | P0 |
| C. Silent Exit | 5 | P0 |
| D. Story Navigation & Soft-Gate | 11 | P1 |
| E. Returning User Flows | 10 | P0 |
| F. Back Button Navigation | 9 | P1 |
| G. Input Validation | 6 | P1 |
| H. Status Machine | 22 | P0 |
| I. Questionnaire | 5 | P1 |
| J. Admin Dashboard | 11 | P1 |
| K. Calendly Webhooks | 5 | P1 |
| L. Analytics Events | 12 | P2 |
| M. Edge Cases | 7 | P1 |
| N. Security & Auth | 5 | P2 |
| O. localStorage | 4 | P2 |
| P. Flutter WebView | 4 | P1 |
| Q. Responsive UI | 4 | P2 |
| R. Known Bugs | 2 | Reference |
| S. DB Queries | - | Reference |
| **TOTAL** | **~138** | |
