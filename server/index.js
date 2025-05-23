import express from "express";
import cors from "cors";
import { hash, compare } from "bcryptjs";
import * as jwt from "jsonwebtoken";
import http from "http";
import pool from "./db.js";
import fs from "fs";
import {join} from 'path'

const saltRounds = 10;

const app = express();

// middleware
app.use(cors());
app.use(express.json()); // req.body

// JWT secret key
const jwtSecret = process.env.JWT_SECRET || "your-secret-key"; // Make sure to store this in an environment variable in production

// JWT authentication middleware
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(" ")[1]; // Extracting the token from the Bearer schema

    jwt.verify(token, jwtSecret, (err, user) => {
      if (err) {
        return res.sendStatus(403); // Forbidden
      }
      req.user = user; // Adding user information to the request
      next(); // Continue processing the request
    });
  } else {
    res.sendStatus(401); // Unauthorized
  }
}

// create user
app.post("/signup", async (req, res) => {
  try {
    const { user_id, name, email, mobile, password } = req.body;

    // Convert is_admin string to boolean. Default to false if not provided
    const is_admin = req.body.is_admin === "true";

    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    const hashedPassword = await hash(password, saltRounds);

    const newUser = await pool.query(
      "INSERT INTO users (user_id, name, email, mobile, password, is_admin) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [user_id, name, email, mobile, hashedPassword, is_admin]
    );

    res.json(newUser.rows[0]);
  } catch (err) {
    console.error(err.message);
    res
      .status(500)
      .json({ error: "Error creating user", details: err.message });
  }
});

// delete user

