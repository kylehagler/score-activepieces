import { createAction, Property } from '@activepieces/pieces-framework';

export const addContactAndOpportunity = createAction({
    auth: undefined,
    name: 'add_contact_and_opportunity',
    displayName: 'Add Contact and Opportunity',
    description: 'Create a new contact and opportunity in Score',
    props: {
        // Contact fields
        first_name: Property.ShortText({
            displayName: 'First Name',
            description: 'Contact first name',
            required: true,
        }),
        last_name: Property.ShortText({
            displayName: 'Last Name',
            description: 'Contact last name',
            required: true,
        }),
        email: Property.ShortText({
            displayName: 'Email',
            description: 'Contact email address',
            required: false,
        }),
        phone: Property.ShortText({
            displayName: 'Phone',
            description: 'Contact phone number',
            required: false,
        }),
        address_line_1: Property.ShortText({
            displayName: 'Address Line 1',
            description: 'Street address',
            required: false,
        }),
        address_line_2: Property.ShortText({
            displayName: 'Address Line 2',
            description: 'Apartment, suite, etc.',
            required: false,
        }),
        city: Property.ShortText({
            displayName: 'City',
            description: 'City',
            required: false,
        }),
        state: Property.ShortText({
            displayName: 'State',
            description: 'State (2-letter code)',
            required: false,
        }),
        zip: Property.ShortText({
            displayName: 'ZIP Code',
            description: 'ZIP or postal code',
            required: false,
        }),
        birthdate: Property.ShortText({
            displayName: 'Birthdate',
            description: 'Date of birth (YYYY-MM-DD)',
            required: false,
        }),
        // Opportunity fields
        opportunity_status: Property.StaticDropdown({
            displayName: 'Opportunity Status',
            description: 'The status for the new opportunity',
            required: true,
            defaultValue: 'NEW_LEAD',
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
        opportunity_type: Property.StaticDropdown({
            displayName: 'Opportunity Type',
            description: 'The type of insurance opportunity',
            required: true,
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
        const {
            first_name,
            last_name,
            email,
            phone,
            address_line_1,
            address_line_2,
            city,
            state,
            zip,
            birthdate,
            opportunity_status,
            opportunity_type,
        } = context.propsValue;

        // Build contact data
        const contactData: Record<string, unknown> = {
            first_name,
            last_name,
        };
        if (email) contactData['email'] = email;
        if (phone) contactData['phone'] = phone;
        if (address_line_1) contactData['address_line_1'] = address_line_1;
        if (address_line_2) contactData['address_line_2'] = address_line_2;
        if (city) contactData['city'] = city;
        if (state) contactData['state'] = state;
        if (zip) contactData['zip'] = zip;
        if (birthdate) contactData['birthdate'] = birthdate;

        // Build opportunity data
        const opportunityData = {
            status: opportunity_status,
            type: opportunity_type,
        };

        // Call Score API to create contact and opportunity
        const response = await fetch(
            'https://str8-crm.vercel.app/api/contacts/create-with-opportunity',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contact: contactData,
                    opportunity: opportunityData,
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create contact and opportunity: ${response.status} ${errorText}`);
        }

        const result = await response.json();

        return {
            success: true,
            contact: result.contact,
            opportunity: result.opportunity,
        };
    },
});
