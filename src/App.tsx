import React, { useState, useEffect } from 'react';
    import { Session } from '@supabase/supabase-js';
    import { supabase } from './lib/supabaseClient';
    import Layout from './components/Layout';
    import TeamPage from './pages/TeamPage';
    import SchedulePage from './pages/SchedulePage';
    import StatsPage from './pages/StatsPage';
    import LineupPage from './pages/LineupPage';
    import GamePage from './pages/GamePage';
    import AuthPage from './pages/AuthPage';
    import { TeamProvider } from './context/TeamContext';
    import { PlayerProvider } from './context/PlayerContext'; // Import PlayerProvider
    import { DndProvider } from 'react-dnd';
    import { HTML5Backend } from 'react-dnd-html5-backend';

    function App() {
      const [session, setSession] = useState<Session | null>(null);
      const [loading, setLoading] = useState(true);
      const [currentPage, _setCurrentPage] = useState('team');
      const [previousPage, setPreviousPage] = useState<string | null>(null);
      const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

      useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          setSession(session);
          setLoading(false);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          setSession(session);
          if (!session) {
            _setCurrentPage('team');
            setPreviousPage(null);
            setSelectedGameId(null);
          }
        });
        return () => subscription.unsubscribe();
      }, []);

      const handleLogout = async () => {
        setLoading(true);
        await supabase.auth.signOut();
        setLoading(false);
      };

      const setCurrentPage = (newPage: string) => {
        if (newPage !== currentPage) {
          setPreviousPage(currentPage);
          _setCurrentPage(newPage);
        }
      };

      const selectGame = (gameId: string) => {
        setSelectedGameId(gameId);
        setCurrentPage('game');
      };

      const renderPage = () => {
        switch (currentPage) {
          case 'team': return <TeamPage />;
          case 'schedule': return <SchedulePage />;
          case 'stats': return <StatsPage />;
          case 'lineup': return <LineupPage previousPage={previousPage} />;
          case 'game': return <GamePage gameId={selectedGameId} previousPage={previousPage} />;
          default: return <TeamPage />;
        }
      };

      const showMainLayout = currentPage !== 'game';

      if (loading) {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
      }

      if (!session) {
        return <AuthPage />;
      }

      return (
        <DndProvider backend={HTML5Backend}>
          {/* TeamProvider provides teamData and currentUser needed by PlayerProvider */}
          <TeamProvider setCurrentPage={setCurrentPage} selectGame={selectGame}>
            {/* PlayerProvider manages player state and consumes TeamContext */}
            <PlayerProvider>
              {showMainLayout ? (
                <Layout
                  currentPage={currentPage}
                  setCurrentPage={setCurrentPage}
                  isLoggedIn={!!session}
                  onLogout={handleLogout}
                >
                  {renderPage()}
                </Layout>
              ) : (
                <div className="min-h-screen bg-gray-100 flex flex-col">
                   <main className="flex-grow flex flex-col">
                      {renderPage()}
                   </main>
                </div>
              )}
            </PlayerProvider>
          </TeamProvider>
        </DndProvider>
      );
    }

    export default App;
