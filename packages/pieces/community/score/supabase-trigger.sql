-- Score New Lead Trigger for ActivePieces
-- This trigger sends enriched webhook payloads when new opportunities are created
-- Uses the universal app-events endpoint - one webhook URL for ALL users!
--
-- SETUP INSTRUCTIONS:
-- 1. Enable the pg_net extension in your Supabase project
-- 2. Update the WEBHOOK_URL variable below with your ActivePieces app-events URL
-- 3. Run this entire script in the Supabase SQL Editor

-- Step 1: Enable pg_net extension (required for HTTP requests from PostgreSQL)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step 2: Create the trigger function
CREATE OR REPLACE FUNCTION notify_activepieces_new_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    contact_record JSONB;
    payload JSONB;
    -- Universal webhook URL for Score app events
    -- Format: https://YOUR_ACTIVEPIECES_URL/api/v1/app-events/score
    -- For local dev: http://localhost:3000/api/v1/app-events/score
    webhook_url TEXT := 'https://flows.score.insure/api/v1/app-events/score';
BEGIN
    -- Fetch related contact data
    SELECT to_jsonb(c.*)
    INTO contact_record
    FROM contacts c
    WHERE c.id = NEW.contact_id;

    -- Build enriched payload with opportunity, contact, and agent info
    -- The agent_user_id is used to route to the correct user's flows
    payload := jsonb_build_object(
        'type', 'INSERT',
        'table', 'opportunities',
        'schema', 'public',
        'opportunity', to_jsonb(NEW.*),
        'contact', contact_record,
        'agent_user_id', contact_record->>'agent_user_id',
        'timestamp', NOW()
    );

    -- Send HTTP POST to ActivePieces universal app-events endpoint
    -- pg_net.http_post sends async requests without blocking the transaction
    PERFORM net.http_post(
        url := webhook_url,
        body := payload,
        headers := '{"Content-Type": "application/json"}'::jsonb
    );

    RETURN NEW;
END;
$$;

-- Step 3: Create the trigger on the opportunities table
DROP TRIGGER IF EXISTS on_new_opportunity_for_activepieces ON opportunities;

CREATE TRIGGER on_new_opportunity_for_activepieces
    AFTER INSERT ON opportunities
    FOR EACH ROW
    EXECUTE FUNCTION notify_activepieces_new_lead();

-- Step 4: Verify the trigger was created
SELECT
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing
FROM information_schema.triggers
WHERE trigger_name = 'on_new_opportunity_for_activepieces';

-- HOW IT WORKS:
-- 1. When a new opportunity is created, this trigger fires
-- 2. It fetches the related contact data and builds a JSON payload
-- 3. The payload is sent to ActivePieces at /api/v1/app-events/score
-- 4. ActivePieces routes the event to ALL flows that:
--    a. Use the "Score - New Lead" trigger
--    b. Belong to a user whose externalId matches the agent_user_id in the payload
-- 5. Each matching flow runs with the lead data
--
-- This means:
-- - ONE webhook URL for your entire ActivePieces instance
-- - Each agent only receives leads assigned to them
-- - No per-user webhook configuration needed!
--
-- TESTING:
-- INSERT INTO opportunities (contact_id, status, type)
-- VALUES ('your-contact-id', 'new', 'life_insurance');
