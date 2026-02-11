const express = require('express');
const { getDb } = require('../../db');
const requireAuth = require('../../middlewares/requireAuth');
const requireAdmin = require('../../middlewares/requireAdmin');
const { TOKEN_COOKIE_NAME, verifyUserToken } = require('../../auth/token');

const router = express.Router();

function getViewerId(req) {
  const token = req.cookies[TOKEN_COOKIE_NAME];
  if (!token) {
    return null;
  }

  try {
    const payload = verifyUserToken(token);
    return payload.sub;
  } catch (_error) {
    return null;
  }
}

function buildThreadSelect() {
  return `
    SELECT
      t.id,
      t.title,
      t.body,
      t.author_name AS authorName,
      t.created_at AS createdAt,
      t.author_user_id AS authorUserId,
      COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
      COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0) AS downvotes,
      MAX(CASE WHEN v.user_id = ? THEN v.vote ELSE 0 END) AS userVote
    FROM threads t
    LEFT JOIN thread_votes v ON v.thread_id = t.id
  `;
}

function buildResponseSelect() {
  return `
    SELECT
      r.id,
      r.thread_id AS threadId,
      r.user_id AS userId,
      r.author_name AS authorName,
      r.body,
      r.created_at AS createdAt,
      COALESCE(SUM(CASE WHEN rv.vote = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
      COALESCE(SUM(CASE WHEN rv.vote = -1 THEN 1 ELSE 0 END), 0) AS downvotes,
      MAX(CASE WHEN rv.user_id = ? THEN rv.vote ELSE 0 END) AS userVote
    FROM thread_responses r
    LEFT JOIN response_votes rv ON rv.response_id = r.id
  `;
}

router.get('/', (_req, res) => {
  try {
    const viewerId = getViewerId(_req) || -1;
    const db = getDb();
    const threads = db
      .prepare(
        `${buildThreadSelect()}
         GROUP BY t.id
         ORDER BY datetime(t.created_at) DESC`
      )
      .all(viewerId)
      .map((thread) => ({
        ...thread,
        upvotes: Number(thread.upvotes),
        downvotes: Number(thread.downvotes),
        userVote: Number(thread.userVote)
      }));
    res.json({ threads });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load threads' });
  }
});

