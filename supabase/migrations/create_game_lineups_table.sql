/*
      # Create Game Lineups Table

      This migration creates the `game_lineups` table to store the state
      of each player within a specific finished game.

      1. New Tables
         - `game_lineups`
           - `id` (uuid, primary key): Unique identifier for the lineup entry.
           - `game_id` (uuid, foreign key): References the game this lineup belongs to.
           - `player_id` (uuid, foreign key): References the player this state is for.
           - `location` (text): 'field', 'bench', or 'inactive'.
           - `position` (jsonb): Player's position on the field (nullable).
           - `initial_position` (jsonb): Player's starting position (nullable).
           - `playtime_seconds` (integer): Total seconds played (default 0).
           - `is_starter` (boolean): Whether the player started the game (default false).
           - `subbed_on_count` (integer): Number of times subbed on (default 0).
           - `subbed_off_count` (integer): Number of times subbed off (default 0).
           - `created_at` (timestamptz): Timestamp of creation.

      2. Indexes
         - Composite index on `game_id` and `player_id` for uniqueness and lookups.

      3. Security
         - Enable RLS on `game_lineups` table.
         - Policy: Allow users to manage lineup entries for games associated with their own teams.
    */

    -- Create the game_lineups table
    CREATE TABLE IF NOT EXISTS game_lineups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      location text NOT NULL CHECK (location IN ('field', 'bench', 'inactive')),
      position jsonb NULL,
      initial_position jsonb NULL,
      playtime_seconds integer NOT NULL DEFAULT 0 CHECK (playtime_seconds >= 0),
      is_starter boolean NOT NULL DEFAULT false,
      subbed_on_count integer NOT NULL DEFAULT 0 CHECK (subbed_on_count >= 0),
      subbed_off_count integer NOT NULL DEFAULT 0 CHECK (subbed_off_count >= 0),
      created_at timestamptz DEFAULT now(),
      -- Ensure a player can only have one entry per game
      UNIQUE (game_id, player_id)
    );

    -- Add index for lookups
    CREATE INDEX IF NOT EXISTS idx_game_lineups_game_id_player_id ON game_lineups(game_id, player_id);

    -- Enable Row Level Security
    ALTER TABLE game_lineups ENABLE ROW LEVEL SECURITY;

    -- RLS Policy: Users can manage lineups for their own team's games
    DROP POLICY IF EXISTS "Users can manage own game lineups" ON game_lineups;
    CREATE POLICY "Users can manage own game lineups"
      ON game_lineups
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM games g
          JOIN teams t ON g.team_id = t.id
          WHERE g.id = game_lineups.game_id AND t.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM games g
          JOIN teams t ON g.team_id = t.id
          WHERE g.id = game_lineups.game_id AND t.user_id = auth.uid()
        )
      );