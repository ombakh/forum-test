const express = require('express');
const { getDb } = require('../../db');
const requireAuth = require('../../middlewares/requireAuth');
const requireModerator = require('../../middlewares/requireModerator');

const router = express.Router();

const ENTITY_TYPES = new Set(['thread', 'response', 'user']);
const REVIEW_STATUSES = new Set(['open', 'resolved', 'dismissed']);

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return REVIEW_STATUSES.has(status) ? status : null;
}

function normalizeEntityType(value) {
  const entityType = String(value || '').trim().toLowerCase();
  return ENTITY_TYPES.has(entityType) ? entityType : null;
}

function serializeReportRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    reporterUserId: Number(row.reporterUserId),
    reporterName: row.reporterName,
    reporterHandle: row.reporterHandle || null,
    entityType: row.entityType,
    entityId: Number(row.entityId),
    threadId: row.threadId ? Number(row.threadId) : null,
    reason: row.reason,
    details: row.details || '',
    status: row.status,
    moderatorNote: row.moderatorNote || '',
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt || null,
    reviewedByUserId: row.reviewedByUserId ? Number(row.reviewedByUserId) : null,
    reviewedByName: row.reviewedByName || null,
    threadTitle: row.threadTitle || null,
    responseBody: row.responseBody || null,
    targetUserName: row.targetUserName || null,
    targetUserHandle: row.targetUserHandle || null
  };
}

function loadReportById(db, reportId) {
  return db
    .prepare(
      `SELECT
        r.id,
        r.reporter_user_id AS reporterUserId,
        reporter.name AS reporterName,
        reporter.handle AS reporterHandle,
        r.entity_type AS entityType,
        r.entity_id AS entityId,
        r.thread_id AS threadId,
        r.reason,
        r.details,
        r.status,
        r.moderator_note AS moderatorNote,
        r.created_at AS createdAt,
        r.reviewed_at AS reviewedAt,
        r.reviewed_by_user_id AS reviewedByUserId,
        reviewer.name AS reviewedByName,
        t.title AS threadTitle,
        tr.body AS responseBody,
        target.name AS targetUserName,
        target.handle AS targetUserHandle
       FROM content_reports r
       JOIN users reporter ON reporter.id = r.reporter_user_id
       LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by_user_id
       LEFT JOIN threads t ON t.id = r.thread_id
       LEFT JOIN thread_responses tr
         ON r.entity_type = 'response'
        AND tr.id = r.entity_id
       LEFT JOIN users target
         ON r.entity_type = 'user'
        AND target.id = r.entity_id
       WHERE r.id = ?`
    )
    .get(reportId);
}

function resolveTargetRecord(db, entityType, entityId) {
  if (entityType === 'thread') {
    const thread = db
      .prepare(
        `SELECT
          id,
          title,
          id AS threadId
         FROM threads
         WHERE id = ?`
      )
      .get(entityId);
    return thread
      ? {
          exists: true,
          threadId: Number(thread.threadId),
          title: thread.title || null
        }
      : { exists: false };
  }

  if (entityType === 'response') {
    const response = db
      .prepare(
        `SELECT
          id,
          body,
          thread_id AS threadId
         FROM thread_responses
         WHERE id = ?`
      )
      .get(entityId);

    return response
      ? {
          exists: true,
          threadId: Number(response.threadId),
          body: response.body || null
        }
      : { exists: false };
  }

  if (entityType === 'user') {
    const user = db
      .prepare(
        `SELECT id, name
         FROM users
         WHERE id = ?`
      )
      .get(entityId);

    return user
      ? {
          exists: true,
          threadId: null,
          name: user.name || null
        }
      : { exists: false };
  }

  return { exists: false };
}

router.use(requireAuth);

