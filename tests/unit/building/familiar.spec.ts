import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFamiliarStore } from '@/building/stores/familiar'
import { famMultFromSources, overseasFamMult } from '@/core/familiar'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('萌獸 — 終傷（乘算）', () => {
  it('沒有任何萌獸時倍率是 1，不是 0', () => {
    const store = useFamiliarStore()
    expect(store.sources).toEqual([])
    expect(store.totalPercent).toBe(0)
    expect(store.multiplier).toBe(1)
  })

  it('三隻主萌獸 = 60%，倍率約 1.6', () => {
    const store = useFamiliarStore()
    store.add({ finalDamage: 20 })
    store.add({ finalDamage: 20 })
    store.add({ finalDamage: 20 })

    expect(store.totalPercent).toBe(60)
    expect(store.multiplier).toBeCloseTo(1.6, 5)
  })

  it('逐條累加與遊戲內的標準組合一致', () => {
    // 三隻主萌獸 + 兩條羈絆 = 64%，與 overseasFamMult 由總值反推的結果必須相同
    const store = useFamiliarStore()
    ;[20, 20, 20, 2, 2].forEach((n) => store.add({ finalDamage: n }))

    expect(store.totalPercent).toBe(64)
    expect(store.multiplier).toBeCloseTo(overseasFamMult(64), 10)
  })

  it('終傷為 0 的條目不計入來源', () => {
    const store = useFamiliarStore()
    store.add({ finalDamage: 20 })
    store.add({ magicPowerPercent: 3, label: '只有魔力' })

    expect(store.sources).toEqual([20])
    expect(store.lines).toHaveLength(2)
  })
})

describe('萌獸 — 魔力%／物攻%（加算）', () => {
  it('分開加總，不會混進終傷', () => {
    const store = useFamiliarStore()
    store.add({ finalDamage: 20, magicPowerPercent: 3 })
    store.add({ magicPowerPercent: 2, attackPowerPercent: 4 })

    expect(store.magicPowerPercent).toBe(5)
    expect(store.attackPowerPercent).toBe(4)
    // 終傷只認 finalDamage，不該被百分比詞條影響
    expect(store.totalPercent).toBe(20)
    expect(store.sources).toEqual([20])
  })

  it('加算就是單純相加，不走 float32 累加', () => {
    const store = useFamiliarStore()
    ;[1, 2, 3].forEach((n) => store.add({ magicPowerPercent: n }))
    expect(store.magicPowerPercent).toBe(6)
  })

  it('沒填的欄位當 0，不會變成 NaN', () => {
    const store = useFamiliarStore()
    store.add({ finalDamage: 20 })

    expect(store.magicPowerPercent).toBe(0)
    expect(store.attackPowerPercent).toBe(0)
  })
})

describe('萌獸 — 編輯與存檔', () => {
  it('改終傷會反映到倍率', () => {
    const store = useFamiliarStore()
    const line = store.add({ finalDamage: 20 })
    store.update(line.id, { finalDamage: 25 })

    expect(store.sources).toEqual([25])
    expect(store.multiplier).toBeCloseTo(famMultFromSources([25]), 10)
  })

  it('可以只改其中一個百分比欄位', () => {
    const store = useFamiliarStore()
    const line = store.add({ finalDamage: 20, magicPowerPercent: 3 })
    store.update(line.id, { attackPowerPercent: 5 })

    expect(store.lines[0].finalDamage).toBe(20)
    expect(store.lines[0].magicPowerPercent).toBe(3)
    expect(store.lines[0].attackPowerPercent).toBe(5)
  })

  it('刪除單一條目只影響那一條', () => {
    const store = useFamiliarStore()
    const first = store.add({ finalDamage: 20, label: '甲' })
    store.add({ finalDamage: 25, label: '乙' })
    store.remove(first.id)

    expect(store.lines).toHaveLength(1)
    expect(store.lines[0].label).toBe('乙')
  })

  it('存檔會寫進 localStorage 並在重建時讀回來', () => {
    const store = useFamiliarStore()
    store.add({ finalDamage: 20, magicPowerPercent: 3, label: '小紅' })

    setActivePinia(createPinia())
    const reloaded = useFamiliarStore()
    expect(reloaded.sources).toEqual([20])
    expect(reloaded.magicPowerPercent).toBe(3)
    expect(reloaded.lines[0].label).toBe('小紅')
  })

  it('舊版存檔只有 finalDamage，缺的欄位補 0', () => {
    // 加入魔力%／物攻% 之前存的資料，不能讓它變成 undefined 汙染加總
    localStorage.setItem(
      'mbFamiliarV1',
      JSON.stringify([{ id: 'old', label: '舊資料', finalDamage: 20 }]),
    )
    setActivePinia(createPinia())

    const store = useFamiliarStore()
    expect(store.lines[0].magicPowerPercent).toBe(0)
    expect(store.magicPowerPercent).toBe(0)
    expect(store.totalPercent).toBe(20)
  })

  it('存檔壞掉時當成空的，不讓整頁掛掉', () => {
    localStorage.setItem('mbFamiliarV1', '{ 這不是陣列')
    setActivePinia(createPinia())
    expect(useFamiliarStore().lines).toEqual([])
  })

  it('存檔內容不是陣列也要能撐住', () => {
    localStorage.setItem('mbFamiliarV1', '{"a":1}')
    setActivePinia(createPinia())
    expect(useFamiliarStore().lines).toEqual([])
  })
})
