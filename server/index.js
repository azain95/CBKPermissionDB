import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
const { hash, compare } = bcrypt;
import pkg from "jsonwebtoken";
const { sign, verify } = pkg;
import http from "http";
import pool from "./db.js";
import fs from "fs";
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import scheduleRouter from './routes/schedules.js';
import authenticateJWT from './middleware/auth.js';
import authenticateAdmin from './middleware/adminAuth.js';
import authenticateLeader from './middleware/leaderAuth.js';
import csv from 'csv-parser';
import stream from 'stream';
import format from 'pg-format';
import { createTransport } from 'nodemailer';
import rateLimit from 'express-rate-limit';
import { initializeFirebase, sendPushNotification, sendPushNotificationToMultiple } from './firebase.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const saltRounds = 10;

// Initialize Firebase
initializeFirebase();

// Map structure: { email: { otp: '123456', expires: timestamp } }
const otpStore = new Map();

// Cleanup expired OTPs every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of otpStore.entries()) {
    if (data.expires < now) {
      otpStore.delete(email);
    }
  }
}, 10 * 60 * 1000);

const transporter = createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});


// Email validation regex
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Password strength validation
const validatePasswordStrength = (password) => {
  if (!password || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true };
};


// Strict rate limiter for password reset endpoints (3 attempts per 15 minutes per IP)
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 requests per window
  message: { error: 'Too many password reset attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General auth rate limiter for signin (10 attempts per 15 minutes)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // req.body

// JWT secret key
import { jwtSecret } from './config.js';


// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- Uploader #1: For Profile Photos (uploads to Cloudinary) ---
const cloudinaryStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'dasho_profile_images',
        format: async (req, file) => 'png',
        public_id: (req, file) => `profile-${Date.now()}`,
    },
});
const uploadProfilePhoto = multer({ storage: cloudinaryStorage });


// --- Uploader #2: For CSV Schedule Import (uploads to memory) ---
const csvMemoryStorage = multer.memoryStorage();
const uploadCsv = multer({ storage: csvMemoryStorage });

// --- Uploader #3: For Attachments (uploads to Cloudinary via memory buffer) ---
const mem = multer({ storage: multer.memoryStorage() });

// --- Uploader #4: For Announcements (uploads to Cloudinary) ---
const announcementStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'dasho/announcements',
        resource_type: 'auto', // Supports images, PDFs, docs, etc.
        allowed_formats: ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'],
    },
});
const upload = multer({ 
    storage: announcementStorage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});


app.use('/schedules', scheduleRouter);

// POST /schedules/import - Handles CSV file upload for schedules
app.post("/schedules/import", authenticateJWT, authenticateAdmin, uploadCsv.single('file'), async (req, res) => {
    console.log("--- Received request to /schedules/import ---");
    const { year, month } = req.body;

    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: "File buffer is missing. Please upload a valid file." });
    }
    const fileBuffer = req.file.buffer;

    if (!year || !month) {
        return res.status(400).json({ error: "Year and month are required." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const allUsersResult = await client.query('SELECT user_id, name, unit FROM users');
        
        // --- FIX #1: Convert all database user_id keys to lowercase for the map ---
        const existingUsers = new Map(allUsersResult.rows.map(u => 
            [u.user_id.toLowerCase(), { originalId: u.user_id, name: u.name, unit: u.unit }]
        ));

        const schedulesToInsert = [];
        const notFoundInDb = [];
        const usersFoundInCsv = new Set();

        const readableStream = new stream.Readable();
        readableStream.push(fileBuffer);
        readableStream.push(null);

        readableStream
            .pipe(csv({ separator: ',' }))
            .on('data', (row) => {
                const userIdFromCsv = row.user_id || row[''] || Object.values(row)[0];
                if (!userIdFromCsv) return;

                // --- FIX #2: Convert the CSV user_id to lowercase before looking it up ---
                const userFromDb = existingUsers.get(userIdFromCsv.toLowerCase());

                if (userFromDb) {
                    // Use the original, correct-case user ID for inserts
                    const originalUserId = userFromDb.originalId;
                    usersFoundInCsv.add(originalUserId);

                    for (const key in row) {
                        const dateMatch = key.trim().match(/(\d{1,2})\/(\d{1,2})/);
                        if (dateMatch && row[key]) {
                            const csvMonth = parseInt(dateMatch[1], 10);
                            const day = parseInt(dateMatch[2], 10);

                            if (csvMonth === parseInt(month, 10)) {
                                const shiftValue = row[key].trim();
                                if (shiftValue) { // Ensure shift value is not empty
                                    const shiftDate = new Date(Date.UTC(year, month - 1, day));
                                    schedulesToInsert.push([
                                        originalUserId, // Use original case for DB
                                        shiftDate.toISOString().split('T')[0],
                                        shiftValue,
                                        shiftValue,
                                        userFromDb.unit || null
                                    ]);
                                }
                            }
                        }
                    }
                } else {
                    if (!notFoundInDb.includes(userIdFromCsv)) {
                         notFoundInDb.push(userIdFromCsv);
                    }
                }
            })
            .on('end', async () => {
                try {
                    if (usersFoundInCsv.size > 0) {
                        const userList = Array.from(usersFoundInCsv);
                        await client.query(
                            `DELETE FROM schedules WHERE EXTRACT(YEAR FROM shift_date) = $1 AND EXTRACT(MONTH FROM shift_date) = $2 AND user_id = ANY($3::text[])`,
                            [year, month, userList]
                        );
                    }
                    
                    if (schedulesToInsert.length > 0) {
                        const insertQuery = format('INSERT INTO schedules (user_id, shift_date, shift_type, shift_time, unit) VALUES %L', schedulesToInsert);
                        await client.query(insertQuery);
                    }
                    
                    await client.query('COMMIT');

                    const allDbUserIds = new Set(allUsersResult.rows.map(u => u.user_id));
                    const usersWithoutSchedule = [...allDbUserIds]
                        .filter(id => !usersFoundInCsv.has(id))
                        .map(id => ({ id: id, name: existingUsers.get(id.toLowerCase())?.name || 'N/A' }));

                    res.status(200).json({
                        message: "Import processed successfully.",
                        insertedCount: schedulesToInsert.length,
                        notFoundInDb,
                        usersWithoutSchedule,
                    });
                    
                } catch (dbError) {
                    await client.query('ROLLBACK');
                    console.error("Database transaction error:", dbError);
                    res.status(500).json({ error: "Failed to update database." });
                }
            });

    } catch (err) {
        console.error("General error during import:", err);
        await client.query('ROLLBACK').catch(rollbackErr => console.error('Rollback failed:', rollbackErr));
        res.status(500).json({ error: "An unexpected error occurred." });
    } finally {
        client.release();
    }
});

