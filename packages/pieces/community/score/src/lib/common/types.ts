// Contact type based on Supabase schema
export interface Contact {
    id: string;
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    full_name: string | null;
    name_suffix: string | null;
    email: string | null;
    phone: string | null;
    address_line_1: string | null;
    address_line_2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    birthdate: string | null;
    agent_user_id: string | null;
    client_portal_id: string | null;
    created_at: string | null;
    updated_at: string | null;
}

// Opportunity type based on Supabase schema
export interface Opportunity {
    id: string;
    contact_id: string;
    agent_user_id: string | null;
    lead_source_id: string | null;
    status: string;
    type: string | null;
    notes: string | null;
    follow_up_date: string | null;
    created_at: string | null;
    updated_at: string | null;
}

// Policy type based on Supabase schema
export interface Policy {
    id: string;
    opportunity_id: string | null;
    carrier_id: string;
    policy_number: string;
    policy_status: string | null; // policy_status_enum
    face_amount: number | null;
    annual_premium: number | null;
    product_type: string | null;
    product_name: string | null;
    submitted_date: string | null;
    effective_date: string | null;
    is_split: boolean | null;
    created_at: string | null;
    updated_at: string | null;
}

// Webhook payload for new lead (INSERT on opportunities)
export interface NewLeadPayload {
    type: 'INSERT';
    table: 'opportunities';
    schema: string;
    record: Opportunity;
    old_record: null;
    // Enriched by webhook function
    contact: Contact;
    agent_user_id: string;
    timestamp: string;
}

// Webhook payload for lead updated (UPDATE on opportunities)
export interface LeadUpdatedPayload {
    type: 'UPDATE';
    table: 'opportunities';
    schema: string;
    record: Opportunity;
    old_record: Partial<Opportunity>;
    // Enriched by webhook function
    contact: Contact;
    agent_user_id: string;
    timestamp: string;
}

// Webhook payload for policy updated (UPDATE on policies)
export interface PolicyUpdatedPayload {
    type: 'UPDATE';
    table: 'policies';
    schema: string;
    record: Policy;
    old_record: Partial<Policy>;
    // Enriched by webhook function
    contact: Contact;
    agent_user_id: string;
    timestamp: string;
}
