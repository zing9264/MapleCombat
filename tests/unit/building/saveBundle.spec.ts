// 匯出／匯入時帶上 MapleBuilding 自己的資料。
import { beforeEach, describe, expect, it } from 'vitest'
import { applyBuildingData, collectBuildingData } from '@/building/services/saveBundle'

beforeEach(() => localStorage.clear())

describe('collectBuildingData', () => {
  it('只收 mb 開頭的鍵', () => {
    localStorage.setItem('mbBaselineV1', '{"mainFlat":"5904"}')
    localStorage.setItem('baseMain', '5904')
    localStorage.setItem('activeView', 'character')

    expect(collectBuildingData()).toEqual({ mbBaselineV1: '{"mainFlat":"5904"}' })
  })

  it('沒有資料時是空物件，不是 undefined', () => {
    expect(collectBuildingData()).toEqual({})
  })

  it('用前綴判斷，新增 store 不必回來改這裡', () => {
    localStorage.setItem('mbSomethingBrandNew', 'x')
    expect(collectBuildingData().mbSomethingBrandNew).toBe('x')
  })
})

describe('applyBuildingData', () => {
  it('寫回 localStorage', () => {
    expect(applyBuildingData({ mbBaselineV1: '{"a":1}' })).toBe(true)
    expect(localStorage.getItem('mbBaselineV1')).toBe('{"a":1}')
  })

  it('不碰非 mb 的鍵 —— 上游的欄位由上游自己處理', () => {
    applyBuildingData({ baseMain: '9999', mbX: 'ok' })
    expect(localStorage.getItem('baseMain')).toBeNull()
    expect(localStorage.getItem('mbX')).toBe('ok')
  })

  it('不清掉現有的鍵：舊備份不該把新資料洗掉', () => {
    localStorage.setItem('mbFamiliarV2', '[{"id":"a"}]')
    applyBuildingData({ mbBaselineV1: '{}' })
    expect(localStorage.getItem('mbFamiliarV2')).toBe('[{"id":"a"}]')
  })

  it('沒有可用內容時回 false', () => {
    expect(applyBuildingData(null)).toBe(false)
    expect(applyBuildingData({ baseMain: '1' })).toBe(false)
    expect(applyBuildingData({ mbX: 123 })).toBe(false)
  })
})