app.post('/attachments', authenticateJWT, mem.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Missing file' });
    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: 'dasho_request_attachments',
      resource_type: 'auto',
    });
    return res.status(201).json({ attachment_url: result.secure_url });
  } catch (e) {
    console.error('Attachment upload failed', e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// POST /users/update-units - Update user units from CSV
app.post('/users/update-units', authenticateJWT, uploadCsv.single('scheduleFile'), async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!req.file) {
        return res.status(400).json({ error: 'No file provided for unit update.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const userResult = await client.query('SELECT user_id FROM users');
        const userMap = new Map(userResult.rows.map(u => [u.user_id.trim().toLowerCase(), u.user_id.trim()]));

        let currentUnit = null;
        const userToUnitMap = new Map();

        const fileContent = req.file.buffer.toString('utf8');
        const lines = fileContent.split(/\r?\n/);

        // --- NEW, MORE ROBUST LOGIC ---
        // 1. Handle the very first line to get the initial unit.
        if (lines.length > 0) {
            const firstLineColumns = lines[0].split(',').map(c => c.trim());
            if (firstLineColumns.length > 1) {
                currentUnit = firstLineColumns[1]; // e.g., "CC Zone"
            }
        }

        // 2. Process all lines to map users to their units
        for (const line of lines) {
            const columns = line.split(',').map(c => c.trim());
            // If we find a new unit header, update our current unit
            if (columns[0] === '' && columns[1]) {
                currentUnit = columns[1];
            } 
            // If it's a staff row and we have a unit defined
            else if (columns[0] && currentUnit) {
                const userId = columns[0].toLowerCase();
                if (userMap.has(userId)) {
                    // Map the user to the unit we are currently tracking
                    userToUnitMap.set(userMap.get(userId), currentUnit);
                }
            }
        }
        
        let updatedUsersCount = 0;
        for (const [userId, unit] of userToUnitMap.entries()) {
            const updateResult = await client.query(
                'UPDATE users SET unit = $1 WHERE user_id = $2',
                [unit, userId]
            );
            updatedUsersCount += updateResult.rowCount;
        }

        await client.query('COMMIT');
        res.json({ message: `Successfully updated ${updatedUsersCount} users with new unit assignments.` });

    } catch (dbError) {
        await client.query('ROLLBACK');
        console.error('Database error during unit update:', dbError);
        res.status(500).json({ error: 'A database error occurred during unit update.', details: dbError.message });
    } finally {
        client.release();
    }
});

// POST /signup - Create user
app.post("/signup", async (req, res) => {
    try {
        const {
            user_id, name, email, mobile, password, is_admin, civil_id, emergency_contact,
            address, photo_url, dob, joining_date, education, graduation_year,
            driving_license, contract_type, job_title, grade, status, nationality,
        } = req.body;
        
        // Validate email format
        if (email && !isValidEmail(email)) {
            return res.status(400).json({ error: "Invalid email format" });
        }
        
        // Validate password strength
        const passwordCheck = validatePasswordStrength(password);
        if (!passwordCheck.valid) {
            return res.status(400).json({ error: passwordCheck.message });
        }
        
        const hashedPassword = await hash(password, saltRounds);
        const result = await pool.query(
            `INSERT INTO users (
                user_id, name, email, mobile, password, is_admin, civil_id, emergency_contact,
                address, photo_url, dob, joining_date, education, graduation_year,
                driving_license, contract_type, job_title, grade, status, nationality
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
            RETURNING *`,
            [
                user_id, name, email, mobile, hashedPassword, is_admin || false, civil_id,
                emergency_contact, address, photo_url || null, dob, joining_date, education,
                graduation_year, driving_license, contract_type, job_title, grade, status, nationality
            ]
        );
        const { password: returnedPassword, ...userWithoutPassword } = result.rows[0];
        res.status(201).json(userWithoutPassword);
    } catch (err) {
        console.error(err.message);
        if (err.code === '23505') {
            res.status(409).json({ error: "User ID already exists" });
        } else {
            res.status(500).json({ error: "Error creating user", details: err.message });
        }
    }
});

// DELETE /users/:user_id - Soft-delete user by setting status to inactive
app.delete("/users/:user_id", authenticateJWT, authenticateAdmin, async (req, res) => {
    try {
        const { user_id } = req.params;
        // Instead of DELETE, we UPDATE the user's status.
        const result = await pool.query(
            "UPDATE users SET status = 'inactive' WHERE user_id = $1 RETURNING user_id",
            [user_id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        // We can now say "disabled" or "archived" instead of "deleted".
        res.json({ message: "User disabled successfully" });

    } catch (err) {
        console.error("Error disabling user:", err.message);
        // Provide a more specific error message if a foreign key constraint was the issue.
        if (err.code === '23503') {
             return res.status(409).json({ error: "Cannot disable user. They have dependent records (e.g., requests) that need to be handled." });
        }
        res.status(500).json({ error: "Error disabling user" });
    }
});

// POST /requests - Create leave/permission request
app.post("/requests", authenticateJWT, async (req, res) => {
  try {
    const { req_type, date_from, date_to, time_from, time_to, reason, attachment_url } = req.body;
    const user_id = req.user?.user_id;
    if (!user_id) return res.status(401).json({ error: "Unauthorized" });

    const allowed = new Set([
      "permission",
      "swap",
      "sick leave",
      "annual leave",
      "other leave",
      "emergency leave",
      "maternity leave",
    ]);
    if (!allowed.has(String(req_type || "").toLowerCase())) {
      return res.status(400).json({ error: "Invalid req_type" });
    }

    const toNull = (v) => (v === "" || v === undefined ? null : v);

    const sql =
      'INSERT INTO "requests" ("user_id","req_type","date_from","date_to","time_from","time_to","reason","attachment_url","status") ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *';

    const params = [
      user_id,
      req_type,
      toNull(date_from),    // YYYY-MM-DD
      toNull(date_to),      // YYYY-MM-DD
      toNull(time_from),    // HH:mm
      toNull(time_to),      // HH:mm
      toNull(reason),
      toNull(attachment_url),
      "pending",
    ];

    const result = await pool.query(sql, params);
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create /requests failed:", { code: err.code, detail: err.detail, message: err.message });
    if (err.code === "22P02") return res.status(400).json({ error: "Invalid date/time format" });
    return res.status(500).json({ error: "Error creating permission request" });
  }
});

// POST /changepassword - Change user password
app.post("/changepassword", authenticateJWT, async (req, res) => {
  try {
    const { user_id, newPassword } = req.body;

    if (req.user.user_id !== user_id && !req.user.is_admin) {
        return res.sendStatus(403);
    }
    
    // Validate password strength
    const passwordCheck = validatePasswordStrength(newPassword);
    if (!passwordCheck.valid) {
        return res.status(400).json({ error: passwordCheck.message });
    }

    const user = await pool.query("SELECT * FROM users WHERE user_id = $1", [
      user_id,
    ]);

    if (user.rows.length > 0) {
      const hashedNewPassword = await hash(newPassword, saltRounds);

      await pool.query("UPDATE users SET password = $1 WHERE user_id = $2", [
        hashedNewPassword,
        user_id,
      ]);

      res.json({ message: "Password updated successfully" });
    } else {
      res.status(400).json({ error: "User not found" });
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error changing password" });
  }
});


// GET /requests - Get all requests with optional type filter
app.get("/requests", authenticateJWT, async (req, res) => {
  try {
    const { type } = req.query;
    const filters = [];
    const params = [];
    let idx = 1;

    if (!req.user.is_admin) {
      filters.push(`r."user_id" = $${idx++}`);
      params.push(req.user.user_id);
    }

    if (type) {
      filters.push(`LOWER(r."req_type") = $${idx++}`);
      params.push(String(type).toLowerCase());
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const sql = `SELECT r.*, u.name FROM "requests" r
                 JOIN "users" u ON r."user_id" = u."user_id"
                 ${where}
                 ORDER BY r.req_datetime DESC`;

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Error retrieving requests:", err);
    res.status(500).json({ error: "Error retrieving requests" });
  }
});

// GET /requests/user/:user_id - Get requests for specific user
app.get("/requests/user/:user_id", authenticateJWT, async (req, res) => {
  try {
    const { user_id } = req.params;
    if (req.user.user_id !== user_id && !req.user.is_admin) {
        return res.sendStatus(403);
    }
    const userRequests = await pool.query(
      'SELECT * FROM "requests" WHERE "user_id" = $1 ORDER BY req_datetime DESC',
      [user_id]
    );
    res.json(userRequests.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error retrieving user requests" });
  }
});

// Get all users
app.get("/users", authenticateJWT, async (req, res) => {
  try {
    const allUsers = await pool.query(
       'SELECT * FROM "users" ORDER BY name'
    );
    const usersWithoutPasswords = allUsers.rows.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
    res.json(usersWithoutPasswords);
  } catch (err) {
    console.error("Error in /users route:", err.message);
    res.status(500).json({ error: "Error retrieving users" });
  }
});

// Get specific user
app.get("/users/:user_id", authenticateJWT, async (req, res) => {
  try {
  const { user_id } = req.params;
  if (req.user.role !== 'admin' && req.user.user_id !== user_id) {
    return res.status(403).json({ error: "You are not authorized to view this profile." });
  }
  const user = await pool.query(
    `SELECT user_id, name, email, mobile, is_admin, civil_id, emergency_contact, 
        address, photo_url, dob, joining_date, education, graduation_year, 
        driving_license, contract_type, job_title, grade, status, nationality, 
        role, unit 
     FROM "users" WHERE "user_id" = $1`,
    [user_id]
  );

  if (user.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { password, ...userWithoutPassword } = user.rows[0];
  res.json(userWithoutPassword);
  } catch (err) {
  console.error(err.message);
  res.status(500).json({ error: "Error fetching user" });
  }
});

// Update a user (including profile photo)
app.put("/users/:user_id", authenticateJWT, uploadProfilePhoto.single('photo'), async (req, res) => {
  try {
    const { user_id } = req.params;
    if (req.user.user_id !== user_id && req.user.role !== 'admin') {
      return res.sendStatus(403);
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;
    const editableFields = [
      'name', 'email', 'mobile', 'civil_id', 'emergency_contact', 'address', 'dob',
      'joining_date', 'education', 'graduation_year', 'driving_license',
      'contract_type', 'job_title', 'grade', 'status', 'nationality',
      'is_admin', 'role', 'unit'
    ];
    for (const field of editableFields) {
      if (req.body[field] !== undefined) {
        let valueToSave = req.body[field];
        if (['dob', 'joining_date'].includes(field) && valueToSave === '') {
          valueToSave = null;
        }
        if (field === 'driving_license' && typeof valueToSave !== 'boolean') {
          valueToSave = valueToSave === 'Yes' || valueToSave === true;
        }
        updates.push(`"${field}" = $${paramIndex++}`);
        values.push(valueToSave);
      }
    }
    if (req.file) {
      updates.push(`photo_url = $${paramIndex++}`);
      values.push(req.file.path);
    } else if (req.body.photo_url !== undefined && req.body.photo_url === '') {
      updates.push(`photo_url = $${paramIndex++}`);
      values.push(null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update provided' });
    }

    values.push(user_id);
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE user_id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found or nothing to update' });
    }

    const { password, ...updatedUserWithoutPassword } = result.rows[0];
    res.json(updatedUserWithoutPassword);

  } catch (err) {
    console.error("--- ERROR IN PUT /users/:user_id ROUTE ---", err);
    res.status(500).json({ error: 'Error updating user profile', details: err.message });
  }
});

// Update a request
app.put("/requests/:request_id", authenticateJWT, async (req, res) => {
  try {
    const { request_id } = req.params;
    const { status, approved_by, approved_by_2, rejection_reason } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        values.push(status);
    }
    if (approved_by !== undefined) {
        updates.push(`approved_by = $${paramIndex++}`);
        values.push(approved_by);
    }
    if (approved_by_2 !== undefined) {
        updates.push(`approved_by_2 = $${paramIndex++}`);
        values.push(approved_by_2);
    }
    if (rejection_reason !== undefined) {
        updates.push(`rejection_reason = $${paramIndex++}`);
        values.push(rejection_reason);
    }

    if (updates.length === 0) {
        return res.status(400).json({ message: "No fields to update provided" });
    }

    values.push(request_id);

    const updateRequest = await pool.query(
      `UPDATE "requests" SET ${updates.join(', ')} WHERE "id" = $${paramIndex} RETURNING *`,
      values
    );

    if (updateRequest.rowCount === 0) {
      return res.status(404).json({ error: "Request not found" });
    }

    res.json(updateRequest.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error updating request" });
  }
});

// Delete a request
app.delete("/requests/:request_id", authenticateJWT, async (req, res) => {
  try {
    const { request_id } = req.params;
    const deleteRequest = await pool.query(
      'DELETE FROM "requests" WHERE "id" = $1',
      [request_id]
    );
    if (deleteRequest.rowCount === 0) {
      return res.status(404).json({ error: "Request not found" });
    }
    res.json({ message: "Request deleted successfully" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error deleting request" });
  }
});

// Grant admin privileges from a user
app.put("/users/makeadmin/:user_id", authenticateJWT,authenticateAdmin, async (req, res) => {
  try {
    const { user_id } = req.params;

    const user = await pool.query(
      'SELECT * FROM "users" WHERE "user_id" = $1',
      [user_id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await pool.query(
      'UPDATE "users" SET "is_admin" = true WHERE "user_id" = $1',
      [user_id]
    );

    res.json({ message: "User updated to admin successfully" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error updating user to admin" });
  }
});

// Remove admin privileges from a user
app.put("/users/removeadmin/:user_id", authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { user_id } = req.params;

    const user = await pool.query("SELECT * FROM users WHERE user_id = $1", [
      user_id,
    ]);

    if (user.rows.length > 0) {
      await pool.query("UPDATE users SET is_admin = $1 WHERE user_id = $2", [
        false,
        user_id,
      ]);

      res.json({ message: "Admin privileges removed successfully" });
    } else {
      res.status(400).json({ error: "User not found" });
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error removing admin privileges" });
  }
});

// Approve a leave request (Simplified Dual Approval for now)
app.put(
  "/requests/:request_id/approve",
  authenticateJWT,
  async (req, res) => {
    try {
      const { request_id } = req.params;
      const { user_id } = req.user;

      const request = await pool.query('SELECT status, approved_by, approved_by_2 FROM requests WHERE id = $1', [request_id]);
      if (request.rows.length === 0) {
          return res.status(404).json({ error: "Request not found" });
      }

      const currentStatus = request.rows[0].status;
      const approvedBy1 = request.rows[0].approved_by;
      const approvedBy2 = request.rows[0].approved_by_2;

      let newStatus = currentStatus;
      let updateApprovedBy1 = approvedBy1;
      let updateApprovedBy2 = approvedBy2;

      if (currentStatus === 'pending') {
          if (!approvedBy1) {
              updateApprovedBy1 = user_id;
              newStatus = 'approved';
          } else if (approvedBy1 && !approvedBy2 && approvedBy1 !== user_id) {
              updateApprovedBy2 = user_id;
              newStatus = 'approved';
          } else if (approvedBy1 === user_id) {
              return res.status(400).json({ error: "You have already approved this request." });
          } else if (approvedBy2 === user_id) {
              return res.status(400).json({ error: "You have already provided the second approval for this request." });
          } else {
              return res.status(400).json({ error: "Request already fully approved or not awaiting your approval." });
          }
      } else if (currentStatus === 'approved') {
          return res.status(400).json({ error: "Request is already approved." });
      } else if (currentStatus === 'rejected') {
          return res.status(400).json({ error: "Request has been rejected." });
      }

      const updateRequest = await pool.query(
        'UPDATE "requests" SET "status" = $1, "approved_by" = $2, "approved_by_2" = $3 WHERE "id" = $4 RETURNING *',
        [newStatus, updateApprovedBy1, updateApprovedBy2, request_id]
      );

      res.json(updateRequest.rows[0]);

    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: "Error approving request" });
    }
  }
);

// Reject a leave request
app.put("/requests/:request_id/reject", authenticateJWT, async (req, res) => {
  try {
    const { request_id } = req.params;
    const { reason } = req.body;
    const { user_id } = req.user;

    const updateRequest = await pool.query(
      'UPDATE "requests" SET "status" = $1, "rejection_reason" = $2, "approved_by" = $3 WHERE "id" = $4 RETURNING *',
      ["rejected", reason, user_id, request_id]
    );

    if (updateRequest.rowCount === 0) {
        return res.status(404).json({ error: "Request not found" });
    }
    res.json(updateRequest.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error rejecting request" });
  }
});



app.get('/users/:userId/schedule-details', authenticateJWT, async (req, res) => {
    const { userId } = req.params;
    const { year, month } = req.query;

    // --- Authorization Check ---
    // A user can view their own details. An admin/leader can view anyone's.
    if (req.user.role !== 'admin' && req.user.role !== 'leader' && req.user.user_id !== userId) {
        return res.status(403).json({ error: 'Forbidden: You do not have permission to view this profile.' });
    }

    if (!year || !month) {
        return res.status(400).json({ error: "Year and month query parameters are required." });
    }

    try {
        // Define the three queries we need to run
        const profileQuery = pool.query(
            `SELECT user_id, name, email, mobile, job_title, unit, photo_url FROM users WHERE user_id = $1`,
            [userId]
        );

        const schedulesQuery = pool.query(
            `SELECT id, shift_date, shift_type, shift_time FROM schedules 
             WHERE user_id = $1 AND EXTRACT(YEAR FROM shift_date) = $2 AND EXTRACT(MONTH FROM shift_date) = $3 
             ORDER BY shift_date`,
            [userId, year, month]
        );
        
        const requestsQuery = pool.query(
            `SELECT id, req_type, status, date_from, date_to FROM requests 
             WHERE user_id = $1 AND EXTRACT(YEAR FROM req_datetime) = $2 AND EXTRACT(MONTH FROM req_datetime) = $3 
             ORDER BY req_datetime DESC`,
            [userId, year, month]
        );

        // Run all queries in parallel for maximum efficiency
        const [profileResult, schedulesResult, requestsResult] = await Promise.all([
            profileQuery,
            schedulesQuery,
            requestsQuery
        ]);

        if (profileResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Combine the results into a single JSON response
        res.json({
            profile: profileResult.rows[0],
            schedules: schedulesResult.rows,
            requests: requestsResult.rows
        });

    } catch (err) {
        console.error(`Error fetching schedule details for user ${userId}:`, err);
        res.status(500).json({ error: 'Server error while fetching employee details.' });
    }
});



// Dashboard statistics
app.get("/dashboard/statistics", authenticateJWT, async (req, res) => {
  try {
    const requests = await pool.query(
      'SELECT req_type, status, COUNT(*) AS count FROM "requests" GROUP BY req_type, status'
    );

    const users = await pool.query('SELECT COUNT(*) AS count FROM "users"');

    const statistics = {
      totalLeaves: 0,
      totalPermissions: 0,
      totalSwaps: 0,
      totalApprovedLeaves: 0,
      totalApprovedPermissions: 0,
      totalApprovedSwaps: 0,
      totalRejectedLeaves: 0,
      totalRejectedPermissions: 0,
      totalRejectedSwaps: 0,
      totalPendingLeaves: 0,
      totalPendingPermissions: 0,
      totalPendingSwaps: 0,
      totalUsers: users.rows[0].count,
    };

    requests.rows.forEach((row) => {
      const count = parseInt(row.count, 10);
      if (
        [
          "sick leave",
          "annual leave",
          "other leave",
          "emergency leave",
          "maternity leave",
        ].includes(row.req_type)
      ) {
        statistics.totalLeaves += count;
        if (row.status === "approved") statistics.totalApprovedLeaves += count;
        if (row.status === "rejected") statistics.totalRejectedLeaves += count;
        if (row.status === "pending") statistics.totalPendingLeaves += count;
      }

      if (row.req_type === "swap") {
        statistics.totalSwaps += count;
        if (row.status === "approved") statistics.totalApprovedSwaps += count;
        if (row.status === "rejected") statistics.totalRejectedSwaps += count;
        if (row.status === "pending") statistics.totalPendingSwaps += count;
      }
      if (row.req_type === "permission") {
        statistics.totalPermissions += count;
        if (row.status === "approved")
          statistics.totalApprovedPermissions += count;
        if (row.status === "rejected")
          statistics.totalRejectedPermissions += count;
        if (row.status === "pending")
          statistics.totalPendingPermissions += count;
      }
    });

    res.json(statistics);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error retrieving statistics" });
  }
});

// GET events for a specific user
app.get("/events/user/:user_id", authenticateJWT, async (req, res) => {
    try {
        const { user_id } = req.params;
        if (req.user.user_id !== user_id && !req.user.is_admin) {
            return res.sendStatus(403);
        }
        const userEvents = await pool.query('SELECT * FROM events WHERE user_id = $1 ORDER BY event_date DESC', [user_id]);
        res.json(userEvents.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Error retrieving user events" });
    }
});


// Read the SQL script from the file
const sqlScript = fs.readFileSync(join(__dirname, "database.sql"), "utf8");

export async function runSqlScript() {
  try {
    await pool.query(sqlScript);
    console.log("SQL script executed successfully");
  } catch (error) {
    console.error("Error executing SQL script:", error);
  }
}

// (router already mounted above)


// GET /schedules/my-schedule - Get current user's schedule with leave integration
app.get('/schedules/my-schedule', authenticateJWT, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { month, year, unit_id } = req.query;

    let query = `
      SELECT 
        id,
        user_id,
        shift_date as date,
        shift_type as shift_code,
        shift_time as start_time,
        '' as end_time,
        shift_type as type,
        unit as unit_name
      FROM schedules 
      WHERE user_id = $1
    `;
    const params = [user_id];
    let paramIndex = 2;

    if (month && year) {
      query += ` AND EXTRACT(MONTH FROM shift_date) = $${paramIndex} AND EXTRACT(YEAR FROM shift_date) = $${paramIndex + 1}`;
      params.push(parseInt(month), parseInt(year));
      paramIndex += 2;
    }

    if (unit_id && unit_id !== 'all') {
      query += ` AND unit = $${paramIndex}`;
      params.push(unit_id);
    }

    query += ` ORDER BY shift_date ASC`;

    const { rows } = await pool.query(query, params);

    // Add linked_request info if there are any approved leaves for these dates
    const scheduleWithLeaves = await Promise.all(rows.map(async (schedule) => {
      const leaveCheck = await pool.query(
        `SELECT req_type FROM requests 
         WHERE user_id = $1 
         AND status = 'approved' 
         AND date_from <= $2 
         AND date_to >= $2`,
        [user_id, schedule.date]
      );

      if (leaveCheck.rows.length > 0) {
        schedule.linked_request = `On ${leaveCheck.rows[0].req_type}`;
      }

      return schedule;
    }));

    res.json({ schedule: scheduleWithLeaves });
  } catch (err) {
    console.error('Error fetching my schedule:', err);
    res.status(500).json({ error: 'Error retrieving schedule' });
  }
});

// GET /schedules/user/:userId - Get specific user's schedule (for swap requests)
app.get('/schedules/user/:userId', authenticateJWT, async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year, unit_id } = req.query;

    console.log(`📅 Fetching schedule for user: ${userId}, month: ${month}, year: ${year}`);

    let query = `
      SELECT 
        id,
        user_id,
        shift_date as date,
        shift_type as shift_code,
        shift_time as start_time,
        '' as end_time,
        shift_type as type,
        unit as unit_name
      FROM schedules 
      WHERE user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;

    if (month && year) {
      query += ` AND EXTRACT(MONTH FROM shift_date) = $${paramIndex} AND EXTRACT(YEAR FROM shift_date) = $${paramIndex + 1}`;
      params.push(parseInt(month), parseInt(year));
      paramIndex += 2;
    }

    if (unit_id && unit_id !== 'all') {
      query += ` AND unit = $${paramIndex}`;
      params.push(unit_id);
    }

    query += ` ORDER BY shift_date ASC`;

    const { rows } = await pool.query(query, params);

    // Add linked_request info if there are any approved leaves for these dates
    const scheduleWithLeaves = await Promise.all(rows.map(async (schedule) => {
      const leaveCheck = await pool.query(
        `SELECT req_type FROM requests 
         WHERE user_id = $1 
         AND status = 'approved' 
         AND date_from <= $2 
         AND date_to >= $2`,
        [userId, schedule.date]
      );

      if (leaveCheck.rows.length > 0) {
        schedule.linked_request = `On ${leaveCheck.rows[0].req_type}`;
      }

      return schedule;
    }));

    console.log(`✅ Found ${scheduleWithLeaves.length} schedule entries for user ${userId}`);
    res.json({ schedule: scheduleWithLeaves });
  } catch (err) {
    console.error('Error fetching user schedule:', err);
    res.status(500).json({ error: 'Error retrieving user schedule' });
  }
});

// PUT /schedules/:id - Update schedule shift (leader/admin only)
app.put('/schedules/:id', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { id } = req.params;
    const { shift_type } = req.body;
    
    // Validation
    if (!shift_type) {
      return res.status(400).json({ error: 'Shift type is required' });
    }
    
    const { rows } = await pool.query(
      'UPDATE schedules SET shift_type = $1 WHERE id = $2 RETURNING *',
      [shift_type, id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating schedule:', err);
    res.status(500).json({ error: 'Error updating schedule' });
  }
});

// GET /announcements - Get all announcements with read status for current user
app.get('/announcements', authenticateJWT, async (req, res) => {
  try {
    const { user_id, role } = req.user;
    const { target_role, is_urgent } = req.query;

    // Build query with filters
    let query = `
      SELECT 
        a.id,
        a.title,
        a.content,
        a.target_role,
        a.is_urgent,
        a.attachment_url,
        a.author_id as created_by,
        a.created_at,
        CASE WHEN ar.read_at IS NOT NULL THEN true ELSE false END as is_read
      FROM announcements a
      LEFT JOIN announcement_reads ar ON a.id = ar.announcement_id AND ar.user_id = $1
      WHERE 1=1
    `;

    const values = [user_id];
    let paramIndex = 2;

    // Filter by target_role (staff can see "employee" and "all", leaders see all except admin-only, admins see all)
    if (target_role) {
      query += ` AND a.target_role = $${paramIndex++}`;
      values.push(target_role);
    } else {
      // Default filtering by user role
      if (role === 'staff') {
        query += ` AND a.target_role IN ('employee', 'all')`;
      } else if (role === 'leader') {
        query += ` AND a.target_role IN ('leader', 'employee', 'all')`;
      }
      // Admins see all
    }

    // Filter by urgency
    if (is_urgent !== undefined) {
      const isUrgentBool = is_urgent === 'true' || is_urgent === true;
      query += ` AND a.is_urgent = $${paramIndex++}`;
      values.push(isUrgentBool);
    }

    query += ` ORDER BY a.is_urgent DESC, a.created_at DESC`;

    const { rows } = await pool.query(query, values);
    
    console.log(`📢 Fetched ${rows.length} announcements for user ${user_id}`);
    res.json(rows); // Return array directly as per admin team's spec
  } catch (err) {
    console.error('❌ Error fetching announcements:', err);
    res.status(500).json({ error: 'Error retrieving announcements' });
  }
});

// POST /announcements/:id/read - Mark announcement as read
app.post('/announcements/:id/read', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.user;

    await pool.query(
      `INSERT INTO announcement_reads (announcement_id, user_id) 
       VALUES ($1, $2) 
       ON CONFLICT (announcement_id, user_id) DO NOTHING`,
      [id, user_id]
    );

    res.json({ message: 'Announcement marked as read' });
  } catch (err) {
    console.error('Error marking announcement as read:', err);
    res.status(500).json({ error: 'Error updating announcement' });
  }
});

// POST /announcements - Create announcement (leaders + admins)
app.post('/announcements', authenticateJWT, authenticateLeader, upload.single('attachment'), async (req, res) => {
  try {
    const { title, content, target_role, is_urgent } = req.body;
    const author_id = req.user.user_id;
    
    console.log('📝 Create announcement request:', { title, content, target_role, is_urgent, hasFile: !!req.file });

    // Validation
    if (!title || !content) {
      return res.status(400).json({ 
        error: 'Title and content are required',
        errors: {
          title: !title ? 'Title is required' : undefined,
          content: !content ? 'Content is required' : undefined
        }
      });
    }

    if (!target_role || !['admin', 'leader', 'employee', 'all'].includes(target_role)) {
      return res.status(400).json({ 
        error: 'Invalid target_role. Must be one of: admin, leader, employee, all',
        errors: { target_role: 'Invalid value' }
      });
    }

    // Handle file upload
    let attachment_url = null;
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'dasho/announcements',
          resource_type: 'auto'
        });
        attachment_url = result.secure_url;
        console.log('✅ File uploaded to Cloudinary:', attachment_url);
      } catch (uploadErr) {
        console.error('❌ Cloudinary upload error:', uploadErr);
        return res.status(500).json({ error: 'File upload failed' });
      }
    }

    // Parse is_urgent (handle both boolean and string)
    const isUrgent = is_urgent === true || is_urgent === 'true';

    const result = await pool.query(
      `INSERT INTO announcements (title, content, target_role, is_urgent, attachment_url, author_id, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $6) 
       RETURNING *`,
      [title, content, target_role, isUrgent, attachment_url, author_id]
    );

    const announcement = result.rows[0];
    console.log('✅ Announcement created:', announcement.id);

    // Send push notifications to all users with FCM tokens
    try {
      const tokensResult = await pool.query(
        'SELECT fcm_token FROM users WHERE fcm_token IS NOT NULL'
      );
      
      if (tokensResult.rows.length > 0) {
        const fcmTokens = tokensResult.rows.map(row => row.fcm_token);
        await sendPushNotificationToMultiple(
          fcmTokens,
          title,
          content.substring(0, 100) + (content.length > 100 ? '...' : ''),
          { type: 'announcement', id: announcement.id.toString(), isUrgent: isUrgent.toString() }
        );
      }
    } catch (notifErr) {
      console.error('Error sending push notifications:', notifErr);
      // Don't fail the request if notifications fail
    }

    res.status(201).json(announcement);
  } catch (err) {
    console.error('❌ Error creating announcement:', err);
    res.status(500).json({ error: 'Error creating announcement', message: err.message });
  }
});

// PUT /announcements/:id - Update announcement (leaders + admins)
app.put('/announcements/:id', authenticateJWT, authenticateLeader, upload.single('attachment'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, target_role, is_urgent } = req.body;

    console.log('📝 Update announcement request:', { id, title, content, target_role, is_urgent, hasFile: !!req.file });

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      values.push(content);
    }
    if (target_role !== undefined) {
      if (!['admin', 'leader', 'employee', 'all'].includes(target_role)) {
        return res.status(400).json({ error: 'Invalid target_role' });
      }
      updates.push(`target_role = $${paramIndex++}`);
      values.push(target_role);
    }
    if (is_urgent !== undefined) {
      const isUrgent = is_urgent === true || is_urgent === 'true';
      updates.push(`is_urgent = $${paramIndex++}`);
      values.push(isUrgent);
    }

    // Handle file upload
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'dasho/announcements',
          resource_type: 'auto'
        });
        updates.push(`attachment_url = $${paramIndex++}`);
        values.push(result.secure_url);
        console.log('✅ File uploaded to Cloudinary:', result.secure_url);
      } catch (uploadErr) {
        console.error('❌ Cloudinary upload error:', uploadErr);
        return res.status(500).json({ error: 'File upload failed' });
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update provided' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await pool.query(
      `UPDATE announcements SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    console.log('✅ Announcement updated:', id);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error updating announcement:', err);
    res.status(500).json({ error: 'Error updating announcement', message: err.message });
  }
});

// DELETE /announcements/:id - Delete announcement (leaders + admins)
app.delete('/announcements/:id', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM announcements WHERE id = $1 RETURNING *', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    console.log('✅ Announcement deleted:', id);
    res.status(200).json({ message: 'Announcement deleted successfully' });
  } catch (err) {
    console.error('❌ Error deleting announcement:', err);
    res.status(500).json({ error: 'Error deleting announcement' });
  }
});


// GET /notifications/unread-count - Get count of unread notifications
app.get('/notifications/unread-count', authenticateJWT, async (req, res) => {
  try {
    const { user_id } = req.user;

    const { rows } = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
      [user_id]
    );

    const unreadCount = parseInt(rows[0].count);
    console.log(`📬 User ${user_id} has ${unreadCount} unread notifications`);
    
    res.json({ unreadCount });
  } catch (err) {
    console.error('❌ Error fetching unread count:', err);
    res.status(500).json({ error: 'Error retrieving unread count' });
  }
});

// GET /notifications - Get user's notifications
app.get('/notifications', authenticateJWT, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { limit, is_read } = req.query;

    const limitValue = limit ? parseInt(limit) : 50;

    // Build query with optional is_read filter
    let query = `SELECT 
      id,
      type,
      title,
      message,
      is_read,
      created_at
    FROM notifications
    WHERE user_id = $1`;
    
    const params = [user_id];
    let paramIndex = 2;

    if (is_read !== undefined) {
      query += ` AND is_read = $${paramIndex++}`;
      params.push(is_read === 'true');
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limitValue);

    const { rows } = await pool.query(query, params);

    // Get total count
    const totalResult = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1',
      [user_id]
    );

    // Get unread count
    const unreadResult = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [user_id]
    );

    console.log(`📬 Fetched ${rows.length} notifications for user ${req.user.username || user_id}`);
    
    res.json({
      notifications: rows,
      total: parseInt(totalResult.rows[0].count),
      unreadCount: parseInt(unreadResult.rows[0].count)
    });
  } catch (err) {
    console.error('❌ Error fetching notifications:', err);
    res.status(500).json({ error: 'Error retrieving notifications' });
  }
});

// POST /notifications/:id/read - Mark notification as read
app.post('/notifications/:id/read', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.user;

    const result = await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, user_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    console.log(`✅ Notification ${id} marked as read for user ${user_id}`);
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('❌ Error marking notification as read:', err);
    res.status(500).json({ error: 'Error updating notification' });
  }
});

// DELETE /notifications/:id - Delete notification
app.delete('/notifications/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.user;

    const result = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, user_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    console.log(`✅ Notification ${id} deleted for user ${user_id}`);
    res.status(200).json({ message: 'Notification deleted successfully' });
  } catch (err) {
    console.error('❌ Error deleting notification:', err);
    res.status(500).json({ error: 'Error deleting notification' });
  }
});


