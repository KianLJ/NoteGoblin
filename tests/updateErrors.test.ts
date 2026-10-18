import { describe, expect, it } from 'vitest'
import { updateErrorMessage } from '@shared/updateErrors'

describe('updateErrorMessage', () => {
  it('names common failures in plain words', () => {
    expect(updateErrorMessage(new Error('net::ERR_INTERNET_DISCONNECTED'))).toBe('No internet connection.')
    expect(updateErrorMessage(new Error('getaddrinfo ENOTFOUND github.com'))).toBe('No internet connection.')
    expect(updateErrorMessage(new Error('connect ETIMEDOUT 140.82.121.4:443'))).toBe('The update server took too long to answer.')
    expect(updateErrorMessage(new Error('sha512 checksum mismatch, expected abc, got def'))).toBe('The download was damaged — it will try again.')
  })

  it('keeps just the first line of anything else, shortened', () => {
    expect(updateErrorMessage(new Error('Cannot find latest.yml in the latest release artifacts\n  at stack line'))).toBe('Cannot find latest.yml in the latest release artifacts')
    expect(updateErrorMessage('x'.repeat(300))).toHaveLength(201)
    expect(updateErrorMessage(new Error(''))).toBe('Something went wrong.')
  })
})
