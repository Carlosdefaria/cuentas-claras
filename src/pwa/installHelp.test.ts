import { describe, expect, it } from 'vitest'
import { iosInstallDevice } from './installHelp'

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.0.0 (iPhone15,2; iOS 18_6; es_ES)',
  ipadOs:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
}

describe('iosInstallDevice', () => {
  it('iPhone en Safari (y en Chrome, que desde iOS 16.4 también instala) → iPhone', () => {
    expect(iosInstallDevice({ userAgent: UA.iphoneSafari, maxTouchPoints: 5, standalone: false })).toBe('iPhone')
    expect(iosInstallDevice({ userAgent: UA.iphoneChrome, maxTouchPoints: 5, standalone: false })).toBe('iPhone')
  })

  it('iPadOS se presenta como Mac pero es táctil → iPad; un Mac de verdad → nada', () => {
    expect(iosInstallDevice({ userAgent: UA.ipadOs, maxTouchPoints: 5, standalone: false })).toBe('iPad')
    expect(iosInstallDevice({ userAgent: UA.ipadOs, maxTouchPoints: 0, standalone: false })).toBeNull()
  })

  it('ya instalada, dentro de otra app o en Android → nada', () => {
    expect(iosInstallDevice({ userAgent: UA.iphoneSafari, maxTouchPoints: 5, standalone: true })).toBeNull()
    expect(iosInstallDevice({ userAgent: UA.iphoneInstagram, maxTouchPoints: 5, standalone: false })).toBeNull()
    expect(iosInstallDevice({ userAgent: UA.android, maxTouchPoints: 5, standalone: false })).toBeNull()
  })
})