// GET /circulars - Get all circulars (accessible to all authenticated users)
app.get('/circulars', authenticateJWT, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM circulars ORDER BY created_at DESC'
    );

    res.json({ circulars: rows });
  } catch (err) {
    console.error('Error fetching circulars:', err);
    res.status(500).json({ error: 'Error retrieving circulars' });
  }
});

// POST /circulars - Create circular (admin only)
app.post('/circulars', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { title, description } = req.body;
    const created_by = req.user.user_id;

    // Validation
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (title.length > 255) {
      return res.status(400).json({ error: 'Title must be 255 characters or less' });
    }

    // For now, document_url can be optional (will be required when file upload is added)
    const document_url = req.body.document_url || null;

    const result = await pool.query(
      `INSERT INTO circulars (title, description, document_url, created_by) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [title, description || '', document_url, created_by]
    );

    const circular = result.rows[0];

    // Send push notifications to all users with FCM tokens
    try {
      const tokensResult = await pool.query(
        'SELECT fcm_token FROM users WHERE fcm_token IS NOT NULL'
      );
      
      if (tokensResult.rows.length > 0) {
        const fcmTokens = tokensResult.rows.map(row => row.fcm_token);
        await sendPushNotificationToMultiple(
          fcmTokens,
          title,
          description ? description.substring(0, 100) + (description.length > 100 ? '...' : '') : 'New circular available',
          { type: 'circular', id: circular.id.toString() }
        );
      }
    } catch (notifErr) {
      console.error('Error sending push notifications:', notifErr);
      // Don't fail the request if notifications fail
    }

    res.status(201).json({ 
      message: 'Circular created successfully',
      circular: circular
    });
  } catch (err) {
    console.error('❌ Error creating circular:', err);
    res.status(500).json({ error: 'Error creating circular' });
  }
});

// PUT /circulars/:id - Update circular (admin only)
app.put('/circulars/:id', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, document_url } = req.body;

    // Validation
    if (title && title.length > 255) {
      return res.status(400).json({ error: 'Title must be 255 characters or less' });
    }

    const result = await pool.query(
      `UPDATE circulars 
       SET title = COALESCE($1, title), 
           description = COALESCE($2, description),
           document_url = COALESCE($3, document_url)
       WHERE id = $4 
       RETURNING *`,
      [title, description, document_url, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Circular not found' });
    }

    res.json({ message: 'Circular updated successfully', circular: result.rows[0] });
  } catch (err) {
    console.error('Error updating circular:', err);
    res.status(500).json({ error: 'Error updating circular' });
  }
});

// DELETE /circulars/:id - Delete circular (admin only)
app.delete('/circulars/:id', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM circulars WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Circular not found' });
    }

    res.json({ message: 'Circular deleted successfully' });
  } catch (err) {
    console.error('Error deleting circular:', err);
    res.status(500).json({ error: 'Error deleting circular' });
  }
});


// GET /events - Get all events with optional filters
app.get('/events', authenticateJWT, async (req, res) => {
  try {
    const { category, start_date, end_date, month, year } = req.query;
    const { user_id } = req.user;

    let query = `
      SELECT 
        e.id,
        e.title,
        e.description,
        e.event_date,
        e.event_time,
        e.location,
        e.category,
        e.created_by,
        e.attachment_url
      FROM events e
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;

    if (category) {
      query += ` AND e.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (start_date) {
      query += ` AND e.event_date >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      query += ` AND e.event_date <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    if (month && year) {
      query += ` AND EXTRACT(MONTH FROM e.event_date) = $${paramIndex} AND EXTRACT(YEAR FROM e.event_date) = $${paramIndex + 1}`;
      params.push(month, year);
      paramIndex += 2;
    }

    query += ' ORDER BY e.event_date ASC, e.event_time ASC NULLS LAST';

    const { rows } = await pool.query(query, params);

    res.json({ events: rows });
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: 'Error retrieving events' });
  }
});

// POST /events - Create a new event (admins + leaders)
app.post('/events', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { title, description, event_date, event_time, location, category } = req.body;
    const created_by = req.user.user_id;

    // Validation
    if (!title || !event_date || !category) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        errors: {
          title: !title ? 'Title is required' : null,
          event_date: !event_date ? 'Event date is required' : null,
          category: !category ? 'Category is required' : null
        }
      });
    }

    const validCategories = ['meeting', 'holiday', 'training', 'social', 'deadline'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ 
        error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
      });
    }

    const result = await pool.query(
      `INSERT INTO events (title, description, event_date, event_time, location, category, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [title, description, event_date, event_time, location, category, created_by]
    );

    console.log(`✅ Event created: ${title} on ${event_date}`);
    res.status(201).json({ 
      message: 'Event created successfully', 
      event: result.rows[0] 
    });
  } catch (err) {
    console.error('❌ Error creating event:', err);
    res.status(500).json({ error: 'Error creating event' });
  }
});