app.delete("/users/:user_id", authenticateJWT, async (req, res) => {
  try {
    const { user_id } = req.params;
    const deleteUser = await pool.query(
      'DELETE FROM "users" WHERE "user_id" = $1',
      [user_id]
    );
    if (deleteUser.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error deleting user" });
  }
});

// Verify a password and create JWT token
app.post("/signin", async (req, res) => {
  try {
    const { user_id, password } = req.body;

    const user = await pool.query("SELECT * FROM users WHERE user_id = $1", [
      user_id,
    ]);

    if (user.rows.length > 0) {
      const passwordMatch = await compare(password, user.rows[0].password);
      if (!passwordMatch) {
        res.status(400).json({ error: "Invalid credentials" });
      } else {
        const token = jwt.sign(
          { user_id: user.rows[0].user_id, is_admin: user.rows[0].is_admin },
          jwtSecret,
          { expiresIn: "1h" }
        ); // Include is_admin attribute

        // Exclude the password field from the response
        const { password, ...userWithoutPassword } = user.rows[0];
        res.json({ token, user: userWithoutPassword });
      }
    } else {
      res.status(400).json({ error: "Invalid credentials" });
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error logging in", details: err.message });
  }
});

// change password
app.post("/changepassword", async (req, res) => {
  try {
    // Get the new password and user_id from the request body
    const { user_id, newPassword } = req.body;

    // Query the database to get the user
    const user = await pool.query("SELECT * FROM users WHERE user_id = $1", [
      user_id,
    ]);

    if (user.rows.length > 0) {
      // Hash the new password
      const hashedNewPassword = await hash(newPassword, saltRounds);

      // Update the password in the database
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

// create request

app.post("/requests", authenticateJWT, async (req, res) => {
  try {
    const {
      req_datetime,
      req_type,
      date_from,
      date_to,
      time_from,
      time_to,
      user_id,
      reason,
      attachment,
    } = req.body;

    const newRequest = await pool.query(
      'INSERT INTO "requests" ("req_datetime", "req_type", "date_from", "date_to", "time_from", "time_to", "user_id", "reason", "attachment", "status") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [
        req_datetime,
        req_type,
        date_from,
        date_to,
        time_from,
        time_to,
        user_id,
        reason,
        attachment || "",
        "pending",
      ]
    );

    res.json(newRequest.rows[0]);
  } catch (err) {
    console.error(err.message);

    if (err.code === "23502") {
      res.status(400).json({ error: "Missing required fields" });
    } else if (err.code === "23505") {
      res.status(400).json({ error: "Duplicate request" });
    } else {
      res.status(500).json({ error: "Error creating permission request" });
    }
  }
});

// Get all requests (Admin only)
app.get("/requests", authenticateAdmin, async (req, res) => {
  try {
    const allRequests = await pool.query(
      'SELECT r.*, u.name FROM "requests" r JOIN "users" u ON r."user_id" = u."user_id"'
    );
    res.json(allRequests.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error retrieving requests" });
  }
});

// get requests for specific user
app.get("/requests/user/:user_id", authenticateJWT, async (req, res) => {
  try {
    const { user_id } = req.params;
    const userRequests = await pool.query(
      'SELECT * FROM "requests" WHERE "user_id" = $1',
      [user_id]
    );
    res.json(userRequests.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error retrieving user requests" });
  }
});

// get all users

app.get("/users", authenticateJWT, async (req, res) => {
  try {
    const allUsers = await pool.query('SELECT * FROM "users"');
    res.json(allUsers.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error retrieving users" });
  }
});

// get specific user

app.get("/users/:user_id", authenticateJWT, async (req, res) => {
  try {
    const { user_id } = req.params;
    const user = await pool.query(
      'SELECT * FROM "users" WHERE "user_id" = $1',
      [user_id]
    );
    if (user.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error fetching user" });
  }
});

// update a request
app.put("/requests/:request_id", authenticateJWT, async (req, res) => {
  try {
    const { request_id } = req.params;
    const { status } = req.body;

    const updateRequest = await pool.query(
      'UPDATE "requests" SET "status" = $1 WHERE "id" = $2 RETURNING *',
      [status, request_id]
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

// delete a request

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

// grant admin privileges from a user
app.put("/users/makeadmin/:user_id", authenticateJWT, async (req, res) => {
  try {
    const { user_id } = req.params;

    // Check if the user exists
    const user = await pool.query(
      'SELECT * FROM "users" WHERE "user_id" = $1',
      [user_id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update the is_admin field to true
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

app.put("/users/removeadmin/:user_id", authenticateJWT, async (req, res) => {
  try {
    const { user_id } = req.params;

    // Check if the user exists
    const user = await pool.query("SELECT * FROM users WHERE user_id = $1", [
      user_id,
    ]);

    if (user.rows.length > 0) {
      // Update the is_admin field to false
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

// Admin auth middleware

function authenticateAdmin(req, res, next) {
  authenticateJWT(req, res, () => {
    if (req.user && req.user.is_admin) {
      next();
    } else {
      res.sendStatus(403); // Forbidden
    }
  });
}

// Approve a leave request
app.put(
  "/requests/:request_id/approve",
  authenticateAdmin,
  async (req, res) => {
    try {
      const { request_id } = req.params;

      // Approve the request in the database
      const updateRequest = await pool.query(
        'UPDATE "requests" SET "status" = $1 WHERE "id" = $2 RETURNING *',
        ["approved", request_id]
      );

      res.json(updateRequest.rows[0]);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: "Error approving request" });
    }
  }
);

// Reject a leave request
app.put("/requests/:request_id/reject", authenticateAdmin, async (req, res) => {
  try {
    const { request_id } = req.params;
    const { reason } = req.body; // Get the reason from the request body

    // Reject the request in the database and update the reason
    const updateRequest = await pool.query(
      'UPDATE "requests" SET "status" = $1, "reason" = $2 WHERE "id" = $3 RETURNING *',
      ["rejected", reason, request_id] // Include the reason in the update query
    );

    res.json(updateRequest.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error rejecting request" });
  }
});

app.get("/dashboard/statistics", async (req, res) => {
  try {
    // Count total leave requests, permissions, swaps based on status
    const requests = await pool.query(
      'SELECT req_type, status, COUNT(*) AS count FROM "requests" GROUP BY req_type, status'
    );

    // Count total users
    const users = await pool.query('SELECT COUNT(*) AS count FROM "users"');

    // Process the data
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
      const count = parseInt(row.count, 10); // Convert the count to a number
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


const server = http.createServer(app);
server.timeout = 10000; // 10-second timeout

server.listen(5000, () => {
  runSqlScript()
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});
