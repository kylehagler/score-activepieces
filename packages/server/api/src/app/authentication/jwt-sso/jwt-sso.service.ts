import { ActivepiecesError, ErrorCode, isNil } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { jwtUtils } from '../../helper/jwt-utils'
import { systemConstants } from '@activepieces/server-shared'
import { AppSystemProp, environmentVariables } from '@activepieces/server-shared'

export type ScoreJwtPayload = {
    email: string
    firstName: string
    lastName: string
    externalId: string
    iat?: number
    exp?: number
}

export type ValidateScoreJwtParams = {
    token: string
}

export const jwtSsoService = (log: FastifyBaseLogger) => ({
    async validateScoreJwt({ token }: ValidateScoreJwtParams): Promise<ScoreJwtPayload> {
        const scoreJwtSecret = environmentVariables.getEnvironment(AppSystemProp.SCORE_JWT_SECRET)

        if (isNil(scoreJwtSecret)) {
            log.error('SCORE_JWT_SECRET is not configured')
            throw new ActivepiecesError({
                code: ErrorCode.INVALID_CREDENTIALS,
                params: null,
            }, 'SSO is not configured properly. Please contact your administrator.')
        }

        try {
            // Verify and decode the JWT token using the shared secret
            const decoded = await jwtUtils.decodeAndVerify<ScoreJwtPayload>({
                jwt: token,
                key: scoreJwtSecret,
            })

            // Validate required fields
            if (!decoded.email || !decoded.firstName || !decoded.lastName || !decoded.externalId) {
                log.error({ payload: decoded }, 'Missing required fields in JWT payload')
                throw new ActivepiecesError({
                    code: ErrorCode.INVALID_CREDENTIALS,
                    params: null,
                }, 'Invalid SSO token: missing required user information')
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            if (!emailRegex.test(decoded.email)) {
                log.error({ email: decoded.email }, 'Invalid email format in JWT payload')
                throw new ActivepiecesError({
                    code: ErrorCode.INVALID_CREDENTIALS,
                    params: null,
                }, 'Invalid SSO token: invalid email format')
            }

            log.info({
                email: decoded.email,
                externalId: decoded.externalId,
            }, 'Successfully validated Score JWT token')

            return decoded
        } catch (error) {
            // If it's already an ActivepiecesError, rethrow it
            if (error instanceof ActivepiecesError) {
                throw error
            }

            // Otherwise, wrap it in a generic authentication error
            log.error({ error }, 'Failed to validate Score JWT token')
            throw new ActivepiecesError({
                code: ErrorCode.INVALID_CREDENTIALS,
                params: null,
            }, 'Invalid or expired SSO token')
        }
    },
})