// PUT /events/:id - Update an event (admins + leaders for own events)
app.put('/events/:id', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, event_date, event_time, location, category } = req.body;
    const { user_id, role } = req.user;

    // Check if event exists and user has permission
    const eventCheck = await pool.query(
      'SELECT * FROM events WHERE id = $1',
      [id]
    );

    if (eventCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Leaders can only edit their own events, admins can edit any
    if (role !== 'admin' && eventCheck.rows[0].created_by !== user_id) {
      return res.status(403).json({ error: 'You can only edit your own events' });
    }

    if (category) {
      const validCategories = ['meeting', 'holiday', 'training', 'social', 'deadline'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ 
          error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
        });
      }
    }

    const result = await pool.query(
      `UPDATE events 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           event_date = COALESCE($3, event_date),
           event_time = COALESCE($4, event_time),
           location = COALESCE($5, location),
           category = COALESCE($6, category),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [title, description, event_date, event_time, location, category, id]
    );

    console.log(`✅ Event updated: ${id}`);
    res.json({ message: 'Event updated successfully', event: result.rows[0] });
  } catch (err) {
    console.error('❌ Error updating event:', err);
    res.status(500).json({ error: 'Error updating event' });
  }
});

// DELETE /events/:id - Delete an event (admins + leaders for own events)
app.delete('/events/:id', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, role } = req.user;

    // Check if event exists and user has permission
    const eventCheck = await pool.query(
      'SELECT * FROM events WHERE id = $1',
      [id]
    );

    if (eventCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Leaders can only delete their own events, admins can delete any
    if (role !== 'admin' && eventCheck.rows[0].created_by !== user_id) {
      return res.status(403).json({ error: 'You can only delete your own events' });
    }

    await pool.query('DELETE FROM events WHERE id = $1', [id]);

    console.log(`✅ Event deleted: ${id}`);
    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    console.error('❌ Error deleting event:', err);
    res.status(500).json({ error: 'Error deleting event' });
  }
});

// POST /events/:id/rsvp - RSVP to an event
app.post('/events/:id/rsvp', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const { user_id } = req.user;

    // Validation
    const validStatuses = ['going', 'maybe', 'not-going'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }

    // Check if event exists
    const eventCheck = await pool.query('SELECT id FROM events WHERE id = $1', [id]);
    if (eventCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Upsert RSVP (insert or update)
    const result = await pool.query(
      `INSERT INTO event_rsvps (event_id, user_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id, user_id)
       DO UPDATE SET status = $3, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [id, user_id, status]
    );

    console.log(`✅ User ${user_id} RSVP'd ${status} to event ${id}`);
    res.json({ 
      message: 'RSVP updated successfully', 
      rsvp: result.rows[0] 
    });
  } catch (err) {
    console.error('❌ Error updating RSVP:', err);
    res.status(500).json({ error: 'Error updating RSVP' });
  }
});


