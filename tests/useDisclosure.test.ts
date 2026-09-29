import { describe, expect, it } from 'vitest'
import { useDisclosure } from '../src/composables/useDisclosure'

describe('useDisclosure', () => {
  it('starts closed unless told otherwise', () => {
    expect(useDisclosure().open.value).toBe(false)
    expect(useDisclosure(true).open.value).toBe(true)
  })

  it('toggles, shows and hides', () => {
    const d = useDisclosure()
    d.toggle()
    expect(d.open.value).toBe(true)
    d.toggle()
    expect(d.open.value).toBe(false)
    d.show()
    d.show()
    expect(d.open.value).toBe(true)
    d.hide()
    expect(d.open.value).toBe(false)
  })
})
