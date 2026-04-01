type EnvVariables = Array<{
  name: string
  value: string
}>

type EndpointId = number

type StackData = {
  Id: number
  Name: string
  EndpointId: EndpointId
  Env: EnvVariables
}

type CreateStackParams = { type: number; method: string; endpointId: EndpointId }
type CreateStackBody = { name: string; stackFileContent: string; swarmID?: string }
type UpdateStackParams = { endpointId: EndpointId }
type UpdateStackBody = {
  env: EnvVariables
  stackFileContent?: string
  prune: boolean
  pullImage: boolean
}

type QueryParams = Record<string, string | number | boolean | undefined>

export class PortainerApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly method: string,
    public readonly url: string,
    public readonly body?: unknown
  ) {
    super(
      `HTTP Status ${status} (${method} ${url}): ${
        body !== undefined ? JSON.stringify(body, null, 2) : 'No response body'
      }`
    )
    this.name = 'PortainerApiError'
  }
}

export class PortainerApi {
  private authToken = ''
  private baseApiUrl: string

  constructor(host: string) {
    this.baseApiUrl = `${host.replace(/\/+$/, '')}/api`
  }

  private createUrl(path: string, params?: QueryParams): string {
    const url = new URL(`${this.baseApiUrl}${path}`)

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value))
        }
      }
    }

    return url.toString()
  }

  private async request<T>(path: string, options: RequestInit, params?: QueryParams): Promise<T> {
    const method = options.method ?? 'GET'
    const url = this.createUrl(path, params)
    const headers = new Headers(options.headers)

    if (this.authToken) {
      headers.set('Authorization', this.authToken)
    }

    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await fetch(url, { ...options, headers })
    const contentType = response.headers.get('content-type') ?? ''
    const rawBody = await response.text()

    let responseBody: unknown
    if (rawBody) {
      if (contentType.includes('application/json')) {
        try {
          responseBody = JSON.parse(rawBody)
        } catch {
          responseBody = rawBody
        }
      } else {
        responseBody = rawBody
      }
    }

    if (!response.ok) {
      throw new PortainerApiError(response.status, method, url, responseBody)
    }

    return responseBody as T
  }

  async login({ username, password }: { username: string; password: string }): Promise<void> {
    const data = await this.request<{ jwt: string }>('/auth', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    })
    this.authToken = `Bearer ${data.jwt}`
  }

  async logout(): Promise<void> {
    await this.request<void>('/auth/logout', { method: 'POST' })
    this.authToken = ''
  }

  async getStacks(): Promise<StackData[]> {
    return this.request<StackData[]>('/stacks', { method: 'GET' })
  }

  async createStack(params: CreateStackParams, body: CreateStackBody): Promise<void> {
    const path = body?.swarmID ? '/stacks/create/swarm/string' : '/stacks/create/standalone/string'
    await this.request<void>(path, { method: 'POST', body: JSON.stringify(body) }, params)
  }

  async updateStack(id: number, params: UpdateStackParams, body: UpdateStackBody): Promise<void> {
    await this.request<void>(`/stacks/${id}`, { method: 'PUT', body: JSON.stringify(body) }, params)
  }
}
