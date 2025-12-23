import { createTrigger, Property, TriggerStrategy } from '@activepieces/pieces-framework';
import { PolicyUpdatedPayload } from '../common/types';

export const policyUpdated = createTrigger({
    name: 'policy_updated',
    displayName: 'Policy Updated',
    description: 'Triggers when a policy assigned to you is updated in Score',
    auth: undefined,
    type: TriggerStrategy.APP_WEBHOOK,
    props: {
        instructions: Property.MarkDown({
            value: `## How It Works

This trigger automatically fires when a policy assigned to you is updated in Score.

**No setup required!** The webhook is configured globally by your administrator.

> Only policies where you are the assigned agent will trigger your flows.`
        }),
    },
    sampleData: {
        record: {
            id: 'uuid-123',
            opportunity_id: 'opp-uuid-456',
            carrier_id: 'carrier-uuid',
            policy_number: 'POL-12345',
            policy_status: 'active',
            face_amount: 500000,
            annual_premium: 540,
            product_type: 'term',
            product_name: 'Term Life 20',
            submitted_date: '2024-01-01',
            effective_date: '2024-01-15',
            is_split: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-15T10:30:00Z'
        },
        old_record: {
            policy_status: 'pending'
        },
        contact: {
            id: 'contact-uuid-789',
            first_name: 'John',
            middle_name: null,
            last_name: 'Doe',
            full_name: 'John Doe',
            name_suffix: null,
            email: 'john@example.com',
            phone: '555-1234',
            address_line_1: '123 Main St',
            address_line_2: null,
            city: 'Austin',
            state: 'TX',
            zip: '78701',
            birthdate: '1985-06-15',
            agent_user_id: 'agent-uuid-789',
            client_portal_id: null,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z'
        },
        agent_user_id: 'agent-uuid-789',
        timestamp: '2024-01-15T10:30:00Z'
    },

    async onEnable(context) {
        // Fetch project to get owner's user ID
        const projectResponse = await fetch(
            `${context.server.apiUrl}v1/worker/project`,
            {
                headers: {
                    Authorization: `Bearer ${context.server.token}`,
                },
            }
        );
        const project = await projectResponse.json();

        // Fetch owner's user details to get their externalId (Score user ID)
        const userResponse = await fetch(
            `${context.server.apiUrl}v1/worker/users/${project.ownerId}`,
            {
                headers: {
                    Authorization: `Bearer ${context.server.token}`,
                },
            }
        );
        const ownerUser = await userResponse.json();

        // Register this flow to listen for policy_updated events for this user's agent_user_id
        context.app.createListeners({
            events: ['policy_updated'],
            identifierValue: ownerUser.externalId,
        });
    },

    async onDisable() {
        // Listeners are automatically cleaned up
    },

    async test() {
        // Return sample data for testing
        return [{
            record: {
                id: 'test-uuid-123',
                opportunity_id: 'test-opp-456',
                carrier_id: 'test-carrier-id',
                policy_number: 'POL-TEST-001',
                policy_status: 'active',
                face_amount: 500000,
                annual_premium: 540,
                product_type: 'term',
                product_name: 'Term Life 20',
                submitted_date: new Date(Date.now() - 86400000 * 14).toISOString().split('T')[0],
                effective_date: new Date().toISOString().split('T')[0],
                is_split: false,
                created_at: new Date(Date.now() - 86400000 * 14).toISOString(),
                updated_at: new Date().toISOString()
            },
            old_record: {
                policy_status: 'pending'
            },
            contact: {
                id: 'test-contact-789',
                first_name: 'Test',
                middle_name: null,
                last_name: 'Policy',
                full_name: 'Test Policy',
                name_suffix: null,
                email: 'test@example.com',
                phone: '555-0000',
                address_line_1: '123 Test St',
                address_line_2: null,
                city: 'Austin',
                state: 'TX',
                zip: '78701',
                birthdate: '1990-01-01',
                agent_user_id: 'test-agent-id',
                client_portal_id: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            },
            agent_user_id: 'test-agent-id',
            timestamp: new Date().toISOString()
        }];
    },

    async run(context) {
        const payload = context.payload.body as PolicyUpdatedPayload;

        // Return the updated policy data (filtering is already done by the app webhook routing)
        return [{
            record: payload.record,
            old_record: payload.old_record,
            contact: payload.contact,
            agent_user_id: payload.agent_user_id,
            timestamp: payload.timestamp
        }];
    }
});
