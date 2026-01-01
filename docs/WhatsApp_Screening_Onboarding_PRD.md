# WhatsApp Screening & Onboarding System - PRD

## 1. Overview & Objectives

### Purpose
Build a WhatsApp-based application system that streamlines the process of recruiting club leaders and venue partners through automated screening, interview scheduling, and onboarding workflows.

### Key Goals
- Reduce manual screening effort
- Provide transparent application status tracking
- Automate follow-ups and reminders
- Enable seamless interview scheduling
- Structured onboarding for selected candidates

## 2. User Flows

### 2.1 Application Initiation Flow
```
App/Website → WhatsApp Link → WhatsApp Chat
```

**Entry Points:**
- App button/link
- Website CTA
- Direct WhatsApp link

**Initial Interaction Options:**
1. General Query
2. Become Club Leader
3. Become Venue Partner

### 2.2 Club Leader Application Flow

#### Stage 1: Form Collection
**Generic Questions (All Applicants):**
- Name
- City
- Contact details
- Preferred activity location

**Activity-Specific Questions:**
- Which activity do you want to start?
- Experience in this activity
- Availability (days/hours)
- Activity-specific qualifications

#### Stage 2: Form Completion Tracking
**Scenario A: Incomplete Form**
- Send reminder after 24 hours
- Send second reminder after 48 hours
- If no response after 72 hours → Mark as "Resolved"
- Final message: "Your application is being closed due to incomplete information. Contact us if you want to reapply."

**Scenario B: Complete Form**
- Automatic notification to screening team
- Status updated to "Under Review"

#### Stage 3: Initial Screening
**Backend Team Actions:**
- Review application
- Mark as "Selected for Interview" or "Rejected"

**Rejected Applicants:**
- Receive rejection message
- Option to ask for feedback: "Know why I was rejected"
- Connects to human agent for explanation

**Selected Applicants:**
- Receive calendar scheduling link
- Status updated to "Interview Scheduled"

#### Stage 4: Interview Scheduling
**Process:**
- Applicant books calendar slot
- System automatically detects booking
- Interview details stored in system
- Confirmation sent to both parties

#### Stage 5: Interview Outcome
**Selected Candidates:**
- Move to onboarding stage
- Status: "Onboarding in Progress"

**Rejected Candidates:**
- Reason marked in backend
- Generic rejection message sent
- Option for feedback conversation

#### Stage 6: Onboarding
**Process:**
- Welcome message with onboarding checklist
- Step-by-step guidance
- Manual support available on request
- Progress tracking in backend

## 3. System Requirements

### 3.1 Core Features

#### WhatsApp Integration
- Webhook handling for incoming messages
- Automated response system
- Message template management
- Media sharing capability

#### Application Management
- Form builder with conditional logic
- Progress tracking dashboard
- Status management system
- Automated reminder system

#### Calendar Integration
- Third-party calendar booking system
- Automatic event detection
- Interview scheduling workflow
- Reminder notifications

#### Backend Dashboard
- Application review interface
- Status management
- Bulk actions capability
- Analytics and reporting

### 3.2 Data Models

#### Applicant Profile
```
- Applicant ID
- Name
- Phone Number
- City
- Application Type (Club Leader/Venue Partner)
- Activity Selected
- Application Status
- Created Date
- Last Updated
- Rejection Reason (if applicable)
```

#### Application Status States
```
1. Form In Progress
2. Form Abandoned
3. Under Review
4. Selected for Interview
5. Interview Scheduled
6. Interview Completed
7. Selected for Onboarding
8. Onboarding in Progress
9. Onboarding Complete
10. Rejected
11. Application Closed
```

#### Form Responses
```
- Response ID
- Applicant ID
- Question ID
- Answer
- Timestamp
```

## 4. User Experience Specifications

### 4.1 Applicant Experience

#### Status Inquiry Capability
**User Query:** "Where is my application?"
**System Response:**
- Identifies user by phone number
- Retrieves current status
- Provides relevant next steps
- Offers human support if needed

#### Transparent Communication
- Clear status messages at each stage
- Expected timelines communicated
- Easy escalation to human support
- Regular progress updates

### 4.2 Backend Team Experience

#### Review Dashboard
- List of pending applications
- Quick accept/reject actions
- Bulk operations
- Search and filter capabilities

#### Communication Tools
- Template message management
- Manual message override
- Escalation handling
- Performance analytics

## 5. Technical Architecture

### 5.1 System Components

#### WhatsApp Business API Integration
- Message webhook handling
- Template message sending
- Media management
- User session management

#### Application Engine
- Form logic processor
- Status state machine
- Reminder scheduler
- Progress tracker

#### Calendar Service
- Third-party integration (Calendly/similar)
- Event detection API
- Booking confirmation system

#### Backend CMS
- Application review interface
- Status management dashboard
- Analytics and reporting
- User management

### 5.2 Integration Points

#### External Systems
- WhatsApp Business API
- Calendar booking platform
- SMS backup system (optional)
- Email notifications (internal)

#### Database Schema
- Applicant management
- Form responses
- Status history
- Communication logs

## 6. Business Rules

### 6.1 Timing Rules
- Reminder 1: 24 hours after form abandonment
- Reminder 2: 48 hours after form abandonment
- Auto-close: 72 hours after last reminder
- Interview scheduling: Within 48 hours of selection
- Onboarding start: Within 24 hours of final selection

### 6.2 Communication Rules
- All messages must have fallback to human support
- Status inquiries get instant automated responses
- Rejection messages include feedback option
- Onboarding messages are progressive and actionable

### 6.3 Data Management
- Application data retained for 1 year
- Communication logs kept for compliance
- Personal data handling per privacy policy
- Backup and recovery procedures

## 7. Success Metrics

### 7.1 Conversion Metrics
- Form completion rate
- Application to interview rate
- Interview to selection rate
- Onboarding completion rate

### 7.2 Operational Metrics
- Average response time
- Manual intervention rate
- Support ticket volume
- User satisfaction scores

### 7.3 Quality Metrics
- Application quality score
- Time to hire
- Early attrition rate
- Feedback sentiment

## 8. Implementation Phases

### Phase 1: Core Application Flow
- WhatsApp integration
- Basic form collection
- Status tracking
- Manual review dashboard

### Phase 2: Automation & Scheduling
- Reminder system
- Calendar integration
- Automated status updates
- Template management

### Phase 3: Advanced Features
- Smart status inquiries
- Advanced analytics
- Bulk operations
- Performance optimization

### Phase 4: Scale & Optimize
- Multi-language support
- Advanced automation
- Predictive analytics
- System optimization

## 9. Risk Mitigation

### 9.1 Technical Risks
- WhatsApp API limitations
- High message volume handling
- System downtime backup plans
- Data sync reliability

### 9.2 Operational Risks
- Manual review bottlenecks
- Communication gaps
- User experience degradation
- Support overload

### 9.3 Compliance Risks
- Data privacy regulations
- WhatsApp policy compliance
- Communication standards
- Audit trail maintenance

## 10. Next Steps

1. **Technical Design:** Detailed system architecture and API specifications
2. **UI/UX Design:** Backend dashboard mockups and user journey maps
3. **Development Planning:** Sprint planning and resource allocation
4. **Integration Planning:** Third-party service evaluation and selection
5. **Testing Strategy:** User acceptance testing and load testing plans