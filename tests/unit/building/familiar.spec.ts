// 萌獸 store：位置指派（召喚／羈絆）、草稿、存檔與舊版轉移。
//
// 詞條換算與合計在 familiarLoadout.spec.ts。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { MAX_BOND_SLOTS, useFamiliarStore } from '@/building/stores/familiar'

const STORAGE_KEY = 'mbFamiliarV2'
const LEGACY_KEY = 'mbFamiliarV1'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('位置指派', () => {
  it('新增的萌獸預設沒上場', () => {
    const store = useFamiliarStore()
    const familiar = store.add({ name: '木妖' })
    expect(familiar.slot).toBeNull()
    expect(store.active).toHaveLength(0)
  })

  it('召喚中只能有一隻，指派第二隻會把第一隻踢下來', () => {
    const store = useFamiliarStore()
    const a = store.add({ name: '暗黑半人馬' })
    const b = store.add({ name: '木妖' })

    store.setSlot(a.id, 'summon')
    store.setSlot(b.id, 'summon')

    expect(store.summoned?.id).toBe(b.id)
    expect(store.list.find((f) => f.id === a.id)?.slot).toBeNull()
  })

  it(`羈絆最多 ${MAX_BOND_SLOTS} 格，滿了就拒絕並說明原因`, () => {
    const store = useFamiliarStore()
    const ids = Array.from(
      { length: MAX_BOND_SLOTS + 1 },
      (_, i) => store.add({ name: `m${i}` }).id,
    )

    for (const id of ids) store.setSlot(id, 'bond')

    expect(store.bonds).toHaveLength(MAX_BOND_SLOTS)
    // 拒絕時要講原因，不然玩家只會看到「按了沒反應」
    expect(store.lastError).toContain('羈絆')
    expect(store.list.find((f) => f.id === ids[MAX_BOND_SLOTS])?.slot).toBeNull()
  })

  it('已經在羈絆裡的再指派一次不會被當成超額', () => {
    const store = useFamiliarStore()
    const ids = Array.from({ length: MAX_BOND_SLOTS }, (_, i) => store.add({ name: `m${i}` }).id)
    for (const id of ids) store.setSlot(id, 'bond')

    store.setSlot(ids[0], 'bond')
    expect(store.bonds).toHaveLength(MAX_BOND_SLOTS)
    expect(store.lastError).toBe('')
  })

  it('撤下來之後羈絆就空出一格', () => {
    const store = useFamiliarStore()
    const ids = Array.from({ length: MAX_BOND_SLOTS }, (_, i) => store.add({ name: `m${i}` }).id)
    for (const id of ids) store.setSlot(id, 'bond')

    store.setSlot(ids[0], null)
    const extra = store.add({ name: '新的' })
    store.setSlot(extra.id, 'bond')

    expect(store.bonds).toHaveLength(MAX_BOND_SLOTS)
    expect(store.lastError).toBe('')
  })
})

describe('草稿', () => {
  it('沒開草稿時 hasDraft 是 false', () => {
    const store = useFamiliarStore()
    store.setSlot(store.add({ name: 'a' }).id, 'summon')
    expect(store.hasDraft).toBe(false)
    expect(store.draftActive).toEqual(store.active)
  })

  it('草稿只是試算，不影響實際位置', () => {
    const store = useFamiliarStore()
    const a = store.add({ name: 'a', lines: [{ name: '最終傷害%', value: 20 }] })
    store.setSlot(a.id, 'summon')

    store.setDraftSlot(a.id, null)

    expect(store.hasDraft).toBe(true)
    expect(store.draftActive).toHaveLength(0)
    // 實際位置沒變
    expect(store.summoned?.id).toBe(a.id)
    expect(store.current.multiplier).toBeCloseTo(1.2, 6)
    expect(store.draft.multiplier).toBe(1)
  })

  it('套用草稿才會真的改位置', () => {
    const store = useFamiliarStore()
    const a = store.add({ name: 'a' })
    store.setSlot(a.id, 'summon')

    store.setDraftSlot(a.id, null)
    store.applyDraft()

    expect(store.summoned).toBeNull()
    expect(store.hasDraft).toBe(false)
  })

  it('取消草稿會回到原本的位置', () => {
    const store = useFamiliarStore()
    const a = store.add({ name: 'a' })
    store.setSlot(a.id, 'summon')

    store.setDraftSlot(a.id, null)
    store.clearDraft()

    expect(store.hasDraft).toBe(false)
    expect(store.draftActive.map((f) => f.id)).toEqual([a.id])
  })

  it('草稿裡指派召喚中也只能有一隻', () => {
    const store = useFamiliarStore()
    const a = store.add({ name: 'a' })
    const b = store.add({ name: 'b' })
    store.setSlot(a.id, 'summon')

    store.setDraftSlot(b.id, 'summon')

    expect(store.slotOf(a.id)).toBeNull()
    expect(store.slotOf(b.id)).toBe('summon')
  })
})

describe('存檔', () => {
  it('寫進 localStorage 並在重建時讀回來', () => {
    const store = useFamiliarStore()
    const a = store.add({ name: '暗黑半人馬' })
    store.updateLine(a.id, 0, { name: '最終傷害%', value: 20 })
    store.setSlot(a.id, 'summon')

    setActivePinia(createPinia())
    const reloaded = useFamiliarStore()

    expect(reloaded.list).toHaveLength(1)
    expect(reloaded.summoned?.name).toBe('暗黑半人馬')
    expect(reloaded.current.multiplier).toBeCloseTo(1.2, 6)
  })

  it('每隻固定三條詞條：缺的補空、多的裁掉', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: 'x', name: 'a', lines: [{ name: '最終傷害%', value: 20 }] }]),
    )
    const store = useFamiliarStore()
    expect(store.list[0].lines).toHaveLength(3)
  })

  it('存檔壞掉時當成空的，不讓整頁掛掉', () => {
    localStorage.setItem(STORAGE_KEY, '{壞掉的 JSON')
    expect(useFamiliarStore().list).toEqual([])
  })

  it('存檔內容不是陣列也要能撐住', () => {
    localStorage.setItem(STORAGE_KEY, '{"nope":true}')
    expect(useFamiliarStore().list).toEqual([])
  })
})

describe('舊版存檔轉移', () => {
  it('舊的終傷/魔力/物攻 轉成一隻萌獸的詞條', () => {
    // 舊版一筆就是一個數值組合，對應不到某一隻萌獸，只能保守地轉
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify([
        { id: 'a', label: '主萌獸', finalDamage: 20, magicPowerPercent: 14, equipped: true },
        { id: 'b', label: '羈絆', finalDamage: 2, magicPowerPercent: 4, equipped: true },
      ]),
    )

    const store = useFamiliarStore()
    expect(store.list).toHaveLength(2)
    expect(store.summoned?.name).toBe('主萌獸')
    expect(store.bonds).toHaveLength(1)
    expect(store.current.finalDamageSources).toEqual([20, 2])
    expect(store.current.magicPowerPercent).toBe(18)
  })

  it('舊版標為未裝備的轉過來也是沒上場', () => {
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify([{ id: 'a', label: 'x', finalDamage: 20, equipped: false }]),
    )
    expect(useFamiliarStore().active).toHaveLength(0)
  })

  it('已經有新版存檔時就不再讀舊版', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{ id: 'a', finalDamage: 20 }]))
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]))
    expect(useFamiliarStore().list).toEqual([])
  })
})
