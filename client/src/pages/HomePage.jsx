import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import VoteControls from '../components/VoteControls.jsx';
import { deleteThread, fetchThreads, voteThread } from '../services/threadService.js';

function HomePage({ user }) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [votingThreadId, setVotingThreadId] = useState(null);
  const [deletingThreadId, setDeletingThreadId] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadThreads() {
      try {
        const threadList = await fetchThreads();
        if (active) {
          setThreads(threadList);
        }
      } catch (_error) {
        if (active) {
          setError('Could not load threads');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadThreads();
    return () => {
      active = false;
    };
  }, []);

  async function onVote(threadId, vote) {
    setVotingThreadId(threadId);
    setError('');

    try {
      const updatedThread = await voteThread(threadId, vote);
      setThreads((current) =>
        current.map((thread) => (thread.id === updatedThread.id ? updatedThread : thread))
      );
    } catch (voteError) {
      setError(voteError.message);
    } finally {
      setVotingThreadId(null);
    }
  }

  async function onDelete(threadId) {
    const confirmed = window.confirm('Delete this thread? This action cannot be undone.');
    if (!confirmed) {
      return;
    }

    setDeletingThreadId(threadId);
    setError('');
    try {
      await deleteThread(threadId);
      setThreads((current) => current.filter((thread) => thread.id !== threadId));
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete thread');
    } finally {
      setDeletingThreadId(null);
    }
  }

  return (
    <section>
      <div className="card">
        <h1 className="page-title">Recent Threads</h1>
        {!user ? (
          <p className="muted">
            You can browse threads. <Link to="/login">Login</Link> to vote and post.
          </p>
        ) : null}
        {error ? <p className="error-text">{error}</p> : null}
        {loading ? <p className="muted">Loading...</p> : null}
        {!loading && threads.length === 0 ? <p className="muted">No threads yet.</p> : null}
      </div>

      <ul className="thread-list">
        {threads.map((thread, index) => (
          <li
            key={thread.id}
            className="thread-item thread-item--animated"
            style={{ '--stagger': index }}
          >
            <h3>
              <Link to={`/threads/${thread.id}`}>{thread.title}</Link>
            </h3>
            <p className="muted">by {thread.authorName}</p>
            <VoteControls
              thread={thread}
              user={user}
              disabled={votingThreadId === thread.id}
              onVote={(vote) => onVote(thread.id, vote)}
            />
            {user?.isAdmin ? (
              <button
                className="btn btn--secondary"
                type="button"
                onClick={() => onDelete(thread.id)}
                disabled={deletingThreadId === thread.id}
              >
                Delete
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default HomePage;
