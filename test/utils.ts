import { omit } from 'lodash'
import { Config } from '../src/Config'
import { createDatabaseConnection } from '../src/utils'

export const TEST_DATABASE_NAME = 'stream_metrics_index_test'

export const dropTestDatabaseIfExists = async (config: Config['database']): Promise<void> => {
    const connection = await createDatabaseConnection(omit(config, 'name'))
    await connection.execute(`DROP DATABASE IF EXISTS ${config.name}`)
    connection.destroy()
}
