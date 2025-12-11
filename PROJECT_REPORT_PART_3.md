# DASHO Employee Management System - Complete Project Report
## Part 3: API Endpoints & Features

**Report Date:** November 5, 2025  
**Project:** DASHO Employee Management System  
**Document:** Part 3 of 6

---

## Table of Contents

1. [API Overview](#api-overview)
2. [Authentication Endpoints](#authentication-endpoints)
3. [User Management](#user-management)
4. [Schedule Management](#schedule-management)
5. [Request Management](#request-management)
6. [Team & Unit Management](#team-unit-management)
7. [Communication Features](#communication-features)
8. [Event Management](#event-management)
9. [Warning System](#warning-system)
10. [Break Management](#break-management)
11. [Notification System](#notification-system)
12. [File Upload](#file-upload)
13. [Push Notifications](#push-notifications)

---

## 1. API Overview

### 1.1 General Information

**Base URL:** `http://server-ip:3000`  
**API Version:** 1.0  
**Total Endpoints:** 82  
**Authentication:** JWT Bearer Token  
**Content-Type:** `application/json` (except file uploads: `multipart/form-data`)

### 1.2 Response Format

**Success Response:**
```json
{
  "data": {},
  "message": "Operation successful"
}
```

**Error Response:**
```json
{
  "error": "Error message",
  "details": "Detailed error information"
}
```

### 1.3 HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET, PUT, DELETE |
| 201 | Created | Successful POST |
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

### 1.4 Authentication Header

All protected endpoints require JWT token:

```
Authorization: Bearer <jwt_token>
```

---

## 2. Authentication Endpoints

### 2.1 Sign In

**Endpoint:** `POST /api/auth/signin`  
**Access:** Public  
**Rate Limit:** 10 requests per 15 minutes

**Request Body:**
```json
{
  "user_id": "E12345",
  "password": "SecurePassword123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "user_id": "E12345",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "role": "staff",
    "photo_url": "https://cloudinary.com/..."
  }
}
```

**Errors:**
- 400: Missing user_id or password
- 401: Invalid credentials

---

### 2.2 Sign Up

**Endpoint:** `POST /api/auth/signup`  
**Access:** Public  
**Rate Limit:** 10 requests per 15 minutes

**Request Body:**
```json
{
  "user_id": "E12345",
  "name": "John Doe",
  "email": "john.doe@example.com",
  "password": "SecurePassword123",
  "mobile": "+96512345678",
  "civil_id": "123456789",
  "dob": "1990-01-01",
  "joining_date": "2024-01-01",
  "nationality": "Kuwait"
}
```

**Response (201):**
```json
{
  "message": "User registered successfully",
  "user_id": "E12345"
}
```

**Errors:**
- 400: Missing required fields
- 409: User ID already exists

---

### 2.3 Get Current User

**Endpoint:** `GET /api/auth/me`  
**Access:** Protected (All roles)

**Response (200):**
```json
{
  "user_id": "E12345",
  "name": "John Doe",
  "email": "john.doe@example.com",
  "role": "staff",
  "mobile": "+96512345678",
  "photo_url": "https://cloudinary.com/...",
  "unit": "Engineering",
  "teams": ["Development"],
  "fcm_token": "firebase_token_here"
}
```

---

### 2.4 Forgot Password

**Endpoint:** `POST /api/auth/forgot-password`  
**Access:** Public  
**Rate Limit:** 3 requests per 15 minutes per email

**Request Body:**
```json
{
  "email": "john.doe@example.com"
}
```

**Response (200):**
```json
{
  "message": "OTP sent to your email",
  "expires_in": 300
}
```

**OTP Details:**
- 6-digit code
- Valid for 5 minutes
- Sent via Nodemailer

---

### 2.5 Verify OTP

**Endpoint:** `POST /api/auth/verify-otp`  
**Access:** Public

**Request Body:**
```json
{
  "email": "john.doe@example.com",
  "otp": "123456"
}
```

**Response (200):**
```json
{
  "message": "OTP verified successfully",
  "reset_token": "temp_reset_token_xyz"
}
```

**Errors:**
- 400: Invalid or expired OTP
- 404: Email not found

---

### 2.6 Reset Password

**Endpoint:** `POST /api/auth/reset-password`  
**Access:** Public (requires reset_token from OTP verification)

**Request Body:**
```json
{
  "reset_token": "temp_reset_token_xyz",
  "new_password": "NewSecurePassword123"
}
```

**Response (200):**
```json
{
  "message": "Password reset successfully"
}
```

**Password Requirements:**
- Minimum 8 characters
- At least 1 uppercase
- At least 1 lowercase
- At least 1 number

---

## 3. User Management

### 3.1 Get All Users

**Endpoint:** `GET /api/users`  
**Access:** Protected (Admin, Leader)

**Query Parameters:**
- `role` (optional): Filter by role (staff/leader/admin)
- `status` (optional): Filter by status (active/inactive)
- `unit` (optional): Filter by unit name

**Response (200):**
```json
{
  "users": [
    {
      "user_id": "E12345",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "role": "staff",
      "status": "active",
      "unit": "Engineering",
      "teams": ["Development"]
    }
  ],
  "total": 188
}
```

---

### 3.2 Get User by ID

**Endpoint:** `GET /api/users/:userId`  
**Access:** Protected (Own profile or Admin/Leader)

**Response (200):**
```json
{
  "user_id": "E12345",
  "name": "John Doe",
  "email": "john.doe@example.com",
  "mobile": "+96512345678",
  "civil_id": "123456789",
  "emergency_contact": "+96598765432",
  "address": "123 Main St, Kuwait City",
  "photo_url": "https://cloudinary.com/...",
  "dob": "1990-01-01",
  "joining_date": "2024-01-01",
  "education": "Bachelor's Degree",
  "graduation_year": 2012,
  "driving_license": true,
  "contract_type": "Permanent",
  "job_title": "Software Engineer",
  "grade": "G5",
  "status": "active",
  "nationality": "Kuwait",
  "role": "staff",
  "unit": "Engineering",
  "teams": ["Development", "Backend"]
}
```

---

### 3.3 Create User

**Endpoint:** `POST /api/users`  
**Access:** Protected (Admin only)

**Request Body:**
```json
{
  "user_id": "E12346",
  "name": "Jane Smith",
  "email": "jane.smith@example.com",
  "password": "TempPassword123",
  "mobile": "+96512345679",
  "civil_id": "987654321",
  "dob": "1992-05-15",
  "joining_date": "2024-11-01",
  "nationality": "Kuwait",
  "role": "staff",
  "job_title": "Frontend Developer",
  "contract_type": "Permanent"
}
```

**Response (201):**
```json
{
  "message": "User created successfully",
  "user_id": "E12346"
}
```

---

### 3.4 Update User

**Endpoint:** `PUT /api/users/:userId`  
**Access:** Protected (Own profile or Admin)

**Request Body (Partial Update):**
```json
{
  "mobile": "+96512345680",
  "address": "456 New St, Kuwait City",
  "emergency_contact": "+96598765433"
}
```

**Response (200):**
```json
{
  "message": "User updated successfully",
  "user": {
    "user_id": "E12345",
    "name": "John Doe",
    "mobile": "+96512345680"
  }
}
```

---

### 3.5 Delete User

**Endpoint:** `DELETE /api/users/:userId`  
**Access:** Protected (Admin only)

**Response (200):**
```json
{
  "message": "User deleted successfully",
  "user_id": "E12346"
}
```

**Note:** Cascading deletes remove related records:
- Schedules
- Requests
- Team/Unit assignments
- Notifications
- etc.

---

### 3.6 Upload User Photo

**Endpoint:** `POST /api/users/:userId/photo`  
**Access:** Protected (Own profile or Admin)  
**Content-Type:** `multipart/form-data`

**Request:**
```
File: photo (image/jpeg, image/png, max 5MB)
```

**Response (200):**
```json
{
  "message": "Photo uploaded successfully",
  "photo_url": "https://res.cloudinary.com/.../profile.jpg"
}
```

**Cloudinary Integration:**
- Folder: `dasho_profiles/`
- Transformation: Auto-format, quality auto
- Public access

---

### 3.7 Get User Statistics

**Endpoint:** `GET /api/users/:userId/stats`  
**Access:** Protected (Own stats or Admin/Leader)

**Response (200):**
```json
{
  "user_id": "E12345",
  "name": "John Doe",
  "statistics": {
    "total_schedules": 52,
    "pending_requests": 2,
    "approved_requests": 15,
    "rejected_requests": 1,
    "total_warnings": 0,
    "completed_tasks": 28,
    "pending_tasks": 3,
    "upcoming_events": 4,
    "unread_notifications": 7
  }
}
```

---

### 3.8 Assign User to Team

**Endpoint:** `POST /api/users/:userId/teams`  
**Access:** Protected (Admin only)

**Request Body:**
```json
{
  "team_id": 1,
  "is_leader": false
}
```

**Response (201):**
```json
{
  "message": "User assigned to team successfully",
  "assignment": {
    "user_id": "E12345",
    "team_id": 1,
    "is_leader": false,
    "assigned_at": "2025-11-05T10:30:00Z"
  }
}
```

---

### 3.9 Assign User to Unit

**Endpoint:** `POST /api/users/:userId/units`  
**Access:** Protected (Admin only)

**Request Body:**
```json
{
  "unit_id": 2
}
```

**Response (201):**
```json
{
  "message": "User assigned to unit successfully",
  "assignment": {
    "user_id": "E12345",
    "unit_id": 2,
    "assigned_at": "2025-11-05T10:30:00Z"
  }
}
```

---

### 3.10 Remove User from Team

**Endpoint:** `DELETE /api/users/:userId/teams/:teamId`  
**Access:** Protected (Admin only)

**Response (200):**
```json
{
  "message": "User removed from team successfully"
}
```

---

### 3.11 Remove User from Unit

**Endpoint:** `DELETE /api/users/:userId/units/:unitId`  
**Access:** Protected (Admin only)

**Response (200):**
```json
{
  "message": "User removed from unit successfully"
}
```

---

### 3.12 Update User Role

**Endpoint:** `PUT /api/users/:userId/role`  
**Access:** Protected (Admin only)

**Request Body:**
```json
{
  "role": "leader"
}
```

**Valid Roles:**
- staff
- leader
- admin

**Response (200):**
```json
{
  "message": "User role updated successfully",
  "user_id": "E12345",
  "new_role": "leader"
}
```

---

## 4. Schedule Management

### 4.1 Get Schedules

**Endpoint:** `GET /api/schedules`  
**Access:** Protected (All roles)

**Query Parameters:**
- `user_id` (optional): Filter by user
- `date_from` (optional): Start date (YYYY-MM-DD)
- `date_to` (optional): End date (YYYY-MM-DD)
- `unit` (optional): Filter by unit
- `shift_type` (optional): Filter by shift type

**Response (200):**
```json
{
  "schedules": [
    {
      "id": 1,
      "user_id": "E12345",
      "user_name": "John Doe",
      "shift_date": "2025-11-05",
      "shift_time": "08:00-16:00",
      "unit": "Engineering",
      "shift_type": "Regular",
      "created_at": "2025-10-01T10:00:00Z"
    }
  ],
  "total": 13694
}
```

---

### 4.2 Get User Schedule

**Endpoint:** `GET /api/schedules/user/:userId`  
**Access:** Protected (Own schedule or Admin/Leader)

**Query Parameters:**
- `month` (optional): Month number (1-12)
- `year` (optional): Year (e.g., 2025)

**Response (200):**
```json
{
  "user_id": "E12345",
  "user_name": "John Doe",
  "month": 11,
  "year": 2025,
  "schedules": [
    {
      "id": 1,
      "shift_date": "2025-11-05",
      "shift_time": "08:00-16:00",
      "unit": "Engineering",
      "shift_type": "Regular"
    }
  ],
  "total_shifts": 22
}
```

---

### 4.3 Import Schedules (CSV)

**Endpoint:** `POST /api/schedules/import`  
**Access:** Protected (Admin only)  
**Content-Type:** `multipart/form-data`

**Request:**
```
File: schedules.csv
```

**CSV Format:**
```csv
user_id,shift_date,shift_time,unit,shift_type
E12345,2025-11-05,08:00-16:00,Engineering,Regular
E12346,2025-11-05,16:00-00:00,Engineering,Night
```

**Response (200):**
```json
{
  "message": "Schedules imported successfully",
  "imported": 250,
  "failed": 0,
  "errors": []
}
```

**Validation:**
- user_id must exist
- shift_date must be valid date
- No duplicate entries (user_id + shift_date)

---

### 4.4 Create Schedule

**Endpoint:** `POST /api/schedules`  
**Access:** Protected (Admin only)

**Request Body:**
```json
{
  "user_id": "E12345",
  "shift_date": "2025-11-10",
  "shift_time": "08:00-16:00",
  "unit": "Engineering",
  "shift_type": "Regular"
}
```

**Response (201):**
```json
{
  "message": "Schedule created successfully",
  "schedule": {
    "id": 13695,
    "user_id": "E12345",
    "shift_date": "2025-11-10",
    "shift_time": "08:00-16:00"
  }
}
```

---

### 4.5 Update Schedule

**Endpoint:** `PUT /api/schedules/:scheduleId`  
**Access:** Protected (Admin only)

**Request Body:**
```json
{
  "shift_time": "09:00-17:00",
  "shift_type": "Modified"
}
```

**Response (200):**
```json
{
  "message": "Schedule updated successfully",
  "schedule": {
    "id": 13695,
    "shift_time": "09:00-17:00",
    "shift_type": "Modified",
    "updated_at": "2025-11-05T11:00:00Z"
  }
}
```

---

### 4.6 Delete Schedule

**Endpoint:** `DELETE /api/schedules/:scheduleId`  
**Access:** Protected (Admin only)

**Response (200):**
```json
{
  "message": "Schedule deleted successfully",
  "schedule_id": 13695
}
```

---

## 5. Request Management

### 5.1 Get All Requests

**Endpoint:** `GET /api/requests`  
**Access:** Protected (Admin, Leader)

**Query Parameters:**
- `status` (optional): pending/approved/rejected
- `req_type` (optional): Request type
- `user_id` (optional): Filter by user
- `date_from` (optional): Start date
- `date_to` (optional): End date

**Response (200):**
```json
{
  "requests": [
    {
      "id": 1,
      "user_id": "E12345",
      "user_name": "John Doe",
      "req_type": "annual leave",
      "date_from": "2025-12-01",
      "date_to": "2025-12-07",
      "reason": "Family vacation",
      "status": "pending",
      "req_datetime": "2025-11-01T09:00:00Z",
      "attachment_url": null
    }
  ],
  "total": 6
}
```

---

### 5.2 Get User Requests

**Endpoint:** `GET /api/requests/user/:userId`  
**Access:** Protected (Own requests or Admin/Leader)

**Query Parameters:**
- `status` (optional): pending/approved/rejected

**Response (200):**
```json
{
  "user_id": "E12345",
  "requests": [
    {
      "id": 1,
      "req_type": "annual leave",
      "date_from": "2025-12-01",
      "date_to": "2025-12-07",
      "status": "pending",
      "approved_by": null,
      "approved_by_2": null
    }
  ],
  "total": 3
}
```

---

### 5.3 Create Request

**Endpoint:** `POST /api/requests`  
**Access:** Protected (All roles - own requests)

**Request Body:**
```json
{
  "req_type": "annual leave",
  "date_from": "2025-12-01",
  "date_to": "2025-12-07",
  "reason": "Family vacation",
  "attachment_url": "https://cloudinary.com/document.pdf"
}
```

**Valid Request Types:**
- permission
- swap
- sick leave
- annual leave
- other leave
- emergency leave
- maternity leave

**Response (201):**
```json
{
  "message": "Request submitted successfully",
  "request": {
    "id": 7,
    "user_id": "E12345",
    "req_type": "annual leave",
    "status": "pending",
    "req_datetime": "2025-11-05T11:30:00Z"
  }
}
```

---

### 5.4 Approve Request

**Endpoint:** `PUT /api/requests/:requestId/approve`  
**Access:** Protected (Leader, Admin)

**Request Body:**
```json
{
  "approval_level": 1
}
```

**Approval Levels:**
- 1: First approval (Leader)
- 2: Second approval (Admin) - Required for dual approval types

**Response (200):**
```json
{
  "message": "Request approved successfully",
  "request": {
    "id": 7,
    "status": "approved",
    "approved_by": "L12345",
    "approved_by_2": null
  }
}
```

**Dual Approval Logic:**
- Annual leave: Requires both Leader and Admin approval
- Sick leave: Single approval sufficient
- Emergency leave: Single approval sufficient

---

### 5.5 Reject Request

**Endpoint:** `PUT /api/requests/:requestId/reject`  
**Access:** Protected (Leader, Admin)

**Request Body:**
```json
{
  "rejection_reason": "Insufficient leave balance"
}
```

**Response (200):**
```json
{
  "message": "Request rejected",
  "request": {
    "id": 7,
    "status": "rejected",
    "rejection_reason": "Insufficient leave balance"
  }
}
```

---

### 5.6 Delete Request

**Endpoint:** `DELETE /api/requests/:requestId`  
**Access:** Protected (Own pending requests or Admin)

**Response (200):**
```json
{
  "message": "Request deleted successfully",
  "request_id": 7
}
```

**Note:** Only pending requests can be deleted

---

## 6. Team & Unit Management

### 6.1 Get All Teams

**Endpoint:** `GET /api/teams`  
**Access:** Protected (All roles)

**Response (200):**
```json
{
  "teams": [
    {
      "id": 1,
      "name": "Development",
      "description": "Software development team",
      "member_count": 45,
      "leader_count": 3,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 3
}
```

---

### 6.2 Get Team by ID

**Endpoint:** `GET /api/teams/:teamId`  
**Access:** Protected (All roles)

**Response (200):**
```json
{
  "id": 1,
  "name": "Development",
  "description": "Software development team",
  "created_at": "2024-01-01T00:00:00Z",
  "members": [
    {
      "user_id": "E12345",
      "name": "John Doe",
      "is_leader": false,
      "assigned_at": "2024-01-15T00:00:00Z"
    }
  ],
  "leaders": [
    {
      "user_id": "L12345",
      "name": "Jane Leader",
      "assigned_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total_members": 45
}
```

---

### 6.3 Create Team

**Endpoint:** `POST /api/teams`  
**Access:** Protected (Admin only)

**Request Body:**
```json
{
  "name": "QA Team",
  "description": "Quality assurance and testing"
}
```

**Response (201):**
```json
{
  "message": "Team created successfully",
  "team": {
    "id": 4,
    "name": "QA Team",
    "description": "Quality assurance and testing",
    "created_at": "2025-11-05T12:00:00Z"
  }
}
```

---

### 6.4 Update Team

**Endpoint:** `PUT /api/teams/:teamId`  
**Access:** Protected (Admin only)

**Request Body:**
```json
{
  "description": "Quality assurance, testing, and automation"
}
```

**Response (200):**
```json
{
  "message": "Team updated successfully",
  "team": {
    "id": 4,
    "name": "QA Team",
    "description": "Quality assurance, testing, and automation",
    "updated_at": "2025-11-05T12:30:00Z"
  }
}
```

---

### 6.5 Delete Team

**Endpoint:** `DELETE /api/teams/:teamId`  
**Access:** Protected (Admin only)

**Response (200):**
```json
{
  "message": "Team deleted successfully",
  "team_id": 4
}
```

**Note:** Cascading delete removes all user_teams assignments

---

### 6.6 Get All Units

**Endpoint:** `GET /api/units`  
**Access:** Protected (All roles)

**Response (200):**
```json
{
  "units": [
    {
      "id": 1,
      "name": "Engineering",
      "description": "Engineering department",
      "member_count": 67,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 7
}
```

---

### 6.7 Get Unit by ID

**Endpoint:** `GET /api/units/:unitId`  
**Access:** Protected (All roles)

**Response (200):**
```json
{
  "id": 1,
  "name": "Engineering",
  "description": "Engineering department",
  "created_at": "2024-01-01T00:00:00Z",
  "members": [
    {
      "user_id": "E12345",
      "name": "John Doe",
      "job_title": "Software Engineer",
      "assigned_at": "2024-01-15T00:00:00Z"
    }
  ],
  "total_members": 67
}
```

---

### 6.8 Create Unit

**Endpoint:** `POST /api/units`  
**Access:** Protected (Admin only)

**Request Body:**
```json
{
  "name": "IT Support",
  "description": "IT support and helpdesk"
}
```

**Response (201):**
```json
{
  "message": "Unit created successfully",
  "unit": {
    "id": 8,
    "name": "IT Support",
    "description": "IT support and helpdesk",
    "created_at": "2025-11-05T13:00:00Z"
  }
}
```

---

### 6.9 Update Unit

**Endpoint:** `PUT /api/units/:unitId`  
**Access:** Protected (Admin only)

**Request Body:**
```json
{
  "description": "IT support, helpdesk, and infrastructure"
}
```

**Response (200):**
```json
{
  "message": "Unit updated successfully",
  "unit": {
    "id": 8,
    "name": "IT Support",
    "description": "IT support, helpdesk, and infrastructure",
    "updated_at": "2025-11-05T13:30:00Z"
  }
}
```

---

### 6.10 Delete Unit

**Endpoint:** `DELETE /api/units/:unitId`  
**Access:** Protected (Admin only)

**Response (200):**
```json
{
  "message": "Unit deleted successfully",
  "unit_id": 8
}
```

**Note:** Cascading delete removes all user_units assignments

---

### 6.11 Get Team Members

**Endpoint:** `GET /api/teams/:teamId/members`  
**Access:** Protected (All roles)

**Response (200):**
```json
{
  "team_id": 1,
  "team_name": "Development",
  "members": [
    {
      "user_id": "E12345",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "is_leader": false,
      "photo_url": "https://cloudinary.com/...",
      "assigned_at": "2024-01-15T00:00:00Z"
    }
  ],
  "total": 45
}
```

---

### 6.12 Get Unit Members

**Endpoint:** `GET /api/units/:unitId/members`  
**Access:** Protected (All roles)

**Response (200):**
```json
{
  "unit_id": 1,
  "unit_name": "Engineering",
  "members": [
    {
      "user_id": "E12345",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "job_title": "Software Engineer",
      "photo_url": "https://cloudinary.com/...",
      "assigned_at": "2024-01-15T00:00:00Z"
    }
  ],
  "total": 67
}
```

---

## 7. Communication Features

### 7.1 Get All Announcements

**Endpoint:** `GET /api/announcements`  
**Access:** Protected (All roles)

**Query Parameters:**
- `target_role` (optional): Filter by role
- `is_urgent` (optional): true/false
- `is_pinned` (optional): true/false

**Response (200):**
```json
{
  "announcements": [
    {
      "id": 1,
      "title": "System Maintenance",
      "content": "Scheduled maintenance on Sunday",
      "created_by": "A12345",
      "author_name": "Admin User",
      "created_at": "2025-11-01T08:00:00Z",
      "is_pinned": true,
      "is_urgent": false,
      "target_role": "all",
      "attachment_url": null,
      "read_by_user": false
    }
  ],
  "total": 4
}
```

---

### 7.2 Get Announcement by ID

**Endpoint:** `GET /api/announcements/:announcementId`  
**Access:** Protected (All roles)

**Response (200):**
```json
{
  "id": 1,
  "title": "System Maintenance",
  "content": "Scheduled maintenance on Sunday...",
  "created_by": "A12345",
  "author_name": "Admin User",
  "author_photo": "https://cloudinary.com/...",
  "created_at": "2025-11-01T08:00:00Z",
  "is_pinned": true,
  "is_urgent": false,
  "target_role": "all",
  "attachment_url": null,
  "read_count": 156,
  "total_recipients": 188
}
```

---

### 7.3 Create Announcement

**Endpoint:** `POST /api/announcements`  
**Access:** Protected (Admin, Leader)

**Request Body:**
```json
{
  "title": "Holiday Notice",
  "content": "Office will be closed on...",
  "target_role": "all",
  "is_urgent": false,
  "is_pinned": false,
  "attachment_url": "https://cloudinary.com/..."
}
```

**Valid Target Roles:**
- all
- admin
- leader
- employee (staff)

**Response (201):**
```json
{
  "message": "Announcement created successfully",
  "announcement": {
    "id": 5,
    "title": "Holiday Notice",
    "created_at": "2025-11-05T14:00:00Z"
  }
}
```

**Push Notification:**
- Automatically sent to all targeted users with FCM tokens
- Title: Announcement title
- Body: First 100 characters of content

---

### 7.4 Update Announcement

**Endpoint:** `PUT /api/announcements/:announcementId`  
**Access:** Protected (Admin, Leader - own announcements)

**Request Body:**
```json
{
  "is_pinned": true,
  "is_urgent": true
}
```

**Response (200):**
```json
{
  "message": "Announcement updated successfully",
  "announcement": {
    "id": 5,
    "is_pinned": true,
    "is_urgent": true
  }
}
```

---

### 7.5 Delete Announcement

**Endpoint:** `DELETE /api/announcements/:announcementId`  
**Access:** Protected (Admin only)

**Response (200):**
```json
{
  "message": "Announcement deleted successfully",
  "announcement_id": 5
}
```

**Note:** Cascading delete removes all announcement_reads records

---

### 7.6 Mark Announcement as Read

**Endpoint:** `POST /api/announcements/:announcementId/read`  
**Access:** Protected (All roles)

**Response (200):**
```json
{
  "message": "Announcement marked as read",
  "announcement_id": 1,
  "read_at": "2025-11-05T14:30:00Z"
}
```

**Note:** Idempotent - calling multiple times has no effect

---

### 7.7 Get All Circulars

**Endpoint:** `GET /api/circulars`  
**Access:** Protected (All roles)

**Response (200):**
```json
{
  "circulars": [
    {
      "id": 1,
      "title": "HR Policy Update",
      "description": "Updated HR policies effective...",
      "document_url": "https://cloudinary.com/policy.pdf",
      "created_by": "A12345",
      "author_name": "Admin User",
      "created_at": "2025-10-15T09:00:00Z",
      "read_by_user": false
    }
  ],
  "total": 1
}
```

---

### 7.8 Create Circular

**Endpoint:** `POST /api/circulars`  
**Access:** Protected (Admin only)

**Request Body:**
```json
{
  "title": "Safety Guidelines",
  "description": "New safety guidelines for all employees...",
  "document_url": "https://cloudinary.com/safety.pdf"
}
```

**Response (201):**
```json
{
  "message": "Circular created successfully",
  "circular": {
    "id": 2,
    "title": "Safety Guidelines",
    "created_at": "2025-11-05T15:00:00Z"
  }
}
```

**Push Notification:**
- Automatically sent to all users with FCM tokens
- Title: "New Circular: {title}"
- Body: First 100 characters of description

---

### 7.9 Update Circular

**Endpoint:** `PUT /api/circulars/:circularId`  
**Access:** Protected (Admin only)

**Request Body:**
```json
{
  "description": "Updated safety guidelines..."
}
```

**Response (200):**
```json
{
  "message": "Circular updated successfully",
  "circular": {
    "id": 2,
    "title": "Safety Guidelines"
  }
}
```

---

### 7.10 Delete Circular

**Endpoint:** `DELETE /api/circulars/:circularId`  
**Access:** Protected (Admin only)

**Response (200):**
```json
{
  "message": "Circular deleted successfully",
  "circular_id": 2
}
```

**Note:** Cascading delete removes all circular_reads records

---

### 7.11 Mark Circular as Read

**Endpoint:** `POST /api/circulars/:circularId/read`  
**Access:** Protected (All roles)

**Response (200):**
```json
{
  "message": "Circular marked as read",
  "circular_id": 1,
  "read_at": "2025-11-05T15:30:00Z"
}
```

---

## 8. Event Management

### 8.1 Get All Events

**Endpoint:** `GET /api/events`  
**Access:** Protected (All roles)

**Query Parameters:**
- `date_from` (optional): Start date
- `date_to` (optional): End date
- `category` (optional): Event category

**Response (200):**
```json
{
  "events": [
    {
      "id": 1,
      "title": "Team Building Activity",
      "description": "Annual team building event",
      "event_date": "2025-12-15",
      "event_time": "14:00:00",
      "location": "Conference Hall A",
      "category": "Team",
      "created_by": "A12345",
      "author_name": "Admin User",
      "rsvp_status": null,
      "going_count": 45,
      "maybe_count": 12,
      "not_going_count": 3
    }
  ],
  "total": 2
}
```

---

### 8.2 Create Event

**Endpoint:** `POST /api/events`  
**Access:** Protected (Admin, Leader)

**Request Body:**
```json
{
  "title": "Tech Talk",
  "description": "Monthly tech talk session",
  "event_date": "2025-11-20",
  "event_time": "15:00:00",
  "location": "Virtual Meeting",
  "category": "Training",
  "attachment_url": "https://cloudinary.com/agenda.pdf"
}
```

**Response (201):**
```json
{
  "message": "Event created successfully",
  "event": {
    "id": 3,
    "title": "Tech Talk",
    "event_date": "2025-11-20"
  }
}
```

---

### 8.3 Update Event

**Endpoint:** `PUT /api/events/:eventId`  
**Access:** Protected (Admin, Leader - own events)

**Request Body:**
```json
{
  "event_time": "16:00:00",
  "location": "Conference Room B"
}
```

**Response (200):**
```json
{
  "message": "Event updated successfully",
  "event": {
    "id": 3,
    "event_time": "16:00:00",
    "location": "Conference Room B"
  }
}
```

---

### 8.4 Delete Event

**Endpoint:** `DELETE /api/events/:eventId`  
**Access:** Protected (Admin only)

**Response (200):**
```json
{
  "message": "Event deleted successfully",
  "event_id": 3
}
```

**Note:** Cascading delete removes all event_rsvps

---

### 8.5 RSVP to Event

**Endpoint:** `POST /api/events/:eventId/rsvp`  
**Access:** Protected (All roles)

**Request Body:**
```json
{
  "status": "going"
}
```

**Valid Statuses:**
- going
- maybe
- not_going

**Response (200):**
```json
{
  "message": "RSVP recorded successfully",
  "rsvp": {
    "event_id": 1,
    "user_id": "E12345",
    "status": "going",
    "created_at": "2025-11-05T16:00:00Z"
  }
}
```

**Note:** Updates existing RSVP if already exists

---

## 9. Warning System

### 9.1 Get All Warnings

**Endpoint:** `GET /api/warnings`  
**Access:** Protected (Admin, Leader)

**Query Parameters:**
- `user_id` (optional): Filter by user
- `kind` (optional): Filter by warning type
- `date_from` (optional): Start date
- `date_to` (optional): End date

**Response (200):**
```json
{
  "warnings": [
    {
      "id": 1,
      "user_id": "E12345",
      "user_name": "John Doe",
      "kind": "verbal_warning",
      "date": "2025-10-15",
      "details": "Late arrival without prior notice",
      "attachment": null,
      "ack_at": null,
      "created_by": "L12345",
      "creator_name": "Jane Leader",
      "created_at": "2025-10-15T09:00:00Z"
    }
  ],
  "total": 2
}
```

---

### 9.2 Get User Warnings

**Endpoint:** `GET /api/warnings/user/:userId`  
**Access:** Protected (Own warnings or Admin/Leader)

**Response (200):**
```json
{
  "user_id": "E12345",
  "warnings": [
    {
      "id": 1,
      "kind": "verbal_warning",
      "date": "2025-10-15",
      "details": "Late arrival without prior notice",
      "ack_at": null
    }
  ],
  "total": 1
}
```

---

### 9.3 Create Warning

**Endpoint:** `POST /api/warnings`  
**Access:** Protected (Admin, Leader)

**Request Body:**
```json
{
  "user_id": "E12345",
  "kind": "warning",
  "date": "2025-11-05",
  "details": "Violation of company policy",
  "attachment": "https://cloudinary.com/evidence.pdf"
}
```

**Valid Warning Types:**
- warning
- draw_attention
- notice
- final_warning
- verbal_warning
- verbal_notice

**Response (201):**
```json
{
  "message": "Warning issued successfully",
  "warning": {
    "id": 3,
    "user_id": "E12345",
    "kind": "warning",
    "date": "2025-11-05"
  }
}
```

---

### 9.4 Acknowledge Warning

**Endpoint:** `POST /api/warnings/:warningId/acknowledge`  
**Access:** Protected (Warned user only)

**Response (200):**
```json
{
  "message": "Warning acknowledged",
  "warning": {
    "id": 3,
    "ack_at": "2025-11-05T17:00:00Z"
  }
}
```

---

## 10. Break Management

### 10.1 Get Break Templates

**Endpoint:** `GET /api/breaks/templates`  
**Access:** Protected (Admin, Leader)

**Query Parameters:**
- `unit_id` (optional): Filter by unit
- `weekday` (optional): Filter by weekday (0-6)

**Response (200):**
```json
{
  "templates": [
    {
      "id": 1,
      "unit_id": 1,
      "unit_name": "Engineering",
      "weekday": 1,
      "weekday_name": "Monday",
      "start_window": "10:00:00",
      "end_window": "14:00:00",
      "duration_min": 15,
      "min_gap_start": 60,
      "min_gap_end": 60,
      "staggering": 15,
      "created_at": "2025-01-01T00:00:00Z"
    }
  ],
  "total": 0
}
```

---

### 10.2 Create Break Template

**Endpoint:** `POST /api/breaks/templates`  
**Access:** Protected (Admin only)

**Request Body:**
```json
{
  "unit_id": 1,
  "weekday": 1,
  "start_window": "10:00",
  "end_window": "14:00",
  "duration_min": 15,
  "min_gap_start": 60,
  "min_gap_end": 60,
  "staggering": 15
}
```

**Response (201):**
```json
{
  "message": "Break template created successfully",
  "template": {
    "id": 1,
    "unit_id": 1,
    "weekday": 1
  }
}
```

---

### 10.3 Update Break Template

**Endpoint:** `PUT /api/breaks/templates/:templateId`  
**Access:** Protected (Admin only)

**Request Body:**
```json
{
  "duration_min": 20,
  "staggering": 10
}
```

**Response (200):**
```json
{
  "message": "Break template updated successfully",
  "template": {
    "id": 1,
    "duration_min": 20,
    "staggering": 10
  }
}
```

---

### 10.4 Delete Break Template

**Endpoint:** `DELETE /api/breaks/templates/:templateId`  
**Access:** Protected (Admin only)

**Response (200):**
```json
{
  "message": "Break template deleted successfully",
  "template_id": 1
}
```

---

### 10.5 Get Break Assignments

**Endpoint:** `GET /api/breaks/assignments`  
**Access:** Protected (All roles)

**Query Parameters:**
- `user_id` (optional): Filter by user
- `date` (optional): Specific date
- `date_from` (optional): Start date
- `date_to` (optional): End date
- `status` (optional): Filter by status

**Response (200):**
```json
{
  "assignments": [
    {
      "id": 1,
      "user_id": "E12345",
      "user_name": "John Doe",
      "date": "2025-11-05",
      "planned_start": "10:30:00",
      "planned_end": "10:45:00",
      "status": "scheduled",
      "template_id": 1
    }
  ],
  "total": 0
}
```

---

### 10.6 Create Break Assignment

**Endpoint:** `POST /api/breaks/assignments`  
**Access:** Protected (Admin, Leader)

**Request Body:**
```json
{
  "user_id": "E12345",
  "date": "2025-11-10",
  "template_id": 1,
  "planned_start": "10:30",
  "planned_end": "10:45"
}
```

**Response (201):**
```json
{
  "message": "Break assigned successfully",
  "assignment": {
    "id": 1,
    "user_id": "E12345",
    "date": "2025-11-10"
  }
}
```

---

### 10.7 Update Break Assignment

**Endpoint:** `PUT /api/breaks/assignments/:assignmentId`  
**Access:** Protected (Admin, Leader)

**Request Body:**
```json
{
  "planned_start": "11:00",
  "planned_end": "11:15",
  "status": "rescheduled"
}
```

**Response (200):**
```json
{
  "message": "Break assignment updated successfully",
  "assignment": {
    "id": 1,
    "planned_start": "11:00:00",
    "planned_end": "11:15:00"
  }
}
```

---

### 10.8 Delete Break Assignment

**Endpoint:** `DELETE /api/breaks/assignments/:assignmentId`  
**Access:** Protected (Admin only)

**Response (200):**
```json
{
  "message": "Break assignment deleted successfully",
  "assignment_id": 1
}
```

---

### 10.9 Log Break

**Endpoint:** `POST /api/breaks/logs`  
**Access:** Protected (All roles - own breaks)

**Request Body:**
```json
{
  "assignment_id": 1,
  "actual_start": "2025-11-05T10:32:00Z",
  "actual_end": "2025-11-05T10:48:00Z",
  "reason": "Slight delay due to meeting"
}
```

**Response (201):**
```json
{
  "message": "Break logged successfully",
  "log": {
    "id": 1,
    "assignment_id": 1,
    "variance_min": 3,
    "created_at": "2025-11-05T10:48:00Z"
  }
}
```

**Note:** Automatically calculates variance from planned times

---

### 10.10 Get Break Logs

**Endpoint:** `GET /api/breaks/logs`  
**Access:** Protected (Admin, Leader)

**Query Parameters:**
- `user_id` (optional): Filter by user
- `date_from` (optional): Start date
- `date_to` (optional): End date

**Response (200):**
```json
{
  "logs": [
    {
      "id": 1,
      "assignment_id": 1,
      "user_id": "E12345",
      "user_name": "John Doe",
      "date": "2025-11-05",
      "planned_start": "10:30:00",
      "planned_end": "10:45:00",
      "actual_start": "2025-11-05T10:32:00Z",
      "actual_end": "2025-11-05T10:48:00Z",
      "variance_min": 3,
      "reason": "Slight delay due to meeting",
      "approved_by": null
    }
  ],
  "total": 0
}
```

---

### 10.11 Approve Break Variance

**Endpoint:** `POST /api/breaks/logs/:logId/approve`  
**Access:** Protected (Leader, Admin)

**Response (200):**
```json
{
  "message": "Break variance approved",
  "log": {
    "id": 1,
    "approved_by": "L12345",
    "variance_min": 3
  }
}
```

---

### 10.12 Request Break Swap

**Endpoint:** `POST /api/breaks/assignments/:assignmentId/swap`  
**Access:** Protected (All roles - own breaks)

**Request Body:**
```json
{
  "swap_with_user_id": "E12346"
}
```

**Response (200):**
```json
{
  "message": "Break swap requested",
  "assignment": {
    "id": 1,
    "swap_with_user_id": "E12346",
    "status": "swap_requested"
  }
}
```

---

### 10.13 Approve Break Swap

**Endpoint:** `POST /api/breaks/assignments/:assignmentId/swap/approve`  
**Access:** Protected (Leader, Admin)

**Response (200):**
```json
{
  "message": "Break swap approved",
  "assignments_swapped": 2
}
```

---

### 10.14 Get User Break Schedule

**Endpoint:** `GET /api/breaks/user/:userId/schedule`  
**Access:** Protected (Own schedule or Admin/Leader)

**Query Parameters:**
- `date` (optional): Specific date
- `week` (optional): Week offset from current (0 = this week)

**Response (200):**
```json
{
  "user_id": "E12345",
  "user_name": "John Doe",
  "date_from": "2025-11-04",
  "date_to": "2025-11-10",
  "assignments": [
    {
      "id": 1,
      "date": "2025-11-05",
      "planned_start": "10:30:00",
      "planned_end": "10:45:00",
      "status": "scheduled"
    }
  ],
  "total": 5
}
```

---

### 10.15 Get Break Adherence Report

**Endpoint:** `GET /api/breaks/adherence`  
**Access:** Protected (Admin, Leader)

**Query Parameters:**
- `unit_id` (optional): Filter by unit
- `date_from`: Start date (required)
- `date_to`: End date (required)

**Response (200):**
```json
{
  "date_range": {
    "from": "2025-11-01",
    "to": "2025-11-05"
  },
  "unit_id": 1,
  "unit_name": "Engineering",
  "adherence": [
    {
      "user_id": "E12345",
      "user_name": "John Doe",
      "total_breaks": 5,
      "logged_breaks": 4,
      "on_time_breaks": 3,
      "late_breaks": 1,
      "avg_variance_min": 2.5,
      "adherence_rate": 80
    }
  ],
  "summary": {
    "total_users": 45,
    "overall_adherence": 85.5
  }
}
```

---

## 11. Notification System

### 11.1 Get User Notifications

**Endpoint:** `GET /api/notifications`  
**Access:** Protected (All roles - own notifications)

**Query Parameters:**
- `is_read` (optional): true/false
- `type` (optional): Notification type

**Response (200):**
```json
{
  "notifications": [
    {
      "id": 1,
      "title": "Request Approved",
      "message": "Your annual leave request has been approved",
      "type": "request_approval",
      "related_id": 7,
      "related_type": "request",
      "is_read": false,
      "created_at": "2025-11-05T09:00:00Z"
    }
  ],
  "unread_count": 7,
  "total": 15
}
```

---

### 11.2 Mark Notification as Read

**Endpoint:** `PUT /api/notifications/:notificationId/read`  
**Access:** Protected (Notification owner)

**Response (200):**
```json
{
  "message": "Notification marked as read",
  "notification_id": 1
}
```

---

### 11.3 Mark All as Read

**Endpoint:** `PUT /api/notifications/read-all`  
**Access:** Protected (All roles)

**Response (200):**
```json
{
  "message": "All notifications marked as read",
  "count": 7
}
```

---

### 11.4 Delete Notification

**Endpoint:** `DELETE /api/notifications/:notificationId`  
**Access:** Protected (Notification owner)

**Response (200):**
```json
{
  "message": "Notification deleted successfully",
  "notification_id": 1
}
```

---

## 12. File Upload

### 12.1 Upload Attachment

**Endpoint:** `POST /api/attachments/upload`  
**Access:** Protected (All roles)  
**Content-Type:** `multipart/form-data`

**Request:**
```
Field: type (string) - "profile" / "request" / "circular" / "event" / "warning"
File: file (image or document)
```

**Supported Formats:**
- Images: JPEG, PNG, GIF (max 5MB)
- Documents: PDF, DOC, DOCX (max 10MB)

**Response (200):**
```json
{
  "message": "File uploaded successfully",
  "url": "https://res.cloudinary.com/.../document.pdf",
  "public_id": "dasho_attachments/abc123",
  "format": "pdf",
  "resource_type": "raw"
}
```

**Cloudinary Folders:**
- Profile photos: `dasho_profiles/`
- Request attachments: `dasho_requests/`
- Circulars: `dasho_circulars/`
- Events: `dasho_events/`
- Warnings: `dasho_warnings/`

---

### 12.2 Delete Attachment

**Endpoint:** `DELETE /api/attachments/:publicId`  
**Access:** Protected (Admin or owner)

**Response (200):**
```json
{
  "message": "Attachment deleted successfully",
  "public_id": "dasho_attachments/abc123"
}
```

---

## 13. Push Notifications

### 13.1 Register FCM Token

**Endpoint:** `POST /api/fcm/register`  
**Access:** Protected (All roles)

**Request Body:**
```json
{
  "fcm_token": "firebase_device_token_here"
}
```

**Response (200):**
```json
{
  "message": "FCM token registered successfully",
  "user_id": "E12345"
}
```

**Note:** Token is stored in users.fcm_token and used for push notifications

---

### 13.2 Push Notification Triggers

Push notifications are automatically sent when:

1. **New Announcement** (Admin/Leader creates announcement)
   - Title: Announcement title
   - Body: First 100 characters of content
   - Recipients: All users matching target_role with FCM tokens
   - Data: { type: "announcement", id: announcement_id }

2. **New Circular** (Admin creates circular)
   - Title: "New Circular: {title}"
   - Body: First 100 characters of description
   - Recipients: All users with FCM tokens
   - Data: { type: "circular", id: circular_id }

3. **Request Approved** (Leader/Admin approves request)
   - Title: "Request Approved"
   - Body: "Your {req_type} request has been approved"
   - Recipients: Request owner
   - Data: { type: "request", id: request_id, status: "approved" }

4. **Request Rejected** (Leader/Admin rejects request)
   - Title: "Request Rejected"
   - Body: "Your {req_type} request has been rejected"
   - Recipients: Request owner
   - Data: { type: "request", id: request_id, status: "rejected" }

5. **Warning Issued** (Admin/Leader issues warning)
   - Title: "Warning Issued"
   - Body: "You have received a {kind}"
   - Recipients: Warned user
   - Data: { type: "warning", id: warning_id }

---

**Continue to Part 4:** Issues Encountered & Solutions

