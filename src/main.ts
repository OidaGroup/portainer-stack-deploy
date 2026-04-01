import { getBooleanInput, getInput, info, setFailed } from '@actions/core'
import { PortainerApiError } from './api'
import { deployStack } from './deployStack'

export async function run(): Promise<void> {
  try {
    const portainerHost: string = getInput('portainer-host', { required: true })
    const username: string = getInput('username', { required: true })
    const password: string = getInput('password', { required: true })
    const swarmId: string = getInput('swarm-id', { required: false })
    const endpointId: string = getInput('endpoint-id', { required: false })
    const stackName: string = getInput('stack-name', { required: true })
    const stackDefinitionFile: string = getInput('stack-definition', { required: false })
    const templateVariables: string = getInput('template-variables', { required: false })
    const image: string = getInput('image', { required: false })
    const pruneStack: boolean = getBooleanInput('prune-stack', { required: false })
    const pullImage: boolean = getBooleanInput('pull-image', { required: false })

    await deployStack({
      portainerHost,
      username,
      password,
      swarmId,
      endpointId: parseInt(endpointId) || 1,
      stackName,
      stackDefinitionFile: stackDefinitionFile ?? undefined,
      templateVariables: templateVariables ? JSON.parse(templateVariables) : undefined,
      image,
      pruneStack: pruneStack || false,
      pullImage: pullImage || false
    })
    info('✅ Deployment done')
  } catch (error) {
    if (error instanceof PortainerApiError) {
      return setFailed(error.message)
    }
    return setFailed(error instanceof Error ? error : new Error(String(error)))
  }
}

run()
