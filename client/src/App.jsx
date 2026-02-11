import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import PageMotion from './components/PageMotion.jsx';
import HomePage from './pages/HomePage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MyPostsSidebar from './components/MyPostsSidebar.jsx';
import PostPage from './pages/PostPage.jsx';
import ThreadPage from './pages/ThreadPage.jsx';
import { getCurrentUser, logout } from './services/authService.js';

function App() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [myPostsVersion, setMyPostsVersion] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      try {
        const currentUser = await getCurrentUser();
        if (active) {
          setUser(currentUser);
        }
      } catch (_error) {
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    }

    loadCurrentUser();
    return () => {
      active = false;
    };
  }, []);

  async function onLogout() {
    try {
      await logout();
    } finally {
      setUser(null);
      setMyPostsVersion((current) => current + 1);
    }
  }

  function onThreadPosted() {
    setMyPostsVersion((current) => current + 1);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">Pinboard</div>
        <nav className="topbar__nav">
          <Link to="/">Home</Link>
          <Link to="/post">Post</Link>
          {user?.isAdmin ? <Link to="/admin">Admin</Link> : null}
          {authLoading ? null : user ? (
            <>
              <span className="topbar__user">Signed in as {user.name}</span>
              <button type="button" className="btn btn--secondary" onClick={onLogout}>
                Logout
              </button>
            </>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </nav>
      </header>

      <div className="content-grid">
        <main className="main-panel">
          <PageMotion routeKey={location.pathname}>
            <Routes location={location}>
              <Route path="/" element={<HomePage user={user} />} />
              <Route
                path="/post"
                element={<PostPage user={user} onThreadPosted={onThreadPosted} />}
              />
              <Route path="/admin" element={<AdminPage user={user} />} />
              <Route path="/login" element={<LoginPage onAuthSuccess={setUser} />} />
              <Route path="/threads/:threadId" element={<ThreadPage user={user} />} />
            </Routes>
          </PageMotion>
        </main>

        <aside className="sidebar">
          <MyPostsSidebar user={user} version={myPostsVersion} />
        </aside>
      </div>
    </div>
  );
}

export default App;
