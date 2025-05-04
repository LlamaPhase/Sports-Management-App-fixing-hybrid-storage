import React, { createContext, useState, useEffect, ReactNode, useCallback, useContext } from 'react'; // Added useContext
    import { v4 as uuidv4 } from 'uuid';
    import { supabase } from '../lib/supabaseClient';
    import { Session, User } from '@supabase/supabase-js';
    import { PlayerContext, Player } from './PlayerContext'; // Import PlayerContext and Player type

    // --- Types (Keep Game/Event/Lineup related types here) ---

    // PlayerLineupState represents a player's state *within a game* (active or finished)
    export interface PlayerLineupState {
      id: string; // Player ID
      location: 'bench' | 'field' | 'inactive';
      position?: { x: number; y: number };
      initialPosition?: { x: number; y: number };
      playtimeSeconds: number;
      playtimerStartTime: number | null; // Only used in active games (LS)
      isStarter?: boolean;
      subbedOnCount: number;
      subbedOffCount: number;
    }

    // Type for Supabase game_lineups table (matches user schema)
    export interface GameLineupData {
        id: string; // Supabase primary key for the lineup row itself
        game_id: string;
        player_id: string;
        location: 'bench' | 'field' | 'inactive';
        position: { x: number; y: number } | null;
        initial_position: { x: number; y: number } | null;
        playtime_seconds: number;
        playtimer_start_time: string | null; // timestamptz from DB
        is_starter: boolean;
        subbed_on_count: number;
        subbed_off_count: number;
        created_at: string;
        updated_at: string;
    }

    // GameEvent represents an event *within a game* (active or finished)
    export interface GameEvent {
      id: string; // Event's unique ID (can be LS or Supabase)
      type: 'goal' | 'substitution';
      team: 'home' | 'away';
      scorerPlayerId?: string | null; // Player ID
      assistPlayerId?: string | null; // Player ID
      playerInId?: string; // Player ID
      playerOutId?: string; // Player ID
      timestamp: number; // Wall clock timestamp (Date.now() for LS, mapped from event_timestamp for Supabase)
      gameSeconds: number; // Game time in seconds
    }

    // Type for Supabase game_events table (matches user schema)
    export interface GameEventData {
        id: string; // Supabase primary key for the event row
        game_id: string;
        type: 'goal' | 'substitution';
        team: 'home' | 'away';
        scorer_player_id: string | null;
        assist_player_id: string | null;
        player_in_id: string | null;
        player_out_id: string | null;
        event_timestamp: string; // timestamptz from DB
        game_seconds: number;
        created_at: string;
    }

    // Game type used in the application state (includes runtime fields)
    export interface Game {
      id: string;
      team_id: string; // Added team_id for Supabase interactions
      // user_id: string; // Removed, derived via team_id
      opponent: string;
      date: string; // Mapped from game_date
      time: string; // Mapped from game_time
      location: 'home' | 'away';
      season?: string;
      competition?: string;
      homeScore?: number;
      awayScore?: number;
      timerStatus?: 'stopped' | 'running';
      timerStartTime?: number | null; // Only used in active games (LS)
      timerElapsedSeconds?: number; // Mapped from timer_elapsed
      isExplicitlyFinished?: boolean;
      lineup?: PlayerLineupState[] | null; // Array of player states for this game
      events?: GameEvent[]; // Array of events for this game
      dataSource?: 'localStorage' | 'supabase'; // Flag to indicate source
    }

    // Type for Supabase games table (matches user schema, omits app-level derived fields)
    export interface GameData {
        id: string;
        team_id: string;
        opponent: string;
        game_date: string; // date
        game_time: string | null; // time
        location: 'home' | 'away';
        season: string | null;
        competition: string | null;
        home_score: number;
        away_score: number;
        timer_status: 'stopped' | 'running';
        timer_elapsed: number; // integer
        is_explicitly_finished: boolean;
        created_at: string;
        updated_at: string;
    }

    // Type for application state SavedLineup
    export interface SavedLineup {
      id: string; // Supabase ID
      team_id: string;
      name: string;
      players: Pick<PlayerLineupState, 'id' | 'location' | 'position'>[]; // Uses Player IDs
    }

    // Type for Supabase saved_lineups table
    export interface SavedLineupData {
        id: string;
        team_id: string;
        name: string;
        lineup_data: Pick<PlayerLineupState, 'id' | 'location' | 'position'>[]; // Stored as JSONB
        created_at: string;
    }


    export interface GameHistory {
      seasons: string[];
      competitions: string[];
    }

    export interface TeamData {
      id: string;
      user_id: string;
      name: string;
      logo_url: string | null;
      created_at: string;
    }

    // --- Context Props (Removed Player related props) ---
    interface TeamContextProps {
      teamData: TeamData | null;
      teamLoading: boolean;
      currentUser: User | null; // Expose currentUser for PlayerContext to consume
      updateTeamNameInDb: (newName: string) => Promise<void>;
      updateTeamLogoInDb: (newLogoUrl: string | null) => Promise<void>;
      // --- Game State and Functions (Hybrid) ---
      games: Game[];
      gamesLoading: boolean;
      addGame: (opponent: string, date: string, time: string, location: 'home' | 'away', season?: string, competition?: string) => void; // Saves initially to LS
      updateGame: (id: string, updates: Partial<Omit<Game, 'id' | 'team_id' | 'homeScore' | 'awayScore' | 'timerStatus' | 'timerStartTime' | 'timerElapsedSeconds' | 'isExplicitlyFinished' | 'lineup' | 'events' | 'dataSource'>>) => void; // Updates LS if active
      deleteGame: (id: string) => Promise<void>; // Deletes from LS or Supabase
      startGameTimer: (gameId: string) => void; // Operates on LS game
      stopGameTimer: (gameId: string) => void; // Operates on LS game
      markGameAsFinished: (gameId: string) => Promise<void>; // Saves LS game to Supabase, then removes from LS
      resetGameLineup: (gameId: string) => PlayerLineupState[] | null; // Operates on LS game
      movePlayerInGame: ( gameId: string, playerId: string, sourceLocation: PlayerLineupState['location'], targetLocation: PlayerLineupState['location'], newPosition?: { x: number; y: number } ) => void; // Operates on LS game
      addGameEvent: (gameId: string, team: 'home' | 'away', scorerPlayerId: string | null, assistPlayerId?: string | null) => void; // Operates on LS game
      removeLastGameEvent: (gameId: string, team: 'home' | 'away') => void; // Operates on LS game
      // --- Saved Lineups (Now uses Supabase) ---
      savedLineups: SavedLineup[];
      savedLineupsLoading: boolean;
      saveLineup: (name: string) => Promise<void>; // Now async
      // loadLineup: (name: string) => boolean; // REMOVED - Moved to PlayerContext
      deleteLineup: (name: string) => Promise<void>; // Now async
      // --- Navigation & History ---
      setCurrentPage: (page: string) => void;
      selectGame: (gameId: string) => void;
      gameHistory: GameHistory;
      getMostRecentSeason: () => string | undefined;
      getMostRecentCompetition: () => string | undefined;
      // --- Player Deletion Cleanup ---
      cleanupGamesForDeletedPlayer: (playerId: string) => void;
    }

    // --- Context ---
    export const TeamContext = createContext<TeamContextProps>({
      teamData: null, teamLoading: true, currentUser: null,
      updateTeamNameInDb: async () => { console.warn("Default updateTeamNameInDb context function called."); },
      updateTeamLogoInDb: async () => { console.warn("Default updateTeamLogoInDb context function called."); },
      games: [], gamesLoading: true,
      addGame: () => { console.warn("Default addGame context function called."); },
      updateGame: () => { console.warn("Default updateGame context function called."); },
      deleteGame: async () => { console.warn("Default deleteGame context function called."); },
      startGameTimer: () => { console.warn("Default startGameTimer context function called."); },
      stopGameTimer: () => { console.warn("Default stopGameTimer context function called."); },
      markGameAsFinished: async () => { console.warn("Default markGameAsFinished context function called."); },
      resetGameLineup: () => { console.warn("Default resetGameLineup context function called."); return null; },
      movePlayerInGame: () => { console.warn("Default movePlayerInGame context function called."); },
      addGameEvent: () => { console.warn("Default addGameEvent context function called."); },
      removeLastGameEvent: () => { console.warn("Default removeLastGameEvent context function called."); },
      savedLineups: [], savedLineupsLoading: true,
      saveLineup: async () => { console.warn("Default saveLineup context function called."); },
      // loadLineup: () => false, // REMOVED
      deleteLineup: async () => { console.warn("Default deleteLineup context function called."); },
      setCurrentPage: () => { console.warn("Default setCurrentPage context function called."); },
      selectGame: () => { console.warn("Default selectGame context function called."); },
      gameHistory: { seasons: [], competitions: [] },
      getMostRecentSeason: () => undefined, getMostRecentCompetition: () => undefined,
      cleanupGamesForDeletedPlayer: () => { console.warn("Default cleanupGamesForDeletedPlayer context function called."); },
    });

    // --- Provider ---
    interface TeamProviderProps {
      children: ReactNode;
      setCurrentPage: (page: string) => void;
      selectGame: (gameId: string) => void;
    }

    const getCurrentDate = (): string => new Date().toISOString().split('T')[0];
    const getCurrentTime = (): string => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

    // --- LocalStorage Keys ---
    const LOCAL_STORAGE_ACTIVE_GAMES_KEY = 'activeGames';
    const LOCAL_STORAGE_GAME_HISTORY_KEY = 'gameHistory';

    // --- LocalStorage Load/Save Helpers (Simplified) ---
    const loadFromLocalStorage = <T,>(key: string, defaultValue: T): T => {
      try {
        const storedValue = localStorage.getItem(key);
        return storedValue ? JSON.parse(storedValue) : defaultValue;
      } catch (error) {
        console.error(`Error reading localStorage key “${key}”:`, error);
        localStorage.removeItem(key);
        return defaultValue;
      }
    };

    const saveToLocalStorage = <T,>(key: string, value: T): void => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.error(`Error setting localStorage key “${key}”:`, error);
      }
    };

    // --- TeamProvider Component ---
    export const TeamProvider: React.FC<TeamProviderProps> = ({ children, setCurrentPage, selectGame }) => {
      // Team Data State
      const [teamData, setTeamData] = useState<TeamData | null>(null);
      const [teamLoading, setTeamLoading] = useState<boolean>(true);
      const [currentUser, setCurrentUser] = useState<User | null>(null);

      // Game State (Combined from Supabase + LS)
      const [games, setGames] = useState<Game[]>([]);
      const [gamesLoading, setGamesLoading] = useState<boolean>(true);

      // Saved Lineups State (Now from Supabase)
      const [savedLineups, setSavedLineupsState] = useState<SavedLineup[]>([]);
      const [savedLineupsLoading, setSavedLineupsLoading] = useState<boolean>(true);

      // Local Storage State (History only)
      const [gameHistory, setGameHistoryState] = useState<GameHistory>(() => loadFromLocalStorage(LOCAL_STORAGE_GAME_HISTORY_KEY, { seasons: [], competitions: [] }));

      // Consume PlayerContext to get the current player list
      // NOTE: This context MUST be rendered inside PlayerProvider in App.tsx
      const playerContext = useContext(PlayerContext);
      const players = playerContext?.players ?? []; // Get players from PlayerContext

      // --- Local Storage Effects ---
      useEffect(() => { saveToLocalStorage(LOCAL_STORAGE_GAME_HISTORY_KEY, gameHistory); }, [gameHistory]);

      // --- Fetch Initial Data (Team, Games, SavedLineups) ---
      useEffect(() => {
        const fetchTeamAndGamesData = async (user: User | null) => {
          if (!user) {
            setTeamData(null); setTeamLoading(false);
            setGames([]); setGamesLoading(false);
            setSavedLineupsState([]); setSavedLineupsLoading(false);
            localStorage.removeItem(LOCAL_STORAGE_ACTIVE_GAMES_KEY);
            return;
          }

          setTeamLoading(true);
          setGamesLoading(true);
          setSavedLineupsLoading(true);
          let fetchedTeamData: TeamData | null = null;

          try {
            // 1. Fetch Team Data
            const { data: teamResult, error: teamError } = await supabase
              .from('teams')
              .select('*')
              .eq('user_id', user.id)
              .single();

            if (teamError && teamError.code !== 'PGRST116') throw teamError;
            fetchedTeamData = teamResult as TeamData | null;
            setTeamData(fetchedTeamData);
          } catch (error: any) {
            console.error('Error fetching team data:', error.message);
            setTeamData(null);
          } finally {
            setTeamLoading(false);
          }

          // Fetch Games and Saved Lineups only if team exists
          if (fetchedTeamData) {
              // Fetch Games
              try {
                  const { data: gamesData, error: gamesError } = await supabase
                      .from('games')
                      .select(`*, game_lineups ( * ), game_events ( * )`)
                      .eq('team_id', fetchedTeamData.id)
                      .order('game_date', { ascending: false })
                      .order('game_time', { ascending: false, nullsFirst: true });
                  if (gamesError) throw gamesError;

                  const playersMap = new Map(players.map(p => [p.id, p])); // Use current players from state/PlayerContext

                  const supabaseGames = gamesData.map((dbGame: any): Game | null => {
                      const gameBase: Partial<Game> = { id: dbGame.id, team_id: dbGame.team_id, opponent: dbGame.opponent, date: dbGame.game_date, time: dbGame.game_time || '', location: dbGame.location, season: dbGame.season || '', competition: dbGame.competition || '', homeScore: dbGame.home_score, awayScore: dbGame.away_score, timerStatus: dbGame.timer_status, timerElapsedSeconds: dbGame.timer_elapsed, isExplicitlyFinished: dbGame.is_explicitly_finished, };
                      const lineup: PlayerLineupState[] = (dbGame.game_lineups || []).map((lu: GameLineupData): PlayerLineupState => ({ id: lu.player_id, location: lu.location, position: lu.position ?? undefined, initialPosition: lu.initial_position ?? undefined, playtimeSeconds: lu.playtime_seconds, playtimerStartTime: null, isStarter: lu.is_starter, subbedOnCount: lu.subbed_on_count, subbedOffCount: lu.subbed_off_count, }));
                      const events: GameEvent[] = (dbGame.game_events || []).map((ev: GameEventData): GameEvent => ({ id: ev.id, type: ev.type, team: ev.team, scorerPlayerId: ev.scorer_player_id, assistPlayerId: ev.assist_player_id, playerInId: ev.player_in_id ?? undefined, playerOutId: ev.player_out_id ?? undefined, timestamp: new Date(ev.event_timestamp).getTime(), gameSeconds: ev.game_seconds, }));
                      return validateGameData({ ...gameBase, lineup, events, dataSource: 'supabase' }, playersMap);
                  }).filter((g): g is Game => g !== null);

                  const localStorageGamesRaw = loadFromLocalStorage<any[]>(LOCAL_STORAGE_ACTIVE_GAMES_KEY, []);
                  const localStorageGames = localStorageGamesRaw.map(g => validateGameData({ ...g, dataSource: 'localStorage' }, playersMap)).filter((g): g is Game => g !== null && !g.isExplicitlyFinished);

                  const mergedGamesMap = new Map<string, Game>();
                  supabaseGames.forEach(game => mergedGamesMap.set(game.id, game));
                  localStorageGames.forEach(lsGame => { if (!mergedGamesMap.has(lsGame.id) || !mergedGamesMap.get(lsGame.id)?.isExplicitlyFinished) { mergedGamesMap.set(lsGame.id, lsGame); } });
                  const finalGames = Array.from(mergedGamesMap.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || (b.time || "23:59").localeCompare(a.time || "23:59"));
                  setGames(finalGames);

              } catch (error: any) { console.error('Error fetching games from Supabase:', error.message); }
              finally { setGamesLoading(false); }

              // Fetch Saved Lineups
              try {
                  const { data: savedLineupsData, error: savedLineupsError } = await supabase.from('saved_lineups').select('*').eq('team_id', fetchedTeamData.id);
                  if (savedLineupsError) throw savedLineupsError;
                  const fetchedSavedLineups: SavedLineup[] = (savedLineupsData as SavedLineupData[]).map(sl => ({ id: sl.id, team_id: sl.team_id, name: sl.name, players: sl.lineup_data, }));
                  setSavedLineupsState(fetchedSavedLineups);
              } catch (error: any) { console.error('Error fetching saved lineups:', error.message); setSavedLineupsState([]); }
              finally { setSavedLineupsLoading(false); }

          } else { // No team data
              setGames([]); setGamesLoading(false);
              setSavedLineupsState([]); setSavedLineupsLoading(false);
          }
        };

        // Auth listener setup
        supabase.auth.getSession().then(({ data: { session } }) => {
          const user = session?.user ?? null;
          setCurrentUser(user);
          fetchTeamAndGamesData(user); // Fetch team and games
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          const user = session?.user ?? null;
          setCurrentUser(user);
          fetchTeamAndGamesData(user); // Refetch on auth change
        });
        return () => { subscription?.unsubscribe(); };
      }, [players]); // Re-run fetch if players list changes (needed for validation)

      // --- Team Update Functions (Unchanged) ---
      const updateTeamNameInDb = useCallback(async (newName: string) => { if (!teamData || !currentUser) { console.error("Cannot update team name: No team data or user logged in."); return; } try { const { error } = await supabase.from('teams').update({ name: newName }).eq('id', teamData.id).eq('user_id', currentUser.id); if (error) throw error; setTeamData(prev => prev ? { ...prev, name: newName } : null); } catch (error: any) { console.error('Error updating team name:', error.message); } }, [teamData, currentUser]);
      const updateTeamLogoInDb = useCallback(async (newLogoUrl: string | null) => { if (!teamData || !currentUser) { console.error("Cannot update team logo: No team data or user logged in."); return; } try { const { error } = await supabase.from('teams').update({ logo_url: newLogoUrl }).eq('id', teamData.id).eq('user_id', currentUser.id); if (error) throw error; setTeamData(prev => prev ? { ...prev, logo_url: newLogoUrl } : null); } catch (error: any) { console.error('Error updating team logo:', error.message); } }, [teamData, currentUser]);

      // --- Game Data Validation (Moved inside Provider for access to players) ---
      const validateGameData = useCallback((gameData: any, playersMap: Map<string, Player>): Game | null => {
        if (typeof gameData !== 'object' || gameData === null || !gameData.id) { console.warn(`Invalid game data (no id), skipping:`, gameData); return null; }
        const playerIdsInRoster = new Set(playersMap.keys());
        const validLineup = Array.isArray(gameData.lineup) ? gameData.lineup.map((p: any): PlayerLineupState | null => { if (typeof p !== 'object' || p === null || !p.id || !playerIdsInRoster.has(p.id)) { console.warn(`Invalid player lineup data (missing/invalid id: ${p?.id}) in game ${gameData.id}, skipping player:`, p); return null; } const location = ['field', 'bench', 'inactive'].includes(p.location) ? p.location : 'bench'; return { id: p.id, location: location, position: p.position, initialPosition: p.initialPosition, playtimeSeconds: typeof p.playtimeSeconds === 'number' ? p.playtimeSeconds : 0, playtimerStartTime: typeof p.playtimerStartTime === 'number' ? p.playtimerStartTime : null, isStarter: typeof p.isStarter === 'boolean' ? p.isStarter : false, subbedOnCount: typeof p.subbedOnCount === 'number' ? p.subbedOnCount : 0, subbedOffCount: typeof p.subbedOffCount === 'number' ? p.subbedOffCount : 0, }; }).filter((p): p is PlayerLineupState => p !== null) : null;
        const validEvents = Array.isArray(gameData.events) ? gameData.events.map((ev: any): GameEvent | null => { if (typeof ev !== 'object' || ev === null || !ev.id || !ev.type || !ev.team || typeof ev.timestamp !== 'number' || typeof ev.gameSeconds !== 'number') { console.warn(`Invalid game event data in game ${gameData.id}, skipping event:`, ev); return null; } const baseEvent: Omit<GameEvent, 'scorerPlayerId' | 'assistPlayerId' | 'playerInId' | 'playerOutId'> = { id: ev.id, type: ['goal', 'substitution'].includes(ev.type) ? ev.type : 'goal', team: ['home', 'away'].includes(ev.team) ? ev.team : 'home', timestamp: ev.timestamp, gameSeconds: ev.gameSeconds, }; const scorerPlayerId = typeof ev.scorerPlayerId === 'string' && playerIdsInRoster.has(ev.scorerPlayerId) ? ev.scorerPlayerId : null; const assistPlayerId = typeof ev.assistPlayerId === 'string' && playerIdsInRoster.has(ev.assistPlayerId) ? ev.assistPlayerId : null; const playerInId = typeof ev.playerInId === 'string' && playerIdsInRoster.has(ev.playerInId) ? ev.playerInId : undefined; const playerOutId = typeof ev.playerOutId === 'string' && playerIdsInRoster.has(ev.playerOutId) ? ev.playerOutId : undefined; if (ev.type === 'goal') { return { ...baseEvent, type: 'goal', scorerPlayerId, assistPlayerId }; } else if (ev.type === 'substitution') { return { ...baseEvent, type: 'substitution', playerInId, playerOutId }; } else { console.warn(`Unknown event type "${ev.type}" in game ${gameData.id}, skipping event:`, ev); return null; } }).filter((ev): ev is GameEvent => ev !== null) : [];
        return { id: gameData.id, team_id: typeof gameData.team_id === 'string' ? gameData.team_id : '', opponent: typeof gameData.opponent === 'string' ? gameData.opponent : 'Unknown', date: typeof gameData.date === 'string' ? gameData.date : getCurrentDate(), time: typeof gameData.time === 'string' ? gameData.time : '', location: ['home', 'away'].includes(gameData.location) ? gameData.location : 'home', season: typeof gameData.season === 'string' ? gameData.season : '', competition: typeof gameData.competition === 'string' ? gameData.competition : '', homeScore: typeof gameData.homeScore === 'number' ? gameData.homeScore : 0, awayScore: typeof gameData.awayScore === 'number' ? gameData.awayScore : 0, timerStatus: ['stopped', 'running'].includes(gameData.timerStatus) ? gameData.timerStatus : 'stopped', timerStartTime: typeof gameData.timerStartTime === 'number' ? gameData.timerStartTime : null, timerElapsedSeconds: typeof gameData.timerElapsedSeconds === 'number' ? gameData.timerElapsedSeconds : 0, isExplicitlyFinished: typeof gameData.isExplicitlyFinished === 'boolean' ? gameData.isExplicitlyFinished : false, lineup: validLineup, events: validEvents, dataSource: gameData.dataSource };
      }, []); // No dependencies needed here as it's a pure function

      // --- Function to create default lineup (uses players from PlayerContext) ---
      const createDefaultLineup = useCallback((currentPlayers: Player[]): PlayerLineupState[] => {
        return currentPlayers.map(p => ({ id: p.id, location: 'bench', position: undefined, initialPosition: undefined, playtimeSeconds: 0, playtimerStartTime: null, isStarter: false, subbedOnCount: 0, subbedOffCount: 0, }));
      }, []); // No dependency needed as it uses the argument

      // --- Saved Lineups (Now Supabase) ---
      const saveLineup = useCallback(async (name: string) => {
          if (!name.trim()) { alert("Please enter a name."); return; }
          if (!teamData) { alert("Cannot save lineup: Team data missing."); return; }
          setSavedLineupsLoading(true);
          try {
              const lineupToSave: Omit<SavedLineupData, 'id' | 'created_at'> = {
                  team_id: teamData.id,
                  name: name.trim(),
                  // Use players from PlayerContext state
                  lineup_data: players.map(({ id, location, position }) => ({ id, location, position })),
              };
              const { data, error } = await supabase.from('saved_lineups').upsert(lineupToSave, { onConflict: 'team_id, name' }).select().single();
              if (error) throw error;
              const newSavedLineup: SavedLineup = { id: data.id, team_id: data.team_id, name: data.name, players: data.lineup_data, };
              setSavedLineupsState((prev) => { const filtered = prev.filter(l => l.name !== newSavedLineup.name); return [...filtered, newSavedLineup]; });
          } catch (error: any) { console.error('Error saving lineup to Supabase:', error.message); alert(`Failed to save lineup: ${error.message}`); }
          finally { setSavedLineupsLoading(false); }
      }, [players, teamData]); // Depend on players from PlayerContext

      const deleteLineup = useCallback(async (name: string) => {
          const lineupToDelete = savedLineups.find(l => l.name === name);
          if (!lineupToDelete) { alert("Lineup not found."); return; }
          setSavedLineupsLoading(true);
          try {
              const { error } = await supabase.from('saved_lineups').delete().eq('id', lineupToDelete.id);
              if (error) throw error;
              setSavedLineupsState((prev) => prev.filter(l => l.id !== lineupToDelete.id));
          } catch (error: any) { console.error('Error deleting lineup from Supabase:', error.message); alert(`Failed to delete lineup: ${error.message}`); }
          finally { setSavedLineupsLoading(false); }
      }, [savedLineups]);

      // --- Game History (Unchanged - still uses localStorage) ---
      const updateHistory = (season?: string, competition?: string) => { setGameHistoryState(prev => { const newSeasons = [...prev.seasons]; const newCompetitions = [...prev.competitions]; if (season && season.trim()) { const trimmedSeason = season.trim(); const seasonIndex = newSeasons.indexOf(trimmedSeason); if (seasonIndex > -1) newSeasons.splice(seasonIndex, 1); newSeasons.unshift(trimmedSeason); } if (competition && competition.trim()) { const trimmedCompetition = competition.trim(); const compIndex = newCompetitions.indexOf(trimmedCompetition); if (compIndex > -1) newCompetitions.splice(compIndex, 1); newCompetitions.unshift(trimmedCompetition); } return { seasons: newSeasons, competitions: newCompetitions }; }); };
      const getMostRecentSeason = (): string | undefined => gameHistory.seasons[0];
      const getMostRecentCompetition = (): string | undefined => gameHistory.competitions[0];

      // --- Helper to Update Local Storage and Merged State ---
      const updateLocalStorageAndState = (updatedGame: Game) => {
          const currentLSGames = loadFromLocalStorage<Game[]>(LOCAL_STORAGE_ACTIVE_GAMES_KEY, []);
          const gameLSIndex = currentLSGames.findIndex(g => g.id === updatedGame.id);
          let newLSGames: Game[];
          if (gameLSIndex > -1) { newLSGames = [...currentLSGames]; newLSGames[gameLSIndex] = updatedGame; }
          else { newLSGames = [...currentLSGames, updatedGame]; }
          saveToLocalStorage(LOCAL_STORAGE_ACTIVE_GAMES_KEY, newLSGames);
          setGames(prevGames => {
              const gameIndex = prevGames.findIndex(g => g.id === updatedGame.id);
              if (gameIndex > -1) { const newState = [...prevGames]; newState[gameIndex] = updatedGame; return newState.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || (b.time || "23:59").localeCompare(a.time || "23:59")); }
              return [...prevGames, updatedGame].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || (b.time || "23:59").localeCompare(a.time || "23:59"));
          });
      };

      // --- Game Functions (Modified for Hybrid Storage) ---
      const addGame = (opponent: string, date: string, time: string, location: 'home' | 'away', season?: string, competition?: string) => {
          if (!teamData || !currentUser) { alert("Cannot add game. Please ensure you are logged in."); return; }
          const currentPlayersFromState = players; // Use players from PlayerContext
          const newGame: Game = {
              id: uuidv4(), team_id: teamData.id, opponent, date, time, location,
              season: season?.trim() || '', competition: competition?.trim() || '',
              homeScore: 0, awayScore: 0, timerStatus: 'stopped', timerStartTime: null, timerElapsedSeconds: 0,
              isExplicitlyFinished: false, lineup: createDefaultLineup(currentPlayersFromState), events: [],
              dataSource: 'localStorage'
          };
          const currentLSGames = loadFromLocalStorage<Game[]>(LOCAL_STORAGE_ACTIVE_GAMES_KEY, []);
          saveToLocalStorage(LOCAL_STORAGE_ACTIVE_GAMES_KEY, [...currentLSGames, newGame]);
          setGames(prev => [...prev, newGame].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || (b.time || "23:59").localeCompare(a.time || "23:59")));
          updateHistory(season, competition);
      };
      const updateGame = (id: string, updates: Partial<Omit<Game, 'id' | 'team_id' | 'homeScore' | 'awayScore' | 'timerStatus' | 'timerStartTime' | 'timerElapsedSeconds' | 'isExplicitlyFinished' | 'lineup' | 'events' | 'dataSource'>>) => {
          const gameIndex = games.findIndex(g => g.id === id);
          if (gameIndex === -1) return;
          const gameToUpdate = games[gameIndex];
          if (!gameToUpdate.isExplicitlyFinished && gameToUpdate.dataSource === 'localStorage') {
              let seasonToUpdateHistory: string | undefined = undefined; let competitionToUpdateHistory: string | undefined = undefined;
              const finalUpdates = { ...updates };
              if (typeof updates.season === 'string') { finalUpdates.season = updates.season.trim(); seasonToUpdateHistory = finalUpdates.season; }
              if (typeof updates.competition === 'string') { finalUpdates.competition = updates.competition.trim(); competitionToUpdateHistory = finalUpdates.competition; }
              const updatedGame = { ...gameToUpdate, ...finalUpdates };
              updateLocalStorageAndState(updatedGame);
              if (seasonToUpdateHistory !== undefined || competitionToUpdateHistory !== undefined) { updateHistory(seasonToUpdateHistory ?? gameToUpdate.season, competitionToUpdateHistory ?? gameToUpdate.competition); }
          } else if (gameToUpdate.isExplicitlyFinished && gameToUpdate.dataSource === 'supabase') { console.warn("Attempted to update a finished game stored in Supabase. Feature not implemented."); alert("Cannot update finished games directly yet."); }
          else { console.warn(`Attempted to update game ${id} with unexpected state: finished=${gameToUpdate.isExplicitlyFinished}, source=${gameToUpdate.dataSource}`); }
      };
      const deleteGame = async (id: string) => {
          const gameToDelete = games.find(g => g.id === id);
          if (!gameToDelete) return;
          if (gameToDelete.dataSource === 'localStorage' && !gameToDelete.isExplicitlyFinished) {
              const currentLSGames = loadFromLocalStorage<Game[]>(LOCAL_STORAGE_ACTIVE_GAMES_KEY, []);
              const newLSGames = currentLSGames.filter(g => g.id !== id);
              saveToLocalStorage(LOCAL_STORAGE_ACTIVE_GAMES_KEY, newLSGames);
              setGames(prev => prev.filter(g => g.id !== id));
          } else if (gameToDelete.dataSource === 'supabase' && gameToDelete.isExplicitlyFinished) {
              setGamesLoading(true);
              try { const { error } = await supabase.from('games').delete().eq('id', id); if (error) throw error; setGames(prev => prev.filter(g => g.id !== id)); }
              catch (error: any) { console.error(`Error deleting game ${id} from Supabase:`, error.message); alert(`Failed to delete finished game: ${error.message}`); }
              finally { setGamesLoading(false); }
          } else { console.warn(`Attempted to delete game ${id} with unexpected state: finished=${gameToDelete.isExplicitlyFinished}, source=${gameToDelete.dataSource}`); setGames(prev => prev.filter(g => g.id !== id)); const currentLSGames = loadFromLocalStorage<Game[]>(LOCAL_STORAGE_ACTIVE_GAMES_KEY, []); const newLSGames = currentLSGames.filter(g => g.id !== id); saveToLocalStorage(LOCAL_STORAGE_ACTIVE_GAMES_KEY, newLSGames); }
      };

      // --- Timer, Event, Lineup functions: Operate on Local Storage Version (Unchanged logic) ---
      const startGameTimer = (gameId: string) => { const gameIndex = games.findIndex(g => g.id === gameId && g.dataSource === 'localStorage' && !g.isExplicitlyFinished); if (gameIndex === -1) return; const now = Date.now(); const currentDate = getCurrentDate(); const currentTime = getCurrentTime(); const gameToUpdate = games[gameIndex]; const updates: Partial<Game> = {}; if (gameToUpdate.date !== currentDate) updates.date = currentDate; if (gameToUpdate.time !== currentTime) updates.time = currentTime; const isStartingFresh = (gameToUpdate.timerElapsedSeconds ?? 0) === 0 && !gameToUpdate.timerStartTime; const newLineup = gameToUpdate.lineup?.map(p => { const isFieldPlayer = p.location === 'field'; const initialPosition = isStartingFresh && isFieldPlayer ? p.position : p.initialPosition; const isStarter = isStartingFresh ? (p.location === 'field' || p.location === 'bench') : (p.isStarter ?? false); return { ...p, playtimerStartTime: isFieldPlayer ? now : p.playtimerStartTime, isStarter: isStarter, initialPosition: initialPosition, }; }) ?? null; const updatedGame = { ...gameToUpdate, ...updates, timerStatus: 'running', timerStartTime: now, isExplicitlyFinished: false, lineup: newLineup } as Game; updateLocalStorageAndState(updatedGame); };
      const stopGameTimer = (gameId: string) => { const gameIndex = games.findIndex(g => g.id === gameId && g.dataSource === 'localStorage' && g.timerStatus === 'running'); if (gameIndex === -1) return; const now = Date.now(); const gameToUpdate = games[gameIndex]; if (!gameToUpdate.timerStartTime) return; const elapsed = (now - gameToUpdate.timerStartTime) / 1000; const newElapsedSeconds = Math.round((gameToUpdate.timerElapsedSeconds || 0) + elapsed); const newLineup = gameToUpdate.lineup?.map(p => { if ((p.location === 'field' || p.location === 'inactive') && p.playtimerStartTime) { const playerElapsed = (now - p.playtimerStartTime) / 1000; const currentPlaytime = typeof p.playtimeSeconds === 'number' ? p.playtimeSeconds : 0; const newPlaytime = Math.round(currentPlaytime + playerElapsed); return { ...p, playtimeSeconds: newPlaytime, playtimerStartTime: null }; } return p; }) ?? null; const updatedGame = { ...gameToUpdate, timerStatus: 'stopped', timerStartTime: null, timerElapsedSeconds: newElapsedSeconds, lineup: newLineup } as Game; updateLocalStorageAndState(updatedGame); };
      const addGameEvent = (gameId: string, team: 'home' | 'away', scorerPlayerId: string | null, assistPlayerId?: string | null) => { const gameIndex = games.findIndex(g => g.id === gameId && g.dataSource === 'localStorage' && !g.isExplicitlyFinished); if (gameIndex === -1) return; const gameToUpdate = games[gameIndex]; let currentSeconds = gameToUpdate.timerElapsedSeconds ?? 0; if (gameToUpdate.timerStatus === 'running' && gameToUpdate.timerStartTime) { currentSeconds += (Date.now() - gameToUpdate.timerStartTime) / 1000; } const newEvent: GameEvent = { id: uuidv4(), type: 'goal', team: team, scorerPlayerId: scorerPlayerId, assistPlayerId: assistPlayerId, timestamp: Date.now(), gameSeconds: Math.round(currentSeconds), }; const updatedEvents = [...(gameToUpdate.events || []), newEvent]; const newHomeScore = team === 'home' ? (gameToUpdate.homeScore ?? 0) + 1 : (gameToUpdate.homeScore ?? 0); const newAwayScore = team === 'away' ? (gameToUpdate.awayScore ?? 0) + 1 : (gameToUpdate.awayScore ?? 0); const updatedGame = { ...gameToUpdate, events: updatedEvents, homeScore: newHomeScore, awayScore: newAwayScore } as Game; updateLocalStorageAndState(updatedGame); };
      const removeLastGameEvent = (gameId: string, team: 'home' | 'away') => { const gameIndex = games.findIndex(g => g.id === gameId && g.dataSource === 'localStorage' && !g.isExplicitlyFinished); if (gameIndex === -1) return; const gameToUpdate = games[gameIndex]; const events = gameToUpdate.events || []; let lastGoalEventIndex = -1; for (let i = events.length - 1; i >= 0; i--) { if (events[i].type === 'goal' && events[i].team === team) { lastGoalEventIndex = i; break; } } if (lastGoalEventIndex !== -1) { const updatedEvents = [...events]; updatedEvents.splice(lastGoalEventIndex, 1); const newHomeScore = team === 'home' ? Math.max(0, (gameToUpdate.homeScore ?? 0) - 1) : (gameToUpdate.homeScore ?? 0); const newAwayScore = team === 'away' ? Math.max(0, (gameToUpdate.awayScore ?? 0) - 1) : (gameToUpdate.awayScore ?? 0); const updatedGame = { ...gameToUpdate, events: updatedEvents, homeScore: newHomeScore, awayScore: newAwayScore } as Game; updateLocalStorageAndState(updatedGame); } };
      const movePlayerInGame = ( gameId: string, playerId: string, sourceLocation: PlayerLineupState['location'], targetLocation: PlayerLineupState['location'], newPosition?: { x: number; y: number } ) => { const gameIndex = games.findIndex(g => g.id === gameId && g.dataSource === 'localStorage' && !g.isExplicitlyFinished); if (gameIndex === -1) return; const now = Date.now(); const gameToUpdate = games[gameIndex]; if (!gameToUpdate.lineup) return; const isGameActive = gameToUpdate.timerStatus === 'running' || (gameToUpdate.timerStatus === 'stopped' && (gameToUpdate.timerElapsedSeconds ?? 0) > 0); let newLineup = [...gameToUpdate.lineup]; const playerIndex = newLineup.findIndex(p => p.id === playerId); if (playerIndex === -1) return; const playerState = { ...newLineup[playerIndex] }; let updatedPlaytime = playerState.playtimeSeconds; let updatedStartTime = playerState.playtimerStartTime; if ((sourceLocation === 'field' || sourceLocation === 'inactive') && playerState.playtimerStartTime) { const elapsed = (now - playerState.playtimerStartTime) / 1000; updatedPlaytime = Math.round(playerState.playtimeSeconds + elapsed); updatedStartTime = null; } if (targetLocation === 'field' && gameToUpdate.timerStatus === 'running' && updatedStartTime === null) { updatedStartTime = now; } else if (targetLocation !== 'field') { updatedStartTime = null; } let updatedSubbedOnCount = playerState.subbedOnCount; let updatedSubbedOffCount = playerState.subbedOffCount; let substitutionEvent: GameEvent | null = null; if (isGameActive) { let currentSeconds = gameToUpdate.timerElapsedSeconds ?? 0; if (gameToUpdate.timerStatus === 'running' && gameToUpdate.timerStartTime) { currentSeconds += (Date.now() - gameToUpdate.timerStartTime) / 1000; } const eventSeconds = Math.round(currentSeconds); const eventTeam = (gameToUpdate.location === 'home') ? 'home' : 'away'; if (sourceLocation === 'bench' && targetLocation === 'field') { updatedSubbedOnCount++; substitutionEvent = { id: uuidv4(), type: 'substitution', team: eventTeam, playerInId: playerId, playerOutId: undefined, timestamp: now, gameSeconds: eventSeconds, }; } else if (sourceLocation === 'field' && targetLocation === 'bench') { updatedSubbedOffCount++; substitutionEvent = { id: uuidv4(), type: 'substitution', team: eventTeam, playerInId: undefined, playerOutId: playerId, timestamp: now, gameSeconds: eventSeconds, }; } } playerState.location = targetLocation; playerState.position = targetLocation === 'field' ? newPosition : undefined; playerState.playtimeSeconds = updatedPlaytime; playerState.playtimerStartTime = updatedStartTime; playerState.subbedOnCount = updatedSubbedOnCount; playerState.subbedOffCount = updatedSubbedOffCount; newLineup[playerIndex] = playerState; const updatedEvents = substitutionEvent ? [...(gameToUpdate.events || []), substitutionEvent] : gameToUpdate.events; const updatedGame = { ...gameToUpdate, lineup: newLineup, events: updatedEvents } as Game; updateLocalStorageAndState(updatedGame); };
      const resetGameLineup = (gameId: string): PlayerLineupState[] | null => { const gameIndex = games.findIndex(g => g.id === gameId && g.dataSource === 'localStorage' && !g.isExplicitlyFinished); if (gameIndex === -1) return null; const gameToUpdate = games[gameIndex]; const currentPlayersFromState = players; const defaultLineup = createDefaultLineup(currentPlayersFromState); const updatedGame = { ...gameToUpdate, lineup: defaultLineup, timerElapsedSeconds: 0, timerStartTime: null, timerStatus: 'stopped', isExplicitlyFinished: false, homeScore: 0, awayScore: 0, events: [] } as Game; updateLocalStorageAndState(updatedGame); return defaultLineup; };

      // --- Function to Save Finished Game to Supabase (Adjusted for new schema) ---
      const saveFinishedGameToSupabase = async (game: Game) => {
          if (!game.isExplicitlyFinished) { console.error("Attempted to save non-finished game:", game.id); return; }
          if (!currentUser || !teamData) { alert("Cannot save game. User or Team data missing."); return; }
          setGamesLoading(true);
          try {
              const gameDataToSave: Omit<GameData, 'id' | 'team_id' | 'created_at' | 'updated_at'> & { id: string, team_id: string } = { id: game.id, team_id: game.team_id, opponent: game.opponent, game_date: game.date, game_time: game.time || null, location: game.location, season: game.season || null, competition: game.competition || null, home_score: game.homeScore ?? 0, away_score: game.awayScore ?? 0, timer_status: 'stopped', timer_elapsed: game.timerElapsedSeconds ?? 0, is_explicitly_finished: true, };
              const { error: gameUpsertError } = await supabase.from('games').upsert(gameDataToSave, { onConflict: 'id' });
              if (gameUpsertError) throw gameUpsertError;
              await supabase.from('game_lineups').delete().eq('game_id', game.id);
              await supabase.from('game_events').delete().eq('game_id', game.id);
              if (game.lineup && game.lineup.length > 0) { const lineupDataToSave: Omit<GameLineupData, 'id' | 'game_id' | 'created_at' | 'updated_at'>[] = game.lineup.map(p => ({ player_id: p.id, location: p.location, position: p.position ?? null, initial_position: p.initialPosition ?? null, playtime_seconds: p.playtimeSeconds, playtimer_start_time: null, is_starter: p.isStarter ?? false, subbed_on_count: p.subbedOnCount, subbed_off_count: p.subbedOffCount, })); const lineupPayload = lineupDataToSave.map(lu => ({ ...lu, game_id: game.id })); const { error: lineupInsertError } = await supabase.from('game_lineups').insert(lineupPayload); if (lineupInsertError) throw lineupInsertError; }
              if (game.events && game.events.length > 0) { const eventDataToSave: Omit<GameEventData, 'id' | 'game_id' | 'created_at'>[] = game.events.map(e => ({ type: e.type, team: e.team, scorer_player_id: e.scorerPlayerId ?? null, assist_player_id: e.assistPlayerId ?? null, player_in_id: e.playerInId ?? null, player_out_id: e.playerOutId ?? null, event_timestamp: new Date(e.timestamp).toISOString(), game_seconds: e.gameSeconds, })); const eventPayload = eventDataToSave.map(ev => ({ ...ev, game_id: game.id })); const { error: eventInsertError } = await supabase.from('game_events').insert(eventPayload); if (eventInsertError) throw eventInsertError; }
              const currentLSGames = loadFromLocalStorage<Game[]>(LOCAL_STORAGE_ACTIVE_GAMES_KEY, []);
              const newLSGames = currentLSGames.filter(g => g.id !== game.id);
              saveToLocalStorage(LOCAL_STORAGE_ACTIVE_GAMES_KEY, newLSGames);
              setGames(prevGames => { const gameIndex = prevGames.findIndex(g => g.id === game.id); if (gameIndex > -1) { const newState = [...prevGames]; newState[gameIndex] = { ...game, isExplicitlyFinished: true, dataSource: 'supabase', timerStartTime: null, timerStatus: 'stopped' }; return newState.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || (b.time || "23:59").localeCompare(a.time || "23:59")); } return prevGames; });
          } catch (error: any) { console.error(`Error saving finished game ${game.id} to Supabase:`, error.message); alert(`Failed to save finished game data: ${error.message}`); setGames(prevGames => prevGames.map(g => g.id === game.id ? { ...g, isExplicitlyFinished: false } : g)); }
          finally { setGamesLoading(false); }
      };

      // --- Mark Game as Finished (Orchestrator - Unchanged logic) ---
      const markGameAsFinished = async (gameId: string) => {
          const gameIndex = games.findIndex(g => g.id === gameId && g.dataSource === 'localStorage' && !g.isExplicitlyFinished);
          if (gameIndex === -1) { const existingGame = games.find(g => g.id === gameId); if (existingGame && existingGame.isExplicitlyFinished) { console.log(`Game ${gameId} is already finished.`); return; } console.warn(`Game ${gameId} not found in active LS games.`); return; }
          let gameToFinish = { ...games[gameIndex] };
          const now = Date.now(); let finalElapsedSeconds = gameToFinish.timerElapsedSeconds ?? 0; let finalLineup = gameToFinish.lineup;
          if (gameToFinish.timerStatus === 'running' && gameToFinish.timerStartTime) { const elapsed = (now - gameToFinish.timerStartTime) / 1000; finalElapsedSeconds = Math.round((gameToFinish.timerElapsedSeconds || 0) + elapsed); finalLineup = gameToFinish.lineup?.map(p => { if ((p.location === 'field' || p.location === 'inactive') && p.playtimerStartTime) { const playerElapsed = (now - p.playtimerStartTime) / 1000; const currentPlaytime = typeof p.playtimeSeconds === 'number' ? p.playtimeSeconds : 0; const newPlaytime = Math.round(currentPlaytime + playerElapsed); return { ...p, playtimeSeconds: newPlaytime, playtimerStartTime: null }; } return p; }) ?? null; }
          finalLineup = finalLineup?.map(p => ({ ...p, playtimerStartTime: null })) ?? null;
          gameToFinish = { ...gameToFinish, timerStatus: 'stopped', timerStartTime: null, timerElapsedSeconds: finalElapsedSeconds, isExplicitlyFinished: true, lineup: finalLineup };
          await saveFinishedGameToSupabase(gameToFinish);
      };

       // --- Player Deletion Cleanup ---
       // This function is called by PlayerContext after a player is successfully deleted from DB
       const cleanupGamesForDeletedPlayer = useCallback((playerId: string) => {
           // Clean up active games in Local Storage
           const activeGames = loadFromLocalStorage<Game[]>(LOCAL_STORAGE_ACTIVE_GAMES_KEY, []);
           const updatedActiveGames = activeGames.map(game => {
               const newLineup = game.lineup?.filter(p => p.id !== playerId) ?? null;
               const newEvents = game.events?.map(e => { let updatedEvent = {...e}; if (e.scorerPlayerId === playerId) updatedEvent.scorerPlayerId = null; if (e.assistPlayerId === playerId) updatedEvent.assistPlayerId = null; if (e.playerInId === playerId) updatedEvent.playerInId = undefined; if (e.playerOutId === playerId) updatedEvent.playerOutId = undefined; return updatedEvent; }).filter(e => !(e.type === 'substitution' && !e.playerInId && !e.playerOutId)) ?? [];
               return {...game, lineup: newLineup, events: newEvents};
           });
           saveToLocalStorage(LOCAL_STORAGE_ACTIVE_GAMES_KEY, updatedActiveGames);

           // Update the main 'games' state for both LS and Supabase sourced games
           setGames(prev => prev.map(game => {
               // If it's an active LS game, use the already cleaned version
               if (game.dataSource === 'localStorage') {
                   const updatedGame = updatedActiveGames.find(ag => ag.id === game.id);
                   return updatedGame || game; // Use updated LS game or keep original
               }
               // If it's a Supabase game, clean its local representation
               const newLineup = game.lineup?.filter(p => p.id !== playerId) ?? null;
               const newEvents = game.events?.map(e => { let updatedEvent = {...e}; if (e.scorerPlayerId === playerId) updatedEvent.scorerPlayerId = null; if (e.assistPlayerId === playerId) updatedEvent.assistPlayerId = null; if (e.playerInId === playerId) updatedEvent.playerInId = undefined; if (e.playerOutId === playerId) updatedEvent.playerOutId = undefined; return updatedEvent; }).filter(e => !(e.type === 'substitution' && !e.playerInId && !e.playerOutId)) ?? [];
               return {...game, lineup: newLineup, events: newEvents};
           }));
           console.log(`Cleaned up game data references for deleted player ${playerId}`);
       }, []); // Dependency on setGames


      // --- Context Value ---
      const contextValue: TeamContextProps = {
        teamData, teamLoading, currentUser, // Expose currentUser
        updateTeamNameInDb, updateTeamLogoInDb,
        games, gamesLoading, addGame, updateGame, deleteGame,
        startGameTimer, stopGameTimer, markGameAsFinished,
        resetGameLineup, movePlayerInGame, addGameEvent, removeLastGameEvent,
        savedLineups, savedLineupsLoading, saveLineup, deleteLineup, // Keep saved lineup functions here for now
        setCurrentPage, selectGame,
        gameHistory, getMostRecentSeason, getMostRecentCompetition,
        cleanupGamesForDeletedPlayer, // Expose cleanup function
      };

      return <TeamContext.Provider value={contextValue}>{children}</TeamContext.Provider>;
    };
