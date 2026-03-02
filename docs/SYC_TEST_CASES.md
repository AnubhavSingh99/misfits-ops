# SYC — Screen-by-Screen Test Cases

**Date:** 2026-03-02
**Covers:** Every user action on every screen, for every user type

---

## User Types

| Code | Description |
|------|-------------|
| **NEW** | Fresh browser, no localStorage, no account |
| **NEW-APP** | Same as NEW but opened from Flutter app (`?source=app`) |
| **RET-ACTIVE** | Returning user, has token, app status=ACTIVE, no city/activity |
| **RET-ACTIVE-Q** | Returning user, has token, app status=ACTIVE, has city+activity (mid-questionnaire) |
| **RET-ABANDONED** | Returning user, has token, app status=ABANDONED |
| **RET-NI** | Returning user, has token, app status=NOT_INTERESTED |
| **RET-SUBMITTED** | Returning user, has token, app status=SUBMITTED |
| **RET-REVIEW** | Returning user, has token, app status=UNDER_REVIEW |
| **RET-INT-PEND** | Returning user, app status=INTERVIEW_PENDING |
| **RET-INT-SCHED** | Returning user, app status=INTERVIEW_SCHEDULED |
| **RET-SELECTED** | Returning user, app status=SELECTED |
| **RET-REJECTED** | Returning user, app status=REJECTED |
| **RET-CLUB** | Returning user, app status=CLUB_CREATED |
| **RET-EXPIRED** | Returning user, has token but it's expired (401) |
| **RET-CORRUPT** | Returning user, corrupted JSON in localStorage |

---

# 1. LOADING SCREEN

No user interaction possible. Purely animated splash.

| ID | Action | User Type | Expected |
|----|--------|-----------|----------|
| L-01 | Wait 2.8s | NEW | Animation plays: miffy (200ms) → dots (700-1000ms) → cloud+text (1150ms) → fade out (2300ms) → transitions to Story |
| L-02 | Wait 2.8s | RET-ACTIVE | Animation plays → `checkExistingUser(token)` → routes to CityActivity |
| L-03 | Wait 2.8s | RET-ACTIVE-Q | Animation → `checkExistingUser` → routes to Questionnaire (city+activity prefilled) |
| L-04 | Wait 2.8s | RET-ABANDONED | Animation → `checkExistingUser` → routes to CityActivity or Questionnaire (resume) |
| L-05 | Wait 2.8s | RET-NI | Animation → `checkExistingUser` → routes to CityActivity or Questionnaire (resume) |
| L-06 | Wait 2.8s | RET-SUBMITTED | Animation → `checkExistingUser` → routes to Progress |
| L-07 | Wait 2.8s | RET-REVIEW | Animation → `checkExistingUser` → routes to Progress |
| L-08 | Wait 2.8s | RET-INT-PEND | Animation → `checkExistingUser` → routes to Progress |
| L-09 | Wait 2.8s | RET-INT-SCHED | Animation → `checkExistingUser` → routes to Progress |
| L-10 | Wait 2.8s | RET-SELECTED | Animation → `checkExistingUser` → routes to Progress |
| L-11 | Wait 2.8s | RET-REJECTED | Animation → `checkExistingUser` → routes to WelcomeBack |
| L-12 | Wait 2.8s | RET-CLUB | Animation → `checkExistingUser` → routes to WelcomeBack |
| L-13 | Wait 2.8s | RET-EXPIRED | Animation → `checkExistingUser` → 401 → clears localStorage → Story |
| L-14 | Wait 2.8s | RET-CORRUPT | `loadUser()` catches JSON.parse error → null → Story |
| L-15 | Android hardware back | Any | FlutterBridge close or `window.history.back()` |

---

# 2. STORY SCREEN (Slides 0-2 + Decision)

## Slide 0: "Imagine this"

| ID | Action | Expected |
|----|--------|----------|
| S0-01 | Wait, observe | Pill "Imagine this" fades in at 400ms |
| S0-02 | Wait more | Bold heading appears at 1000ms, `canTap` becomes true |
| S0-03 | Wait more | Subtext "Pretty cool stuff! People love it..." appears at 1700ms |
| S0-04 | Wait more | Tap hint + shake animation at 2500ms |
| S0-05 | Tap before 1000ms (before heading) | **Nothing happens** — soft-gate active |
| S0-06 | Tap after 1000ms | Advances to Slide 1 |
| S0-07 | Tap back (<) button | Exit modal opens (`onClose`) — this is slide 0, no previous slide |
| S0-08 | Tap X (close) button | Exit modal opens |
| S0-09 | Android hardware back | Exit modal opens (same as back button on slide 0) |