router.get('/:threadId', (req, res) => {
  try {
    const viewerId = getViewerId(req) || -1;
    const db = getDb();
    const thread = db
      .prepare(
        `${buildThreadSelect()}
         WHERE t.id = ?
         GROUP BY t.id`
      )
      .get(viewerId, req.params.threadId);

    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    return res.json({
      thread: {
        ...thread,
        upvotes: Number(thread.upvotes),
        downvotes: Number(thread.downvotes),
        userVote: Number(thread.userVote)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load thread' });
  }
});

router.post('/', requireAuth, (req, res) => {
  const title = (req.body.title || '').trim();
  const body = (req.body.body || '').trim();
  const authorName = req.authUser.name || 'Member';
  const authorUserId = req.authUser.id;

  if (!title || !body) {
    return res.status(400).json({ message: 'Title and body are required' });
  }

  try {
    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO threads (title, body, author_name, author_user_id)
         VALUES (?, ?, ?, ?)`
      )
      .run(title, body, authorName, authorUserId);

    const thread = db
      .prepare(
        `${buildThreadSelect()}
         WHERE t.id = ?
         GROUP BY t.id`
      )
      .get(authorUserId, result.lastInsertRowid);

    return res.status(201).json({
      thread: {
        ...thread,
        upvotes: Number(thread.upvotes),
        downvotes: Number(thread.downvotes),
        userVote: Number(thread.userVote)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create thread' });
  }
});

router.post('/:threadId/vote', requireAuth, (req, res) => {
  const threadId = Number(req.params.threadId);
  const vote = Number(req.body.vote);
  const userId = req.authUser.id;

  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ message: 'Invalid thread id' });
  }

  if (vote !== 1 && vote !== -1) {
    return res.status(400).json({ message: 'Vote must be 1 or -1' });
  }

  try {
    const db = getDb();
    const threadExists = db.prepare('SELECT id FROM threads WHERE id = ?').get(threadId);

    if (!threadExists) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    db.prepare(
      `INSERT INTO thread_votes (thread_id, user_id, vote)
       VALUES (?, ?, ?)
       ON CONFLICT(thread_id, user_id) DO UPDATE SET
         vote = excluded.vote,
         updated_at = CURRENT_TIMESTAMP`
    ).run(threadId, userId, vote);

    const thread = db
      .prepare(
        `${buildThreadSelect()}
         WHERE t.id = ?
         GROUP BY t.id`
      )
      .get(userId, threadId);

    return res.json({
      thread: {
        ...thread,
        upvotes: Number(thread.upvotes),
        downvotes: Number(thread.downvotes),
        userVote: Number(thread.userVote)
      }
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not submit vote' });
  }
});

router.delete('/:threadId', requireAuth, requireAdmin, (req, res) => {
  const threadId = Number(req.params.threadId);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ message: 'Invalid thread id' });
  }

  try {
    const db = getDb();
    const exists = db.prepare('SELECT id FROM threads WHERE id = ?').get(threadId);
    if (!exists) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    db.prepare('DELETE FROM threads WHERE id = ?').run(threadId);
    return res.status(204).send();
  } catch (_error) {
    return res.status(500).json({ message: 'Could not delete thread' });
  }
});

router.get('/:threadId/responses', (req, res) => {
  const threadId = Number(req.params.threadId);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ message: 'Invalid thread id' });
  }

  try {
    const viewerId = getViewerId(req) || -1;
    const db = getDb();
    const exists = db.prepare('SELECT id FROM threads WHERE id = ?').get(threadId);
    if (!exists) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    const responses = db
      .prepare(
        `${buildResponseSelect()}
         WHERE r.thread_id = ?
         GROUP BY r.id
         ORDER BY datetime(r.created_at) ASC`
      )
      .all(viewerId, threadId)
      .map((response) => ({
        ...response,
        upvotes: Number(response.upvotes),
        downvotes: Number(response.downvotes),
        userVote: Number(response.userVote)
      }));

    return res.json({ responses });
  } catch (_error) {
    return res.status(500).json({ message: 'Failed to load responses' });
  }
});

router.post('/:threadId/responses', requireAuth, (req, res) => {
  const threadId = Number(req.params.threadId);
  const body = (req.body.body || '').trim();

  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ message: 'Invalid thread id' });
  }

  if (!body) {
    return res.status(400).json({ message: 'Response body is required' });
  }

  try {
    const db = getDb();
    const exists = db.prepare('SELECT id FROM threads WHERE id = ?').get(threadId);
    if (!exists) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    const result = db
      .prepare(
        `INSERT INTO thread_responses (thread_id, user_id, author_name, body)
         VALUES (?, ?, ?, ?)`
      )
      .run(threadId, req.authUser.id, req.authUser.name, body);

    const response = db
      .prepare(
        `${buildResponseSelect()}
         WHERE r.id = ?
         GROUP BY r.id`
      )
      .get(req.authUser.id, result.lastInsertRowid);

    return res.status(201).json({
      response: {
        ...response,
        upvotes: Number(response.upvotes),
        downvotes: Number(response.downvotes),
        userVote: Number(response.userVote)
      }
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Failed to create response' });
  }
});

router.post('/:threadId/responses/:responseId/vote', requireAuth, (req, res) => {
  const threadId = Number(req.params.threadId);
  const responseId = Number(req.params.responseId);
  const vote = Number(req.body.vote);
  const userId = req.authUser.id;

  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ message: 'Invalid thread id' });
  }

  if (!Number.isInteger(responseId) || responseId <= 0) {
    return res.status(400).json({ message: 'Invalid response id' });
  }

  if (vote !== 1 && vote !== -1) {
    return res.status(400).json({ message: 'Vote must be 1 or -1' });
  }

  try {
    const db = getDb();
    const responseExists = db
      .prepare('SELECT id FROM thread_responses WHERE id = ? AND thread_id = ?')
      .get(responseId, threadId);

    if (!responseExists) {
      return res.status(404).json({ message: 'Response not found' });
    }

    db.prepare(
      `INSERT INTO response_votes (response_id, user_id, vote)
       VALUES (?, ?, ?)
       ON CONFLICT(response_id, user_id) DO UPDATE SET
         vote = excluded.vote,
         updated_at = CURRENT_TIMESTAMP`
    ).run(responseId, userId, vote);

    const response = db
      .prepare(
        `${buildResponseSelect()}
         WHERE r.id = ?
         GROUP BY r.id`
      )
      .get(userId, responseId);

    return res.json({
      response: {
        ...response,
        upvotes: Number(response.upvotes),
        downvotes: Number(response.downvotes),
        userVote: Number(response.userVote)
      }
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not submit response vote' });
  }
});

module.exports = router;
