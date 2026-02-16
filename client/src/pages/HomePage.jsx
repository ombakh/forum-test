import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TiltCard from '../components/TiltCard.jsx';
import { fetchThreads } from '../services/threadService.js';
import { fetchFollowingThreads } from '../services/userService.js';
import { formatDateTime } from '../utils/dateTime.js';

function HomePage({ user }) {
  const [trendingThreads, setTrendingThreads] = useState([]);
  const [trendingSearch, setTrendingSearch] = useState('');
  const [trendingSort, setTrendingSort] = useState('top');
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState('');

  const [feedTab, setFeedTab] = useState('trending');
  const [followingThreads, setFollowingThreads] = useState([]);
  const [followingSearch, setFollowingSearch] = useState('');
  const [followingSort, setFollowingSort] = useState('new');
  const [followingLoading, setFollowingLoading] = useState(false);
  const [followingError, setFollowingError] = useState('');

  useEffect(() => {
    if (!user) {
      setFeedTab('trending');
    }
  }, [user]);

  useEffect(() => {
    let active = true;

    async function loadTrendingFeed() {
      if (feedTab !== 'trending') {
        return;
      }

      setTrendingLoading(true);
      setTrendingError('');

      try {
        const threads = await fetchThreads({
          search: trendingSearch,
          sort: trendingSort
        });
        if (active) {
          setTrendingThreads(threads);
        }
      } catch (loadError) {
        if (active) {
          setTrendingError(loadError.message || 'Could not load trending posts');
        }
      } finally {
        if (active) {
          setTrendingLoading(false);
        }
      }
    }

    const timer = setTimeout(loadTrendingFeed, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [feedTab, trendingSearch, trendingSort]);

  useEffect(() => {
    let active = true;

    async function loadFollowingFeed() {
      if (!user || feedTab !== 'following') {
        return;
      }

      setFollowingLoading(true);
      setFollowingError('');

      try {
        const threads = await fetchFollowingThreads({
          search: followingSearch,
          sort: followingSort
        });
        if (active) {
          setFollowingThreads(threads);
        }
      } catch (loadError) {
        if (active) {
          setFollowingError(loadError.message || 'Could not load following feed');
        }
      } finally {
        if (active) {
          setFollowingLoading(false);
        }
      }
    }

    const timer = setTimeout(loadFollowingFeed, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [user, feedTab, followingSearch, followingSort]);

  const trendingAverageScore = useMemo(() => {
    if (trendingThreads.length === 0) {
      return 0;
    }
    const total = trendingThreads.reduce(
      (sum, thread) => sum + ((thread.upvotes || 0) - (thread.downvotes || 0)),
      0
    );
    return Math.round(total / trendingThreads.length);
  }, [trendingThreads]);

  const followingAverageScore = useMemo(() => {
    if (followingThreads.length === 0) {
      return 0;
    }
    const total = followingThreads.reduce(
      (sum, thread) => sum + ((thread.upvotes || 0) - (thread.downvotes || 0)),
      0
    );
    return Math.round(total / followingThreads.length);
  }, [followingThreads]);

  const currentCount = feedTab === 'trending' ? trendingThreads.length : followingThreads.length;
  const currentAverageScore =
    feedTab === 'trending' ? trendingAverageScore : followingAverageScore;

  return (
    <section className="home-page">
      <TiltCard as="div" className="card section-header-card card--hero">
        <h1 className="page-title">{feedTab === 'following' ? 'Following Feed' : 'Trending Posts'}</h1>
        <div className="hero-metrics">
          <div className="hero-metric">
            <span>Showing</span>
            <strong>{currentCount}</strong>
          </div>
          <div className="hero-metric">
            <span>Avg Score</span>
            <strong>{currentAverageScore}</strong>
          </div>
        </div>

        {user ? (
          <div className="board-tabs">
            <button
              className={`btn btn--secondary ${feedTab === 'trending' ? 'is-selected' : ''}`}
              type="button"
              onClick={() => setFeedTab('trending')}
            >
              Trending
            </button>
            <button
              className={`btn btn--secondary ${feedTab === 'following' ? 'is-selected' : ''}`}
              type="button"
              onClick={() => setFeedTab('following')}
            >
              Following
            </button>
          </div>
        ) : null}

        {feedTab === 'trending' ? (
          <>
            <p className="muted">Posts people are engaging with right now.</p>
            <div className="home-feed-controls">
              <input
                className="home-feed-controls__search"
                value={trendingSearch}
                onChange={(event) => setTrendingSearch(event.target.value)}
                placeholder="Search trending posts..."
              />
              <label className="home-feed-controls__sort-wrap">
                <span className="home-feed-controls__sort-label">Sort</span>
                <select
                  className="home-feed-controls__sort"
                  value={trendingSort}
                  onChange={(event) => setTrendingSort(event.target.value)}
                  aria-label="Sort trending posts"
                >
                  <option value="top">Top</option>
                  <option value="active">Most Active</option>
                  <option value="discussed">Most Discussed</option>
                  <option value="new">Newest</option>
                </select>
              </label>
            </div>
            {!user ? <p className="muted"><Link to="/login">Login</Link> to unlock your following feed.</p> : null}
            {trendingError ? <p className="error-text">{trendingError}</p> : null}
            {trendingLoading ? <p className="muted">Loading trending posts...</p> : null}
            {!trendingLoading && trendingThreads.length === 0 ? (
              <p className="muted">{trendingSearch ? 'No matching trending posts.' : 'No trending posts yet.'}</p>
            ) : null}
          </>
        ) : (
          <>
            <p className="muted">Threads from people you follow.</p>
            <div className="home-feed-controls">
              <input
                className="home-feed-controls__search"
                value={followingSearch}
                onChange={(event) => setFollowingSearch(event.target.value)}
                placeholder="Search in following feed..."
              />
              <label className="home-feed-controls__sort-wrap">
                <span className="home-feed-controls__sort-label">Sort</span>
                <select
                  className="home-feed-controls__sort"
                  value={followingSort}
                  onChange={(event) => setFollowingSort(event.target.value)}
                  aria-label="Sort following feed"
                >
                  <option value="new">Newest</option>
                  <option value="top">Top</option>
                  <option value="active">Most Active</option>
                  <option value="discussed">Most Discussed</option>
                </select>
              </label>
            </div>
            {followingError ? <p className="error-text">{followingError}</p> : null}
            {followingLoading ? <p className="muted">Loading following feed...</p> : null}
            {!followingLoading && followingThreads.length === 0 ? (
              <p className="muted">
                {followingSearch
                  ? 'No matching threads from people you follow.'
                  : 'No threads yet. Follow people from their profiles to build your feed.'}
              </p>
            ) : null}
          </>
        )}
      </TiltCard>

      {feedTab === 'trending' ? (
        <div className="home-trending-scroll">
          <ul className="thread-list home-trending-list">
            {trendingThreads.map((thread, index) => (
              <TiltCard
                as="li"
                key={thread.id}
                className="thread-item thread-item--animated"
                style={{ '--stagger': index }}
              >
                <h3>
                  <Link to={`/threads/${thread.id}`}>{thread.title}</Link>
                </h3>
                <p className="muted">
                  by{' '}
                  {thread.authorUserId ? (
                    <Link to={`/users/${thread.authorUserId}`}>{thread.authorName}</Link>
                  ) : (
                    thread.authorName
                  )}
                  {' • '}
                  {thread.boardSlug ? <Link to={`/boards/${thread.boardSlug}`}>/{thread.boardSlug}</Link> : 'No board'}
                </p>
                <p className="muted">
                  #{index + 1} trending • Score: {(thread.upvotes || 0) - (thread.downvotes || 0)} •{' '}
                  {thread.responseCount || 0} responses • last activity{' '}
                  {formatDateTime(thread.latestActivityAt || thread.createdAt, user?.timezone)}
                </p>
                {user ? (
                  <div className="thread-actions">
                    <Link
                      className="btn btn--secondary"
                      to={`/messages?shareThreadId=${thread.id}&shareThreadTitle=${encodeURIComponent(thread.title)}`}
                    >
                      Share
                    </Link>
                  </div>
                ) : null}
              </TiltCard>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="thread-list home-following-list">
          {followingThreads.map((thread, index) => (
            <TiltCard
              as="li"
              key={thread.id}
              className="thread-item thread-item--animated"
              style={{ '--stagger': index }}
            >
              <h3>
                <Link to={`/threads/${thread.id}`}>{thread.title}</Link>
              </h3>
              <p className="muted">
                by{' '}
                {thread.authorUserId ? (
                  <Link to={`/users/${thread.authorUserId}`}>{thread.authorName}</Link>
                ) : (
                  thread.authorName
                )}
                {' • '}
                {thread.boardSlug ? <Link to={`/boards/${thread.boardSlug}`}>/{thread.boardSlug}</Link> : 'No board'}
              </p>
              <p className="muted">
                Score: {(thread.upvotes || 0) - (thread.downvotes || 0)} • {thread.responseCount || 0}{' '}
                responses • last activity{' '}
                {formatDateTime(thread.latestActivityAt || thread.createdAt, user?.timezone)}
              </p>
              {user ? (
                <div className="thread-actions">
                  <Link
                    className="btn btn--secondary"
                    to={`/messages?shareThreadId=${thread.id}&shareThreadTitle=${encodeURIComponent(thread.title)}`}
                  >
                    Share
                  </Link>
                </div>
              ) : null}
            </TiltCard>
          ))}
        </ul>
      )}
    </section>
  );
}

export default HomePage;
