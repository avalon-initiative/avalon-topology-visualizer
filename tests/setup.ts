import { vi } from 'vitest'

// No test reaches the published trust-anchor list; a test that needs networks mocks it itself.
vi.mock('@avalon-initiative/protocol-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@avalon-initiative/protocol-sdk')>()),
  fetchTrustAnchors: vi.fn(async () => []),
}))
