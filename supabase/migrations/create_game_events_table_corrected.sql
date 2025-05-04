/*
      # Create Game Events Table (Corrected Schema)

      This migration creates the `game_events` table using the user-provided schema.

      1. New Tables
         - `game_events`
           - `id` (uuid, primary key)
           - `game_id` (uuid, foreign key)
           - `type` (text)
           - `team` (text)
           - `scorer_player_id` (uuid, foreign key, nullable)
           - `assist_player_id` (uuid, foreign key, nullable)
           - `player_in_id` (uuid, foreign key, nullable)
           - `player_out_id` (uuid, foreign key, nullable)
           - `event_timestamp` (timestamptz): Renamed from `timestamp`.
           - `game_seconds` (integer)
           - `created_at` (timestamptz)

      2. Indexes
         - Index on `game_id`.

      3. Security
         - Enable RLS on `game_events` table.
         - Policy: Allow users to manage events for games associated with their own teams.
    */

    -- Create the game_events table with corrected columns
    CREATE TABLE IF NOT EXISTS game_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      type text NOT NULL CHECK (type IN ('goal', 'substitution')),
      team text NOT NULL CHECK (team IN ('home', 'away')),
      scorer_player_id uuid NULL REFERENCES players(id) ON DELETE SET NULL,
      assist_player_id uuid NULL REFERENCES players(id) ON DELETE SET NULL,
      player_in_id uuid NULL REFERENCES players(id) ON DELETE SET NULL,
      player_out_id uuid NULL REFERENCES players(id) ON DELETE SET NULL,
      event_timestamp timestamptz NOT NULL, -- Renamed
      game_seconds integer NOT NULL CHECK (game_seconds >= 0),
      created_at timestamptz DEFAULT now()
    );

    -- Add index for lookups
    CREATE INDEX IF NOT EXISTS idx_game_events_game_id ON game_events(game_id);

    -- Enable Row Level Security
    ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;

    -- RLS Policy: Users can manage events for their own team's games
    DROP POLICY IF EXISTS "Users can manage own game events" ON game_events;
    CREATE POLICY "Users can manage own game events"
      ON game_events
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM games g
          JOIN teams t ON g.team_id = t.id
          WHERE g.id = game_events.game_id AND t.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM games g
          JOIN teams t ON g.team_id = t.id
          WHERE g.id = game_events.game_id AND t.user_id = auth.uid()
        )
      );