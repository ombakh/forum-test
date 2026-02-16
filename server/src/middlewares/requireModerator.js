function requireModerator(req, res, next) {
  if (!req.authUser || (!req.authUser.isAdmin && !req.authUser.isModerator)) {
    return res.status(403).json({ message: 'Moderator or admin privileges required' });
  }

  return next();
}

module.exports = requireModerator;