// GET /warnings/my-warnings - Get warnings for current user
app.get('/warnings/my-warnings', authenticateJWT, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { type } = req.query;

    let query = 'SELECT * FROM warnings WHERE user_id = $1';
    const params = [user_id];

    if (type && type !== 'all') {
      query += ' AND kind = $2';
      params.push(type);
    }

    query += ' ORDER BY date DESC, created_at DESC';

    const { rows } = await pool.query(query, params);
    res.json({ warnings: rows });
  } catch (err) {
    console.error('Error fetching warnings:', err);
    res.status(500).json({ error: 'Error retrieving warnings' });
  }
});

// POST /warnings/:id/acknowledge - Acknowledge a warning
app.post('/warnings/:id/acknowledge', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.user;

    // Verify the warning belongs to this user
    const warning = await pool.query(
      'SELECT user_id FROM warnings WHERE id = $1',
      [id]
    );

    if (warning.rows.length === 0) {
      return res.status(404).json({ error: 'Warning not found' });
    }

    if (warning.rows[0].user_id !== user_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Update acknowledgment timestamp
    const result = await pool.query(
      'UPDATE warnings SET ack_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error acknowledging warning:', err);
    res.status(500).json({ error: 'Error acknowledging warning' });
  }
});

// GET /warnings - Get all warnings (admin/leader with filters)
app.get('/warnings', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { user_id, kind, date_from, date_to, unit } = req.query;

    let query = 'SELECT w.*, u.name as user_name, u.unit FROM warnings w JOIN users u ON w.user_id = u.user_id WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (user_id) {
      query += ` AND w.user_id = $${paramIndex++}`;
      params.push(user_id);
    }
    if (kind && kind !== 'all') {
      query += ` AND w.kind = $${paramIndex++}`;
      params.push(kind);
    }
    if (date_from) {
      query += ` AND w.date >= $${paramIndex++}`;
      params.push(date_from);
    }
    if (date_to) {
      query += ` AND w.date <= $${paramIndex++}`;
      params.push(date_to);
    }
    if (unit && unit !== 'all') {
      query += ` AND u.unit = $${paramIndex++}`;
      params.push(unit);
    }

    query += ' ORDER BY w.date DESC, w.created_at DESC';

    const { rows } = await pool.query(query, params);
    res.json({ warnings: rows });
  } catch (err) {
    console.error('Error fetching warnings:', err);
    res.status(500).json({ error: 'Error retrieving warnings' });
  }
});

