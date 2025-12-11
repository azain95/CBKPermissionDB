import express from 'express';
import pool from '../db.js';
import authenticateAdmin from '../middleware/adminAuth.js'; // Ensure you are using the admin auth
import authenticateJWT from '../middleware/auth.js'; // General logged-in check

const router = express.Router();

router.get('/', authenticateJWT, async (req, res) => {
    try {
        const { year, month, department } = req.query;

        // The frontend dashboard will always provide these
        if (!year || !month) {
            return res.status(400).json({ error: "Year and month are required query parameters." });
        }

        // Base query to get all necessary schedule and user info
        let query = `
            SELECT 
                s.id, 
                s.shift_date, 
                s.shift_type, 
                s.shift_time, 
                u.user_id, 
                u.name, 
                u.job_title,
                u.unit as department
            FROM schedules s
            JOIN users u ON s.user_id = u.user_id
            WHERE EXTRACT(YEAR FROM s.shift_date) = $1
              AND EXTRACT(MONTH FROM s.shift_date) = $2
        `;
        const queryParams = [year, month];

        // Dynamically add the department/unit filter if it's provided
        if (department && department !== 'all') {
            queryParams.push(department);
            query += ` AND u.unit = $${queryParams.length}`;
        }

        query += ` ORDER BY u.name, s.shift_date;`;

        const schedulesResult = await pool.query(query, queryParams);
        res.json(schedulesResult.rows);

    } catch (err) {
        console.error("Error in /schedules GET route:", err.message);
        res.status(500).json({ error: "Failed to fetch schedule data." });
    }
});


router.get('/counts', authenticateJWT, authenticateAdmin, async (req, res) => {
    try {
        const { shift_date, job_title, shift_type } = req.query;

        // This CASE statement now exactly matches the logic you provided.
        const shiftTypeCaseStatement = `
            CASE
                WHEN s.shift_time IN ('MOR', '08:00-16:00', '10:00-18:00') THEN 'Morning'
                WHEN s.shift_time IN ('AFT', '12:00-20:00', '14:00-22:00', '16:00-00:00', '16:00-21:00', '17:00-22:00', '18:00-02:00') THEN 'Afternoon'
                WHEN s.shift_time IN ('00:00-08:00', 'NIGHT') THEN 'Night'
                WHEN s.shift_time ILIKE '%LEAVE%' OR s.shift_time ILIKE '%OFF%' THEN 'Leave'
                ELSE 'Other'
            END
        `;

        let countQuery = `
            SELECT COUNT(s.id)
            FROM schedules s
            LEFT JOIN users u ON s.user_id = u.user_id
            WHERE 1=1
        `;
        const queryParams = [];

        if (shift_date) {
            queryParams.push(shift_date);
            countQuery += ` AND s.shift_date = $${queryParams.length}`;
        }
        if (job_title && job_title !== 'all') {
            queryParams.push(job_title);
            countQuery += ` AND u.job_title = $${queryParams.length}`;
        }
        if (shift_type && shift_type !== 'all') {
            queryParams.push(shift_type);
            // This now filters based on the intelligent CASE statement
            countQuery += ` AND (${shiftTypeCaseStatement}) = $${queryParams.length}`;
        }

        const result = await pool.query(countQuery, queryParams);
        res.json({ count: result.rows[0].count });

    } catch (err) {
        console.error("Error in /schedules/counts route:", err);
        res.status(500).send('Server Error');
    }
});


