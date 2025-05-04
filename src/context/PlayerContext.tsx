import React, { createContext, useState, useEffect, ReactNode, useCallback, useContext } from 'react';
    import { supabase } from '../lib/supabaseClient';
    import { User } from '@supabase/supabase-js';
    import { TeamContext, SavedLineup, PlayerLineupState } from './TeamContext'; // Import necessary types from TeamContext

    // --- Player Types ---
    export interface PlayerData {
        id: string;
        team_id: string;
        first_name: string;
        last_name: string;
        number: string | null;
        created_at: string;
    }

    export interface Player extends PlayerData {
      location: 'bench' | 'field'; // For lineup planning page
      position?: { x: number; y: number }; // For lineup planning page
    }

    // --- Context Props ---
    interface PlayerContextProps {
      players: Player[];
      playersLoading: boolean;
      addPlayer: (firstName: string, lastName: string, number: string) => Promise<void>;
      updatePlayer: (id: string, updates: Partial<Pick<PlayerData, 'first_name' | 'last_name' | 'number'>>) => Promise<void>;
      deletePlayer: (id: string) => Promise<void>; // Note: Game cleanup logic remains in TeamContext for now
      // Lineup Planning functions (operate on local player state)
      movePlayer: (playerId: string, targetLocation: 'bench' | 'field', position?: { x: number; y: number }) => void;
      swapPlayers: (player1Id: string, player2Id: string) => void;
      resetLineup: () => void;
      loadLineup: (lineupToLoad: SavedLineup) => boolean; // Takes the actual lineup object now
    }

    // --- Context ---
    export const PlayerContext = createContext<PlayerContextProps>({
      players: [],
      playersLoading: true,
      addPlayer: async () => { console.warn("Default addPlayer context function called."); },
      updatePlayer: async () => { console.warn("Default updatePlayer context function called."); },
      deletePlayer: async () => { console.warn("Default deletePlayer context function called."); },
      movePlayer: () => { console.warn("Default movePlayer context function called."); },
      swapPlayers: () => { console.warn("Default swapPlayers context function called."); },
      resetLineup: () => { console.warn("Default resetLineup context function called."); },
      loadLineup: () => { console.warn("Default loadLineup context function called."); return false; },
    });

    // --- Provider ---
    interface PlayerProviderProps {
      children: ReactNode;
    }

    export const PlayerProvider: React.FC<PlayerProviderProps> = ({ children }) => {
      const [players, setPlayers] = useState<Player[]>([]);
      const [playersLoading, setPlayersLoading] = useState<boolean>(true);
      // Consume TeamContext to get teamData and currentUser for fetching/CRUD operations
      const { teamData, currentUser } = useContext(TeamContext);

      // --- Fetch Players ---
      useEffect(() => {
        const fetchPlayers = async () => {
          if (!teamData || !currentUser) {
            setPlayers([]); // No team/user, no players
            setPlayersLoading(false);
            return;
          }

          setPlayersLoading(true);
          try {
            const { data: playersResult, error: playersError } = await supabase
              .from('players')
              .select('*')
              .eq('team_id', teamData.id)
              .order('first_name', { ascending: true });

            if (playersError) throw playersError;

            const fetchedPlayers: Player[] = (playersResult as PlayerData[]).map(p => ({
              ...p,
              location: 'bench', // Default local state
              position: undefined, // Default local state
            }));
            setPlayers(fetchedPlayers);

          } catch (error: any) {
            console.error('Error fetching players:', error.message);
            setPlayers([]); // Set empty array on error
          } finally {
            setPlayersLoading(false);
          }
        };

        fetchPlayers();
        // Re-fetch players if teamData or currentUser changes
      }, [teamData, currentUser]);

      // --- Player CRUD Functions ---
      const addPlayer = useCallback(async (firstName: string, lastName: string, number: string) => {
        if (!currentUser || !teamData) {
          console.error("Cannot add player: User not logged in or team data missing.");
          alert("Could not add player.");
          throw new Error("User not logged in or team data missing."); // Throw error to indicate failure
        }
        setPlayersLoading(true);
        try {
          const { data, error } = await supabase.from('players').insert({ team_id: teamData.id, first_name: firstName, last_name: lastName, number: number || null, }).select().single();
          if (error) throw error;
          const newPlayer: Player = { ...(data as PlayerData), location: 'bench', position: undefined, };
          setPlayers(prev => [...prev, newPlayer].sort((a, b) => a.first_name.localeCompare(b.first_name)));
        } catch (error: any) {
          console.error('Error adding player:', error.message);
          alert(`Error adding player: ${error.message}`);
          throw error; // Re-throw error
        } finally {
          setPlayersLoading(false);
        }
      }, [currentUser, teamData]);

      const updatePlayer = useCallback(async (id: string, updates: Partial<Pick<PlayerData, 'first_name' | 'last_name' | 'number'>>) => {
        if (!teamData) {
          console.error("Cannot update player: Team data missing.");
          throw new Error("Team data missing.");
        }
        const dbUpdates = { ...updates, number: updates.number === '' ? null : updates.number };
        setPlayersLoading(true);
        try {
          const { error } = await supabase.from('players').update(dbUpdates).eq('id', id).eq('team_id', teamData.id);
          if (error) throw error;
          setPlayers(prev => prev.map(p => p.id === id ? { ...p, ...dbUpdates } : p).sort((a, b) => a.first_name.localeCompare(b.first_name)));
        } catch (error: any) {
          console.error('Error updating player:', error.message);
          alert(`Error updating player: ${error.message}`);
          throw error;
        } finally {
          setPlayersLoading(false);
        }
      }, [teamData]);

      // Note: This deletePlayer only handles the DB deletion and local state update.
      // The logic for cleaning up player references in active games remains in TeamContext.
      const deletePlayer = useCallback(async (id: string) => {
        if (!teamData) {
          console.error("Cannot delete player: Team data missing.");
           throw new Error("Team data missing.");
        }
        // Optimistic update locally first? Or wait for DB? Let's wait for DB confirmation.
        setPlayersLoading(true);
        try {
          const { error } = await supabase.from('players').delete().eq('id', id).eq('team_id', teamData.id);
          if (error) throw error;
          // Update local state only after successful DB deletion
          setPlayers(prev => prev.filter(p => p.id !== id));
          // TeamContext will observe the change in 'players' and handle game cleanup separately.
        } catch (error: any) {
          console.error('Error deleting player:', error.message);
          alert(`Error deleting player: ${error.message}`);
          throw error;
        } finally {
          setPlayersLoading(false);
        }
      }, [teamData]);

      // --- Local Player State Management (for lineup planning page) ---
      const movePlayer = useCallback((playerId: string, targetLocation: 'bench' | 'field', position?: { x: number; y: number }) => {
        setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, location: targetLocation, position: targetLocation === 'field' ? position : undefined } : p));
      }, []);

      const swapPlayers = useCallback((player1Id: string, player2Id: string) => {
        setPlayers(prev => {
          const p1Index = prev.findIndex(p => p.id === player1Id);
          const p2Index = prev.findIndex(p => p.id === player2Id);
          if (p1Index === -1 || p2Index === -1) return prev;
          const p1 = prev[p1Index];
          const p2 = prev[p2Index];
          const newState = [...prev];
          // Swap location and position
          newState[p1Index] = { ...p1, location: p2.location, position: p2.position };
          newState[p2Index] = { ...p2, location: p1.location, position: p1.position };
          return newState;
        });
      }, []);

      const resetLineup = useCallback(() => {
        setPlayers(prev => prev.map(p => ({ ...p, location: 'bench', position: undefined })));
      }, []);

      // Load lineup now takes the SavedLineup object directly
      const loadLineup = useCallback((lineupToLoad: SavedLineup): boolean => {
          if (!lineupToLoad) {
              console.error(`Invalid lineup provided to loadLineup.`);
              return false;
          }
          setPlayers(currentPlayers => {
              const savedPlayerStates = new Map(lineupToLoad.players.map(p => [p.id, { location: p.location, position: p.position }]));
              return currentPlayers.map(player => {
                  const savedState = savedPlayerStates.get(player.id);
                  return savedState
                      ? { ...player, location: savedState.location, position: savedState.position }
                      : { ...player, location: 'bench', position: undefined }; // Reset players not in saved lineup
              });
          });
          return true;
      }, []); // No dependency on savedLineups state from TeamContext needed here

      // --- Context Value ---
      const contextValue: PlayerContextProps = {
        players,
        playersLoading,
        addPlayer,
        updatePlayer,
        deletePlayer,
        movePlayer,
        swapPlayers,
        resetLineup,
        loadLineup,
      };

      return <PlayerContext.Provider value={contextValue}>{children}</PlayerContext.Provider>;
    };
