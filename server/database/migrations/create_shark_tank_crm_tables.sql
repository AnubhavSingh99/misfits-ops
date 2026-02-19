-- Migration: Create Shark Tank CRM tables
-- Date: 2026-02-19
-- Description: Creates leads, pending_replies, and message_batches tables for the Shark Tank Outreach CRM

-- Leads table — core CRM entity
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  instagram_url TEXT,
  instagram_handle TEXT UNIQUE,
  whatsapp_number TEXT,
  city TEXT,
  activity TEXT,
  days TEXT,
  timings TEXT,
  area TEXT,
  venue TEXT,
  followers INTEGER,
  leader_name TEXT,
  type TEXT,
  lead_quality TEXT,
  assigned_to TEXT,
  message_template_id INTEGER,
  pipeline_stage TEXT NOT NULL DEFAULT 'NOT_CONTACTED',
  flag TEXT,
  missive_conversation_id TEXT,
  missive_contact_id TEXT,
  call_link TEXT,
  call_scheduled_at TIMESTAMPTZ,
  google_calendar_event_id TEXT,
  last_activity_at TIMESTAMPTZ,
  notes JSONB DEFAULT '[]'::jsonb,
  activity_log JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pending replies — AI-drafted replies waiting to be sent
CREATE TABLE IF NOT EXISTS pending_replies (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  reply_text TEXT NOT NULL,
  send_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message batches — groups of messages in a batch window
CREATE TABLE IF NOT EXISTS message_batches (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  messages JSONB DEFAULT '[]'::jsonb,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON leads(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_instagram_handle ON leads(instagram_handle);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_last_activity ON leads(last_activity_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_pending_replies_status ON pending_replies(status);
CREATE INDEX IF NOT EXISTS idx_pending_replies_lead ON pending_replies(lead_id);
CREATE INDEX IF NOT EXISTS idx_message_batches_lead ON message_batches(lead_id);
CREATE INDEX IF NOT EXISTS idx_message_batches_processed ON message_batches(processed);
