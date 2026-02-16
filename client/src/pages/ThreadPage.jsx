import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import TiltCard from '../components/TiltCard.jsx';
import VoteControls from '../components/VoteControls.jsx';
import {
  createThreadResponse,
  deleteThread,
  fetchThreadById,
  fetchThreadResponses,
  voteThreadResponse,
  voteThread
} from '../services/threadService.js';
import { createReport } from '../services/reportService.js';
import { formatDateTime } from '../utils/dateTime.js';
import { renderMentions } from '../utils/renderMentions.jsx';

function ThreadPage({ user }) {
  const navigate = useNavigate();
  const { threadId } = useParams();
  const [thread, setThread] = useState(null);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [voting, setVoting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [responseBody, setResponseBody] = useState('');
  const [responding, setResponding] = useState(false);
  const [responsesLoading, setResponsesLoading] = useState(true);
  const [votingResponseId, setVotingResponseId] = useState(null);
  const [reportingKey, setReportingKey] = useState('');
  const [reportMessage, setReportMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function loadThread() {
      try {
        const [threadData, responseData] = await Promise.all([
          fetchThreadById(threadId),
          fetchThreadResponses(threadId)
        ]);
        if (active) {
          setThread(threadData);
          setResponses(responseData);
        }
      } catch (_error) {
        if (active) {
          setError('Could not load thread');
        }
      } finally {
        if (active) {
          setLoading(false);
          setResponsesLoading(false);
        }
      }
    }

    loadThread();
    return () => {
      active = false;
    };
  }, [threadId]);

  if (loading) {
    return <p className="muted">Loading thread...</p>;
  }

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  if (!thread) {
    return <p className="muted">Thread not found.</p>;
  }

  const shareThreadTo = `/messages?shareThreadId=${thread.id}&shareThreadTitle=${encodeURIComponent(
    thread.title
  )}`;

  async function onVote(vote) {
    setVoting(true);
    setError('');

    try {
      const updated = await voteThread(thread.id, vote);
      setThread(updated);
    } catch (voteError) {
      setError(voteError.message);
    } finally {
      setVoting(false);
    }
  }

  async function onDelete() {
    const confirmed = window.confirm('Delete this thread? This action cannot be undone.');
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError('');
    try {
      await deleteThread(thread.id);
      navigate('/');
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete thread');
      setDeleting(false);
    }
  }

  async function onRespond(event) {
    event.preventDefault();
    setError('');
    setResponding(true);

    try {
      const created = await createThreadResponse(thread.id, { body: responseBody });
      setResponses((current) => [...current, created]);
      setResponseBody('');
    } catch (responseError) {
      setError(responseError.message || 'Could not post response');
    } finally {
      setResponding(false);
    }
  }

  async function onResponseVote(responseId, vote) {
    setVotingResponseId(responseId);
    setError('');

    try {
      const updated = await voteThreadResponse(thread.id, responseId, vote);
      setResponses((current) =>
        current.map((response) => (response.id === updated.id ? updated : response))
      );
    } catch (voteError) {
      setError(voteError.message || 'Could not vote on response');
    } finally {
      setVotingResponseId(null);
    }
  }

  async function onReport(entityType, entityId) {
    if (!user) {
      setError('Login required to report content');
      setReportMessage('');
      return;
    }

    const reason = window.prompt('Why are you reporting this?', '');
    if (reason === null) {
      return;
    }
    const trimmedReason = String(reason).trim();
    if (!trimmedReason) {
      setError('Report reason is required');
      setReportMessage('');
      return;
    }

    const detailsPrompt = window.prompt('Optional details for moderators:', '');
    if (detailsPrompt === null) {
      return;
    }
    const details = String(detailsPrompt || '').trim();

    const key = `${entityType}:${entityId}`;
    setReportingKey(key);
    setError('');
    setReportMessage('');

    try {
      await createReport({
        entityType,
        entityId,
        reason: trimmedReason,
        details
      });
      setReportMessage('Thanks. Your report was submitted for moderator review.');
    } catch (reportError) {
      setError(reportError.message || 'Could not submit report');
    } finally {
      setReportingKey('');
    }
  }

  return (
    <TiltCard as="article" className="card">
      {thread.boardSlug ? (
        <p className="muted">
          <Link to={`/boards/${thread.boardSlug}`}>/{thread.boardSlug}</Link>
        </p>
      ) : null}
      <h1 className="page-title">{thread.title}</h1>
      <p className="muted">
        <small>
          By{' '}
          {thread.authorUserId ? (
            <Link to={`/users/${thread.authorUserId}`}>{thread.authorName}</Link>
          ) : (
            thread.authorName
          )}{' '}
          on {formatDateTime(thread.createdAt, user?.timezone)}
        </small>
      </p>
      <p className="thread-body">{renderMentions(thread.body)}</p>
      <VoteControls thread={thread} user={user} onVote={onVote} disabled={voting} />
      {user ? (
        <p>
          <Link className="btn btn--secondary" to={shareThreadTo}>
            Share via Message
          </Link>
        </p>
      ) : null}
      {user && thread.authorUserId !== user.id ? (
        <p>
          <button
            className="btn btn--secondary"
            type="button"
            onClick={() => onReport('thread', thread.id)}
            disabled={reportingKey === `thread:${thread.id}`}
          >
            {reportingKey === `thread:${thread.id}` ? 'Reporting...' : 'Report Thread'}
          </button>
        </p>
      ) : null}
      {user?.isAdmin ? (
        <p>
          <button className="btn btn--secondary" type="button" onClick={onDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete Thread'}
          </button>
        </p>
      ) : null}
      {reportMessage ? <p className="muted">{reportMessage}</p> : null}

      <section className="responses">
        <h2>Responses</h2>
        {!user ? <p className="muted">Login to respond to this thread.</p> : null}

        {user ? (
          <form className="form-grid" onSubmit={onRespond}>
            <textarea
              name="responseBody"
              placeholder="Write a response... (use @handle to mention)"
              value={responseBody}
              onChange={(event) => setResponseBody(event.target.value)}
              rows={4}
              required
            />
            <button className="btn" type="submit" disabled={responding}>
              {responding ? 'Posting...' : 'Post Response'}
            </button>
          </form>
        ) : null}

        {responsesLoading ? <p className="muted">Loading responses...</p> : null}
        {!responsesLoading && responses.length === 0 ? (
          <p className="muted">No responses yet. Start the conversation.</p>
        ) : null}

        <ul className="response-list">
          {responses.map((response) => (
            <TiltCard as="li" key={response.id} className="response-item">
              <p className="thread-body">{renderMentions(response.body)}</p>
              <VoteControls
                thread={response}
                user={user}
                onVote={(vote) => onResponseVote(response.id, vote)}
                disabled={votingResponseId === response.id}
              />
              <p className="muted">
                <small>
                  {response.userId ? (
                    <Link to={`/users/${response.userId}`}>{response.authorName}</Link>
                  ) : (
                    response.authorName
                  )}{' '}
                  on {formatDateTime(response.createdAt, user?.timezone)}
                </small>
              </p>
              {user && response.userId !== user.id ? (
                <button
                  className="btn btn--secondary"
                  type="button"
                  onClick={() => onReport('response', response.id)}
                  disabled={reportingKey === `response:${response.id}`}
                >
                  {reportingKey === `response:${response.id}` ? 'Reporting...' : 'Report Reply'}
                </button>
              ) : null}
            </TiltCard>
          ))}
        </ul>
      </section>
    </TiltCard>
  );
}

export default ThreadPage;
