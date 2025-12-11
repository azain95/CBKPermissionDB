-- ============================================================================
-- DASHO DATABASE SCHEMA - PRODUCTION
-- Database: dasho_db
-- Last Updated: 2025-11-05
-- Description: Complete production schema for DASHO employee management system
-- Total Tables: 23
-- ============================================================================

-- ============================================================================
-- 1. USERS TABLE (Core employee data)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255),
    mobile VARCHAR(30),
    password TEXT,
    is_admin BOOLEAN DEFAULT false,
    civil_id VARCHAR(20),
    emergency_contact VARCHAR(30),
    address TEXT,
    photo_url TEXT,
    dob DATE,
    joining_date DATE,
    education VARCHAR(100),
    graduation_year INTEGER,
    driving_license BOOLEAN,
    contract_type VARCHAR(50),
    job_title VARCHAR(100),
    grade VARCHAR(20),
    status VARCHAR(20),
    nationality VARCHAR(50),
    role VARCHAR(50) CHECK (role IN ('staff', 'leader', 'admin')),
    unit VARCHAR(100),
    fcm_token TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_fcm_token ON users(fcm_token);

-- ============================================================================
-- 2. TEAMS TABLE (Team organization)
-- ============================================================================
CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 3. UNITS TABLE (Organizational units)
-- ============================================================================
CREATE TABLE IF NOT EXISTS units (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 4. USER_TEAMS TABLE (User-team assignments)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_teams (
    user_id VARCHAR(255) NOT NULL,
    team_id INTEGER NOT NULL,
    is_leader BOOLEAN DEFAULT false,
    assigned_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, team_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_teams_user_id ON user_teams(user_id);
CREATE INDEX IF NOT EXISTS idx_user_teams_team_id ON user_teams(team_id);

-- ============================================================================
-- 5. USER_UNITS TABLE (User-unit assignments)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_units (
    user_id VARCHAR(255) NOT NULL,
    unit_id INTEGER NOT NULL,
    assigned_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, unit_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_units_user_id ON user_units(user_id);
CREATE INDEX IF NOT EXISTS idx_user_units_unit_id ON user_units(unit_id);

-- ============================================================================
-- 6. SCHEDULES TABLE (Shift scheduling)
-- ============================================================================
CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    shift_date DATE NOT NULL,
    shift_time VARCHAR(20),
    unit VARCHAR(100),
    shift_type VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE (user_id, shift_date)
);

CREATE INDEX IF NOT EXISTS idx_schedules_on_user_and_date ON schedules(user_id, shift_date);

-- ============================================================================
-- 7. REQUESTS TABLE (Leave/Permission requests with dual approval)
-- ============================================================================
CREATE TABLE IF NOT EXISTS requests (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    req_type VARCHAR(50),
    date_from DATE,
    date_to DATE,
    time_from VARCHAR(20),
    time_to VARCHAR(20),
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    approved_by VARCHAR(255),
    approved_by_2 VARCHAR(255),
    rejection_reason TEXT,
    req_datetime TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    attachment_url TEXT,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ============================================================================
-- 8. SWAPS TABLE (Shift swap requests between employees)
-- ============================================================================
CREATE TABLE IF NOT EXISTS swaps (
    id SERIAL PRIMARY KEY,
    requester_id VARCHAR(255),
    target_id VARCHAR(255),
    shift_date DATE,
    status VARCHAR(20) DEFAULT 'pending',
    approved_by_leader BOOLEAN DEFAULT false,
    approved_by_admin BOOLEAN DEFAULT false,
    FOREIGN KEY (requester_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ============================================================================
-- 9. EVENTS TABLE (Calendar events)
-- ============================================================================
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    event_type VARCHAR(50),
    event_date DATE,
    details TEXT,
    attachment_url TEXT,
    created_by VARCHAR(255),
    title VARCHAR(255),
    description TEXT,
    event_time TIME WITHOUT TIME ZONE,
    location VARCHAR(255),
    category VARCHAR(50),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(user_id)
);

-- ============================================================================
-- 10. EVENT_RSVPS TABLE (Event attendance tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_rsvps (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('going', 'maybe', 'not_going')),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_event_id ON event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_user_id ON event_rsvps(user_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_status ON event_rsvps(status);

-- ============================================================================
-- 11. NOTIFICATIONS TABLE (In-app notifications)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    type VARCHAR(50),
    title VARCHAR(500),
    related_id INTEGER,
    related_type VARCHAR(50),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ============================================================================
-- 12. ANNOUNCEMENTS TABLE (System-wide announcements)
-- ============================================================================
CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    body TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_pinned BOOLEAN DEFAULT false,
    content TEXT,
    target_role VARCHAR(50) DEFAULT 'all',
    is_urgent BOOLEAN DEFAULT false,
    attachment_url TEXT,
    author_id VARCHAR(255),
    FOREIGN KEY (created_by) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcements_author_id ON announcements(author_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at);
CREATE INDEX IF NOT EXISTS idx_announcements_is_pinned ON announcements(is_pinned);
CREATE INDEX IF NOT EXISTS idx_announcements_is_urgent ON announcements(is_urgent);
CREATE INDEX IF NOT EXISTS idx_announcements_target_role ON announcements(target_role);

-- ============================================================================
-- 13. ANNOUNCEMENT_READS TABLE (Tracking who read announcements)
-- ============================================================================
CREATE TABLE IF NOT EXISTS announcement_reads (
    id SERIAL PRIMARY KEY,
    announcement_id INTEGER NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    read_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_reads_user_id ON announcement_reads(user_id);

-- ============================================================================
-- 14. CIRCULARS TABLE (Official circulars)
-- ============================================================================
CREATE TABLE IF NOT EXISTS circulars (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    document_url TEXT,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_circulars_created_at ON circulars(created_at);

-- ============================================================================
-- 15. CIRCULAR_READS TABLE (Tracking circular reads)
-- ============================================================================
CREATE TABLE IF NOT EXISTS circular_reads (
    circular_id INTEGER NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    read_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (circular_id, user_id),
    FOREIGN KEY (circular_id) REFERENCES circulars(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_circular_reads_user_id ON circular_reads(user_id);

-- ============================================================================
-- 16. WARNINGS TABLE (Employee warnings)
-- ============================================================================
CREATE TABLE IF NOT EXISTS warnings (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    kind VARCHAR(50) NOT NULL CHECK (kind IN ('warning', 'draw_attention', 'notice', 'final_warning', 'verbal_warning', 'verbal_notice')),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    details TEXT NOT NULL,
    attachment TEXT,
    ack_at TIMESTAMP WITHOUT TIME ZONE,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_warnings_user_id ON warnings(user_id);
CREATE INDEX IF NOT EXISTS idx_warnings_date ON warnings(date);
CREATE INDEX IF NOT EXISTS idx_warnings_kind ON warnings(kind);

-- ============================================================================
-- 17. TASKS TABLE (Task management)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    is_done BOOLEAN DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITHOUT TIME ZONE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_is_done ON tasks(is_done);

-- ============================================================================
-- 18. BREAK_TEMPLATES TABLE (Break policies)
-- ============================================================================
CREATE TABLE IF NOT EXISTS break_templates (
    id SERIAL PRIMARY KEY,
    unit_id INTEGER NOT NULL,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_window TIME WITHOUT TIME ZONE NOT NULL,
    end_window TIME WITHOUT TIME ZONE NOT NULL,
    duration_min INTEGER NOT NULL,
    min_gap_start INTEGER DEFAULT 0,
    min_gap_end INTEGER DEFAULT 0,
    staggering INTEGER DEFAULT 15,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_break_templates_unit_id ON break_templates(unit_id);

-- ============================================================================
-- 19. BREAK_ASSIGNMENTS TABLE (Scheduled breaks)
-- ============================================================================
CREATE TABLE IF NOT EXISTS break_assignments (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    template_id INTEGER,
    planned_start TIME WITHOUT TIME ZONE NOT NULL,
    planned_end TIME WITHOUT TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'scheduled',
    swap_with_user_id VARCHAR(255),
    swap_approved_by VARCHAR(255),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES break_templates(id),
    FOREIGN KEY (swap_with_user_id) REFERENCES users(user_id),
    FOREIGN KEY (swap_approved_by) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_break_assignments_user_id ON break_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_break_assignments_date ON break_assignments(date);

-- ============================================================================
-- 20. BREAK_LOGS TABLE (Actual break times)
-- ============================================================================
CREATE TABLE IF NOT EXISTS break_logs (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL,
    actual_start TIMESTAMP WITHOUT TIME ZONE,
    actual_end TIMESTAMP WITHOUT TIME ZONE,
    variance_min INTEGER,
    reason VARCHAR(100),
    approved_by VARCHAR(255),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assignment_id) REFERENCES break_assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_break_logs_assignment_id ON break_logs(assignment_id);

-- ============================================================================
-- 21. QUOTAS TABLE (Unit staffing quotas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS quotas (
    id SERIAL PRIMARY KEY,
    unit_id INTEGER NOT NULL,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    target_headcount INTEGER NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
    UNIQUE (unit_id, weekday)
);

CREATE INDEX IF NOT EXISTS idx_quotas_unit_id ON quotas(unit_id);

-- ============================================================================
-- 22. APPROVAL_MATRIX TABLE (Approval workflows)
-- ============================================================================
CREATE TABLE IF NOT EXISTS approval_matrix (
    id SERIAL PRIMARY KEY,
    req_type VARCHAR(255) NOT NULL,
    unit_id INTEGER,
    requires_dual_approval BOOLEAN DEFAULT false,
    first_approver_role VARCHAR(20) DEFAULT 'leader',
    second_approver_role VARCHAR(20) DEFAULT 'admin',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (unit_id) REFERENCES units(id)
);

CREATE INDEX IF NOT EXISTS idx_approval_matrix_req_type ON approval_matrix(req_type);

-- ============================================================================
-- 23. AUDIT_LOGS TABLE (System audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================================
-- SCHEMA INFORMATION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '✅ DASHO Database Schema Applied Successfully';
    RAISE NOTICE '📊 Total Tables: 23';
    RAISE NOTICE '👥 Core: users, teams, units, user_teams, user_units';
    RAISE NOTICE '📅 Scheduling: schedules, requests, swaps';
    RAISE NOTICE '📢 Communication: announcements, announcement_reads, circulars, circular_reads, notifications';
    RAISE NOTICE '📆 Events: events, event_rsvps';
    RAISE NOTICE '⚠️  Compliance: warnings, tasks';
    RAISE NOTICE '☕ Breaks: break_templates, break_assignments, break_logs';
    RAISE NOTICE '📊 Analytics: quotas, approval_matrix, audit_logs';
    RAISE NOTICE '🔔 Push Notifications: fcm_token column in users table';
END $$;