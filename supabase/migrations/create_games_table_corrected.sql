/*
      # Create Games Table (Corrected Schema)

      This migration creates the `games` table using the user-provided schema.

      1. New Tables
         - `games`
           - `id` (uuid, primary key)
           - `team_id` (uuid, foreign key)
           - `opponent` (text)
           - `game_date` (date): Renamed from `date`.
           - `game_time` (time): Renamed from `time`.
           - `location` (text)
           - `season` (text, nullable)
           - `competition` (text, nullable)
           - `home_score` (integer, default 0)
           - `away_score` (integer, default 0)
           - `timer_status` (text, default 'stopped')
           - `timer_elapsed` (integer, default 0): Renamed from `timer_elapsed_seconds`.
           - `is_explicitly_finished` (boolean, default false)
           - `created_at` (timestamptz)
           - `updated_at` (timestamptz)
           - *Note: `user_id`, `timer_start_time`, `date`, `time`, `events`, `lineup` from user list are not standard relational columns for this table and will be handled at the application/context level.*

      2. Indexes
         - Index on `team_id`.

      3. Security
         - Enable RLS on `games` table.
         - Policy: Allow users to manage games associated with their own teams (based on `team_id`).
    */

    -- Create the games table with corrected columns
    CREATE TABLE IF NOT EXISTS games (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      opponent text NOT NULL CHECK (char_length(opponent) > 0),
      game_date date NOT NULL, -- Renamed
      game_time time NULL, -- Renamed
      location text NOT NULL CHECK (location IN ('home', 'away')),
      season text NULL,
      competition text NULL,
      home_score integer NOT NULL DEFAULT 0,
      away_score integer NOT NULL DEFAULT 0,
      timer_status text NOT NULL DEFAULT 'stopped' CHECK (timer_status IN ('stopped', 'running')),
      -- timer_start_time timestamptz NULL, -- Removed as per standard practice, runtime value
      timer_elapsed integer NOT NULL DEFAULT 0 CHECK (timer_elapsed >= 0), -- Renamed
      is_explicitly_finished boolean NOT NULL DEFAULT false,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
      -- user_id is implicitly handled via team_id and RLS on teams/games
      -- date, time, events, lineup are application-level constructs derived from this table and related tables/LS
    );

    -- Add index for performance
    CREATE INDEX IF NOT EXISTS idx_games_team_id ON games(team_id);
    -- CREATE INDEX IF NOT EXISTS idx_games_user_id ON games(user_id); -- Removed user_id column

    -- Trigger to update 'updated_at' timestamp (assuming function exists)
    DROP TRIGGER IF EXISTS update_games_updated_at ON games;
    CREATE TRIGGER update_games_updated_at
    BEFORE UPDATE ON games
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); -- Assumes function exists from previous migrations

    -- Enable Row Level Security
    ALTER TABLE games ENABLE ROW LEVEL SECURITY;

    -- RLS Policy: Users can manage games for their own teams (checks ownership via team_id)
    DROP POLICY IF EXISTS "Users can manage own team games" ON games;
    CREATE POLICY "Users can manage own team games"
      ON games
      FOR ALL
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM teams WHERE teams.id = games.team_id AND teams.user_id = auth.uid())
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM teams WHERE teams.id = games.team_id AND teams.user_id = auth.uid())
      );