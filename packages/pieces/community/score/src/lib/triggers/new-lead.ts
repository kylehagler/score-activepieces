import { createTrigger, Property, TriggerStrategy } from '@activepieces/pieces-framework';
import { NewLeadPayload } from '../common/types';

export const newLead = createTrigger({
    name: 'new_lead',
    displayName: 'New Lead',
    description: 'Triggers when a new lead (opportunity) is assigned to you in Score',
    auth: undefined,
    type: TriggerStrategy.APP_WEBHOOK,
    props: {
        instructions: Property.MarkDown({
            value: `## How It Works

This trigger automatically fires when a new lead is created in Score and assigned to you.

**No setup required!** The webhook is configured globally by your administrator.

> Only leads where you are the assigned agent will trigger your flows.`
        }),
    },
    sampleData: {
        record: {
            id: 'uuid-123',
            contact_id: 'uuid-456',
            status: 'NEW_LEAD',
            type: 'LIFE',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z'
        },
        contact: {
            id: 'uuid-456',
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
        timestamp: '2024-01-01T00:00:00Z'
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

        // Register this flow to listen for new_lead events for this user's agent_user_id
        context.app.createListeners({
            events: ['new_lead'],
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
                contact_id: 'test-uuid-456',
                status: 'NEW_LEAD',
                type: 'LIFE',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            },
            contact: {
                id: 'test-uuid-456',
                first_name: 'Test',
                middle_name: null,
                last_name: 'Lead',
                full_name: 'Test Lead',
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
        const payload = context.payload.body as NewLeadPayload;

        // Return the lead data (filtering is already done by the app webhook routing)
        return [{
            record: payload.record,
            contact: payload.contact,
            agent_user_id: payload.agent_user_id,
            timestamp: payload.timestamp
        }];
    }
});
