import { createPiece, PieceAuth } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { newLead } from './lib/triggers/new-lead';
import { leadUpdated } from './lib/triggers/lead-updated';
import { policyUpdated } from './lib/triggers/policy-updated';
import { updateLead } from './lib/actions/update-lead';

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

            if (!body || !body.table) {
                return {};
            }

            // Route based on table and event type
            if (body.table === 'opportunities') {
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
            }

            if (body.table === 'policies') {
                if (body.type === 'UPDATE') {
                    return {
                        event: 'policy_updated',
                        identifierValue: body.agent_user_id ?? 'unknown',
                    };
                }
            }

            return {};
        },
        // Score webhooks from Supabase don't have signature verification
        // The webhook is internal and secured at the network level
        verify: () => true,
    },
    actions: [updateLead],
    triggers: [newLead, leadUpdated, policyUpdated],
});
