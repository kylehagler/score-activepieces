import { ApId, PrincipalType } from '@activepieces/shared'
import { FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox'
import { userService } from './user-service'

export const userWorkerController: FastifyPluginAsyncTypebox = async (app) => {
    app.get('/:id', GetUserRequest, async (req) => {
        const user = await userService.getOneOrFail({ id: req.params.id })
        return {
            id: user.id,
            externalId: user.externalId,
        }
    })
}

const GetUserRequest = {
    config: {
        allowedPrincipals: [PrincipalType.ENGINE] as const,
    },
    schema: {
        params: Type.Object({
            id: ApId,
        }),
    },
}