// POST /warnings - Create warning (admin only)
app.post('/warnings', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { user_id, kind, date, details, attachment } = req.body;
    const created_by = req.user.user_id;

    if (!user_id || !kind || !date || !details) {
      return res.status(400).json({ 
        error: 'user_id, kind, date, and details are required' 
      });
    }

    const validKinds = ['warning', 'draw_attention', 'notice', 'final_warning', 'verbal_warning', 'verbal_notice'];
    if (!validKinds.includes(kind)) {
      return res.status(400).json({ 
        error: 'kind must be one of: warning, draw_attention, notice, final_warning, verbal_warning, verbal_notice' 
      });
    }

    const result = await pool.query(
      `INSERT INTO warnings (user_id, kind, date, details, attachment, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [user_id, kind, date, details, attachment || null, created_by]
    );

    res.status(201).json({ 
      message: 'Warning created successfully',
      warning: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Error creating warning:', err);
    res.status(500).json({ error: 'Error creating warning' });
  }
});


// GET /teams - Get all teams
app.get('/teams', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM teams ORDER BY name');
    res.json({ teams: rows });
  } catch (err) {
    console.error('Error fetching teams:', err);
    res.status(500).json({ error: 'Error retrieving teams' });
  }
});

// POST /teams - Create team (admin only)
app.post('/teams', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Team name is required' });

    const result = await pool.query(
      'INSERT INTO teams (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Team name already exists' });
    }
    console.error('Error creating team:', err);
    res.status(500).json({ error: 'Error creating team' });
  }
});

// PUT /teams/:id - Update team (admin only)
app.put('/teams/:id', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    
    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Team name is required' });
    }
    
    if (name.length > 100) {
      return res.status(400).json({ error: 'Team name must be 100 characters or less' });
    }
    
    const { rows } = await pool.query(
      'UPDATE teams SET name = $1, description = $2 WHERE id = $3 RETURNING *',
      [name.trim(), description?.trim() || null, id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating team:', err);
    
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Team name already exists' });
    }
    
    res.status(500).json({ error: 'Error updating team' });
  }
});

// DELETE /teams/:id - Delete team (admin only)
app.delete('/teams/:id', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { rows } = await pool.query(
      'DELETE FROM teams WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    res.json({ message: 'Team deleted successfully', team: rows[0] });
  } catch (err) {
    console.error('Error deleting team:', err);
    res.status(500).json({ error: 'Error deleting team' });
  }
});

// GET /units - Get all units
app.get('/units', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM units ORDER BY name');
    res.json({ units: rows });
  } catch (err) {
    console.error('Error fetching units:', err);
    res.status(500).json({ error: 'Error retrieving units' });
  }
});

// POST /units - Create unit (admin only)
app.post('/units', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Unit name is required' });

    const result = await pool.query(
      'INSERT INTO units (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Unit name already exists' });
    }
    console.error('Error creating unit:', err);
    res.status(500).json({ error: 'Error creating unit' });
  }
});

// PUT /units/:id - Update unit (admin only)
app.put('/units/:id', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    
    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Unit name is required' });
    }
    
    if (name.length > 100) {
      return res.status(400).json({ error: 'Unit name must be 100 characters or less' });
    }
    
    const { rows } = await pool.query(
      'UPDATE units SET name = $1, description = $2 WHERE id = $3 RETURNING *',
      [name.trim(), description?.trim() || null, id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating unit:', err);
    
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Unit name already exists' });
    }
    
    res.status(500).json({ error: 'Error updating unit' });
  }
});

// DELETE /units/:id - Delete unit (admin only)
app.delete('/units/:id', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { rows } = await pool.query(
      'DELETE FROM units WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    res.json({ message: 'Unit deleted successfully', unit: rows[0] });
  } catch (err) {
    console.error('Error deleting unit:', err);
    res.status(500).json({ error: 'Error deleting unit' });
  }
});


// GET /teams/:teamId/members - Get all members of a team (leaders + admins)
app.get('/teams/:teamId/members', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { teamId } = req.params;
    
    // Verify team exists
    const teamCheck = await pool.query('SELECT id FROM teams WHERE id = $1', [teamId]);
    if (teamCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    // Fetch all members
    const { rows } = await pool.query(
      `SELECT 
        u.user_id,
        u.user_id as username,
        u.name,
        u.email,
        ut.is_leader,
        ut.assigned_at as joined_at
      FROM users u
      INNER JOIN user_teams ut ON u.user_id = ut.user_id
      WHERE ut.team_id = $1
      ORDER BY ut.is_leader DESC, u.name ASC`,
      [teamId]
    );
    
    res.json({ members: rows });
  } catch (err) {
    console.error('Error fetching team members:', err);
    res.status(500).json({ error: 'Error retrieving team members' });
  }
});

// GET /units/:unitId/members - Get all members of a unit (leaders + admins)
app.get('/units/:unitId/members', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { unitId } = req.params;
    
    // Verify unit exists
    const unitCheck = await pool.query('SELECT id FROM units WHERE id = $1', [unitId]);
    if (unitCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    // Fetch all members
    const { rows } = await pool.query(
      `SELECT 
        u.user_id,
        u.user_id as username,
        u.name,
        u.email,
        uu.assigned_at as joined_at
      FROM users u
      INNER JOIN user_units uu ON u.user_id = uu.user_id
      WHERE uu.unit_id = $1
      ORDER BY u.name ASC`,
      [unitId]
    );
    
    res.json({ members: rows });
  } catch (err) {
    console.error('Error fetching unit members:', err);
    res.status(500).json({ error: 'Error retrieving unit members' });
  }
});

// POST /teams/:teamId/members - Assign user to team (admin only)
app.post('/teams/:teamId/members', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { teamId } = req.params;
    const { user_id, is_leader } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Verify team exists
    const teamCheck = await pool.query('SELECT id FROM teams WHERE id = $1', [teamId]);
    if (teamCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Verify user exists
    const userCheck = await pool.query('SELECT user_id FROM users WHERE user_id = $1', [user_id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(
      'INSERT INTO user_teams (user_id, team_id, is_leader) VALUES ($1, $2, $3) RETURNING *',
      [user_id, teamId, is_leader || false]
    );

    res.status(201).json({ 
      message: 'User assigned to team successfully',
      assignment: result.rows[0] 
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'User already assigned to this team' });
    }
    console.error('Error assigning user to team:', err);
    res.status(500).json({ error: 'Error assigning user to team' });
  }
});

// DELETE /teams/:teamId/members/:userId - Remove user from team (admin only)
app.delete('/teams/:teamId/members/:userId', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { teamId, userId } = req.params;

    const result = await pool.query(
      'DELETE FROM user_teams WHERE user_id = $1 AND team_id = $2 RETURNING *',
      [userId, teamId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Team assignment not found' });
    }

    res.json({ message: 'User removed from team successfully' });
  } catch (err) {
    console.error('Error removing user from team:', err);
    res.status(500).json({ error: 'Error removing user from team' });
  }
});

// POST /units/:unitId/members - Assign user to unit (admin only)
app.post('/units/:unitId/members', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { unitId } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Verify unit exists
    const unitCheck = await pool.query('SELECT id FROM units WHERE id = $1', [unitId]);
    if (unitCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    // Verify user exists
    const userCheck = await pool.query('SELECT user_id FROM users WHERE user_id = $1', [user_id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(
      'INSERT INTO user_units (user_id, unit_id) VALUES ($1, $2) RETURNING *',
      [user_id, unitId]
    );

    res.status(201).json({ 
      message: 'User assigned to unit successfully',
      assignment: result.rows[0] 
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'User already assigned to this unit' });
    }
    console.error('Error assigning user to unit:', err);
    res.status(500).json({ error: 'Error assigning user to unit' });
  }
});

// DELETE /units/:unitId/members/:userId - Remove user from unit (admin only)
app.delete('/units/:unitId/members/:userId', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { unitId, userId } = req.params;

    const result = await pool.query(
      'DELETE FROM user_units WHERE user_id = $1 AND unit_id = $2 RETURNING *',
      [userId, unitId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Unit assignment not found' });
    }

    res.json({ message: 'User removed from unit successfully' });
  } catch (err) {
    console.error('Error removing user from unit:', err);
    res.status(500).json({ error: 'Error removing unit from unit' });
  }
});


// GET /users/:userId/teams - Get teams that a specific user belongs to
app.get('/users/:userId/teams', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user exists
    const userCheck = await pool.query('SELECT user_id FROM users WHERE user_id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { rows } = await pool.query(
      `SELECT 
        t.id as team_id,
        t.name as team_name,
        t.description,
        ut.is_leader,
        ut.assigned_at
      FROM teams t
      INNER JOIN user_teams ut ON t.id = ut.team_id
      WHERE ut.user_id = $1
      ORDER BY t.name ASC`,
      [userId]
    );

    res.json({ teams: rows });
  } catch (err) {
    console.error('Error fetching user teams:', err);
    res.status(500).json({ error: 'Error retrieving user teams' });
  }
});

// GET /users/:userId/units - Get units that a specific user belongs to
app.get('/users/:userId/units', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user exists
    const userCheck = await pool.query('SELECT user_id FROM users WHERE user_id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { rows } = await pool.query(
      `SELECT 
        u.id as unit_id,
        u.name as unit_name,
        u.description,
        uu.assigned_at
      FROM units u
      INNER JOIN user_units uu ON u.id = uu.unit_id
      WHERE uu.user_id = $1
      ORDER BY u.name ASC`,
      [userId]
    );

    res.json({ units: rows });
  } catch (err) {
    console.error('Error fetching user units:', err);
    res.status(500).json({ error: 'Error retrieving user units' });
  }
});

// POST /users/fcm-token - Save FCM token for push notifications
app.post('/users/fcm-token', authenticateJWT, async (req, res) => {
  try {
    const { fcm_token } = req.body;
    const { user_id } = req.user;

    if (!fcm_token) {
      return res.status(400).json({ error: 'FCM token is required' });
    }

    await pool.query(
      'UPDATE users SET fcm_token = $1 WHERE user_id = $2',
      [fcm_token, user_id]
    );

    res.json({ message: 'FCM token saved successfully' });
  } catch (err) {
    console.error('Error saving FCM token:', err);
    res.status(500).json({ error: 'Error saving FCM token' });
  }
});


// GET /breaks/templates - Get all break templates (with optional unit filter)
app.get('/breaks/templates', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { unit_id } = req.query;

    let query = `
      SELECT 
        bt.*,
        u.name as unit_name
      FROM break_templates bt
      JOIN units u ON bt.unit_id = u.id
    `;
    const params = [];

    if (unit_id) {
      query += ' WHERE bt.unit_id = $1';
      params.push(unit_id);
    }

    query += ' ORDER BY bt.unit_id, bt.weekday, bt.start_window';

    const { rows } = await pool.query(query, params);
    res.json({ templates: rows });
  } catch (err) {
    console.error('Error fetching break templates:', err);
    res.status(500).json({ error: 'Error retrieving break templates' });
  }
});

// POST /breaks/templates - Create break template (admin only)
app.post('/breaks/templates', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { 
      unit_id, 
      weekday, 
      start_window, 
      end_window, 
      duration_min, 
      min_gap_start, 
      min_gap_end, 
      staggering 
    } = req.body;

    // Validation
    if (!unit_id || weekday === undefined || !start_window || !end_window || !duration_min) {
      return res.status(400).json({ 
        error: 'unit_id, weekday, start_window, end_window, and duration_min are required' 
      });
    }

    if (weekday < 0 || weekday > 6) {
      return res.status(400).json({ error: 'weekday must be between 0 (Sunday) and 6 (Saturday)' });
    }

    const result = await pool.query(
      `INSERT INTO break_templates 
       (unit_id, weekday, start_window, end_window, duration_min, min_gap_start, min_gap_end, staggering)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [unit_id, weekday, start_window, end_window, duration_min, 
       min_gap_start || 0, min_gap_end || 0, staggering || 15]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating break template:', err);
    res.status(500).json({ error: 'Error creating break template' });
  }
});

// PUT /breaks/templates/:id - Update break template (admin only)
app.put('/breaks/templates/:id', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      unit_id, 
      weekday, 
      start_window, 
      end_window, 
      duration_min, 
      min_gap_start, 
      min_gap_end, 
      staggering 
    } = req.body;

    // Validation
    if (weekday !== undefined && (weekday < 0 || weekday > 6)) {
      return res.status(400).json({ error: 'weekday must be between 0 and 6' });
    }

    const { rows } = await pool.query(
      `UPDATE break_templates 
       SET unit_id = COALESCE($1, unit_id),
           weekday = COALESCE($2, weekday),
           start_window = COALESCE($3, start_window),
           end_window = COALESCE($4, end_window),
           duration_min = COALESCE($5, duration_min),
           min_gap_start = COALESCE($6, min_gap_start),
           min_gap_end = COALESCE($7, min_gap_end),
           staggering = COALESCE($8, staggering)
       WHERE id = $9
       RETURNING *`,
      [unit_id, weekday, start_window, end_window, duration_min, 
       min_gap_start, min_gap_end, staggering, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Break template not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating break template:', err);
    res.status(500).json({ error: 'Error updating break template' });
  }
});

// DELETE /breaks/templates/:id - Delete break template (admin only)
app.delete('/breaks/templates/:id', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      'DELETE FROM break_templates WHERE id = $1 RETURNING *',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Break template not found' });
    }

    res.json({ message: 'Break template deleted successfully', template: rows[0] });
  } catch (err) {
    console.error('Error deleting break template:', err);
    res.status(500).json({ error: 'Error deleting break template' });
  }
});

