import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TiltCard from '../components/TiltCard.jsx';
import { fetchReports, reviewReport } from '../services/reportService.js';
import { formatDateTime } from '../utils/dateTime.js';

function truncate(value, limit = 220) {
  const text = String(value || '');
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit - 1)}…`;
}

function buildReportTarget(report) {
  if (report.entityType === 'thread') {
    return {
      label: 'Thread',
      text: report.threadTitle || `Thread #${report.entityId}`,
      to: `/threads/${report.entityId}`
    };
  }

  if (report.entityType === 'response') {
    return {
      label: 'Response',
      text: report.threadTitle ? `In ${report.threadTitle}` : `Response #${report.entityId}`,
      to: report.threadId ? `/threads/${report.threadId}` : null
    };
  }

  return {
    label: 'Profile',
    text: report.targetUserName
      ? `${report.targetUserName}${report.targetUserHandle ? ` (@${report.targetUserHandle})` : ''}`
      : `User #${report.entityId}`,
    to: `/users/${report.entityId}`
  };
}

function ModerationPage({ user }) {
  const canModerate = Boolean(user?.isAdmin || user?.isModerator);
  const [filterStatus, setFilterStatus] = useState('open');
  const [reports, setReports] = useState([]);
  const [summary, setSummary] = useState({
    open: 0,
    resolved: 0,
    dismissed: 0,
    total: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewingId, setReviewingId] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadReports() {
      if (!canModerate) {
        setReports([]);
        setLoading(false);
        setError('');
        return;
      }

      setLoading(true);
      setError('');

      try {
        const data = await fetchReports({ status: filterStatus, limit: 160 });
        if (active) {
          setReports(data.reports || []);
          setSummary(data.summary || { open: 0, resolved: 0, dismissed: 0, total: 0 });
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message || 'Could not load reports');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadReports();
    return () => {
      active = false;
    };
  }, [canModerate, filterStatus, refreshNonce]);

  async function onReview(report, status) {
    if (!report || reviewingId !== null) {
      return;
    }

    let moderatorNote = '';
    if (status !== 'open') {
      const notePrompt = window.prompt('Optional moderator note:', report.moderatorNote || '');
      if (notePrompt === null) {
        return;
      }
      moderatorNote = notePrompt;
    }

    setReviewingId(report.id);
    setError('');
    try {
      await reviewReport(report.id, { status, moderatorNote });
      setRefreshNonce((current) => current + 1);
    } catch (reviewError) {
      setError(reviewError.message || 'Could not update report');
    } finally {
      setReviewingId(null);
    }
  }

  if (!user) {
    return (
      <TiltCard as="section" className="card card--hero">
        <h1 className="page-title">Moderation</h1>
        <p className="muted">
          <Link to="/login">Login</Link> to access moderation tools.
        </p>
      </TiltCard>
    );
  }

  if (!canModerate) {
    return (
      <TiltCard as="section" className="card card--hero">
        <h1 className="page-title">Moderation</h1>
        <p className="muted">Moderator or admin privileges required.</p>
      </TiltCard>
    );
  }

  return (
    <TiltCard as="section" className="card card--hero">
      <h1 className="page-title">Moderation Queue</h1>
      <p className="muted">Review reports from users and resolve flagged content.</p>

      <div className="hero-metrics moderation-summary">
        <div className="hero-metric">
          <span>Open</span>
          <strong>{summary.open || 0}</strong>
        </div>
        <div className="hero-metric">
          <span>Resolved</span>
          <strong>{summary.resolved || 0}</strong>
        </div>
        <div className="hero-metric">
          <span>Dismissed</span>
          <strong>{summary.dismissed || 0}</strong>
        </div>
        <div className="hero-metric">
          <span>Total</span>
          <strong>{summary.total || 0}</strong>
        </div>
      </div>

      <div className="moderation-toolbar">
        <label>
          Status
          <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {loading ? <p className="muted">Loading reports...</p> : null}
      {!loading && reports.length === 0 ? <p className="muted">No reports in this queue.</p> : null}

      <ul className="report-list">
        {reports.map((report) => {
          const target = buildReportTarget(report);
          const statusClass =
            report.status === 'open'
              ? 'is-open'
              : report.status === 'resolved'
                ? 'is-resolved'
                : 'is-dismissed';
          return (
            <li key={report.id} className="report-item">
              <div className="report-item__header">
                <p className="report-item__title">
                  <span className={`report-status-pill ${statusClass}`}>{report.status}</span>{' '}
                  {target.label} report
                </p>
                <p className="muted report-item__meta">
                  by {report.reporterName}
                  {report.reporterHandle ? ` (@${report.reporterHandle})` : ''} •{' '}
                  {formatDateTime(report.createdAt, user?.timezone)}
                </p>
              </div>

              <p className="report-item__reason">
                <strong>Reason:</strong> {report.reason}
              </p>

              {report.details ? (
                <p className="muted report-item__details">
                  <strong>Details:</strong> {truncate(report.details, 320)}
                </p>
              ) : null}

              {target.to ? (
                <p className="report-item__target">
                  <Link to={target.to}>{target.text}</Link>
                </p>
              ) : (
                <p className="report-item__target">{target.text}</p>
              )}

              {report.entityType === 'response' && report.responseBody ? (
                <p className="muted report-item__excerpt">"{truncate(report.responseBody, 220)}"</p>
              ) : null}

              {report.reviewedAt ? (
                <p className="muted report-item__review-meta">
                  Reviewed {formatDateTime(report.reviewedAt, user?.timezone)}
                  {report.reviewedByName ? ` by ${report.reviewedByName}` : ''}
                  {report.moderatorNote ? ` • ${report.moderatorNote}` : ''}
                </p>
              ) : null}

              <div className="report-item__actions">
                {report.status === 'open' ? (
                  <>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      onClick={() => onReview(report, 'resolved')}
                      disabled={reviewingId === report.id}
                    >
                      Resolve
                    </button>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      onClick={() => onReview(report, 'dismissed')}
                      disabled={reviewingId === report.id}
                    >
                      Dismiss
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={() => onReview(report, 'open')}
                    disabled={reviewingId === report.id}
                  >
                    Reopen
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </TiltCard>
  );
}

export default ModerationPage;
