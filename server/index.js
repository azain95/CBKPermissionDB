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
// NEW: Imports for CSV parsing
import csv from 'csv-parser';
import stream from 'stream';
import format from 'pg-format';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const saltRounds = 10;

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // req.body

// JWT secret key
import { jwtSecret } from './config.js';

// =================================================================
//  MULTER & CLOUDINARY CONFIGURATION
// =================================================================

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


app.use('/schedules', scheduleRouter);

// POST /schedules/import - Handles CSV file upload for schedules (PHASE 2)
// index.js


// In your main index.js file...
// REPLACE the entire '/schedules/import' route with this final version.

// In your main index.js file...
// REPLACE the entire '/schedules/import' route with this final version.

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

// =================================================================
//  ATTACHMENTS UPLOAD (Cloudinary via memory buffer)
// =================================================================
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

// update units 
// In your backend index.js -> Replace the existing /users/update-units route

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


// Create user
app.post("/signup", async (req, res) => {
    try {
        const {
            user_id, name, email, mobile, password, is_admin, civil_id, emergency_contact,
            address, photo_url, dob, joining_date, education, graduation_year,
            driving_license, contract_type, job_title, grade, status, nationality,
        } = req.body;
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


// Delete user
// --- NEW AND IMPROVED: Soft-delete a user by setting their status to 'inactive' ---
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


// Create request (unified, validates type, uses attachment_url)
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

// Change password
app.post("/changepassword", authenticateJWT, async (req, res) => {
  try {
    const { user_id, newPassword } = req.body;

    if (req.user.user_id !== user_id && !req.user.is_admin) {
        return res.sendStatus(403);
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

// (Removed legacy duplicate POST /requests that used non-existent "attachment" column)

// Get requests (supports optional ?type=..., admin gets all; non-admin sees own)
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

// Get requests for specific user
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



// NEW: Endpoint for the Employee Schedule Profile Page
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


// =================================================================
//  SERVER INITIALIZATION
// =================================================================

const server = http.createServer(app);
server.timeout = 10000; // 10-second timeout

server.listen(5000, () => {
    console.log("🚀 Server is running on http://localhost:5000");
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send("Something broke!");
});

app.post('/signin', async (req, res) => {
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

    // Create token payload with useful claims
    const payload = {
      user_id: user.user_id,
      is_admin: user.is_admin,
      role: user.role || null,
    };

    const token = sign(payload, jwtSecret, { expiresIn: '8h' });

    const { password: pwd, ...userWithoutPassword } = user;

    res.json({ token, user: userWithoutPassword });
  } catch (err) {
    console.error('Signin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});