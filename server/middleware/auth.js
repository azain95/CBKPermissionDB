import pkg from "jsonwebtoken";
const { verify } = pkg;
import { jwtSecret } from '../config.js';
import db from '../db.js';

async function authenticateJWT(req, res, next) {
    const authHeader = req.headers.authorization;

    if (authHeader) {
        const token = authHeader.split(" ")[1];

        if (!token) {
            return res.sendStatus(401);
        }

        verify(token, jwtSecret, async (err, decoded) => {
            if (err) {
                return res.sendStatus(403);
            }
            
            try {
                const { rows } = await db.query("SELECT * FROM users WHERE user_id = $1", [decoded.user_id]);

                if (rows.length === 0) {
                    return res.sendStatus(403); 
                }

                const currentUser = rows[0];

                if (currentUser.status !== 'active') {
                    return res.sendStatus(403); 
                }

                req.user = currentUser;
                next();

            } catch (dbError) {
                console.error("Database error in auth middleware:", dbError);
                return res.sendStatus(500);
            }
        });
    } else {
        res.sendStatus(401);
    }
}

export default authenticateJWT;