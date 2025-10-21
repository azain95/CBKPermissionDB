// middleware/adminAuth.js

import authenticateJWT from './auth.js';

function authenticateAdmin(req, res, next) {
    console.log("--- authenticateAdmin middleware running ---");
    // We can simplify this. If authenticateJWT runs first on the route, req.user will already exist.
    // The main check is for the role property.
    
    // The user object is attached by the authenticateJWT middleware
if (req.user && (req.user.role === 'admin' || req.user.is_admin === true)) {        console.log("Access GRANTED: User is an admin via role check.");
         console.log("Access GRANTED: User is an admin via role check.");

        next();
    } else {
        console.error("Access DENIED: User is not an admin based on role.", req.user);
        res.sendStatus(403); // Forbidden
    }
}

export default authenticateAdmin;