## Slide 1: "That's Your club."

| ID | Action | Expected |
|----|--------|----------|
| S1-01 | Arrive at slide 1 | `canTap` resets to false. Pill "That's Your club." animates in |
| S1-02 | Tap before heading (< 1s) | Nothing — gate active |
| S1-03 | Tap after heading | Advances to Slide 2 |
| S1-04 | Tap back (<) | Goes to Slide 0 |
| S1-05 | Tap X | Exit modal opens |

## Slide 2: "And..."

| ID | Action | Expected |
|----|--------|----------|
| S2-01 | Arrive at slide 2 | `canTap` resets. Pill "And..." fades in |
| S2-02 | Heading appears | "You made ₹40K last month." |
| S2-03 | Subtext appears | "By putting in just 10 hours a week. On your terms." |
| S2-04 | Tap after heading | Advances to Decision screen (slide 3) |
| S2-05 | Tap back (<) | Goes to Slide 1 |
| S2-06 | Tap X | Exit modal opens |

## Decision Screen (Slide 3)

| ID | Action | User Type | Expected |
|----|--------|-----------|----------|
| SD-01 | Tap "Yes, I'd like to start a club" | NEW | `storyViewed=true`, goes to Login |
| SD-02 | Tap "Yes, I'd like to start a club" | RET (auth) | `storyViewed=true`, goes to Login |
| SD-03 | Tap "Not sure, I'd like to join" | NEW (link) | No API call, redirects to `misfits.net.in` |
| SD-04 | Tap "Not sure, I'd like to join" | NEW-APP | No API call, FlutterBridge close |
| SD-05 | Tap "Not sure, I'd like to join" | RET (auth, has app, link) | `exitApplication("not_interested")`, then `window.history.back()` |
| SD-06 | Tap "Not sure, I'd like to join" | RET (auth, has app, app source) | `exitApplication("not_interested")`, then FlutterBridge `open_clubs` |
| SD-07 | Tap back (<) | Any | Goes to Slide 2 |
| SD-08 | Back from Decision → Slide 2 → back again | Any | Goes to Slide 1 (**NOT** exit modal — Bug #2 fix) |

## Speed-through test

| ID | Action | Expected |
|----|--------|----------|
| S-SPEED-01 | Tap as soon as enabled on each slide | Minimum ~3 seconds total (1s gate x 3 slides) |
| S-SPEED-02 | Verify all 3 headings were visible | User saw the hook text for every slide |

---

# 3. EXIT MODAL

Can appear from: Story (X button, back on slide 0), CityActivity (back, X), Questionnaire (X)

## Button: "Continue"

| ID | Screen | User Type | Expected |
|----|--------|-----------|----------|
| EM-01 | Story | Any | Modal closes, returns to exact story slide |
| EM-02 | CityActivity | Any | Modal closes, returns to CityActivity (selection preserved) |
| EM-03 | Questionnaire | Any | Modal closes, returns to exact question |

## Button: "Skip to application form"

| ID | User Type | Expected |
|----|-----------|----------|
| EM-04 | NEW (no token) | `storyViewed=true`, goes to Login |
| EM-05 | RET (has token) | `storyViewed=true`, calls `handlePostAuth(user)` directly → routes by app status (skips Login) |

## Button: "Will come back later"

| ID | User Type | Expected |
|----|-----------|----------|
| EM-06 | NEW (no token, link) | No API call. Redirect to `misfits.net.in` |
| EM-07 | NEW (no token, app) | No API call. FlutterBridge close |
| EM-08 | RET (auth, has app, link) | API: `exitApplication("interested", tracking)`. DB: status=ABANDONED, exit_type=interested, abandoned_at set, reminder_state initialized. Landing: `window.history.back()` |
| EM-09 | RET (auth, has app, app) | Same API call. Landing: FlutterBridge close |
| EM-10 | RET (auth, API fails) | Error caught silently. Still redirects. DB unchanged. |

## Button: "Yes, I want to exit"

| ID | User Type | Expected |
|----|-----------|----------|
| EM-11 | NEW (no token, link) | No API call. Redirect to `misfits.net.in` |
| EM-12 | NEW (no token, app) | No API call. FlutterBridge close |
| EM-13 | RET (auth, has app, link) | API: `exitApplication("not_interested", tracking)`. DB: status=NOT_INTERESTED, exit_type=not_interested. NO abandoned_at, NO reminder_state. Landing: `window.history.back()` |
| EM-14 | RET (auth, has app, app) | Same API call. Landing: FlutterBridge close |
| EM-15 | RET (auth, API fails) | Error caught silently. Still redirects. |

## Tracking data sent with exit

| ID | Exit from screen | Tracking payload |
|----|-----------------|------------------|
| EM-T1 | Story slide 1 | `{last_screen: "story", last_story_slide: 2}` (1-indexed) |
| EM-T2 | CityActivity | `{last_screen: "city_activity"}` |
| EM-T3 | Questionnaire Q5 of 12 | `{last_screen: "questionnaire", last_question_index: 5, last_question_section: "motivation", total_questions: 12}` |

## Overlay tap

| ID | Action | Expected |
|----|--------|----------|
| EM-16 | Tap dark overlay outside modal card | **Nothing happens** — modal stays open. Must use a button. |

---

# 4. SILENT EXIT (beforeunload)

| ID | Screen | User Type | Expected |
|----|--------|-----------|----------|
| SX-01 | Story | NEW (no token) | `loadUser()` returns null → skip, no API call |
| SX-02 | Story | RET (auth, has app) | keepalive fetch: `PATCH /exit` with `{exit_type: "silent", last_screen: "story", last_story_slide: N}` |
| SX-03 | Questionnaire Q7 | RET (auth) | keepalive fetch with question tracking |
| SX-04 | CityActivity | RET (auth) | keepalive fetch with `{exit_type: "silent", last_screen: "city_activity"}` |
| SX-05 | Login | RET (auth, has app) | keepalive fetch with `{last_screen: "login"}` |
| SX-06 | Progress | Any | **Skipped** — Progress is excluded from silent exit |
| SX-07 | WelcomeBack | Any | **Skipped** — excluded |
| SX-08 | ThankYou | Any | **Skipped** — excluded |
| SX-09 | Loading | Any | **Skipped** — excluded |
| SX-10 | After explicit exit | Any | `hasExited.current = true` → **Skipped** — no double-fire |

---

# 5. LOGIN SCREEN

| ID | Action | Expected |
|----|--------|----------|
| LG-01 | Enter valid 10-digit number, tap Continue | `sendOtp(phone)` called, goes to OTP screen |
| LG-02 | Enter "7597665166" | Accepts, sends OTP |
| LG-03 | Enter "+917597665166" | Strips +91, sends "7597665166" |
| LG-04 | Enter "07597665166" | Strips leading 0, sends "7597665166" |
| LG-05 | Enter "759766" (< 10 digits) | Error: "Please enter a valid 10-digit number" |
| LG-06 | Enter "abcdefghij" | All non-digits stripped → empty → error on submit |
| LG-07 | Enter number, API fails | Error message shown, stays on Login |
| LG-08 | Tap back | Goes to Story |
| LG-09 | Button text while loading | Shows "Sending..." and is disabled |
| LG-10 | Android hardware back | Goes to Story |

---

# 6. OTP SCREEN

| ID | Action | Expected |
|----|--------|----------|
| OTP-01 | Enter correct 6-digit OTP | Auto-validates when 6th digit entered. Goes to Name (new user) or handlePostAuth (existing user with name) |
| OTP-02 | Enter wrong OTP | Error: "The code you entered is incorrect. Please try again." |
| OTP-03 | Paste 6-digit OTP | All 6 inputs filled, auto-validates |
| OTP-04 | Enter 5 digits, tap Verify | Button disabled (needs 6 digits) |
| OTP-05 | Backspace on empty input | Focus moves to previous input |
| OTP-06 | Resend OTP (timer at 0) | `sendOtp(phone)` called, timer resets to 30s, new nonce stored |
| OTP-07 | Resend OTP (timer > 0) | Button disabled, shows countdown |
| OTP-08 | Tap back / "Change phone" | Goes to Login |
| OTP-09 | Phone display | Shows masked: "+91 75XXXXXX66" |
| OTP-10 | Enter key after 6 digits | Triggers validation |
| OTP-11 | Android hardware back | Goes to Login |

---

# 7. NAME CAPTURE SCREEN

| ID | Action | Expected |
|----|--------|----------|
| NC-01 | Enter first name "Saurabh", tap Continue | Name saved to localStorage + sent to backend via `startApplication({name: "Saurabh"})` |
| NC-02 | Enter first + last name "Saurabh Sharma" | Combined as "Saurabh Sharma", saved and sent |
| NC-03 | Leave first name empty, tap Continue | Error: first name required |
| NC-04 | Enter only spaces | Trimmed → empty → error |
| NC-05 | Last name empty | Allowed — last name is optional |
| NC-06 | Tap back | Goes to OTP |
| NC-07 | Android hardware back | Goes to OTP |

---

# 8. CITY/ACTIVITY SCREEN

## City Step

| ID | Action | Expected |
|----|--------|----------|
| CA-01 | Screen loads | Dropdown is **collapsed** (no autoFocus) |
| CA-02 | Tap search input | Dropdown opens, shows cities |
| CA-03 | Type "mum" | Filters to "Mumbai" |
| CA-04 | Type "indore" (lowercase) | Shows "Indore" match. **No** "Add" option (case-insensitive match) |
| CA-05 | Type "Sikar" (not in list) | Shows: `My city is not listed — use "Sikar"` |
| CA-06 | Type "xyz" (zero matches) | Shows: `My city is not listed — use "xyz"` (Add shows even with 0 matches) |
| CA-07 | Select a city from dropdown | Input shows city name, dropdown closes, Next button activates |
| CA-08 | Select custom city via "not listed" | Custom city name used |
| CA-09 | Tap Next without selecting city | Button disabled |
| CA-10 | Tap Next with city selected | Animates to Activity step |
| CA-11 | Tap back (<) | **Exit modal opens** (not Name/OTP) |
| CA-12 | Tap X (close) | Exit modal opens |
| CA-13 | Android hardware back | **Exit modal opens** (not Name) |
| CA-14 | Cities API fails | Falls back to CITIES_FALLBACK (15 hardcoded cities) |

## Activity Step

| ID | Action | Expected |
|----|--------|----------|
| CA-15 | Screen loads | Dropdown collapsed |
| CA-16 | Tap search input | Dropdown opens, shows 23 activities with emojis |
| CA-17 | Type "board" | Filters to "Boardgaming" |
| CA-18 | Type "boardgaming" (exact match) | Shows match, **no** Add option |
| CA-19 | Type "Yoga" (not in list) | Shows: `My activity is not listed — use "Yoga"` |
| CA-20 | Select activity | Input shows activity, dropdown closes, Next activates |
| CA-21 | Tap Next with activity selected | Calls `onSubmit(city, cleanActivity)`. Activity is lowercased + emoji-stripped. Goes to Questionnaire |
| CA-22 | Tap Next without selection | Button disabled |
| CA-23 | Tap back (<) | Goes back to City step (NOT exit modal) |
| CA-24 | Tap X | Exit modal opens |

## Progress Bar

| ID | Action | Expected |
|----|--------|----------|
| CA-25 | City step | Progress shows ~10% (1 of ~10 total steps) |
| CA-26 | Activity step | Progress shows ~20% (2 of ~10 total steps) |

---

# 9. QUESTIONNAIRE SCREEN

## Loading State

| ID | Action | Expected |
|----|--------|----------|
| Q-01 | Screen loads | Shows "Loading questions..." while fetching |
| Q-02 | Config loaded (43 questions for boardgaming) | Shows first question with animation |
| Q-03 | Config API fails | Shows "No questions configured yet" + Continue button |
| Q-04 | No questions for activity | Shows Continue button → calls `onComplete({})` |

## Question Types

### MCQ (Multiple Choice)

| ID | Action | Expected |
|----|--------|----------|
| Q-05 | Options displayed | Grid of option buttons |
| Q-06 | Tap an option | Option highlighted, **auto-advances after 300ms** |
| Q-07 | Tap different option before 300ms | New option selected, timer resets |
| Q-08 | Last question: tap option | Auto-calls `onComplete(allAnswers)` after 300ms |
| Q-09 | No Next button visible | MCQ auto-advances — no next button needed |

### Yes/No

| ID | Action | Expected |
|----|--------|----------|
| Q-10 | Two buttons shown | "Yes" and "No" |
| Q-11 | Tap Yes or No | Selected, auto-advances after 300ms |

### Text Input

| ID | Action | Expected |
|----|--------|----------|
| Q-12 | Single-line input shown | Next button visible at bottom |
| Q-13 | Type text | Answer stored in `answers[pk]` |
| Q-14 | Required + empty: tap Next | Button disabled |
| Q-15 | Required + filled: tap Next | Advances to next question |
| Q-16 | Optional + empty: tap Next | Advances (allowed) |

### Textarea (Long Text)

| ID | Action | Expected |
|----|--------|----------|
| Q-17 | Multi-line textarea shown | Hint: "Most strong responses are 100+ words" |
| Q-18 | Type long answer | Answer stored |
| Q-19 | Next button | Same as text input validation |

## Navigation

| ID | Action | Expected |
|----|--------|----------|
| Q-20 | Tap back on Q1 | Goes to CityActivity |
| Q-21 | Tap back on Q3 | Goes to Q2, previous answer preserved |
| Q-22 | Tap X (close) | Exit modal opens |
| Q-23 | Android hardware back on Q1 | Goes to CityActivity (handled internally) |
| Q-24 | Android hardware back on Q5 | Goes to Q4 |

## Progress

| ID | Action | Expected |
|----|--------|----------|
| Q-25 | On Q3 of 10 | Progress bar shows ~50% (city+activity+3 of 10) |
| Q-26 | Progress callback fires | `onProgressChange(currentIndex, totalQuestions, section)` called |

## Important Badge

| ID | Action | Expected |
|----|--------|----------|
| Q-27 | Question with section="important" | Shows "IMPORTANT" badge |
| Q-28 | Regular question | No badge |

## Submit (Last Question)

| ID | Action | Expected |
|----|--------|----------|
| Q-29 | Answer last MCQ question | Auto-calls `onComplete(answers)` → `handleQuestionnaireComplete` |
| Q-30 | Answer last text question, tap Next | Same as above |
| Q-31 | `handleQuestionnaireComplete` — app exists | `saveQuestionnaire` + `submitApplication` → Progress screen |
| Q-32 | `handleQuestionnaireComplete` — app is null | Tries `startApplication` first. If 409 → uses existing. If fails → alert + back to CityActivity |
| Q-33 | Submit API fails | Goes to Progress anyway (save may have succeeded) |

---

# 10. PROGRESS SCREEN

| ID | Action | User Status | Expected |
|----|--------|-------------|----------|
| P-01 | View | SUBMITTED | Step 1: "In review" (review icon). Steps 2-3 locked. |
| P-02 | View | UNDER_REVIEW | Same as SUBMITTED display |
| P-03 | View | INTERVIEW_PENDING | Step 1: cleared (check). Step 2: "In process" with "Book a call" button |
| P-04 | Tap "Book a call" | INTERVIEW_PENDING | Opens Calendly link (FlutterBridge or window.open) |
| P-05 | View | INTERVIEW_SCHEDULED | Step 2: "In process" with "Join Call" button + scheduled datetime |
| P-06 | Tap "Join Call" | INTERVIEW_SCHEDULED | Opens `calendly_meet_link` |
| P-07 | View | INTERVIEW_SCHEDULED, no meet link | "Interview scheduled" button (disabled/grayed) |
| P-08 | View | INTERVIEW_DONE | Step 2: cleared (check) |
| P-09 | View | SELECTED | Steps 1-2 cleared. Step 3: "Next steps" with 3 links |
| P-10 | Tap "Create your club" | SELECTED | Opens `misfitsclubs.app.link/CreateClub` |
| P-11 | Tap "Onboarding form" | SELECTED | Opens Google Form |
| P-12 | Tap "Contract" | SELECTED, contract exists | Opens contract URL |
| P-13 | Tap "Contract" | SELECTED, no contract | Grayed out / disabled |
| P-14 | View | CLUB_CREATED | All 3 steps cleared (check icons) |
| P-15 | View | admin_created=true | Yellow badge: "Application created by Misfits team" |
| P-16 | Tap back (X) | Any | `window.history.back()` or FlutterBridge close |
| P-17 | Tap phone number at bottom | Any | Opens `tel:9311923197` |
| P-18 | Android hardware back | Any | FlutterBridge close or `window.history.back()` |

---

# 11. WELCOME BACK SCREEN

| ID | Action | User Status | Expected |
|----|--------|-------------|----------|
| WB-01 | View | REJECTED | Shows past app card with "Rejected" + applied date |
| WB-02 | View | CLUB_CREATED | Shows past app card with "Completed" + applied date |
| WB-03 | View | No past apps | Subtitle: "Start your club journey" |
| WB-04 | Tap "Start a new application" | Any | Resets all state (app=null, city="", activity=""), goes to Story |
| WB-05 | Tap back | Any | `window.history.back()` |
| WB-06 | Tap phone number | Any | Opens `tel:9311923197` |
| WB-07 | Android hardware back | Any | FlutterBridge close or `window.history.back()` |

---

# 12. THANK YOU SCREEN

| ID | Action | Expected |
|----|--------|----------|
| TY-01 | View | Shows "Thank you!" message + Miffy image |
| TY-02 | Tap "Explore Misfits" | Opens `misfitsclubs.app.link/home` |
| TY-03 | Tap back | `window.history.back()` |

---

# 13. KEYBOARD / MOBILE UX

| ID | Screen | Action | Expected |
|----|--------|--------|----------|
| KB-01 | CityActivity | Open keyboard by tapping search | Next button stays visible above keyboard (100dvh shrinks viewport) |
| KB-02 | Questionnaire (text) | Open keyboard | Next button visible above keyboard |
| KB-03 | Login | Open keyboard | Continue button visible |
| KB-04 | OTP | Open keyboard | Verify button visible |
| KB-05 | Any | Close keyboard | Button returns to bottom of screen |
| KB-06 | CityActivity | iPhone safe area | Footer respects `env(safe-area-inset-bottom)` |

---

# 14. RETURNING USER — FULL RESUME FLOWS

| ID | Token | App Status | City/Activity | Route To | What User Sees |
|----|-------|-----------|---------------|----------|----------------|
| RF-01 | Valid | ACTIVE | No | CityActivity | Picks city + activity, then questionnaire |
| RF-02 | Valid | ACTIVE | Yes | Questionnaire | Resumes from where they left off, previous answers prefilled |
| RF-03 | Valid | ABANDONED | No | CityActivity | Same as RF-01, backend transitions ABANDONED→ACTIVE |
| RF-04 | Valid | ABANDONED | Yes | Questionnaire | Same as RF-02, backend transitions ABANDONED→ACTIVE |
| RF-05 | Valid | NOT_INTERESTED | No | CityActivity | Same resume, backend transitions NI→ACTIVE |
| RF-06 | Valid | NOT_INTERESTED | Yes | Questionnaire | Same resume |
| RF-07 | Valid | SUBMITTED | - | Progress | Sees "Application submitted" |
| RF-08 | Valid | UNDER_REVIEW | - | Progress | Sees step 1 in review |
| RF-09 | Valid | INTERVIEW_PENDING | - | Progress | Sees "Book a call" button |
| RF-10 | Valid | INTERVIEW_SCHEDULED | - | Progress | Sees scheduled date + "Join Call" |
| RF-11 | Valid | INTERVIEW_DONE | - | Progress | Sees step 2 cleared |
| RF-12 | Valid | SELECTED | - | Progress | Sees step 3 with onboarding links |
| RF-13 | Valid | CLUB_CREATED | - | Progress | All steps complete |
| RF-14 | Valid | REJECTED | - | WelcomeBack | Past app shown, can start new |
| RF-15 | Expired | Any | - | Story | 401 → localStorage cleared → fresh start |
| RF-16 | Corrupt | Any | - | Story | JSON.parse fails → null → fresh start |
| RF-17 | Valid | No app exists | - | WelcomeBack | "Start your club journey" |

---

# 15. EDGE CASES

| ID | Scenario | Expected |
|----|----------|----------|
| EC-01 | Two tabs open, exit in both | First exit works. Second exit: API may fail (invalid transition) — caught silently, user redirected. |
| EC-02 | Exit (ABANDONED) → return → exit (NOT_INTERESTED) → return → submit | Full cycle works. Timeline shows all transitions. |
| EC-03 | Admin rejects while user is mid-questionnaire | User submits → backend rejects (REJECTED is terminal) → error shown |
| EC-04 | Token expires mid-questionnaire | Next API call gets 401. Should route to Story. **Note:** mid-flow 401 handling may be incomplete. |
| EC-05 | Rapid double-click "Yes, I want to exit" | First click: modal closes + API + redirect. Second: modal gone, no-op. One API call only. |
| EC-06 | Network offline during questionnaire submit | `saveQuestionnaire` fails silently. `submitApplication` fails → still goes to Progress. |
| EC-07 | Browser back button (not in-app) | No popstate listener → navigates away entirely. No exit API call. |
| EC-08 | localStorage disabled (private browsing) | `setItem` throws → user not persisted. Each reload = fresh start. |
| EC-09 | Close tab right after explicit exit | `hasExited.current = true` → beforeunload skips → no double API call. |
| EC-10 | Open SYC with `?screen=questionnaire` (debug param) | Goes directly to questionnaire screen (debug mode). |

---

# 16. FLUTTER WEBVIEW SPECIFIC

| ID | Action | Expected |
|----|--------|----------|
| FW-01 | Back on Progress (app source) | `FlutterBridge.postMessage("close")` |
| FW-02 | "Not sure, join" (auth, app source) | `FlutterBridge.postMessage("open_clubs")` |
| FW-03 | "Not sure, join" (unauth, app source) | `FlutterBridge.postMessage("close")` |
| FW-04 | "Will come back later" (auth, app source) | Exit API call + `FlutterBridge.postMessage("close")` |
| FW-05 | Android hardware back on Login | `nativeBack` event → goes to Story |
| FW-06 | Android hardware back on CityActivity | `nativeBack` event → exit modal opens |
| FW-07 | Android hardware back on Story/Questionnaire | `nativeBack` event → handled internally by component |
| FW-08 | "Book a call" on Progress | `FlutterBridge.postMessage({type: "open_url", url})` |
| FW-09 | No FlutterBridge (link source) | All exits fall back to `window.history.back()` or `misfits.net.in` |

---

# 17. DB VERIFICATION (for backend testers)

```sql
-- Check application status + tracking after any test
SELECT pk, status, exit_type, last_screen, last_question_index,
       last_question_section, total_questions, abandoned_at,
       reminder_state, name, city, activity, source,
       submitted_at, created_at, updated_at
FROM club_applications WHERE user_id = '<user_id>'
ORDER BY created_at DESC;

-- Check status transitions (timeline)
SELECT from_status, to_status, actor, created_at
FROM club_application_events WHERE application_pk = <pk>
ORDER BY created_at;

-- Check analytics events
SELECT event_type, metadata, created_at
FROM analytics_events WHERE application_pk = <pk>
ORDER BY created_at;

-- Verify NOT_INTERESTED has no abandoned_at or reminder_state
SELECT pk, status, abandoned_at, reminder_state
FROM club_applications WHERE status = 'NOT_INTERESTED';

-- Verify ABANDONED has abandoned_at and reminder_state
SELECT pk, status, abandoned_at, reminder_state
FROM club_applications WHERE status = 'ABANDONED';
```

---

# Summary

| Section | Test Cases |
|---------|-----------|
| 1. Loading | 15 |
| 2. Story (all slides + decision) | 20 |
| 3. Exit Modal (4 buttons x user types) | 19 |
| 4. Silent Exit | 10 |
| 5. Login | 10 |
| 6. OTP | 11 |
| 7. Name Capture | 7 |
| 8. City/Activity | 26 |
| 9. Questionnaire | 33 |
| 10. Progress | 18 |
| 11. Welcome Back | 7 |
| 12. Thank You | 3 |
| 13. Keyboard/Mobile | 6 |
| 14. Returning User Flows | 17 |
| 15. Edge Cases | 10 |
| 16. Flutter WebView | 9 |
| 17. DB Queries | - |
| **TOTAL** | **221** |
