import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchBoards } from '../services/threadService.js';

function HomePage({ user }) {
  const [boards, setBoards] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadBoards() {
      try {
        const boardList = await fetchBoards();
        if (active) {
          setBoards(boardList);
        }
      } catch (_error) {
        if (active) {
          setError('Could not load boards');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadBoards();
    return () => {
      active = false;
    };
  }, []);

  const filteredBoards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return boards;
    }
    return boards.filter(
      (board) =>
        board.name.toLowerCase().includes(q) ||
        (board.description || '').toLowerCase().includes(q) ||
        board.slug.toLowerCase().includes(q)
    );
  }, [boards, search]);

  return (
    <section>
      <div className="card section-header-card">
        <h1 className="page-title">Communities</h1>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search boards by name, slug, or description..."
        />
        {!user ? (
          <p className="muted">
            Browse communities and open threads inside each board. <Link to="/login">Login</Link>{' '}
            to post.
          </p>
        ) : null}
        {error ? <p className="error-text">{error}</p> : null}
        {loading ? <p className="muted">Loading...</p> : null}
        {!loading && filteredBoards.length === 0 ? (
          <p className="muted">{search ? 'No matching boards.' : 'No boards yet.'}</p>
        ) : null}
      </div>

      <div className="board-grid home-board-grid">
        {filteredBoards.map((board, index) => (
          <Link
            key={board.id}
            to={`/boards/${board.slug}`}
            className="board-card thread-item--animated"
            style={{ '--stagger': index }}
          >
            <h3>{board.name}</h3>
            <p className="muted">/{board.slug}</p>
            <p className="muted">{board.description || 'No description yet.'}</p>
            <p className="muted">
              Owner:{' '}
              {board.creatorUserId ? (
                <Link to={`/users/${board.creatorUserId}`}>{board.createdByName || 'Unknown'}</Link>
              ) : (
                board.createdByName || 'System'
              )}
            </p>
            <p className="muted">
              {board.threadCount} thread{board.threadCount === 1 ? '' : 's'}
            </p>
            <p className="muted">
              Last activity:{' '}
              {board.latestThreadAt ? new Date(board.latestThreadAt).toLocaleString() : 'No activity yet'}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default HomePage;
