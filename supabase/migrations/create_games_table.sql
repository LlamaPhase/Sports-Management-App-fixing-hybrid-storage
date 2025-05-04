/*
      # Create Games Table

      This migration creates the `games` table to store core game information.

      1. New Tables
         - `games`
           - `id` (uuid, primary key): Unique identifier for the game.
           - `team_id` (uuid, foreign key): References the team this game belongs to.
           - `user_id` (uuid, foreign key): References the user who owns the team (redundant but useful for policies).
           - `opponent` (text): Name of the opposing team.
           - `date` (date): Date of the game.
           - `time` (time): Time of the game (nullable).
           - `location` (text): 'home' or 'away'.
           - `season` (text): Season identifier (nullable).
           - `competition` (text): Competition identifier (nullable).
           - `home_score` (integer): Final home score (nullable, default 0).
           - `away_score` (integer): Final away score (nullable, default 0).
           - `timer_status` (text): 'stopped' or 'running' (default 'stopped').
           - `timer_start_time` (timestamptz): Timestamp when the timer was last started (nullable).
           - `timer_elapsed_seconds` (integer): Total elapsed seconds when stopped (default 0).
           - `is_explicitly_finished` (boolean): Flag indicating if the game is manually marked as finished (default false).
           - `created_at` (timestamptz): Timestamp of creation.
           - `updated_at` (timestamptz): Timestamp of last update.

      2. Indexes
         - Index on `team_id` for faster lookups by team.
         - Index on `user_id` for policy checks.

      3. Security
         - Enable RLS on `games` table.
         - Policy: Allow users to manage (SELECT, INSERT, UPDATE, DELETE) games associated with their own teams.
    */

    -- Create the games table
    CREATE TABLE IF NOT EXISTS games (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Link to auth user
      opponent text NOT NULL CHECK (char_length(opponent) > 0),
      date date NOT NULL,
      time time NULL,
      location text NOT NULL CHECK (location IN ('home', 'away')),
      season text NULL,
      competition text NULL,
      home_score integer NULL DEFAULT 0,
      away_score integer NULL DEFAULT 0,
      timer_status text NOT NULL DEFAULT 'stopped' CHECK (timer_status IN ('stopped', 'running')),
      timer_start_time timestamptz NULL,
      timer_elapsed_seconds integer NOT NULL DEFAULT 0 CHECK (timer_elapsed_seconds >= 0),
      is_explicitly_finished boolean NOT NULL DEFAULT false,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    -- Add indexes for performance
    CREATE INDEX IF NOT EXISTS idx_games_team_id ON games(team_id);
    CREATE INDEX IF NOT EXISTS idx_games_user_id ON games(user_id);

    -- Trigger to update 'updated_at' timestamp
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
       NEW.updated_at = now();
       RETURN NEW;
    END;
    $$ language 'plpgsql';

    DROP TRIGGER IF EXISTS update_games_updated_at ON games;
    CREATE TRIGGER update_games_updated_at
    BEFORE UPDATE ON games
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

    -- Enable Row Level Security
    ALTER TABLE games ENABLE ROW LEVEL SECURITY;

    -- RLS Policy: Users can manage games for their own teams
    DROP POLICY IF EXISTS "Users can manage own team games" ON games;
    CREATE POLICY "Users can manage own team games"
      ON games
      FOR ALL -- Applies to SELECT, INSERT, UPDATE, DELETE
      TO authenticated
      USING (
        auth.uid() = user_id AND -- Direct check against user_id column
        EXISTS (SELECT 1 FROM teams WHERE teams.id = games.team_id AND teams.user_id = auth.uid()) -- Ensure team belongs to user
      )
      WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (SELECT 1 FROM teams WHERE teams.id = games.team_id AND teams.user_id = auth.uid())
      );