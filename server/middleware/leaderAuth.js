function authenticateLeader(req, res, next) {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'leader' || req.user.is_admin === true)) {
        next();
    } else {
        res.status(403).json({ error: 'Forbidden: Leader or Admin access required' });
    }
}

export default authenticateLeader;
