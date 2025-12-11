# DASHO Employee Management System - Complete Project Report
## Part 2: Technical Architecture & Database Schema

**Report Date:** November 5, 2025  
**Project:** DASHO Employee Management System  
**Document:** Part 2 of 6

---

## Table of Contents

1. [Database Architecture](#database-architecture)
2. [Complete Schema Documentation](#complete-schema-documentation)
3. [Data Relationships](#data-relationships)
4. [Indexing Strategy](#indexing-strategy)
5. [Security Measures](#security-measures)

---

## 1. Database Architecture

### 1.1 Database Overview

**Database Management System:** PostgreSQL 8.11.3  
**Database Name:** dasho_db  
**Port:** 5433  
**Connection Pool:** Managed by pg module  
**Total Tables:** 23  
**Total Relationships:** 35+ foreign keys  
**Total Indexes:** 40+

### 1.2 Schema Organization

The database is organized into logical groups:

```
DASHO Database Structure
│
├── Core Tables (5)
│   ├── users (Employee master data)
│   ├── teams (Team organization)
│   ├── units (Organizational units)
│   ├── user_teams (Many-to-many: users ↔ teams)
│   └── user_units (Many-to-many: users ↔ units)
│
├── Scheduling (3)
│   ├── schedules (Shift assignments)
│   ├── requests (Leave/permission requests)
│   └── swaps (Shift swap requests)
│
├── Communication (5)
│   ├── announcements (System announcements)
│   ├── announcement_reads (Read tracking)
│   ├── circulars (Official documents)
│   ├── circular_reads (Read tracking)
│   └── notifications (In-app alerts)
│
├── Events (2)
│   ├── events (Calendar events)
│   └── event_rsvps (Attendance tracking)
│
├── Compliance (2)
│   ├── warnings (Employee warnings)
│   └── tasks (Task assignments)
│
├── Breaks (3)
│   ├── break_templates (Break policies)
│   ├── break_assignments (Scheduled breaks)
│   └── break_logs (Actual time logs)
│
└── Analytics (3)
    ├── quotas (Staffing requirements)
    ├── approval_matrix (Workflow rules)
    └── audit_logs (System audit trail)
```

---

## 2. Complete Schema Documentation

### 2.1 Core Tables

#### Table: `users`
**Purpose:** Central employee database

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | VARCHAR(255) | PRIMARY KEY | Unique employee identifier |
| name | VARCHAR(255) | | Employee full name |
| email | VARCHAR(255) | | Email address |
| mobile | VARCHAR(30) | | Phone number |
| password | TEXT | | Hashed password (bcrypt) |
| is_admin | BOOLEAN | DEFAULT false | Admin flag (deprecated, use role) |
| civil_id | VARCHAR(20) | | National ID number |
| emergency_contact | VARCHAR(30) | | Emergency phone number |
| address | TEXT | | Home address |
| photo_url | TEXT | | Cloudinary photo URL |
| dob | DATE | | Date of birth |
| joining_date | DATE | | Employment start date |
| education | VARCHAR(100) | | Education level |
| graduation_year | INTEGER | | Year of graduation |
| driving_license | BOOLEAN | | Has driving license |
| contract_type | VARCHAR(50) | | Employment contract type |
| job_title | VARCHAR(100) | | Current job title |
| grade | VARCHAR(20) | | Employee grade/level |
| status | VARCHAR(20) | | active/inactive |
| nationality | VARCHAR(50) | | Nationality |
| role | VARCHAR(50) | CHECK(role IN ('staff', 'leader', 'admin')) | Primary role |
| unit | VARCHAR(100) | | Unit name (legacy field) |
| fcm_token | TEXT | | Firebase Cloud Messaging token |

**Indexes:**
- PRIMARY KEY on user_id
- INDEX idx_users_fcm_token on (fcm_token)

**Sample Data:** 188 employees

---

#### Table: `teams`
**Purpose:** Team organization structure

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment team ID |
| name | VARCHAR(255) | NOT NULL, UNIQUE | Team name |
| description | TEXT | | Team description |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

**Indexes:**
- PRIMARY KEY on id
- UNIQUE on name

**Sample Data:** 3 teams

---

#### Table: `units`
**Purpose:** Organizational unit structure

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment unit ID |
| name | VARCHAR(255) | NOT NULL, UNIQUE | Unit name |
| description | TEXT | | Unit description |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

**Indexes:**
- PRIMARY KEY on id
- UNIQUE on name

**Sample Data:** 7 units

---

#### Table: `user_teams`
**Purpose:** Many-to-many relationship between users and teams

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | VARCHAR(255) | NOT NULL, FK → users | Employee ID |
| team_id | INTEGER | NOT NULL, FK → teams | Team ID |
| is_leader | BOOLEAN | DEFAULT false | Is team leader |
| assigned_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Assignment date |

**Constraints:**
- PRIMARY KEY (user_id, team_id)
- FOREIGN KEY user_id → users(user_id) ON DELETE CASCADE
- FOREIGN KEY team_id → teams(id) ON DELETE CASCADE

**Indexes:**
- PRIMARY KEY on (user_id, team_id)
- INDEX idx_user_teams_user_id on (user_id)
- INDEX idx_user_teams_team_id on (team_id)

**Sample Data:** 3 assignments

---

#### Table: `user_units`
**Purpose:** Many-to-many relationship between users and units

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | VARCHAR(255) | NOT NULL, FK → users | Employee ID |
| unit_id | INTEGER | NOT NULL, FK → units | Unit ID |
| assigned_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Assignment date |

**Constraints:**
- PRIMARY KEY (user_id, unit_id)
- FOREIGN KEY user_id → users(user_id) ON DELETE CASCADE
- FOREIGN KEY unit_id → units(id) ON DELETE CASCADE

**Indexes:**
- PRIMARY KEY on (user_id, unit_id)
- INDEX idx_user_units_user_id on (user_id)
- INDEX idx_user_units_unit_id on (unit_id)

**Sample Data:** 4 assignments

---

### 2.2 Scheduling Tables

#### Table: `schedules`
**Purpose:** Employee shift scheduling

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment schedule ID |
| user_id | VARCHAR(255) | FK → users | Employee ID |
| shift_date | DATE | NOT NULL | Date of shift |
| shift_time | VARCHAR(20) | | Shift time (e.g., "08:00-16:00") |
| unit | VARCHAR(100) | | Unit name |
| shift_type | VARCHAR(50) | | Type of shift |
| created_at | TIMESTAMP WITH TIME ZONE | NOT NULL, DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | NOT NULL, DEFAULT NOW() | Last update |

**Constraints:**
- FOREIGN KEY user_id → users(user_id) ON DELETE CASCADE
- UNIQUE (user_id, shift_date)

**Indexes:**
- PRIMARY KEY on id
- INDEX idx_schedules_on_user_and_date on (user_id, shift_date)
- UNIQUE on (user_id, shift_date)

**Sample Data:** 13,694 schedule entries

---

#### Table: `requests`
**Purpose:** Leave and permission requests with dual approval

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment request ID |
| user_id | VARCHAR(255) | FK → users | Requester ID |
| req_type | VARCHAR(50) | | Request type (sick leave, annual leave, etc.) |
| date_from | DATE | | Start date |
| date_to | DATE | | End date |
| time_from | VARCHAR(20) | | Start time (for permissions) |
| time_to | VARCHAR(20) | | End time (for permissions) |
| reason | TEXT | | Request reason |
| status | VARCHAR(20) | DEFAULT 'pending' | pending/approved/rejected |
| approved_by | VARCHAR(255) | | First approver ID |
| approved_by_2 | VARCHAR(255) | | Second approver ID (dual approval) |
| rejection_reason | TEXT | | Reason if rejected |
| req_datetime | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Request submission time |
| attachment_url | TEXT | | Cloudinary URL for attachments |

**Constraints:**
- FOREIGN KEY user_id → users(user_id) ON DELETE CASCADE

**Sample Data:** 6 requests

**Valid Request Types:**
- permission
- swap
- sick leave
- annual leave
- other leave
- emergency leave
- maternity leave

---

#### Table: `swaps`
**Purpose:** Shift swap requests between employees

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment swap ID |
| requester_id | VARCHAR(255) | FK → users | Employee requesting swap |
| target_id | VARCHAR(255) | FK → users | Employee to swap with |
| shift_date | DATE | | Date of shift to swap |
| status | VARCHAR(20) | DEFAULT 'pending' | Request status |
| approved_by_leader | BOOLEAN | DEFAULT false | Leader approval |
| approved_by_admin | BOOLEAN | DEFAULT false | Admin approval (dual approval) |

**Constraints:**
- FOREIGN KEY requester_id → users(user_id) ON DELETE CASCADE
- FOREIGN KEY target_id → users(user_id) ON DELETE CASCADE

**Sample Data:** 0 swaps

---

### 2.3 Communication Tables

#### Table: `announcements`
**Purpose:** System-wide announcements with targeting

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment announcement ID |
| title | VARCHAR(255) | | Announcement title |
| body | TEXT | | Legacy content field |
| created_by | VARCHAR(255) | FK → users | Creator user ID |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation time |
| is_pinned | BOOLEAN | DEFAULT false | Pin to top flag |
| content | TEXT | | Main content (current field) |
| target_role | VARCHAR(50) | DEFAULT 'all' | Target audience (admin/leader/employee/all) |
| is_urgent | BOOLEAN | DEFAULT false | Urgent flag |
| attachment_url | TEXT | | Cloudinary URL for attachments |
| author_id | VARCHAR(255) | | Author user ID |

**Constraints:**
- FOREIGN KEY created_by → users(user_id)

**Indexes:**
- PRIMARY KEY on id
- INDEX idx_announcements_author_id on (author_id)
- INDEX idx_announcements_created_at on (created_at)
- INDEX idx_announcements_is_pinned on (is_pinned)
- INDEX idx_announcements_is_urgent on (is_urgent)
- INDEX idx_announcements_target_role on (target_role)

**Sample Data:** 4 announcements

**Note:** Table has both `body` (legacy) and `content` (current) fields for backward compatibility.

---

#### Table: `announcement_reads`
**Purpose:** Track which users have read which announcements

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment read ID |
| announcement_id | INTEGER | NOT NULL, FK → announcements | Announcement ID |
| user_id | VARCHAR(255) | NOT NULL, FK → users | User who read |
| read_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Time of read |

**Constraints:**
- FOREIGN KEY announcement_id → announcements(id) ON DELETE CASCADE
- FOREIGN KEY user_id → users(user_id) ON DELETE CASCADE
- UNIQUE (announcement_id, user_id)

**Indexes:**
- PRIMARY KEY on id
- UNIQUE on (announcement_id, user_id)
- INDEX idx_announcement_reads_user_id on (user_id)

**Sample Data:** 0 reads

---

#### Table: `circulars`
**Purpose:** Official circulars with document attachments

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment circular ID |
| title | VARCHAR(500) | NOT NULL | Circular title |
| description | TEXT | NOT NULL | Circular description/content |
| document_url | TEXT | | URL to PDF/document |
| created_by | VARCHAR(255) | NOT NULL, FK → users | Creator user ID |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Constraints:**
- FOREIGN KEY created_by → users(user_id)

**Indexes:**
- PRIMARY KEY on id
- INDEX idx_circulars_created_at on (created_at)

**Sample Data:** 1 circular

---

#### Table: `circular_reads`
**Purpose:** Track which users have read which circulars

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| circular_id | INTEGER | NOT NULL, FK → circulars | Circular ID |
| user_id | VARCHAR(255) | NOT NULL, FK → users | User who read |
| read_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Time of read |

**Constraints:**
- PRIMARY KEY (circular_id, user_id)
- FOREIGN KEY circular_id → circulars(id) ON DELETE CASCADE
- FOREIGN KEY user_id → users(user_id) ON DELETE CASCADE

**Indexes:**
- PRIMARY KEY on (circular_id, user_id)
- INDEX idx_circular_reads_user_id on (user_id)

**Sample Data:** 0 reads

---

#### Table: `notifications`
**Purpose:** In-app notification system

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment notification ID |
| user_id | VARCHAR(255) | FK → users | Recipient user ID |
| message | TEXT | | Notification message |
| is_read | BOOLEAN | DEFAULT false | Read status |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation time |
| type | VARCHAR(50) | | Notification type |
| title | VARCHAR(500) | | Notification title |
| related_id | INTEGER | | Related entity ID |
| related_type | VARCHAR(50) | | Related entity type |

**Constraints:**
- FOREIGN KEY user_id → users(user_id) ON DELETE CASCADE

**Sample Data:** 0 notifications

---

### 2.4 Event Tables

#### Table: `events`
**Purpose:** Calendar events and activities

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment event ID |
| user_id | VARCHAR(255) | FK → users | Event owner/creator |
| event_type | VARCHAR(50) | | Type of event |
| event_date | DATE | | Event date |
| details | TEXT | | Event details (legacy) |
| attachment_url | TEXT | | Attachment URL |
| created_by | VARCHAR(255) | FK → users | Creator user ID |
| title | VARCHAR(255) | | Event title |
| description | TEXT | | Event description |
| event_time | TIME | | Event time |
| location | VARCHAR(255) | | Event location |
| category | VARCHAR(50) | | Event category |

**Constraints:**
- FOREIGN KEY user_id → users(user_id) ON DELETE CASCADE
- FOREIGN KEY created_by → users(user_id)

**Sample Data:** 2 events

---

#### Table: `event_rsvps`
**Purpose:** Event attendance tracking

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment RSVP ID |
| event_id | INTEGER | NOT NULL, FK → events | Event ID |
| user_id | VARCHAR(255) | NOT NULL | User ID |
| status | VARCHAR(20) | NOT NULL, CHECK(status IN ('going', 'maybe', 'not_going')) | RSVP status |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | RSVP creation time |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last update |

**Constraints:**
- FOREIGN KEY event_id → events(id) ON DELETE CASCADE
- UNIQUE (event_id, user_id)

**Indexes:**
- PRIMARY KEY on id
- UNIQUE on (event_id, user_id)
- INDEX idx_event_rsvps_event_id on (event_id)
- INDEX idx_event_rsvps_user_id on (user_id)
- INDEX idx_event_rsvps_status on (status)

**Sample Data:** 1 RSVP

---

### 2.5 Compliance Tables

#### Table: `warnings`
**Purpose:** Employee warning and disciplinary actions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment warning ID |
| user_id | VARCHAR(255) | NOT NULL, FK → users | Employee receiving warning |
| kind | VARCHAR(50) | NOT NULL, CHECK(kind IN ('warning', 'draw_attention', 'notice', 'final_warning', 'verbal_warning', 'verbal_notice')) | Warning type |
| date | DATE | NOT NULL, DEFAULT CURRENT_DATE | Warning date |
| details | TEXT | NOT NULL | Warning details/reason |
| attachment | TEXT | | Supporting document URL |
| ack_at | TIMESTAMP | | Acknowledgment timestamp |
| created_by | VARCHAR(255) | NOT NULL, FK → users | Creator user ID |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Constraints:**
- FOREIGN KEY user_id → users(user_id) ON DELETE CASCADE
- FOREIGN KEY created_by → users(user_id)

**Indexes:**
- PRIMARY KEY on id
- INDEX idx_warnings_user_id on (user_id)
- INDEX idx_warnings_date on (date)
- INDEX idx_warnings_kind on (kind)

**Sample Data:** 2 warnings

**Valid Warning Types:**
- warning (General warning)
- draw_attention (Attention required)
- notice (Official notice)
- final_warning (Last warning before action)
- verbal_warning (Verbal warning logged)
- verbal_notice (Verbal notice logged)

---

#### Table: `tasks`
**Purpose:** Task assignment and tracking

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment task ID |
| user_id | VARCHAR(255) | NOT NULL, FK → users | Assigned user |
| title | VARCHAR(500) | NOT NULL | Task title |
| is_done | BOOLEAN | DEFAULT false | Completion status |
| created_by | VARCHAR(255) | FK → users | Task creator |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation time |
| completed_at | TIMESTAMP | | Completion time |

**Constraints:**
- FOREIGN KEY user_id → users(user_id) ON DELETE CASCADE
- FOREIGN KEY created_by → users(user_id)

**Indexes:**
- PRIMARY KEY on id
- INDEX idx_tasks_user_id on (user_id)
- INDEX idx_tasks_is_done on (is_done)

**Sample Data:** 0 tasks

---

### 2.6 Break Management Tables

#### Table: `break_templates`
**Purpose:** Break policy templates by unit and weekday

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment template ID |
| unit_id | INTEGER | NOT NULL, FK → units | Unit ID |
| weekday | INTEGER | NOT NULL, CHECK(weekday BETWEEN 0 AND 6) | Day of week (0=Sunday) |
| start_window | TIME | NOT NULL | Earliest break start time |
| end_window | TIME | NOT NULL | Latest break start time |
| duration_min | INTEGER | NOT NULL | Break duration in minutes |
| min_gap_start | INTEGER | DEFAULT 0 | Minimum gap from shift start (minutes) |
| min_gap_end | INTEGER | DEFAULT 0 | Minimum gap from shift end (minutes) |
| staggering | INTEGER | DEFAULT 15 | Minutes between breaks (stagger interval) |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Constraints:**
- FOREIGN KEY unit_id → units(id) ON DELETE CASCADE

**Indexes:**
- PRIMARY KEY on id
- INDEX idx_break_templates_unit_id on (unit_id)

**Sample Data:** 0 templates

**Usage:** Defines break policies like "Engineering unit gets 15-minute breaks between 10am-2pm on Mondays, staggered by 15 minutes"

---

#### Table: `break_assignments`
**Purpose:** Scheduled break assignments for employees

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment assignment ID |
| user_id | VARCHAR(255) | NOT NULL, FK → users | Assigned employee |
| date | DATE | NOT NULL | Break date |
| template_id | INTEGER | FK → break_templates | Source template |
| planned_start | TIME | NOT NULL | Planned start time |
| planned_end | TIME | NOT NULL | Planned end time |
| status | VARCHAR(20) | DEFAULT 'scheduled' | Assignment status |
| swap_with_user_id | VARCHAR(255) | FK → users | User to swap with (if applicable) |
| swap_approved_by | VARCHAR(255) | FK → users | Swap approver |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Constraints:**
- FOREIGN KEY user_id → users(user_id) ON DELETE CASCADE
- FOREIGN KEY template_id → break_templates(id)
- FOREIGN KEY swap_with_user_id → users(user_id)
- FOREIGN KEY swap_approved_by → users(user_id)

**Indexes:**
- PRIMARY KEY on id
- INDEX idx_break_assignments_user_id on (user_id)
- INDEX idx_break_assignments_date on (date)

**Sample Data:** 0 assignments

---

#### Table: `break_logs`
**Purpose:** Actual break time logging

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment log ID |
| assignment_id | INTEGER | NOT NULL, FK → break_assignments | Assignment ID |
| actual_start | TIMESTAMP | | Actual start time |
| actual_end | TIMESTAMP | | Actual end time |
| variance_min | INTEGER | | Variance from planned (minutes) |
| reason | VARCHAR(100) | | Reason for variance |
| approved_by | VARCHAR(255) | FK → users | Approver if variance exceeds threshold |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Log creation time |

**Constraints:**
- FOREIGN KEY assignment_id → break_assignments(id) ON DELETE CASCADE
- FOREIGN KEY approved_by → users(user_id)

**Indexes:**
- PRIMARY KEY on id
- INDEX idx_break_logs_assignment_id on (assignment_id)

**Sample Data:** 0 logs

---

### 2.7 Analytics Tables

#### Table: `quotas`
**Purpose:** Unit staffing quotas by weekday

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment quota ID |
| unit_id | INTEGER | NOT NULL, FK → units | Unit ID |
| weekday | INTEGER | NOT NULL, CHECK(weekday BETWEEN 0 AND 6) | Day of week |
| target_headcount | INTEGER | NOT NULL | Required staff count |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last update |

**Constraints:**
- FOREIGN KEY unit_id → units(id) ON DELETE CASCADE
- UNIQUE (unit_id, weekday)

**Indexes:**
- PRIMARY KEY on id
- INDEX idx_quotas_unit_id on (unit_id)
- UNIQUE on (unit_id, weekday)

**Sample Data:** 0 quotas

---

#### Table: `approval_matrix`
**Purpose:** Configurable approval workflow rules

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment matrix ID |
| req_type | VARCHAR(255) | NOT NULL | Request type |
| unit_id | INTEGER | FK → units | Unit ID (optional) |
| requires_dual_approval | BOOLEAN | DEFAULT false | Dual approval required |
| first_approver_role | VARCHAR(20) | DEFAULT 'leader' | First approver role |
| second_approver_role | VARCHAR(20) | DEFAULT 'admin' | Second approver role |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Constraints:**
- FOREIGN KEY unit_id → units(id)

**Indexes:**
- PRIMARY KEY on id
- INDEX idx_approval_matrix_req_type on (req_type)

**Sample Data:** 0 rules

---

#### Table: `audit_logs`
**Purpose:** System audit trail

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment log ID |
| user_id | VARCHAR(255) | FK → users | User who performed action |
| action | VARCHAR(100) | NOT NULL | Action performed |
| entity_type | VARCHAR(50) | | Entity type affected |
| entity_id | INTEGER | | Entity ID affected |
| changes | JSONB | | JSON of changes made |
| ip_address | INET | | IP address of request |
| user_agent | TEXT | | Browser/client user agent |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Action timestamp |

**Constraints:**
- FOREIGN KEY user_id → users(user_id)

**Indexes:**
- PRIMARY KEY on id
- INDEX idx_audit_logs_user_id on (user_id)
- INDEX idx_audit_logs_entity_type on (entity_type)
- INDEX idx_audit_logs_created_at on (created_at)

**Sample Data:** 0 logs

---

## 3. Data Relationships

### 3.1 Entity Relationship Diagram (Simplified)

```
┌────────────┐
│   users    │◄────┐
└─────┬──────┘     │
      │            │
      │ 1:N        │ FK
      ▼            │
┌────────────┐     │
│ schedules  │     │
└────────────┘     │
                   │
┌────────────┐     │
│  requests  │─────┘
└────────────┘
      │
      │ 1:N
      ▼
┌────────────┐
│ attachment │
└────────────┘

┌────────────┐      ┌────────────┐
│   teams    │◄─────┤user_teams  │
└────────────┘  N:M └────────────┘
                         │
                         │ FK
                         ▼
                    ┌────────────┐
                    │   users    │
                    └────────────┘
                         │
                         │ FK
                         ▼
                    ┌────────────┐
                    │user_units  │
                    └────────────┘
                         │ N:M
                         ▼
                    ┌────────────┐
                    │   units    │
                    └────────────┘

┌──────────────┐     ┌──────────────────┐
│announcements │◄────┤announcement_reads│
└──────────────┘ 1:N └──────────────────┘
                             │
                             │ FK
                             ▼
                        ┌────────────┐
                        │   users    │
                        └────────────┘

┌────────────┐     ┌─────────────────┐
│ circulars  │◄────┤ circular_reads  │
└────────────┘ 1:N └─────────────────┘

┌────────────┐     ┌────────────────┐
│   events   │◄────┤  event_rsvps   │
└────────────┘ 1:N └────────────────┘

┌─────────────────┐     ┌──────────────────────┐     ┌─────────────┐
│ break_templates │◄────┤ break_assignments    │◄────┤ break_logs  │
└─────────────────┘ 1:N └──────────────────────┘ 1:N └─────────────┘
```

### 3.2 Foreign Key Relationships Summary

| Child Table | Column | Parent Table | Parent Column | On Delete |
|-------------|--------|--------------|---------------|-----------|
| schedules | user_id | users | user_id | CASCADE |
| requests | user_id | users | user_id | CASCADE |
| swaps | requester_id | users | user_id | CASCADE |
| swaps | target_id | users | user_id | CASCADE |
| events | user_id | users | user_id | CASCADE |
| events | created_by | users | user_id | - |
| event_rsvps | event_id | events | id | CASCADE |
| announcements | created_by | users | user_id | - |
| announcement_reads | announcement_id | announcements | id | CASCADE |
| announcement_reads | user_id | users | user_id | CASCADE |
| circulars | created_by | users | user_id | - |
| circular_reads | circular_id | circulars | id | CASCADE |
| circular_reads | user_id | users | user_id | CASCADE |
| notifications | user_id | users | user_id | CASCADE |
| warnings | user_id | users | user_id | CASCADE |
| warnings | created_by | users | user_id | - |
| tasks | user_id | users | user_id | CASCADE |
| tasks | created_by | users | user_id | - |
| user_teams | user_id | users | user_id | CASCADE |
| user_teams | team_id | teams | id | CASCADE |
| user_units | user_id | users | user_id | CASCADE |
| user_units | unit_id | units | id | CASCADE |
| break_templates | unit_id | units | id | CASCADE |
| break_assignments | user_id | users | user_id | CASCADE |
| break_assignments | template_id | break_templates | id | - |
| break_logs | assignment_id | break_assignments | id | CASCADE |
| quotas | unit_id | units | id | CASCADE |
| approval_matrix | unit_id | units | id | - |
| audit_logs | user_id | users | user_id | - |

**Total Foreign Keys:** 35+

---

## 4. Indexing Strategy

### 4.1 Index Types

The database uses three types of indexes:

1. **Primary Key Indexes** (Automatic)
   - Created automatically on PRIMARY KEY columns
   - B-tree indexes
   - Enforces uniqueness

2. **Unique Indexes**
   - Enforces uniqueness on non-primary columns
   - Examples: `teams.name`, `units.name`, `(user_id, shift_date)`

3. **Performance Indexes**
   - Speeds up frequent queries
   - Examples: `fcm_token`, `created_at`, `status` columns

### 4.2 Indexing Decisions

| Index | Table | Reason |
|-------|-------|--------|
| idx_users_fcm_token | users | Push notification queries |
| idx_schedules_on_user_and_date | schedules | Schedule lookups by user and date |
| idx_announcements_created_at | announcements | Chronological sorting |
| idx_announcements_is_urgent | announcements | Urgent announcement filtering |
| idx_announcements_target_role | announcements | Role-based filtering |
| idx_warnings_kind | warnings | Warning type filtering |
| idx_warnings_date | warnings | Date range queries |
| idx_break_assignments_user_id | break_assignments | User break lookups |
| idx_break_assignments_date | break_assignments | Date-based queries |
| idx_event_rsvps_status | event_rsvps | RSVP status filtering |

### 4.3 Composite Indexes

Composite indexes for multi-column queries:

1. `(user_id, shift_date)` on schedules - Most common query pattern
2. `(announcement_id, user_id)` on announcement_reads - Unique read tracking
3. `(circular_id, user_id)` on circular_reads - Unique read tracking
4. `(event_id, user_id)` on event_rsvps - Unique RSVP tracking
5. `(unit_id, weekday)` on quotas - Unique quota definition

---

## 5. Security Measures

### 5.1 Database-Level Security

1. **Foreign Key Constraints**
   - Referential integrity enforced
   - CASCADE deletes where appropriate
   - Prevents orphaned records

2. **CHECK Constraints**
   - `users.role` IN ('staff', 'leader', 'admin')
   - `warnings.kind` IN (6 specific values)
   - `event_rsvps.status` IN ('going', 'maybe', 'not_going')
   - `break_templates.weekday` BETWEEN 0 AND 6
   - `quotas.weekday` BETWEEN 0 AND 6

3. **Unique Constraints**
   - Prevents duplicate team/unit names
   - Prevents duplicate schedule entries (user + date)
   - Prevents duplicate read tracking
   - Prevents duplicate RSVP entries

4. **NOT NULL Constraints**
   - Critical fields cannot be null
   - Ensures data completeness

### 5.2 Application-Level Security

1. **Password Security**
   - bcrypt hashing (10 rounds)
   - Never store plaintext passwords
   - Server-side validation only

2. **JWT Authentication**
   - Secure token generation
   - Token includes: user_id, role, name
   - Token verification on every request

3. **Role-Based Access Control (RBAC)**
   - Three-tier authorization (Admin > Leader > Staff)
   - Middleware enforcement
   - Granular permissions per endpoint

4. **Input Validation**
   - Server-side validation on all inputs
   - SQL injection prevention (parameterized queries)
   - File upload validation

5. **Rate Limiting**
   - Password reset: 3 attempts per 15 minutes
   - Auth endpoints: 10 attempts per 15 minutes
   - Prevents brute force attacks

---

## 6. Data Integrity

### 6.1 Referential Integrity

- All foreign keys properly configured
- CASCADE deletes prevent orphaned records
- Circular references avoided

### 6.2 Data Validation

- CHECK constraints for enumerated values
- Length constraints on VARCHAR fields
- Date validation in application layer
- Email format validation
- Password strength requirements

### 6.3 Audit Trail

- `created_at` timestamps on all tables
- `updated_at` where applicable
- `audit_logs` table for critical actions
- User actions tracked with `created_by` fields

---

**Continue to Part 3:** API Endpoints & Features

