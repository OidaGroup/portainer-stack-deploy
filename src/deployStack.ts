import { PortainerApi } from './api'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Handlebars from 'handlebars'
import { debug, info } from '@actions/core'

type DeployStack = {
  portainerHost: string
  username: string
  password: string
  swarmId?: string
  endpointId: number
  stackName: string
  stackDefinitionFile?: string
  templateVariables?: object
  image?: string
  pruneStack?: boolean
  pullImage?: boolean
}

enum StackType {
  SWARM = 1,
  COMPOSE = 2
}

function generateNewStackDefinition(
  stackDefinitionFile?: string,
  templateVariables?: object,
  image?: string
): string | undefined {
  if (!stackDefinitionFile) {
    info(`No stack definition file provided. Will not update stack definition.`)
    return undefined
  }

  const stackDefFilePath = join(process.env.GITHUB_WORKSPACE as string, stackDefinitionFile)
  info(`Reading stack definition file from ${stackDefFilePath}`)
  let stackDefinition = readFileSync(stackDefFilePath, 'utf8')
  if (!stackDefinition) {
    throw new Error(`Could not find stack-definition file: ${stackDefFilePath}`)
  }

  if (templateVariables) {
    info(`Applying template variables for keys: ${Object.keys(templateVariables)}`)
    stackDefinition = Handlebars.compile(stackDefinition)(templateVariables)
  }

  if (!image) {
    info(`No new image provided. Will use image in stack definition.`)
    return stackDefinition
  }

  const imageWithoutTag = image.substring(0, image.indexOf(':'))
  info(`Inserting image ${image} into the stack definition`)
  return stackDefinition.replace(new RegExp(`${imageWithoutTag}(:.*)?\n`), `${image}\n`)
}

export async function deployStack({
  portainerHost,
  username,
  password,
  swarmId,
  endpointId,
  stackName,
  stackDefinitionFile,
  templateVariables,
  image,
  pruneStack,
  pullImage
}: DeployStack): Promise<void> {
  const portainerApi = new PortainerApi(portainerHost)

  const stackDefinitionToDeploy = generateNewStackDefinition(
    stackDefinitionFile,
    templateVariables,
    image
  )
  if (stackDefinitionToDeploy) debug(stackDefinitionToDeploy)

  info('Logging in to Portainer instance...')
  await portainerApi.login({ username, password })

  try {
    const allStacks = await portainerApi.getStacks()
    const existingStack = allStacks.find(s => {
      return s.Name === stackName && s.EndpointId === endpointId
    })

    if (existingStack) {
      info(`Found existing stack with name: ${stackName}`)
      info('Updating existing stack...')
      await portainerApi.updateStack(
        existingStack.Id,
        { endpointId: existingStack.EndpointId },
        {
          env: existingStack.Env,
          stackFileContent: stackDefinitionToDeploy,
          prune: pruneStack ?? false,
          pullImage: pullImage ?? false
        }
      )
      info('Successfully updated existing stack')
    } else {
      if (!stackDefinitionToDeploy) {
        throw new Error(
          `Stack with name ${stackName} does not exist and no stack definition file was provided.`
        )
      }
      info('Deploying new stack...')
      await portainerApi.createStack(
        { type: swarmId ? StackType.SWARM : StackType.COMPOSE, method: 'string', endpointId },
        {
          name: stackName,
          stackFileContent: stackDefinitionToDeploy,
          swarmID: swarmId ? swarmId : undefined
        }
      )
      info(`Successfully created new stack with name: ${stackName}`)
    }
  } catch (error) {
    info('⛔️ Something went wrong during deployment!')
    throw error
  } finally {
    info(`Logging out from Portainer instance...`)
    await portainerApi.logout()
  }
}
