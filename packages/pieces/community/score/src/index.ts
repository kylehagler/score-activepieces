import { createPiece, PieceAuth } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { newLead } from './lib/triggers/new-lead';

export const score = createPiece({
    displayName: 'Score',
    description: 'Insurance CRM by Pinnacle Life Group',
    auth: PieceAuth.None(),
    minimumSupportedRelease: '0.30.0',
    logoUrl: '/pinnacle.jpg',
    categories: [PieceCategory.SALES_AND_CRM],
    authors: ['pinnacle-life-group'],
    events: {
        parseAndReply: ({ payload }) => {
            const body = payload.body as {
                type?: string;
                table?: string;
                agent_user_id?: string;
            };

            // Validate this is a Score webhook payload
            if (!body || body.type !== 'INSERT' || body.table !== 'opportunities') {
                return {};
            }

            // Return the event type and identifier (agent_user_id)
            // The identifier is used to route to the correct flow listeners
            return {
                event: 'new_lead',
                identifierValue: body.agent_user_id ?? 'unknown',
            };
        },
        // Score webhooks from Supabase don't have signature verification
        // The webhook is internal and secured at the network level
        verify: () => true,
    },
    actions: [],
    triggers: [newLead],
});
