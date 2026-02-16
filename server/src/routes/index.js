const express = require('express');

const authRoutes = require('../modules/auth/auth.routes');
const boardRoutes = require('../modules/boards/boards.routes');
const userRoutes = require('../modules/users/users.routes');
const threadRoutes = require('../modules/threads/threads.routes');
const commentRoutes = require('../modules/comments/comments.routes');
const messageRoutes = require('../modules/messages/messages.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/boards', boardRoutes);
router.use('/users', userRoutes);
router.use('/threads', threadRoutes);
router.use('/comments', commentRoutes);
router.use('/messages', messageRoutes);

module.exports = router;