router.post('/', (req, res) => {
  const entityType = normalizeEntityType(req.body.entityType);
  const entityId = Number(req.body.entityId);
  const reason = String(req.body.reason || '').trim();
  const details = String(req.body.details || '').trim();

  if (!entityType) {
    return res.status(400).json({ message: 'Invalid report type' });
  }
  if (!Number.isInteger(entityId) || entityId <= 0) {
    return res.status(400).json({ message: 'Invalid report target' });
  }
  if (!reason) {
    return res.status(400).json({ message: 'Report reason is required' });
  }
  if (reason.length > 140) {
    return res.status(400).json({ message: 'Report reason must be 140 characters or fewer' });
  }
  if (details.length > 1000) {
    return res.status(400).json({ message: 'Report details must be 1000 characters or fewer' });
  }
  if (entityType === 'user' && entityId === req.authUser.id) {
    return res.status(400).json({ message: 'You cannot report your own profile' });
  }

  try {
    const db = getDb();
    const target = resolveTargetRecord(db, entityType, entityId);
    if (!target.exists) {
      return res.status(404).json({ message: 'Reported content could not be found' });
    }

    const result = db
      .prepare(
        `INSERT INTO content_reports (
           reporter_user_id,
           entity_type,
           entity_id,
           thread_id,
           reason,
           details
         )
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.authUser.id,
        entityType,
        entityId,
        target.threadId || null,
        reason,
        details || null
      );

    const created = loadReportById(db, Number(result.lastInsertRowid));
    return res.status(201).json({ report: serializeReportRow(created) });
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      return res.status(409).json({ message: 'You already have an open report for this content' });
    }
    return res.status(500).json({ message: 'Could not submit report' });
  }
});

router.get('/', requireModerator, (req, res) => {
  const status = String(req.query.status || 'open').trim().toLowerCase();
  const entityTypeFilter = normalizeEntityType(req.query.entityType);
  const rawLimit = Number(req.query.limit);
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 120;

  if (status !== 'all' && !REVIEW_STATUSES.has(status)) {
    return res.status(400).json({ message: 'Invalid status filter' });
  }
  if (req.query.entityType && !entityTypeFilter) {
    return res.status(400).json({ message: 'Invalid entity type filter' });
  }

  try {
    const db = getDb();
    const params = [];
    const whereParts = [];

    if (status !== 'all') {
      whereParts.push('r.status = ?');
      params.push(status);
    }
    if (entityTypeFilter) {
      whereParts.push('r.entity_type = ?');
      params.push(entityTypeFilter);
    }

    const reports = db
      .prepare(
        `SELECT
          r.id,
          r.reporter_user_id AS reporterUserId,
          reporter.name AS reporterName,
          reporter.handle AS reporterHandle,
          r.entity_type AS entityType,
          r.entity_id AS entityId,
          r.thread_id AS threadId,
          r.reason,
          r.details,
          r.status,
          r.moderator_note AS moderatorNote,
          r.created_at AS createdAt,
          r.reviewed_at AS reviewedAt,
          r.reviewed_by_user_id AS reviewedByUserId,
          reviewer.name AS reviewedByName,
          t.title AS threadTitle,
          tr.body AS responseBody,
          target.name AS targetUserName,
          target.handle AS targetUserHandle
         FROM content_reports r
         JOIN users reporter ON reporter.id = r.reporter_user_id
         LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by_user_id
         LEFT JOIN threads t ON t.id = r.thread_id
         LEFT JOIN thread_responses tr
           ON r.entity_type = 'response'
          AND tr.id = r.entity_id
         LEFT JOIN users target
           ON r.entity_type = 'user'
          AND target.id = r.entity_id
         ${whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''}
         ORDER BY
           CASE WHEN r.status = 'open' THEN 0 ELSE 1 END,
           datetime(r.created_at) DESC,
           r.id DESC
         LIMIT ?`
      )
      .all(...params, limit)
      .map(serializeReportRow);

    const countsRows = db
      .prepare(
        `SELECT
          status,
          COUNT(*) AS count
         FROM content_reports
         GROUP BY status`
      )
      .all();

    const summary = {
      open: 0,
      resolved: 0,
      dismissed: 0,
      total: 0
    };

    for (const row of countsRows) {
      const key = String(row.status || '');
      const count = Number(row.count || 0);
      if (Object.prototype.hasOwnProperty.call(summary, key)) {
        summary[key] = count;
      }
      summary.total += count;
    }

    return res.json({ reports, summary });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not load reports' });
  }
});

router.post('/:reportId/review', requireModerator, (req, res) => {
  const reportId = Number(req.params.reportId);
  const status = normalizeStatus(req.body.status);
  const moderatorNote = String(req.body.moderatorNote || '').trim();

  if (!Number.isInteger(reportId) || reportId <= 0) {
    return res.status(400).json({ message: 'Invalid report id' });
  }
  if (!status) {
    return res.status(400).json({ message: 'Invalid review status' });
  }
  if (moderatorNote.length > 500) {
    return res.status(400).json({ message: 'Moderator note must be 500 characters or fewer' });
  }

  try {
    const db = getDb();
    const exists = db.prepare('SELECT id FROM content_reports WHERE id = ?').get(reportId);
    if (!exists) {
      return res.status(404).json({ message: 'Report not found' });
    }

    if (status === 'open') {
      db.prepare(
        `UPDATE content_reports
         SET status = 'open',
             reviewed_by_user_id = NULL,
             reviewed_at = NULL,
             moderator_note = NULL
         WHERE id = ?`
      ).run(reportId);
    } else {
      db.prepare(
        `UPDATE content_reports
         SET status = ?,
             reviewed_by_user_id = ?,
             reviewed_at = CURRENT_TIMESTAMP,
             moderator_note = ?
         WHERE id = ?`
      ).run(status, req.authUser.id, moderatorNote || null, reportId);
    }

    const updated = loadReportById(db, reportId);
    return res.json({ report: serializeReportRow(updated) });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not review report' });
  }
});

module.exports = router;
