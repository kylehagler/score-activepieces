import { PieceMetadataModel, PieceMetadataModelSummary } from '@activepieces/pieces-framework'
import { score } from '@activepieces/piece-score'
import { AppSystemProp, apVersionUtil } from '@activepieces/server-shared'
import { isNil, ListVersionsResponse, PackageType, PieceSyncMode, PieceType } from '@activepieces/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { repoFactory } from '../core/db/repo-factory'
import { parseAndVerify } from '../helper/json-validator'
import { system } from '../helper/system/system'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobHandlers } from '../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { PieceMetadataEntity } from './piece-metadata-entity'
import { pieceMetadataService } from './piece-metadata-service'

const CLOUD_API_URL = 'https://cloud.activepieces.com/api/v1/pieces'
const piecesRepo = repoFactory(PieceMetadataEntity)
const syncMode = system.get<PieceSyncMode>(AppSystemProp.PIECES_SYNC_MODE)

// Local pieces to sync directly (imported, not from filesystem)
const LOCAL_PIECES = [
    {
        piece: score,
        name: '@activepieces/piece-score',
        version: '0.0.3',
    },
]

export const pieceSyncService = (log: FastifyBaseLogger) => ({
    async setup(): Promise<void> {
        // Always sync local pieces first, regardless of sync mode
        await syncLocalPieces(log)

        if (syncMode !== PieceSyncMode.OFFICIAL_AUTO) {
            log.info('Piece sync service is disabled')
            return
        }
        systemJobHandlers.registerJobHandler(SystemJobName.PIECES_SYNC, async function syncPiecesJobHandler(): Promise<void> {
            await pieceSyncService(log).sync()
        })
        await pieceSyncService(log).sync()
        await systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.PIECES_SYNC,
                data: {},
            },
            schedule: {
                type: 'repeated',
                cron: '0 */1 * * *',
            },
        })
    },
    async sync(): Promise<void> {
        if (syncMode !== PieceSyncMode.OFFICIAL_AUTO) {
            log.info('Piece sync service is disabled')
            return
        }
        try {
            log.info({ time: dayjs().toISOString() }, 'Syncing pieces')
            const pieces = await listPieces()
            const promises: Promise<void>[] = []

            for (const summary of pieces) {
                const lastVersionSynced = await existsInDatabase({ name: summary.name, version: summary.version })
                if (!lastVersionSynced) {
                    promises.push(syncPiece(summary.name, log))
                }
            }
            await Promise.all(promises)

            // Also sync local pieces
            await syncLocalPieces(log)
        }
        catch (error) {
            log.error({ error }, 'Error syncing pieces')
        }
    },
})

async function syncPiece(name: string, log: FastifyBaseLogger): Promise<void> {
    try {
        log.info({ name }, 'Syncing piece metadata into database')
        const versions = await getVersions({ name })
        for (const version of Object.keys(versions)) {
            const currentVersionSynced = await existsInDatabase({ name, version })
            if (!currentVersionSynced) {
                const piece = await getOrThrow({ name, version })
                await pieceMetadataService(log).create({
                    pieceMetadata: piece,
                    packageType: piece.packageType,
                    pieceType: piece.pieceType,
                })
            }
        }
    }
    catch (error) {
        log.error(error, 'Error syncing piece, please upgrade the activepieces to latest version')
    }

}
async function existsInDatabase({ name, version }: { name: string, version: string }): Promise<boolean> {
    return piecesRepo().existsBy({
        name,
        version,
        pieceType: PieceType.OFFICIAL,
        packageType: PackageType.REGISTRY,
    })
}

async function getVersions({ name }: { name: string }): Promise<ListVersionsResponse> {
    const queryParams = new URLSearchParams()
    queryParams.append('edition', system.getEdition())
    queryParams.append('release', await apVersionUtil.getCurrentRelease())
    queryParams.append('name', name)
    const url = `${CLOUD_API_URL}/versions?${queryParams.toString()}`
    const response = await fetch(url)
    return parseAndVerify<ListVersionsResponse>(ListVersionsResponse, (await response.json()))
}

async function getOrThrow({ name, version }: { name: string, version: string }): Promise<PieceMetadataModel> {
    const response = await fetch(
        `${CLOUD_API_URL}/${name}${version ? '?version=' + version : ''}`,
    )
    return response.json()
}

async function listPieces(): Promise<PieceMetadataModelSummary[]> {
    const queryParams = new URLSearchParams()
    queryParams.append('edition', system.getEdition())
    queryParams.append('release', await apVersionUtil.getCurrentRelease())
    const url = `${CLOUD_API_URL}?${queryParams.toString()}`
    const response = await fetch(url)
    if (response.status === StatusCodes.GONE.valueOf()) {
        return []
    }
    if (response.status !== StatusCodes.OK.valueOf()) {
        throw new Error(await response.text())
    }
    return response.json()
}

async function syncLocalPieces(log: FastifyBaseLogger): Promise<void> {
    if (LOCAL_PIECES.length === 0) {
        return
    }

    try {
        log.info({ pieces: LOCAL_PIECES.map(p => p.name) }, 'Syncing local pieces')

        for (const localPiece of LOCAL_PIECES) {
            const metadata = localPiece.piece.metadata()
            const existsInDb = await piecesRepo().existsBy({
                name: localPiece.name,
                version: localPiece.version,
            })

            if (!existsInDb) {
                log.info({ name: localPiece.name, version: localPiece.version }, 'Syncing local piece into database')
                await pieceMetadataService(log).create({
                    pieceMetadata: {
                        name: localPiece.name,
                        displayName: metadata.displayName,
                        description: metadata.description,
                        logoUrl: metadata.logoUrl,
                        version: localPiece.version,
                        minimumSupportedRelease: metadata.minimumSupportedRelease,
                        maximumSupportedRelease: metadata.maximumSupportedRelease,
                        auth: metadata.auth,
                        actions: metadata.actions,
                        triggers: metadata.triggers,
                        categories: metadata.categories,
                        authors: localPiece.piece.authors,
                    },
                    packageType: PackageType.REGISTRY,
                    pieceType: PieceType.OFFICIAL,
                })
            }
        }
    }
    catch (error) {
        log.error({ error }, 'Error syncing local pieces')
    }
}
