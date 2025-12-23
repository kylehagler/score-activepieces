import { createPiece, PieceAuth } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { newLead } from './lib/triggers/new-lead';
import { leadUpdated } from './lib/triggers/lead-updated';

export const score = createPiece({
    displayName: 'Score',
    description: 'Insurance CRM by Pinnacle Life Group',
    auth: PieceAuth.None(),
    minimumSupportedRelease: '0.30.0',
    maximumSupportedRelease: '99.99.99',
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

            // Validate this is a Score webhook payload for opportunities table
            if (!body || body.table !== 'opportunities') {
                return {};
            }

            // Route based on event type
            if (body.type === 'INSERT') {
                return {
                    event: 'new_lead',
                    identifierValue: body.agent_user_id ?? 'unknown',
                };
            }

            if (body.type === 'UPDATE') {
                return {
                    event: 'lead_updated',
                    identifierValue: body.agent_user_id ?? 'unknown',
                };
            }

            return {};
        },
        // Score webhooks from Supabase don't have signature verification
        // The webhook is internal and secured at the network level
        verify: () => true,
    },
    actions: [],
    triggers: [newLead, leadUpdated],
});
