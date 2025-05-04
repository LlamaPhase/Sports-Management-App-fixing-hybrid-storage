/*
      # Create Saved Lineups Table

      This migration creates the `saved_lineups` table to store user-saved
      lineup configurations, replacing the previous Local Storage implementation.

      1. New Tables
         - `saved_lineups`
           - `id` (uuid, primary key): Unique identifier for the saved lineup.
           - `team_id` (uuid, foreign key): References the team this lineup belongs to.
           - `name` (text): User-defined name for the lineup.
           - `lineup_data` (jsonb): Stores the player lineup structure (player IDs, locations, positions).
           - `created_at` (timestamptz): Timestamp of creation.

      2. Indexes
         - Index on `team_id`.
         - Unique constraint on `team_id` and `name`.

      3. Security
         - Enable RLS on `saved_lineups` table.
         - Policy: Allow users to manage their own saved lineups based on `team_id`.
    */

    -- Create the saved_lineups table
    CREATE TABLE IF NOT EXISTS saved_lineups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      name text NOT NULL CHECK (char_length(name) > 0),
      lineup_data jsonb NOT NULL,
      created_at timestamptz DEFAULT now(),
      -- Ensure lineup names are unique per team
      UNIQUE (team_id, name)
    );

    -- Add index for lookups by team
    CREATE INDEX IF NOT EXISTS idx_saved_lineups_team_id ON saved_lineups(team_id);

    -- Enable Row Level Security
    ALTER TABLE saved_lineups ENABLE ROW LEVEL SECURITY;

    -- RLS Policy: Users can manage their own saved lineups
    DROP POLICY IF EXISTS "Users can manage own saved lineups" ON saved_lineups;
    CREATE POLICY "Users can manage own saved lineups"
      ON saved_lineups
      FOR ALL
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM teams WHERE teams.id = saved_lineups.team_id AND teams.user_id = auth.uid())
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM teams WHERE teams.id = saved_lineups.team_id AND teams.user_id = auth.uid())
      );