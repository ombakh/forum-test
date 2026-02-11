import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import VoteControls from '../components/VoteControls.jsx';
import {
  createThreadResponse,
  deleteThread,
  fetchThreadById,
  fetchThreadResponses,
  voteThreadResponse,
  voteThread
} from '../services/threadService.js';

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

  return (
    <article className="card">
      <h1 className="page-title">{thread.title}</h1>
      <p className="muted">
        <small>
          By {thread.authorName} on {new Date(thread.createdAt).toLocaleString()}
        </small>
      </p>
      <p className="thread-body">{thread.body}</p>
      <VoteControls thread={thread} user={user} onVote={onVote} disabled={voting} />
      {user?.isAdmin ? (
        <p>
          <button className="btn btn--secondary" type="button" onClick={onDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete Thread'}
          </button>
        </p>
      ) : null}

      <section className="responses">
        <h2>Responses</h2>
        {!user ? <p className="muted">Login to respond to this thread.</p> : null}

        {user ? (
          <form className="form-grid" onSubmit={onRespond}>
            <textarea
              name="responseBody"
              placeholder="Write a response..."
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
            <li key={response.id} className="response-item">
              <p className="thread-body">{response.body}</p>
              <VoteControls
                thread={response}
                user={user}
                onVote={(vote) => onResponseVote(response.id, vote)}
                disabled={votingResponseId === response.id}
              />
              <p className="muted">
                <small>
                  {response.authorName} on {new Date(response.createdAt).toLocaleString()}
                </small>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

export default ThreadPage;
