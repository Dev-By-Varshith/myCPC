-- MyCPC Database Schema (PostgreSQL)
-- This schema represents the structured data for Phase 2+ (Supabase migration)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cf_handle VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active TIMESTAMPTZ,
    settings JSONB DEFAULT '{}'
);

-- 2. Sessions (Local extension traces mapped to contests)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    contest_id INT NOT NULL,
    trace_storage_key VARCHAR(255) NOT NULL, -- Key in Cloudflare R2
    status VARCHAR(50) DEFAULT 'raw', -- 'raw', 'extracted', 'analyzed'
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ
);

-- 3. Submissions Features (Extracted by the structured extraction job)
CREATE TABLE submissions_features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(id),
    problem_id VARCHAR(50) NOT NULL,
    verdict VARCHAR(50),
    time_taken_sec INT,
    idle_gaps_count INT,
    max_idle_gap_sec INT,
    edit_churn_score FLOAT,
    burst_submit_flag BOOLEAN,
    complexity_flag VARCHAR(50), -- O(N^2), etc.
    tags JSONB,
    submitted_at TIMESTAMPTZ
);

-- 4. Skill Scores (Skill Graph + Per-topic Elo)
CREATE TABLE skill_scores (
    user_id UUID REFERENCES users(id),
    topic_tag VARCHAR(100) NOT NULL,
    elo_rating INT DEFAULT 1200,
    confidence_interval FLOAT,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, topic_tag)
);

-- 5. Coach Reports (Synthesized by LLM Pipeline)
CREATE TABLE coach_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID UNIQUE REFERENCES sessions(id),
    headline TEXT NOT NULL,
    highlight TEXT,
    diagnosed_mistakes JSONB, -- Array of {timestamp, issue, explanation}
    topic_trend JSONB,
    upsolve_list JSONB, -- Array of problem IDs
    socratic_question TEXT,
    generated_at TIMESTAMPTZ DEFAULT NOW()
);
