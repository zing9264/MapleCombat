// 卷軸格數的還原。
import { describe, expect, it } from 'vitest'
import { baseScrollSlots, currentScrollSlots, hammeredSlots } from '@/building/core/scrollSlots'

describe('baseScrollSlots', () => {
  it('沒敲過鐵鎚就是當下格數', () => {
    const item = {
      scroll_upgrade: '8',
      scroll_upgradeable_count: '0',
      scroll_resilience_count: '0',
    }
    expect(baseScrollSlots(item)).toBe(8)
  })

  it('敲過鐵鎚要扣回去', () => {
    // 實測：玩家的永恆法師褲 up=11、resilience=-3 → 原本 8 格
    const item = {
      scroll_upgrade: '11',
      scroll_upgradeable_count: '0',
      scroll_resilience_count: '-3',
    }
    expect(currentScrollSlots(item)).toBe(11)
    expect(hammeredSlots(item)).toBe(3)
    expect(baseScrollSlots(item)).toBe(8)
  })

  it('還沒用完的格數也要算進去', () => {
    const item = {
      scroll_upgrade: '7',
      scroll_upgradeable_count: '1',
      scroll_resilience_count: '0',
    }
    expect(baseScrollSlots(item)).toBe(8)
  })

  it('正數視為未知而忽略 —— 那個欄位的語意是反推的，不確定就不要亂改數字', () => {
    const item = {
      scroll_upgrade: '8',
      scroll_upgradeable_count: '0',
      scroll_resilience_count: '2',
    }
    expect(baseScrollSlots(item)).toBe(8)
  })

  it('缺欄位的舊資料不會壞掉', () => {
    expect(baseScrollSlots({ scroll_upgrade: '5' })).toBe(5)
    expect(baseScrollSlots({})).toBe(0)
  })
})
