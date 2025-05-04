/*
      # Create Game Events Table

      This migration creates the `game_events` table to store significant
      events that occurred during a finished game (goals, substitutions).

      1. New Tables
         - `game_events`
           - `id` (uuid, primary key): Unique identifier for the event.
           - `game_id` (uuid, foreign key): References the game this event belongs to.
           - `type` (text): 'goal' or 'substitution'.
           - `team` (text): 'home' or 'away'.
           - `scorer_player_id` (uuid, foreign key): Player who scored (nullable).
           - `assist_player_id` (uuid, foreign key): Player who assisted (nullable).
           - `player_in_id` (uuid, foreign key): Player subbed in (nullable).
           - `player_out_id` (uuid, foreign key): Player subbed out (nullable).
           - `timestamp` (timestamptz): Wall-clock time of the event.
           - `game_seconds` (integer): Game time in seconds when the event occurred.
           - `created_at` (timestamptz): Timestamp of creation.

      2. Indexes
         - Index on `game_id` for faster event lookups per game.

      3. Security
         - Enable RLS on `game_events` table.
         - Policy: Allow users to manage events for games associated with their own teams.
    */

    -- Create the game_events table
    CREATE TABLE IF NOT EXISTS game_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      type text NOT NULL CHECK (type IN ('goal', 'substitution')),
      team text NOT NULL CHECK (team IN ('home', 'away')),
      scorer_player_id uuid NULL REFERENCES players(id) ON DELETE SET NULL,
      assist_player_id uuid NULL REFERENCES players(id) ON DELETE SET NULL,
      player_in_id uuid NULL REFERENCES players(id) ON DELETE SET NULL,
      player_out_id uuid NULL REFERENCES players(id) ON DELETE SET NULL,
      "timestamp" timestamptz NOT NULL, -- Using timestamptz for wall clock time
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