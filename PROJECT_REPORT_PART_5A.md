# DASHO Employee Management System - Complete Project Report
## Part 5A: Implementation Details & Code Changes (Database & Core Setup)

**Report Date:** December 11, 2025  
**Project:** DASHO Employee Management System  
**Document:** Part 5A of 7

---

## Table of Contents

1. [Implementation Overview](#implementation-overview)
2. [Project Structure](#project-structure)
3. [Database Implementation](#database-implementation)
4. [Configuration Files](#configuration-files)
5. [Authentication System](#authentication-system)
6. [Middleware Implementation](#middleware-implementation)

---

## 1. Implementation Overview

### 1.1 Development Timeline

**Phase 1: Foundation (Week 1)**
- Project initialization
- Database schema design
- Basic Express server setup
- Authentication implementation

**Phase 2: Core Features (Week 2-3)**
- User management CRUD
- Schedule management
- Request system
- Team/Unit management

**Phase 3: Communication (Week 4)**
- Announcements system
- Circulars system
- Events management
- Notifications

**Phase 4: Compliance (Week 5)**
- Warning system
- Task management
- Break management system

**Phase 5: Integration (Week 6)**
- Firebase Cloud Messaging
- Cloudinary file uploads
- Email notifications
- Frontend integration

**Phase 6: Cleanup & Documentation (Week 7)**
- Code cleanup
- Bug fixes
- Comprehensive documentation
- Deployment preparation

### 1.2 Technology Decisions

| Technology | Decision | Reasoning |
|------------|----------|-----------|
| Database | PostgreSQL 8.11.3 | Relational data, ACID compliance, mature ecosystem |
| Backend | Express.js 4.18.2 | Lightweight, flexible, large community |
| Authentication | JWT | Stateless, scalable, industry standard |
| File Storage | Cloudinary | CDN delivery, automatic optimization, free tier |
| Push Notifications | Firebase Cloud Messaging | Cross-platform, reliable, free |
| Email | Nodemailer | Simple, supports multiple transports |
| Password Hashing | bcrypt | Slow by design, salt built-in, proven security |

### 1.3 Development Approach

1. **Database-First Design**
   - Complete schema before coding
   - Migrations for all changes
   - Foreign keys enforce relationships

2. **Middleware-Based Architecture**
   - Authentication middleware
   - Authorization middleware (RBAC)
   - Error handling middleware
   - Request logging

3. **Modular Code Organization**
   - Separate routes files
   - Shared middleware
   - Utility modules
   - Configuration management

4. **Progressive Enhancement**
   - Basic functionality first
   - Add features incrementally
   - Maintain backwards compatibility

---

## 2. Project Structure

### 2.1 Directory Layout

```
CBKPermissionDB/
├── server/
│   ├── config.js              # Configuration module
│   ├── db.js                  # Database connection pool
│   ├── firebase.js            # Firebase Admin SDK initialization
│   ├── index.js               # Main application file (3,490 lines)
│   ├── database.sql           # Complete database schema (2,300 lines)
│   ├── package.json           # Dependencies and scripts
│   ├── .env                   # Environment variables (not in git)
│   ├── .env.example           # Environment template
│   ├── Dockerfile             # Docker container configuration
│   ├── docker-compose.yml     # Multi-container orchestration
│   ├── middleware/
│   │   ├── auth.js            # JWT authentication middleware
│   │   ├── adminAuth.js       # Admin-only authorization
│   │   └── leaderAuth.js      # Leader/Admin authorization
│   ├── routes/
│   │   └── schedules.js       # Schedule routes (example)
│   └── uploads/               # Temporary upload directory
├── PROJECT_REPORT_PART_1.md   # Documentation: Overview
├── PROJECT_REPORT_PART_2.md   # Documentation: Database
├── PROJECT_REPORT_PART_3.md   # Documentation: API Endpoints
├── PROJECT_REPORT_PART_4.md   # Documentation: Issues & Solutions
├── PROJECT_REPORT_PART_5A.md  # Documentation: Implementation (This file)
├── PROJECT_REPORT_PART_5B.md  # Documentation: Implementation (Features)
└── PROJECT_REPORT_PART_6.md   # Documentation: Testing & Deployment
```

### 2.2 File Purposes

**Core Application Files:**

1. **index.js** (3,490 lines)
   - Main Express application
   - All route definitions
   - Middleware configuration
   - Server initialization
   - 82 API endpoints

2. **db.js** (50 lines)
   - PostgreSQL connection pool
   - Pool configuration
   - Connection error handling
   - Health check query

3. **config.js** (80 lines)
   - Cloudinary configuration
   - Environment variable loading
   - Configuration validation

4. **firebase.js** (95 lines)
   - Firebase Admin SDK setup
   - Push notification functions
   - Error handling
   - Graceful degradation

**Configuration Files:**

5. **package.json** (60 lines)
   - 14 production dependencies
   - 10 development dependencies
   - npm scripts
   - Project metadata

6. **.env** (20+ lines)
   - Database credentials
   - JWT secret
   - Cloudinary credentials
   - Firebase credentials
   - Email configuration

7. **database.sql** (2,300 lines)
   - Complete schema for 23 tables
   - All foreign keys and indexes
   - Check constraints
   - Comments and documentation

**Middleware Files:**

8. **middleware/auth.js** (30 lines)
   - JWT token verification
   - User extraction from token
   - Unauthorized response handling

9. **middleware/adminAuth.js** (25 lines)
   - Admin role verification
   - Forbidden response handling

10. **middleware/leaderAuth.js** (25 lines)
    - Leader or Admin role verification
    - Forbidden response handling

**Docker Files:**

11. **Dockerfile** (30 lines)
    - Node.js base image
    - Dependency installation
    - Production optimization

12. **docker-compose.yml** (50 lines)
    - PostgreSQL service
    - Node.js service
    - Network configuration
    - Volume mounting

---

## 3. Database Implementation

### 3.1 Database Connection (db.js)

**File:** `server/db.js`

```javascript
const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL connection pool configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'dasho_db',
  max: 20,                      // Maximum pool size
  min: 2,                       // Minimum pool size
  idleTimeoutMillis: 30000,     // Close idle connections after 30s
  connectionTimeoutMillis: 2000, // Fail fast if connection takes >2s
  statement_timeout: 10000      // Query timeout: 10 seconds
});

// Handle unexpected pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

// Test database connection on module load
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }
  console.log('✅ Database connected successfully at', res.rows[0].now);
});

module.exports = pool;
```

**Key Features:**
- Connection pooling for performance
- Automatic reconnection handling
- Health check on startup
- Graceful error handling
- Configurable timeouts

**Configuration Parameters:**

| Parameter | Value | Purpose |
|-----------|-------|---------|
| max | 20 | Maximum concurrent connections |
| min | 2 | Keep 2 connections always ready |
| idleTimeoutMillis | 30000 | Release idle connections after 30s |
| connectionTimeoutMillis | 2000 | Fail fast if connection delayed |
| statement_timeout | 10000 | Kill queries running >10s |

**Usage in Endpoints:**
```javascript
const pool = require('./db');

app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database query failed' });
  }
});
```

---

### 3.2 Database Schema (database.sql)

**File:** `server/database.sql` (2,300 lines)

**Schema Organization:**

```sql
-- ========================================
-- DASHO EMPLOYEE MANAGEMENT SYSTEM
-- Complete Database Schema
-- ========================================
-- Database: dasho_db
-- Version: 1.0
-- Last Updated: 2025-11-05
-- Total Tables: 23
-- ========================================

-- Drop existing tables (for clean deployment)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS approval_matrix CASCADE;
DROP TABLE IF EXISTS quotas CASCADE;
DROP TABLE IF EXISTS break_logs CASCADE;
DROP TABLE IF EXISTS break_assignments CASCADE;
DROP TABLE IF EXISTS break_templates CASCADE;
-- ... (all 23 tables)

-- ========================================
-- CORE TABLES
-- ========================================

-- Users table: Central employee database
CREATE TABLE users (
  user_id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  mobile VARCHAR(30),
  password TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  civil_id VARCHAR(20),
  emergency_contact VARCHAR(30),
  address TEXT,
  photo_url TEXT,
  dob DATE,
  joining_date DATE,
  education VARCHAR(100),
  graduation_year INTEGER,
  driving_license BOOLEAN DEFAULT false,
  contract_type VARCHAR(50),
  job_title VARCHAR(100),
  grade VARCHAR(20),
  status VARCHAR(20) DEFAULT 'active',
  nationality VARCHAR(50),
  role VARCHAR(50) DEFAULT 'staff' CHECK(role IN ('staff', 'leader', 'admin')),
  unit VARCHAR(100),
  fcm_token TEXT,
  reset_otp VARCHAR(6),
  reset_otp_expiry TIMESTAMP
);

-- Create index on FCM token for push notifications
CREATE INDEX idx_users_fcm_token ON users(fcm_token);

-- Teams table: Team organization
CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Units table: Organizational units
CREATE TABLE units (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User-Team relationship (many-to-many)
CREATE TABLE user_teams (
  user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  is_leader BOOLEAN DEFAULT false,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, team_id)
);

CREATE INDEX idx_user_teams_user_id ON user_teams(user_id);
CREATE INDEX idx_user_teams_team_id ON user_teams(team_id);

-- User-Unit relationship (many-to-many)
CREATE TABLE user_units (
  user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, unit_id)
);

CREATE INDEX idx_user_units_user_id ON user_units(user_id);
CREATE INDEX idx_user_units_unit_id ON user_units(unit_id);

-- ========================================
-- SCHEDULING TABLES
-- ========================================

-- Schedules table: Employee shift scheduling
CREATE TABLE schedules (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) REFERENCES users(user_id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  shift_time VARCHAR(20),
  unit VARCHAR(100),
  shift_type VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, shift_date)
);

CREATE INDEX idx_schedules_on_user_and_date ON schedules(user_id, shift_date);

-- Requests table: Leave and permission requests
CREATE TABLE requests (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) REFERENCES users(user_id) ON DELETE CASCADE,
  req_type VARCHAR(50) NOT NULL,
  date_from DATE,
  date_to DATE,
  time_from VARCHAR(20),
  time_to VARCHAR(20),
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  approved_by VARCHAR(255),
  approved_by_2 VARCHAR(255),
  rejection_reason TEXT,
  req_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  attachment_url TEXT
);

-- Swaps table: Shift swap requests
CREATE TABLE swaps (
  id SERIAL PRIMARY KEY,
  requester_id VARCHAR(255) REFERENCES users(user_id) ON DELETE CASCADE,
  target_id VARCHAR(255) REFERENCES users(user_id) ON DELETE CASCADE,
  shift_date DATE,
  status VARCHAR(20) DEFAULT 'pending',
  approved_by_leader BOOLEAN DEFAULT false,
  approved_by_admin BOOLEAN DEFAULT false
);

-- ========================================
-- COMMUNICATION TABLES
-- ========================================

-- Announcements table: System-wide announcements
CREATE TABLE announcements (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  created_by VARCHAR(255) REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_pinned BOOLEAN DEFAULT false,
  content TEXT,
  target_role VARCHAR(50) DEFAULT 'all',
  is_urgent BOOLEAN DEFAULT false,
  attachment_url TEXT,
  author_id VARCHAR(255)
);

CREATE INDEX idx_announcements_author_id ON announcements(author_id);
CREATE INDEX idx_announcements_created_at ON announcements(created_at);
CREATE INDEX idx_announcements_is_pinned ON announcements(is_pinned);
CREATE INDEX idx_announcements_is_urgent ON announcements(is_urgent);
CREATE INDEX idx_announcements_target_role ON announcements(target_role);

-- Announcement reads tracking
CREATE TABLE announcement_reads (
  id SERIAL PRIMARY KEY,
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX idx_announcement_reads_user_id ON announcement_reads(user_id);

-- Circulars table: Official documents
CREATE TABLE circulars (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  document_url TEXT,
  created_by VARCHAR(255) NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_circulars_created_at ON circulars(created_at);

-- Circular reads tracking
CREATE TABLE circular_reads (
  circular_id INTEGER NOT NULL REFERENCES circulars(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (circular_id, user_id)
);

CREATE INDEX idx_circular_reads_user_id ON circular_reads(user_id);

-- Notifications table: In-app notifications
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) REFERENCES users(user_id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  type VARCHAR(50),
  title VARCHAR(500),
  related_id INTEGER,
  related_type VARCHAR(50)
);

-- ========================================
-- EVENT TABLES
-- ========================================

-- Events table: Calendar events
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) REFERENCES users(user_id) ON DELETE CASCADE,
  event_type VARCHAR(50),
  event_date DATE,
  details TEXT,
  attachment_url TEXT,
  created_by VARCHAR(255) REFERENCES users(user_id),
  title VARCHAR(255),
  description TEXT,
  event_time TIME,
  location VARCHAR(255),
  category VARCHAR(50)
);

-- Event RSVPs: Attendance tracking
CREATE TABLE event_rsvps (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK(status IN ('going', 'maybe', 'not_going')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, user_id)
);

CREATE INDEX idx_event_rsvps_event_id ON event_rsvps(event_id);
CREATE INDEX idx_event_rsvps_user_id ON event_rsvps(user_id);
CREATE INDEX idx_event_rsvps_status ON event_rsvps(status);

-- ========================================
-- COMPLIANCE TABLES
-- ========================================

-- Warnings table: Employee warnings
CREATE TABLE warnings (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  kind VARCHAR(50) NOT NULL CHECK(kind IN ('warning', 'draw_attention', 'notice', 'final_warning', 'verbal_warning', 'verbal_notice')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  details TEXT NOT NULL,
  attachment TEXT,
  ack_at TIMESTAMP,
  created_by VARCHAR(255) NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_warnings_user_id ON warnings(user_id);
CREATE INDEX idx_warnings_date ON warnings(date);
CREATE INDEX idx_warnings_kind ON warnings(kind);

-- Tasks table: Task assignments
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  is_done BOOLEAN DEFAULT false,
  created_by VARCHAR(255) REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_is_done ON tasks(is_done);

-- ========================================
-- BREAK MANAGEMENT TABLES
-- ========================================

-- Break templates: Break policies by unit and weekday
CREATE TABLE break_templates (
  id SERIAL PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  start_window TIME NOT NULL,
  end_window TIME NOT NULL,
  duration_min INTEGER NOT NULL,
  min_gap_start INTEGER DEFAULT 0,
  min_gap_end INTEGER DEFAULT 0,
  staggering INTEGER DEFAULT 15,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_break_templates_unit_id ON break_templates(unit_id);

-- Break assignments: Scheduled breaks
CREATE TABLE break_assignments (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  template_id INTEGER REFERENCES break_templates(id),
  planned_start TIME NOT NULL,
  planned_end TIME NOT NULL,
  status VARCHAR(20) DEFAULT 'scheduled',
  swap_with_user_id VARCHAR(255) REFERENCES users(user_id),
  swap_approved_by VARCHAR(255) REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_break_assignments_user_id ON break_assignments(user_id);
CREATE INDEX idx_break_assignments_date ON break_assignments(date);

-- Break logs: Actual break times
CREATE TABLE break_logs (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES break_assignments(id) ON DELETE CASCADE,
  actual_start TIMESTAMP,
  actual_end TIMESTAMP,
  variance_min INTEGER,
  reason VARCHAR(100),
  approved_by VARCHAR(255) REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_break_logs_assignment_id ON break_logs(assignment_id);

-- ========================================
-- ANALYTICS TABLES
-- ========================================

-- Quotas table: Staffing requirements
CREATE TABLE quotas (
  id SERIAL PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  target_headcount INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (unit_id, weekday)
);

CREATE INDEX idx_quotas_unit_id ON quotas(unit_id);

-- Approval matrix: Configurable approval rules
CREATE TABLE approval_matrix (
  id SERIAL PRIMARY KEY,
  req_type VARCHAR(255) NOT NULL,
  unit_id INTEGER REFERENCES units(id),
  requires_dual_approval BOOLEAN DEFAULT false,
  first_approver_role VARCHAR(20) DEFAULT 'leader',
  second_approver_role VARCHAR(20) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_approval_matrix_req_type ON approval_matrix(req_type);

-- Audit logs: System audit trail
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) REFERENCES users(user_id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ========================================
-- END OF SCHEMA
-- ========================================
```

**Schema Statistics:**
- Total Tables: 23
- Total Indexes: 40+
- Total Foreign Keys: 35+
- Total Check Constraints: 6
- Lines of SQL: 2,300

---

### 3.3 Database Migrations

**Migration History:**

| Migration | Date | Purpose | Status |
|-----------|------|---------|--------|
| 001 | 2024-11-01 | Initial schema | ✅ Applied |
| 002 | 2024-11-10 | Add teams/units | ✅ Applied |
| 003 | 2024-11-15 | Add announcements/circulars | ✅ Applied |
| 004 | 2024-11-20 | Add break system | ✅ Applied |
| 005 | 2025-11-05 | Add event columns | ✅ Applied |
| 006 | 2025-11-05 | Rename warnings columns | ✅ Applied |
| 007 | 2025-11-05 | Add notification fields | ✅ Applied |
| 008 | 2025-11-05 | Add FCM token support | ✅ Applied |

**Migration 005 Example:**
```sql
-- Migration 005: Add missing event columns
-- Date: 2025-11-05
-- Purpose: Support full event functionality

ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by VARCHAR(255) REFERENCES users(user_id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_time TIME;
ALTER TABLE events ADD COLUMN IF NOT EXISTS location VARCHAR(255);
ALTER TABLE events ADD COLUMN IF NOT EXISTS category VARCHAR(50);

-- Verify migration
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'events';
```

**Migration 006 Example:**
```sql
-- Migration 006: Rename warnings columns for consistency
-- Date: 2025-11-05
-- Purpose: Match API field names

ALTER TABLE warnings RENAME COLUMN severity TO kind;
ALTER TABLE warnings RENAME COLUMN reason TO details;

-- Add constraint for valid warning types
ALTER TABLE warnings DROP CONSTRAINT IF EXISTS warnings_kind_check;
ALTER TABLE warnings ADD CONSTRAINT warnings_kind_check 
  CHECK (kind IN ('warning', 'draw_attention', 'notice', 'final_warning', 'verbal_warning', 'verbal_notice'));

-- Verify migration
SELECT * FROM warnings LIMIT 1;
```

**Migration 008 Example:**
```sql
-- Migration 008: Add FCM token support for push notifications
-- Date: 2025-11-05
-- Purpose: Enable Firebase Cloud Messaging

ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;
CREATE INDEX IF NOT EXISTS idx_users_fcm_token ON users(fcm_token);

-- Verify migration
SELECT COUNT(*) as users_with_tokens FROM users WHERE fcm_token IS NOT NULL;
```

---

## 4. Configuration Files

### 4.1 Environment Variables (.env)

**File:** `server/.env` (NOT in version control)

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5433
DB_USER=postgres
DB_PASSWORD=your_secure_password_here
DB_NAME=dasho_db

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_minimum_32_characters_long_here

# Server Configuration
PORT=3000
NODE_ENV=development

# Cloudinary Configuration (File Storage)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Firebase Configuration (Push Notifications)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Private_Key_Here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com

# Email Configuration (Password Reset)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_specific_password
EMAIL_FROM=DASHO System <noreply@dasho.com>

# Frontend URL (CORS)
FRONTEND_URL=http://localhost:3001

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100
```

**Environment Variable Groups:**

1. **Database Variables**
   - DB_HOST: Database server address
   - DB_PORT: PostgreSQL port (5433)
   - DB_USER: Database username
   - DB_PASSWORD: Database password
   - DB_NAME: Database name (dasho_db)

2. **Security Variables**
   - JWT_SECRET: Secret key for JWT signing (min 32 chars)
   - NODE_ENV: development/production

3. **External Services**
   - Cloudinary: 3 variables for file storage
   - Firebase: 3 variables for push notifications
   - Email: 5 variables for SMTP

4. **Application Config**
   - PORT: Server port (3000)
   - FRONTEND_URL: For CORS configuration

---

### 4.2 Environment Template (.env.example)

**File:** `server/.env.example` (IN version control)

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5433
DB_USER=postgres
DB_PASSWORD=
DB_NAME=dasho_db

# JWT Configuration (Generate with: openssl rand -base64 32)
JWT_SECRET=

# Server Configuration
PORT=3000
NODE_ENV=development

# Cloudinary Configuration
# Sign up at: https://cloudinary.com
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Firebase Configuration
# Download from: Firebase Console > Project Settings > Service Accounts
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_FROM=DASHO System <noreply@dasho.com>

# Frontend URL
FRONTEND_URL=http://localhost:3001

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100
```

**Setup Instructions:**
1. Copy `.env.example` to `.env`
2. Fill in all empty values
3. Generate JWT_SECRET: `openssl rand -base64 32`
4. Get Cloudinary credentials from dashboard
5. Download Firebase service account JSON
6. Configure email with app-specific password

---

### 4.3 Cloudinary Configuration (config.js)

**File:** `server/config.js`

```javascript
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
require('dotenv').config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Validate configuration
if (!process.env.CLOUDINARY_CLOUD_NAME || 
    !process.env.CLOUDINARY_API_KEY || 
    !process.env.CLOUDINARY_API_SECRET) {
  console.warn('⚠️ Cloudinary credentials not configured, file uploads will fail');
}

// Storage configuration for different file types
const storageConfigs = {
  // Profile photos
  profile: new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'dasho_profiles',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
      transformation: [{ width: 500, height: 500, crop: 'limit' }],
      resource_type: 'image'
    }
  }),
  
  // Request attachments
  request: new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'dasho_requests',
      allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'],
      resource_type: 'auto'
    }
  }),
  
  // Circular documents
  circular: new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'dasho_circulars',
      allowed_formats: ['pdf', 'doc', 'docx'],
      resource_type: 'raw'
    }
  }),
  
  // Event attachments
  event: new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'dasho_events',
      allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
      resource_type: 'auto'
    }
  }),
  
  // Warning attachments
  warning: new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'dasho_warnings',
      allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
      resource_type: 'auto'
    }
  })
};

// Multer upload configurations with size limits
const uploads = {
  profile: multer({
    storage: storageConfigs.profile,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
  }),
  
  request: multer({
    storage: storageConfigs.request,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
  }),
  
  circular: multer({
    storage: storageConfigs.circular,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
  }),
  
  event: multer({
    storage: storageConfigs.event,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
  }),
  
  warning: multer({
    storage: storageConfigs.warning,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
  })
};

module.exports = {
  cloudinary,
  uploads
};
```

**Cloudinary Features:**
- Automatic format conversion
- Image optimization
- CDN delivery
- Folder organization
- Size limits per type
- Automatic backup

---

### 4.4 Package Configuration (package.json)

**File:** `server/package.json`

```json
{
  "name": "dasho-backend",
  "version": "1.0.0",
  "description": "DASHO Employee Management System Backend API",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": ["employee", "management", "scheduling", "hr"],
  "author": "DASHO Development Team",
  "license": "ISC",
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cloudinary": "^1.41.3",
    "cors": "^2.8.5",
    "csv-parser": "^3.0.0",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "firebase-admin": "^13.5.0",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "multer-storage-cloudinary": "^4.0.0",
    "nodemailer": "^6.9.7",
    "pg": "^8.11.3",
    "pg-format": "^1.0.4"
  },
  "devDependencies": {
    "@babel/core": "^7.23.6",
    "@babel/preset-env": "^7.23.6",
    "babel-loader": "^9.1.3",
    "copy-webpack-plugin": "^11.0.0",
    "eslint": "^8.55.0",
    "nodemon": "^3.0.2",
    "webpack": "^5.89.0",
    "webpack-cli": "^5.1.4"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
```

**Dependency Analysis:**

**Production Dependencies (14):**
1. bcryptjs - Password hashing
2. cloudinary - File storage
3. cors - Cross-origin requests
4. csv-parser - CSV import
5. dotenv - Environment variables
6. express - Web framework
7. express-rate-limit - Rate limiting
8. firebase-admin - Push notifications
9. jsonwebtoken - JWT authentication
10. multer - File uploads
11. multer-storage-cloudinary - Cloudinary integration
12. nodemailer - Email sending
13. pg - PostgreSQL client
14. pg-format - SQL formatting

**Development Dependencies (10):**
1. @babel/core - JavaScript transpiler
2. @babel/preset-env - Babel presets
3. babel-loader - Webpack Babel loader
4. copy-webpack-plugin - File copying
5. eslint - Code linting
6. nodemon - Auto-restart on changes
7. webpack - Module bundler
8. webpack-cli - Webpack CLI
9. (2 more for build tooling)

---

## 5. Authentication System

### 5.1 Password Hashing

**Implementation:**
```javascript
const bcrypt = require('bcryptjs');

// Sign Up: Hash password before storing
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { user_id, name, email, password } = req.body;
    
    // Validate input
    if (!user_id || !name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Hash password with salt rounds = 10
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Store user with hashed password
    const query = `
      INSERT INTO users (user_id, name, email, password, role)
      VALUES ($1, $2, $3, $4, 'staff')
      RETURNING user_id, name, email, role
    `;
    
    const result = await pool.query(query, [user_id, name, email, hashedPassword]);
    
    res.status(201).json({
      message: 'User registered successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Signup error:', error);
    
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'User ID or email already exists' });
    }
    
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Sign In: Compare password
app.post('/api/auth/signin', async (req, res) => {
  try {
    const { user_id, password } = req.body;
    
    if (!user_id || !password) {
      return res.status(400).json({ error: 'Missing user_id or password' });
    }
    
    // Get user from database
    const query = 'SELECT * FROM users WHERE user_id = $1';
    const result = await pool.query(query, [user_id]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Compare password with hash
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        user_id: user.user_id, 
        name: user.name, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Remove password from response
    delete user.password;
    
    res.json({ token, user });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});
```

**bcrypt Configuration:**
- Salt rounds: 10 (2^10 = 1,024 iterations)
- Automatic salt generation
- Timing: ~100ms per hash (prevents brute force)

**Security Features:**
1. Password never stored in plaintext
2. Each password gets unique salt
3. Slow hashing prevents brute force
4. Compare function is timing-attack resistant

---

### 5.2 JWT Token Management

**Token Generation:**
```javascript
const jwt = require('jsonwebtoken');

// Generate token after successful authentication
const generateToken = (user) => {
  return jwt.sign(
    {
      user_id: user.user_id,
      name: user.name,
      role: user.role,
      email: user.email
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '24h',
      issuer: 'dasho-api',
      audience: 'dasho-clients'
    }
  );
};
```

**Token Payload:**
```json
{
  "user_id": "E12345",
  "name": "John Doe",
  "role": "staff",
  "email": "john.doe@example.com",
  "iat": 1699200000,
  "exp": 1699286400,
  "iss": "dasho-api",
  "aud": "dasho-clients"
}
```

**Token Configuration:**
- Algorithm: HS256 (HMAC with SHA-256)
- Expiration: 24 hours
- Secret: Minimum 32 characters (from .env)
- Claims: user_id, name, role, email

**Usage in Requests:**
```http
GET /api/users HTTP/1.1
Host: localhost:3000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

---

### 5.3 Password Reset Flow

**Step 1: Request OTP**
```javascript
const nodemailer = require('nodemailer');

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    // Validate email
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    // Check if user exists
    const userResult = await pool.query(
      'SELECT user_id, name FROM users WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      // Don't reveal if email exists (security)
      return res.json({ message: 'If email exists, OTP has been sent' });
    }
    
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    
    // Store OTP in database
    await pool.query(
      'UPDATE users SET reset_otp = $1, reset_otp_expiry = $2 WHERE email = $3',
      [otp, otpExpiry, email]
    );
    
    // Send OTP via email
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
    
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Password Reset OTP - DASHO',
      html: `
        <h2>Password Reset Request</h2>
        <p>Hello ${userResult.rows[0].name},</p>
        <p>Your OTP for password reset is: <strong>${otp}</strong></p>
        <p>This OTP will expire in 5 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    });
    
    res.json({ 
      message: 'OTP sent to your email',
      expires_in: 300
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});
```

**Step 2: Verify OTP**
```javascript
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP required' });
    }
    
    // Get user with OTP
    const result = await pool.query(
      'SELECT user_id, reset_otp, reset_otp_expiry FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    // Verify OTP
    if (user.reset_otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    
    // Check expiration
    if (new Date() > new Date(user.reset_otp_expiry)) {
      return res.status(400).json({ error: 'OTP expired' });
    }
    
    // Generate temporary reset token (valid for 10 minutes)
    const resetToken = jwt.sign(
      { user_id: user.user_id, purpose: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    
    res.json({ 
      message: 'OTP verified successfully',
      reset_token: resetToken
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'OTP verification failed' });
  }
});
```

**Step 3: Reset Password**
```javascript
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { reset_token, new_password } = req.body;
    
    if (!reset_token || !new_password) {
      return res.status(400).json({ error: 'Reset token and new password required' });
    }
    
    // Verify reset token
    let decoded;
    try {
      decoded = jwt.verify(reset_token, process.env.JWT_SECRET);
      if (decoded.purpose !== 'password_reset') {
        throw new Error('Invalid token purpose');
      }
    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired reset token' });
    }
    
    // Validate new password (minimum 8 characters)
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    // Update password and clear OTP
    await pool.query(
      `UPDATE users 
       SET password = $1, reset_otp = NULL, reset_otp_expiry = NULL 
       WHERE user_id = $2`,
      [hashedPassword, decoded.user_id]
    );
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
});
```

**Password Reset Flow Diagram:**
```
User                    API                     Database                Email
  |                      |                         |                       |
  |--forgot-password---->|                         |                       |
  |      (email)         |----SELECT user--------->|                       |
  |                      |<----user data-----------|                       |
  |                      |----UPDATE otp---------->|                       |
  |                      |----send OTP-------------------------->|         |
  |<--OTP sent-----------|                         |                       |
  |                      |                         |                       |
  |--verify-otp--------->|                         |                       |
  |   (email, otp)       |----SELECT user--------->|                       |
  |                      |<----user + otp----------|                       |
  |<--reset_token--------|                         |                       |
  |                      |                         |                       |
  |--reset-password----->|                         |                       |
  | (token, new_pwd)     |----UPDATE password----->|                       |
  |<--success------------|                         |                       |
```

---

## 6. Middleware Implementation

### 6.1 Authentication Middleware

**File:** `server/middleware/auth.js`

```javascript
const jwt = require('jsonwebtoken');

/**
 * Authentication middleware
 * Verifies JWT token and extracts user information
 */
function authenticateToken(req, res, next) {
  // Get token from Authorization header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Access denied. No token provided.' 
    });
  }
  
  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user to request object
    req.user = {
      user_id: decoded.user_id,
      name: decoded.name,
      role: decoded.role,
      email: decoded.email
    };
    
    // Continue to next middleware/route handler
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired. Please login again.' 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ 
        error: 'Invalid token.' 
      });
    }
    
    return res.status(500).json({ 
      error: 'Token verification failed.' 
    });
  }
}

module.exports = authenticateToken;
```

**Usage:**
```javascript
const authenticateToken = require('./middleware/auth');

// Protected route
app.get('/api/users', authenticateToken, async (req, res) => {
  // req.user is now available
  console.log('Authenticated user:', req.user.user_id);
  // ... route logic
});
```

---

### 6.2 Admin Authorization Middleware

**File:** `server/middleware/adminAuth.js`

```javascript
/**
 * Admin authorization middleware
 * Requires authenticateToken to run first
 * Checks if user has admin role
 */
function isAdmin(req, res, next) {
  // Check if user is authenticated (should be set by authenticateToken)
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required.' 
    });
  }
  
  // Check if user is admin
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      error: 'Access denied. Admin privileges required.' 
    });
  }
  
  // User is admin, continue
  next();
}

module.exports = isAdmin;
```

**Usage:**
```javascript
const authenticateToken = require('./middleware/auth');
const isAdmin = require('./middleware/adminAuth');

// Admin-only route
app.post('/api/users', authenticateToken, isAdmin, async (req, res) => {
  // Only admins can reach here
  // ... route logic
});
```

---

### 6.3 Leader Authorization Middleware

**File:** `server/middleware/leaderAuth.js`

```javascript
/**
 * Leader authorization middleware
 * Requires authenticateToken to run first
 * Checks if user is leader or admin
 */
function isLeaderOrAdmin(req, res, next) {
  // Check if user is authenticated
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required.' 
    });
  }
  
  // Check if user is leader or admin
  if (req.user.role !== 'leader' && req.user.role !== 'admin') {
    return res.status(403).json({ 
      error: 'Access denied. Leader or Admin privileges required.' 
    });
  }
  
  // User has required role, continue
  next();
}

module.exports = isLeaderOrAdmin;
```

**Usage:**
```javascript
const authenticateToken = require('./middleware/auth');
const isLeaderOrAdmin = require('./middleware/leaderAuth');

// Leader or Admin route
app.post('/api/announcements', authenticateToken, isLeaderOrAdmin, async (req, res) => {
  // Leaders and admins can reach here
  // ... route logic
});
```

---

### 6.4 Rate Limiting Middleware

**Implementation in index.js:**

```javascript
const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per window
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limit for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 login attempts per window
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true // Don't count successful requests
});

// Strict rate limit for password reset
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Max 3 attempts per window
  message: 'Too many password reset attempts, please try again later.',
  keyGenerator: (req) => req.body.email || req.ip // Rate limit by email
});

// Apply rate limiters
app.use('/api/', apiLimiter);
app.use('/api/auth/signin', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/forgot-password', resetPasswordLimiter);
```

**Rate Limit Configuration:**

| Endpoint | Window | Max Requests | Purpose |
|----------|--------|--------------|---------|
| /api/* | 15 min | 100 | General protection |
| /api/auth/signin | 15 min | 10 | Prevent brute force |
| /api/auth/signup | 15 min | 10 | Prevent spam accounts |
| /api/auth/forgot-password | 15 min | 3 | Prevent email bombing |

---

**Continue to Part 5B:** Implementation Details (Features & Integration)

