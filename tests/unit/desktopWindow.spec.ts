import { describe, expect, it } from 'vitest'
import { resolveDesktopWindowSize } from '@/services/desktopWindow'

describe('desktop window sizing', () => {
  it('uses a larger proportional default on a full HD work area', () => {
    expect(resolveDesktopWindowSize({ width: 1920, height: 1040 })).toEqual({
      width: 1267,
      height: 915,
    })
  })

  it('keeps the default inside a smaller laptop work area', () => {
    expect(resolveDesktopWindowSize({ width: 1366, height: 728 })).toEqual({
      width: 1100,
      height: 704,
    })
  })

  it('restores a saved size but clamps it to the current work area', () => {
    expect(
      resolveDesktopWindowSize({ width: 1366, height: 728 }, { width: 1500, height: 1000 }),
    ).toEqual({
      width: 1342,
      height: 704,
    })
  })

  // 迴歸：以前 availableWidth 被寫死上限 980，加上 setMaxSize(980) 之後視窗完全拉不寬
  // （全螢幕還是有效，因為 max size 不套用在全螢幕，害這個 bug 更難察覺）。
  it('lets a wide saved size survive on a wide monitor', () => {
    expect(
      resolveDesktopWindowSize({ width: 2560, height: 1400 }, { width: 1800, height: 1000 }),
    ).toEqual({
      width: 1800,
      height: 1000,
    })
  })
})
