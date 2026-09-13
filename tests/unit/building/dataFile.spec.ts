import { describe, expect, it } from 'vitest'
import {
  SNAPSHOT_VERSION,
  applySnapshot,
  parseSnapshot,
  snapshotStorage,
  type DataSnapshot,
} from '@/building/services/dataFile'

/** 最小可用的 Storage 假物件；只實作被用到的部分 */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial))
  return {
    get length() {
      return map.size
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  } as Storage
}

function read(storage: Storage): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (key !== null) out[key] = storage.getItem(key) ?? ''
  }
  return out
}

describe('snapshotStorage', () => {
  it('抓下整包內容', () => {
    const snapshot = snapshotStorage(fakeStorage({ baseMain: '100', mbInventoryV1: '[]' }))
    expect(snapshot.keys).toEqual({ baseMain: '100', mbInventoryV1: '[]' })
    expect(snapshot.version).toBe(SNAPSHOT_VERSION)
  })

  it('空的 localStorage 不會炸', () => {
    expect(snapshotStorage(fakeStorage()).keys).toEqual({})
  })
})

describe('applySnapshot', () => {
  it('套用快照的值', () => {
    const storage = fakeStorage({ baseMain: '舊' })
    applySnapshot(storage, {
      version: 1,
      savedAt: '',
      keys: { baseMain: '新', atk: '50' },
    })
    expect(read(storage)).toEqual({ baseMain: '新', atk: '50' })
  })

  it('移除快照裡沒有的鍵', () => {
    // 這是刪除能不能生效的關鍵：不移除的話，在別的入口刪掉的東西會復活
    const storage = fakeStorage({ keep: '1', deletedElsewhere: '2' })
    applySnapshot(storage, { version: 1, savedAt: '', keys: { keep: '1' } })
    expect(read(storage)).toEqual({ keep: '1' })
  })

  it('空快照會清空', () => {
    const storage = fakeStorage({ a: '1', b: '2' })
    applySnapshot(storage, { version: 1, savedAt: '', keys: {} })
    expect(read(storage)).toEqual({})
  })
})

describe('parseSnapshot', () => {
  it('往返後內容一致', () => {
    const storage = fakeStorage({ baseMain: '100', mbNexonApiKey: 'secret' })
    const text = JSON.stringify(snapshotStorage(storage))
    const parsed = parseSnapshot(text)
    expect(parsed?.keys).toEqual({ baseMain: '100', mbNexonApiKey: 'secret' })
  })

  it('壞掉的 JSON 回傳 null 而不是丟例外', () => {
    // 檔案毀損時要能照常開起來，沿用現有 localStorage
    expect(parseSnapshot('{ 這不是 JSON')).toBeNull()
    expect(parseSnapshot('')).toBeNull()
  })

  it('不是物件的 JSON 也回傳 null', () => {
    expect(parseSnapshot('123')).toBeNull()
    expect(parseSnapshot('null')).toBeNull()
    expect(parseSnapshot('[]')).toBeNull()
  })

  it('缺少 keys 欄位回傳 null', () => {
    expect(parseSnapshot(JSON.stringify({ version: 1, savedAt: '' }))).toBeNull()
  })

  it('版本比程式新就拒絕，避免用舊程式誤讀新格式', () => {
    const future: DataSnapshot = {
      version: SNAPSHOT_VERSION + 1,
      savedAt: '',
      keys: { a: '1' },
    }
    expect(parseSnapshot(JSON.stringify(future))).toBeNull()
  })

  it('略過非字串的值，不讓它污染 localStorage', () => {
    const parsed = parseSnapshot(
      JSON.stringify({ version: 1, savedAt: '', keys: { good: '1', bad: 42, worse: null } }),
    )
    expect(parsed?.keys).toEqual({ good: '1' })
  })
})
