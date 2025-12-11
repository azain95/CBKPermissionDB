import authenticateJWT from './auth.js';

function authenticateAdmin(req, res, next) {
    if (req.user && (req.user.role === 'admin' || req.user.is_admin === true)) {
        next();
    } else {
        res.sendStatus(403);
    }
}

export default authenticateAdmin;