// GET /breaks/assignments - Get break assignments (with filters)
app.get('/breaks/assignments', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { date, user_id, unit_id, status } = req.query;

    let query = `
      SELECT 
        ba.*,
        u.name_en as user_name,
        swu.name_en as swap_with_name
      FROM break_assignments ba
      JOIN users u ON ba.user_id = u.user_id
      LEFT JOIN users swu ON ba.swap_with_user_id = swu.user_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (date) {
      query += ` AND ba.date = $${paramIndex}`;
      params.push(date);
      paramIndex++;
    }

    if (user_id) {
      query += ` AND ba.user_id = $${paramIndex}`;
      params.push(user_id);
      paramIndex++;
    }

    if (status) {
      query += ` AND ba.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ' ORDER BY ba.date, ba.planned_start';

    const { rows } = await pool.query(query, params);
    res.json({ assignments: rows });
  } catch (err) {
    console.error('Error fetching break assignments:', err);
    res.status(500).json({ error: 'Error retrieving break assignments' });
  }
});

// GET /breaks/my-breaks - Get current user's break assignments
app.get('/breaks/my-breaks', authenticateJWT, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { date_from, date_to } = req.query;

    let query = `
      SELECT 
        ba.*,
        swu.name_en as swap_with_name
      FROM break_assignments ba
      LEFT JOIN users swu ON ba.swap_with_user_id = swu.user_id
      WHERE ba.user_id = $1
    `;
    const params = [user_id];
    let paramIndex = 2;

    if (date_from) {
      query += ` AND ba.date >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      query += ` AND ba.date <= $${paramIndex}`;
      params.push(date_to);
      paramIndex++;
    }

    query += ' ORDER BY ba.date, ba.planned_start';

    const { rows } = await pool.query(query, params);
    res.json({ breaks: rows });
  } catch (err) {
    console.error('Error fetching my breaks:', err);
    res.status(500).json({ error: 'Error retrieving your breaks' });
  }
});

// POST /breaks/assignments - Create break assignment (leader/admin)
app.post('/breaks/assignments', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { user_id, date, template_id, planned_start, planned_end } = req.body;

    // Validation
    if (!user_id || !date || !planned_start || !planned_end) {
      return res.status(400).json({ 
        error: 'user_id, date, planned_start, and planned_end are required' 
      });
    }

    const result = await pool.query(
      `INSERT INTO break_assignments 
       (user_id, date, template_id, planned_start, planned_end, status)
       VALUES ($1, $2, $3, $4, $5, 'scheduled')
       RETURNING *`,
      [user_id, date, template_id || null, planned_start, planned_end]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating break assignment:', err);
    res.status(500).json({ error: 'Error creating break assignment' });
  }
});

// POST /breaks/assignments/generate - Auto-generate assignments from template (admin)
app.post('/breaks/assignments/generate', authenticateJWT, authenticateAdmin, async (req, res) => {
  try {
    const { template_id, date, user_ids } = req.body;

    // Validation
    if (!template_id || !date || !user_ids || !Array.isArray(user_ids)) {
      return res.status(400).json({ 
        error: 'template_id, date, and user_ids (array) are required' 
      });
    }

    // Get template details
    const templateResult = await pool.query(
      'SELECT * FROM break_templates WHERE id = $1',
      [template_id]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Break template not found' });
    }

    const template = templateResult.rows[0];
    const { start_window, duration_min, staggering } = template;

    // Generate staggered breaks for all users
    const assignments = [];
    const startTime = new Date(`2000-01-01 ${start_window}`);

    for (let i = 0; i < user_ids.length; i++) {
      const offsetMinutes = i * (staggering || 15);
      const plannedStart = new Date(startTime.getTime() + offsetMinutes * 60000);
      const plannedEnd = new Date(plannedStart.getTime() + duration_min * 60000);

      const result = await pool.query(
        `INSERT INTO break_assignments 
         (user_id, date, template_id, planned_start, planned_end, status)
         VALUES ($1, $2, $3, $4, $5, 'scheduled')
         RETURNING *`,
        [
          user_ids[i], 
          date, 
          template_id,
          plannedStart.toTimeString().slice(0, 8),
          plannedEnd.toTimeString().slice(0, 8)
        ]
      );

      assignments.push(result.rows[0]);
    }

    res.status(201).json({ 
      message: 'Break assignments generated successfully',
      count: assignments.length,
      assignments 
    });
  } catch (err) {
    console.error('Error generating break assignments:', err);
    res.status(500).json({ error: 'Error generating break assignments' });
  }
});

// PUT /breaks/assignments/:id - Update break assignment (leader/admin)
app.put('/breaks/assignments/:id', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { id } = req.params;
    const { planned_start, planned_end, status } = req.body;

    const { rows } = await pool.query(
      `UPDATE break_assignments 
       SET planned_start = COALESCE($1, planned_start),
           planned_end = COALESCE($2, planned_end),
           status = COALESCE($3, status)
       WHERE id = $4
       RETURNING *`,
      [planned_start, planned_end, status, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Break assignment not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating break assignment:', err);
    res.status(500).json({ error: 'Error updating break assignment' });
  }
});

// DELETE /breaks/assignments/:id - Delete break assignment (leader/admin)
app.delete('/breaks/assignments/:id', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      'DELETE FROM break_assignments WHERE id = $1 RETURNING *',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Break assignment not found' });
    }

    res.json({ message: 'Break assignment deleted successfully', assignment: rows[0] });
  } catch (err) {
    console.error('Error deleting break assignment:', err);
    res.status(500).json({ error: 'Error deleting break assignment' });
  }
});

// POST /breaks/swaps - Request break swap (staff can request)
app.post('/breaks/swaps', authenticateJWT, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { assignment_id, swap_with_user_id } = req.body;

    // Validation
    if (!assignment_id || !swap_with_user_id) {
      return res.status(400).json({ 
        error: 'assignment_id and swap_with_user_id are required' 
      });
    }

    // Verify assignment belongs to requesting user
    const assignmentCheck = await pool.query(
      'SELECT * FROM break_assignments WHERE id = $1 AND user_id = $2',
      [assignment_id, user_id]
    );

    if (assignmentCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You can only request swaps for your own breaks' });
    }

    // Update assignment with swap request
    const { rows } = await pool.query(
      `UPDATE break_assignments 
       SET swap_with_user_id = $1, status = 'scheduled'
       WHERE id = $2
       RETURNING *`,
      [swap_with_user_id, assignment_id]
    );

    res.json({ 
      message: 'Break swap requested successfully. Waiting for leader approval.',
      assignment: rows[0] 
    });
  } catch (err) {
    console.error('Error requesting break swap:', err);
    res.status(500).json({ error: 'Error requesting break swap' });
  }
});

// PUT /breaks/swaps/:id/approve - Approve break swap (leader/admin)
app.put('/breaks/swaps/:id/approve', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.user;

    const { rows } = await pool.query(
      `UPDATE break_assignments 
       SET status = 'swapped',
           swap_approved_by = $1
       WHERE id = $2
       RETURNING *`,
      [user_id, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Break assignment not found' });
    }

    res.json({ 
      message: 'Break swap approved successfully',
      assignment: rows[0] 
    });
  } catch (err) {
    console.error('Error approving break swap:', err);
    res.status(500).json({ error: 'Error approving break swap' });
  }
});

// PUT /breaks/swaps/:id/reject - Reject break swap (leader/admin)
app.put('/breaks/swaps/:id/reject', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `UPDATE break_assignments 
       SET swap_with_user_id = NULL,
           swap_approved_by = NULL,
           status = 'scheduled'
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Break assignment not found' });
    }

    res.json({ 
      message: 'Break swap rejected',
      assignment: rows[0] 
    });
  } catch (err) {
    console.error('Error rejecting break swap:', err);
    res.status(500).json({ error: 'Error rejecting break swap' });
  }
});

