import { jest } from '@jest/globals'

describe('mcp proxy tool contract (remote mode)', () => {
  const baseUrl = 'http://example.test'
  const apiKey = 'test-token'

  const mockIndexModule = async () => {
    await jest.unstable_mockModule('../../dist/index.js', () => {
      return {
        mcpProxyConfig: {
          mode: 'remote',
          serverBaseUrl: baseUrl,
          apiKey,
        },
        workPlan: null,
      }
    })
  }

  const makeResponse = ({ status, body, statusText }) => {
    return {
      status,
      statusText: statusText ?? (status >= 400 ? 'Error' : 'OK'),
      text: async () =>
        typeof body === 'string' ? body : JSON.stringify(body ?? {}),
    }
  }

  test('plan hits /api/me/.../plan with Bearer auth and JSON body', async () => {
    jest.resetModules()
    await mockIndexModule()

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(makeResponse({ status: 200, body: { ok: true } }))
    global.fetch = fetchMock

    const { PLAN_TOOL } = await import('../../dist/tools/plan/toolDefs.js')

    const result = await PLAN_TOOL.handler(
      {
        goal: 'Top goal',
        prPlans: [
          {
            goal: 'PR1',
            commitPlans: [{ goal: 'C1' }],
          },
        ],
        needsMoreThoughts: false,
        agentId: 'Cascade',
        workplanId: 'wp-1',
      },
      {},
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]

    expect(url).toBe(`${baseUrl}/api/me/workplans/wp-1/plan`)
    expect(init.method).toBe('POST')
    expect(init.headers.authorization).toBe(`Bearer ${apiKey}`)
    expect(init.headers['content-type']).toBe('application/json')

    const parsedBody = JSON.parse(init.body)
    expect(parsedBody.goal).toBe('Top goal')
    expect(parsedBody.prPlans.length).toBe(1)

    const payload = JSON.parse(result.content[0].text)
    expect(payload.ok).toBe(true)
    expect(payload.httpStatus).toBe(200)
    expect(payload.endpoint.method).toBe('POST')
    expect(payload.endpoint.path).toBe('/api/me/workplans/wp-1/plan')
  })

  test('track hits /api/me/.../track with prIndex query', async () => {
    jest.resetModules()
    await mockIndexModule()

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(makeResponse({ status: 200, body: { goal: 'x' } }))
    global.fetch = fetchMock

    const { TRACK_TOOL } = await import('../../dist/tools/track/toolDefs.js')

    const result = await TRACK_TOOL.handler(
      {
        agentId: 'Cascade',
        workplanId: 'wp-2',
        prIndex: 1,
      },
      {},
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]

    expect(url).toBe(`${baseUrl}/api/me/workplans/wp-2/track?prIndex=1`)
    expect(init.method).toBe('GET')
    expect(init.headers.authorization).toBe(`Bearer ${apiKey}`)

    const payload = JSON.parse(result.content[0].text)
    expect(payload.ok).toBe(true)
    expect(payload.httpStatus).toBe(200)
    expect(payload.endpoint.method).toBe('GET')
    expect(payload.endpoint.path).toBe('/api/me/workplans/wp-2/track')
  })

  test('update maps HTTP error into normalized payload', async () => {
    jest.resetModules()
    await mockIndexModule()

    const fetchMock = jest.fn().mockResolvedValueOnce(
      makeResponse({
        status: 409,
        body: { error: 'Ambiguous workplanId', workspaceIds: ['a', 'b'] },
        statusText: 'Conflict',
      }),
    )
    global.fetch = fetchMock

    const { UPDATE_STATUS_TOOL } = await import(
      '../../dist/tools/update/toolDefs.js'
    )

    const result = await UPDATE_STATUS_TOOL.handler(
      {
        prIndex: 0,
        commitIndex: 0,
        status: 'in_progress',
        agentId: 'Cascade',
        workplanId: 'wp-amb',
      },
      {},
    )

    const payload = JSON.parse(result.content[0].text)
    expect(payload.ok).toBe(false)
    expect(payload.httpStatus).toBe(409)
    expect(payload.error).toBe('Ambiguous workplanId')
    expect(payload.endpoint.path).toBe('/api/me/workplans/wp-amb/update')
  })
})
