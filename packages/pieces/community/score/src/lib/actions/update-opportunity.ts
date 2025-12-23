import { createAction, Property } from '@activepieces/pieces-framework';

export const updateOpportunity = createAction({
    auth: undefined,
    name: 'update_opportunity',
    displayName: 'Update Opportunity',
    description: 'Update an opportunity in Score',
    props: {
        opportunity_id: Property.ShortText({
            displayName: 'Opportunity ID',
            description: 'The UUID of the opportunity to update',
            required: true,
        }),
        status: Property.StaticDropdown({
            displayName: 'Status',
            description: 'The new status for the opportunity',
            required: false,
            options: {
                options: [
                    { label: 'New Lead', value: 'NEW_LEAD' },
                    { label: 'Contact Attempted', value: 'CONTACT_ATTEMPTED' },
                    { label: 'In Contact', value: 'IN_CONTACT' },
                    { label: 'Appointment Booked', value: 'APPOINTMENT_BOOKED' },
                    { label: 'Follow Up', value: 'FOLLOW_UP' },
                    { label: 'Proposal Sent', value: 'PROPOSAL_SENT' },
                    { label: 'Closed Won', value: 'CLOSED_WON' },
                    { label: 'Closed Lost', value: 'CLOSED_LOST' },
                ],
            },
        }),
        type: Property.StaticDropdown({
            displayName: 'Type',
            description: 'The type of insurance opportunity',
            required: false,
            options: {
                options: [
                    { label: 'Life', value: 'LIFE' },
                    { label: 'Health', value: 'HEALTH' },
                    { label: 'Annuity', value: 'ANNUITY' },
                ],
            },
        }),
    },
    async run(context) {
        const { opportunity_id, status, type } = context.propsValue;

        // Build the update object with only provided fields
        const updateData: Record<string, unknown> = {};
        if (status !== undefined && status !== null) updateData['status'] = status;
        if (type !== undefined && type !== null) updateData['type'] = type;

        if (Object.keys(updateData).length === 0) {
            throw new Error('At least one field must be provided to update');
        }

        // Call Score API to update the opportunity
        const response = await fetch(
            `https://str8-crm.vercel.app/api/opportunities/${opportunity_id}/update`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updateData),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to update opportunity: ${response.status} ${errorText}`);
        }

        const result = await response.json();

        return {
            success: true,
            opportunity: result,
        };
    },
});