router.get('/monthly-counts', authenticateJWT, authenticateAdmin, async (req, res) => {    try {
        const { month, year, job_title } = req.query;
        if (!month || !year) return res.status(400).json({ error: 'Month and year are required.' });

        // This CASE statement defines the shift types based on your logic
        const shiftTypeCaseStatement = `
            CASE
                WHEN s.shift_time IN ('MOR', '08:00-16:00', '10:00-18:00') THEN 'Morning'
                WHEN s.shift_time IN ('AFT', '12:00-20:00', '14:00-22:00', '16:00-00:00', '16:00-21:00', '17:00-22:00', '18:00-02:00') THEN 'Afternoon'
                WHEN s.shift_time IN ('00:00-08:00', 'NIGHT') THEN 'Night'
                WHEN s.shift_time ILIKE '%LEAVE%' OR s.shift_time ILIKE '%OFF%' THEN 'Leave'
                ELSE 'Other'
            END
        `;

        // The query now groups correctly and includes the job_title filter
        let reportQuery = `
            SELECT
                s.shift_date,
                ${shiftTypeCaseStatement} as shift_type,
                COUNT(s.id) as shift_count
             FROM schedules s
             LEFT JOIN users u ON s.user_id = u.user_id
             WHERE EXTRACT(MONTH FROM s.shift_date) = $1 AND EXTRACT(YEAR FROM s.shift_date) = $2
        `;
        const queryParams = [month, year];

        if (job_title && job_title !== 'all') {
            queryParams.push(job_title);
            reportQuery += ` AND u.job_title = $${queryParams.length}`;
        }
        
        // This GROUP BY clause fixes the SQL error
        reportQuery += ` GROUP BY s.shift_date, shift_type ORDER BY s.shift_date, shift_type`;

        const result = await pool.query(reportQuery, queryParams);
        res.json(result.rows);
    } catch (err) {
        console.error("Error in /schedules/monthly-counts route:", err);
        res.status(500).send('Server Error');
    }
});


router.post('/upload', authenticateAdmin, async (req, res) => {
    // ... upload logic ...
});




router.get('/analytics', authenticateJWT, async (req, res) => {
    try {
        const { year, month, department } = req.query;
        if (!year || !month) {
            return res.status(400).json({ error: "Year and month are required." });
        }

        let baseQuery = `
            FROM schedules s
            JOIN users u ON s.user_id = u.user_id
            WHERE EXTRACT(YEAR FROM s.shift_date) = $1 AND EXTRACT(MONTH FROM s.shift_date) = $2
        `;
        const queryParams = [year, month];

        if (department && department !== 'all') {
            queryParams.push(department);
            baseQuery += ` AND u.unit = $${queryParams.length}`;
        }
        
        const dailyCountsQuery = `
            SELECT 
                s.shift_date,
                COUNT(s.id) FILTER (WHERE s.shift_type ILIKE ANY(ARRAY['%MOR%', '%08:00-16:00%', '%10:00-18:00%']))::int as morning,
                COUNT(s.id) FILTER (WHERE s.shift_type ILIKE ANY(ARRAY['%AFT%', '%12:00-20:00%', '%14:00-22:00%', '%16:00-00:00%']))::int as afternoon,
                -- FIX: Removed extra parenthesis from this line that caused the SQL syntax error
                COUNT(s.id) FILTER (WHERE s.shift_type ILIKE '%NIGHT%')::int as night
            ${baseQuery}
            GROUP BY s.shift_date ORDER BY s.shift_date;
        `;

        const employeeTotalsQuery = `
            SELECT 
                u.user_id, u.name, u.job_title, u.unit,
                COUNT(s.id) FILTER (WHERE s.shift_type NOT ILIKE '%LEAVE%' AND s.shift_type NOT ILIKE '%OFF%')::int as total_shifts,
                COUNT(s.id) FILTER (WHERE s.shift_type ILIKE '%LEAVE%' OR s.shift_type ILIKE '%OFF%')::int as total_leave
            ${baseQuery}
            GROUP BY u.user_id, u.name, u.job_title, u.unit
            ORDER BY total_shifts DESC;
        `;

        const requestsQuery = `
            SELECT
                COUNT(id) FILTER (WHERE req_type = 'swap')::int as total_swaps,
                COUNT(id) FILTER (WHERE req_type = 'permission')::int as total_permissions,
                COUNT(id) FILTER (WHERE req_type LIKE '%leave%')::int as total_leaves_requested
            FROM requests
            WHERE EXTRACT(YEAR FROM req_datetime) = $1 AND EXTRACT(MONTH FROM req_datetime) = $2
        `;

        const [dailyCountsRes, employeeTotalsRes, requestsRes] = await Promise.all([
            pool.query(dailyCountsQuery, queryParams),
            pool.query(employeeTotalsQuery, queryParams),
            pool.query(requestsQuery, [year, month])
        ]);

        res.json({
            dailyCounts: dailyCountsRes.rows,
            employeeTotals: employeeTotalsRes.rows,
            requestTotals: requestsRes.rows[0]
        });

    } catch (err) {
        console.error("Error in /schedules/analytics route:", err);
        res.status(500).send('Server Error');
    }
});

export default router;
