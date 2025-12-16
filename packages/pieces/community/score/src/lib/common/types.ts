export interface NewLeadPayload {
    type: 'INSERT';
    table: string;
    schema: string;
    opportunity: {
        id: string;
        contact_id: string;
        status: string;
        type: string;
        created_at?: string;
        [key: string]: unknown;
    };
    contact: {
        id: string;
        first_name: string;
        middle_name: string | null;
        last_name: string;
        name_suffix: string | null;
        email: string;
        phone: string;
        address_line_1: string;
        address_line_2: string | null;
        city: string;
        state: string;
        zip: string;
        birthdate: string;
        agent_user_id: string;
        [key: string]: unknown;
    };
    agent_user_id: string;
    timestamp: string;
}
