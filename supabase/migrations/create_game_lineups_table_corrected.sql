/*
      # Create Game Lineups Table (Corrected Schema)

      This migration creates the `game_lineups` table using the user-provided schema.

      1. New Tables
         - `game_lineups`
           - `id` (uuid, primary key)
           - `game_id` (uuid, foreign key)
           - `player_id` (uuid, foreign key)
           - `location` (text)
           - `position` (jsonb, nullable)
           - `initial_position` (jsonb, nullable)
           - `playtime_seconds` (integer, default 0)
           - `playtimer_start_time` (timestamptz, nullable): Added as requested, though typically a runtime value.
           - `is_starter` (boolean, default false)
           - `subbed_on_count` (integer, default 0)
           - `subbed_off_count` (integer, default 0)
           - `created_at` (timestamptz)
           - `updated_at` (timestamptz)

      2. Indexes
         - Composite index on `game_id` and `player_id`.

      3. Security
         - Enable RLS on `game_lineups` table.
         - Policy: Allow users to manage lineup entries for games associated with their own teams.
    */

    -- Create the game_lineups table with corrected columns
    CREATE TABLE IF NOT EXISTS game_lineups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      location text NOT NULL CHECK (location IN ('field', 'bench', 'inactive')),
      position jsonb NULL,
      initial_position jsonb NULL,
      playtime_seconds integer NOT NULL DEFAULT 0 CHECK (playtime_seconds >= 0),
      playtimer_start_time timestamptz NULL, -- Added as requested
      is_starter boolean NOT NULL DEFAULT false,
      subbed_on_count integer NOT NULL DEFAULT 0 CHECK (subbed_on_count >= 0),
      subbed_off_count integer NOT NULL DEFAULT 0 CHECK (subbed_off_count >= 0),
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(), -- Added as requested
      UNIQUE (game_id, player_id)
    );

    -- Add index for lookups
    CREATE INDEX IF NOT EXISTS idx_game_lineups_game_id_player_id ON game_lineups(game_id, player_id);

     -- Trigger to update 'updated_at' timestamp
    DROP TRIGGER IF EXISTS update_game_lineups_updated_at ON game_lineups;
    CREATE TRIGGER update_game_lineups_updated_at
    BEFORE UPDATE ON game_lineups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); -- Assumes function exists

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