// POST /breaks/logs - Log actual break time (staff or auto-tracked)
app.post('/breaks/logs', authenticateJWT, async (req, res) => {
  try {
    const { assignment_id, actual_start, actual_end, reason } = req.body;

    // Validation
    if (!assignment_id) {
      return res.status(400).json({ error: 'assignment_id is required' });
    }

    // Calculate variance if both times provided
    let variance_min = null;
    if (actual_start && actual_end) {
      const actualDuration = new Date(`2000-01-01 ${actual_end}`) - new Date(`2000-01-01 ${actual_start}`);
      
      // Get planned duration
      const assignmentResult = await pool.query(
        'SELECT planned_start, planned_end FROM break_assignments WHERE id = $1',
        [assignment_id]
      );

      if (assignmentResult.rows.length > 0) {
        const { planned_start, planned_end } = assignmentResult.rows[0];
        const plannedDuration = new Date(`2000-01-01 ${planned_end}`) - new Date(`2000-01-01 ${planned_start}`);
        variance_min = Math.round((actualDuration - plannedDuration) / 60000);
      }
    }

    const result = await pool.query(
      `INSERT INTO break_logs 
       (assignment_id, actual_start, actual_end, variance_min, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [assignment_id, actual_start, actual_end, variance_min, reason || null]
    );

    // Update assignment status
    await pool.query(
      `UPDATE break_assignments 
       SET status = 'completed'
       WHERE id = $1`,
      [assignment_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error logging break:', err);
    res.status(500).json({ error: 'Error logging break' });
  }
});

// GET /breaks/adherence - Get break adherence report (leader/admin)
app.get('/breaks/adherence', authenticateJWT, authenticateLeader, async (req, res) => {
  try {
    const { date_from, date_to, unit_id, user_id } = req.query;

    let query = `
      SELECT 
        ba.id,
        ba.user_id,
        u.name_en as user_name,
        un.name as unit_name,
        ba.date,
        ba.planned_start,
        ba.planned_end,
        ba.status,
        bl.actual_start,
        bl.actual_end,
        bl.variance_min,
        bl.reason,
        CASE 
          WHEN bl.variance_min IS NULL THEN 'Not logged'
          WHEN bl.variance_min BETWEEN -5 AND 5 THEN 'On time'
          WHEN bl.variance_min > 5 THEN 'Extended'
          ELSE 'Early'
        END as adherence_status
      FROM break_assignments ba
      JOIN users u ON ba.user_id = u.user_id
      LEFT JOIN units un ON u.unit = un.name
      LEFT JOIN break_logs bl ON ba.id = bl.assignment_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (date_from) {
      query += ` AND ba.date >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      query += ` AND ba.date <= $${paramIndex}`;
      params.push(date_to);
      paramIndex++;
    }

    if (user_id) {
      query += ` AND ba.user_id = $${paramIndex}`;
      params.push(user_id);
      paramIndex++;
    }

    query += ' ORDER BY ba.date DESC, ba.planned_start';

    const { rows } = await pool.query(query, params);

    // Calculate statistics
    const total = rows.length;
    const onTime = rows.filter(r => r.adherence_status === 'On time').length;
    const extended = rows.filter(r => r.adherence_status === 'Extended').length;
    const notLogged = rows.filter(r => r.adherence_status === 'Not logged').length;

    res.json({ 
      adherence: rows,
      statistics: {
        total,
        on_time: onTime,
        extended,
        not_logged: notLogged,
        adherence_rate: total > 0 ? ((onTime / total) * 100).toFixed(2) : 0
      }
    });
  } catch (err) {
    console.error('Error fetching break adherence:', err);
    res.status(500).json({ error: 'Error retrieving break adherence report' });
  }
});



const server = http.createServer(app);
server.timeout = 10000; // 10-second timeout

server.listen(5000, () => {
    console.log("🚀 Server is running on http://localhost:5000");
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send("Something broke!");
});


// POST /forgot-password - Generate and send OTP to user's email (EMAIL-BASED)
app.post('/forgot-password', passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    
    // Validate email is provided
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if user exists with this email
    const { rows } = await pool.query('SELECT user_id, name, email FROM users WHERE email = $1', [email]);
    if (rows.length === 0) {
      // Security: Don't reveal if email exists or not
      console.log(`Password reset attempted for non-existent email: ${email}`);
      return res.status(200).json({ message: 'If this email exists, an OTP has been sent.' });
    }

    const user = rows[0];

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP with 5-minute expiration
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    otpStore.set(email, { otp, expires: expiresAt, userId: user.user_id });

    // Send OTP via email
    const mailOptions = {
      from: `DASHO System <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset OTP - DASHO System',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
            <h2 style="margin: 0;">Password Reset Request</h2>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px;">
            <p>Hello <strong>${user.name}</strong>,</p>
            <p>You requested to reset your password for your DASHO account.</p>
            <p>Your One-Time Password (OTP) is:</p>
            <div style="background-color: white; padding: 20px; text-align: center; margin: 20px 0; border: 2px dashed #4CAF50; border-radius: 5px;">
              <h1 style="color: #4CAF50; font-size: 36px; letter-spacing: 8px; margin: 0;">${otp}</h1>
            </div>
            <p><strong>⏱️ This code will expire in 5 minutes.</strong></p>
            <p style="color: #666; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
              If you didn't request this password reset, please ignore this email and ensure your account is secure.
            </p>
          </div>
          <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
            <p>DASHO Employee Management System</p>
            <p>This is an automated message, please do not reply.</p>
          </div>
        </div>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ OTP sent successfully to ${email} | OTP: ${otp} | Expires: ${new Date(expiresAt).toISOString()}`);
    } catch (emailError) {
      console.error(`❌ Failed to send email to ${email}:`, emailError.message);
      // Remove OTP if email failed
      otpStore.delete(email);
      return res.status(500).json({ error: 'Failed to send OTP email. Please try again.' });
    }
    
    res.status(200).json({ 
      message: 'If this email exists, an OTP has been sent. Please check your inbox.'
    });

  } catch (err) {
    console.error('❌ Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// POST /reset-password - Verify OTP and reset password (EMAIL-BASED)
app.post('/reset-password', passwordResetLimiter, async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    // Validate required fields
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP, and new password are required' });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password strength
    const passwordCheck = validatePasswordStrength(newPassword);
    if (!passwordCheck.valid) {
      return res.status(400).json({ error: passwordCheck.message });
    }

    // Validate OTP
    const otpData = otpStore.get(email);
    if (!otpData) {
      console.log(`❌ Invalid/missing OTP attempt for ${email}`);
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Check if OTP has expired
    if (Date.now() > otpData.expires) {
      otpStore.delete(email);
      console.log(`⏱️ Expired OTP attempt for ${email}`);
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    // Verify OTP matches
    if (otpData.otp !== otp) {
      console.log(`❌ Wrong OTP attempt for ${email}`);
      return res.status(400).json({ error: 'Invalid OTP. Please check and try again.' });
    }

    // Hash new password
    const hashedPassword = await hash(newPassword, saltRounds);

    // Update password in database
    const result = await pool.query(
      'UPDATE users SET password = $1 WHERE email = $2 RETURNING user_id, name, email',
      [hashedPassword, email]
    );

    if (result.rowCount === 0) {
      console.log(`❌ User not found during password reset: ${email}`);
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove OTP from store after successful reset
    otpStore.delete(email);

    console.log(`✅ Password reset successful for ${email} (User: ${result.rows[0].user_id})`);

    res.status(200).json({ 
      message: 'Password reset successful. You can now login with your new password.',
      user: result.rows[0]
    });

  } catch (err) {
    console.error('❌ Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});


// POST /forgot-password-by-username - Generate and send OTP using username
app.post('/forgot-password-by-username', passwordResetLimiter, async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    console.log('🔍 Searching for user:', username);

    // Find user by user_id (case-insensitive)
    const { rows } = await pool.query(
      'SELECT user_id, name, email FROM users WHERE LOWER(user_id) = LOWER($1)', 
      [username.trim()]
    );
    
    console.log('📊 Query result:', rows);

    if (rows.length === 0) {
      console.log('❌ User not found');
      // Security: Return generic message to prevent username enumeration
      return res.status(400).json({ 
        error: 'Username not found. Please check and try again.'
      });
    }

    const user = rows[0];
    console.log('✅ User found:', user.user_id, user.email);

    if (!user.email) {
      return res.status(400).json({ error: 'No email registered for this account. Please contact admin.' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('🔑 Generated OTP:', otp);
    
    // Store OTP with 5-minute expiration (using username as key in lowercase)
    const expiresAt = Date.now() + 5 * 60 * 1000;
    otpStore.set(username.trim().toLowerCase(), { 
      otp, 
      expires: expiresAt, 
      userId: user.user_id,
      email: user.email 
    });

    console.log('💾 Stored OTP for:', username.trim().toLowerCase());

    // Mask email for privacy (e.g., j***n@example.com)
    const maskEmail = (email) => {
      const [localPart, domain] = email.split('@');
      if (localPart.length <= 2) {
        return `${localPart[0]}***@${domain}`;
      }
      const maskedLocal = localPart[0] + '***' + localPart[localPart.length - 1];
      return `${maskedLocal}@${domain}`;
    };

    const maskedEmail = maskEmail(user.email);

    // Send OTP via email
    const mailOptions = {
      from: `DASHO System <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Password Reset OTP - DASHO System',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #3B82F6; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
            <h2 style="margin: 0;">Password Reset Request</h2>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px;">
            <p>Hello <strong>${user.name}</strong>,</p>
            <p>You requested to reset your password for your DASHO account (<strong>${user.user_id}</strong>).</p>
            <p>Your One-Time Password (OTP) is:</p>
            <div style="background-color: white; padding: 20px; text-align: center; margin: 20px 0; border: 2px dashed #3B82F6; border-radius: 5px;">
              <h1 style="color: #3B82F6; font-size: 36px; letter-spacing: 8px; margin: 0;">${otp}</h1>
            </div>
            <p><strong>⏱️ This code will expire in 5 minutes.</strong></p>
            <p style="color: #666; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
              If you didn't request this password reset, please ignore this email and ensure your account is secure.
            </p>
          </div>
        </div>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully to:', user.email);
    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError);
      otpStore.delete(username.trim().toLowerCase());
      return res.status(500).json({ error: 'Failed to send OTP email. Please try again later.' });
    }
    
    res.status(200).json({ 
      message: 'OTP sent successfully',
      maskedEmail: maskedEmail
    });

  } catch (err) {
    console.error('❌ Forgot password (username) error:', err);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// POST /reset-password-by-username - Verify OTP and reset password using username
app.post('/reset-password-by-username', passwordResetLimiter, async (req, res) => {
  try {
    const { username, otp, newPassword } = req.body;

    console.log('🔄 Reset password attempt for:', username);

    // Validate required fields
    if (!username || !otp || !newPassword) {
      return res.status(400).json({ error: 'Username, OTP, and new password are required' });
    }

    // Validate password strength
    const passwordCheck = validatePasswordStrength(newPassword);
    if (!passwordCheck.valid) {
      return res.status(400).json({ error: passwordCheck.message });
    }

    // Retrieve stored OTP (case-insensitive username lookup)
    const storedData = otpStore.get(username.trim().toLowerCase());
    
    console.log('🔍 Looking for OTP with key:', username.trim().toLowerCase());
    console.log('💾 Stored data:', storedData ? 'Found' : 'Not found');

    if (!storedData) {
      return res.status(400).json({ error: 'Invalid or expired OTP. Please request a new one.' });
    }

    // Check if OTP expired
    if (Date.now() > storedData.expires) {
      console.log('⏰ OTP expired');
      otpStore.delete(username.trim().toLowerCase());
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    // Verify OTP
    console.log('🔑 Comparing OTP - Received:', otp, 'Stored:', storedData.otp);
    if (storedData.otp !== otp.trim()) {
      return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
    }

    console.log('✅ OTP verified successfully');

    // Hash new password
    const hashedPassword = await hash(newPassword, saltRounds);

    // Update password in database (case-insensitive)
    const result = await pool.query(
      'UPDATE users SET password = $1 WHERE LOWER(user_id) = LOWER($2) RETURNING user_id, name',
      [hashedPassword, username.trim()]
    );

    if (result.rowCount === 0) {
      console.log('❌ User not found in database');
      otpStore.delete(username.trim().toLowerCase());
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('✅ Password updated for:', result.rows[0].user_id);

    // Clear OTP from store
    otpStore.delete(username.trim().toLowerCase());

    res.status(200).json({ 
      message: 'Password reset successfully. You can now login with your new password.',
      user_id: result.rows[0].user_id
    });

  } catch (err) {
    console.error('❌ Reset password (username) error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});


app.post('/signin', authLimiter, async (req, res) => {
  try {
    const { user_id, password } = req.body;
    if (!user_id || !password) return res.status(400).json({ error: 'user_id and password required' });

    const { rows } = await pool.query('SELECT * FROM users WHERE user_id = $1', [user_id]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];

    // Optional: block inactive users (matches auth middleware)
    if (user.status && user.status !== 'active') {
      return res.status(403).json({ error: 'User is not active' });
    }

    const passwordMatches = await compare(password, user.password);
    if (!passwordMatches) return res.status(401).json({ error: 'Invalid credentials' });

    // ✅ NEW: Query user's teams and units for RBAC
    const teamsResult = await pool.query(
      'SELECT team_id FROM user_teams WHERE user_id = $1',
      [user_id]
    );
    const unitsResult = await pool.query(
      'SELECT unit_id FROM user_units WHERE user_id = $1',
      [user_id]
    );

    const team_ids = teamsResult.rows.map(r => r.team_id);
    const unit_ids = unitsResult.rows.map(r => r.unit_id);

    // Create token payload with RBAC claims
    const payload = {
      user_id: user.user_id,
      is_admin: user.is_admin,
      role: user.role || null,
      team_ids: team_ids,      // ✅ NEW: Array of team IDs
      unit_ids: unit_ids,       // ✅ NEW: Array of unit IDs
    };

    const token = sign(payload, jwtSecret, { expiresIn: '8h' });

    const { password: pwd, ...userWithoutPassword } = user;

    res.json({ token, user: userWithoutPassword });
  } catch (err) {
    console.error('Signin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
