import { Static, Type } from '@sinclair/typebox'

export const SsoLoginRequest = Type.Object({
    token: Type.String({
        description: 'JWT token from Score application',
        minLength: 1,
    }),
})

export type SsoLoginRequest = Static<typeof SsoLoginRequest>