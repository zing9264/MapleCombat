// initDataFile() 的協調邏輯。
//
// 這裡測的是「順序與退路」，不是檔案 IO：沒有檔案要播種、檔案壞掉要能照常開起來、
// 瀏覽器環境要完全不作用。Rust 那端的實際讀寫由 Tauri 負責，這裡用 mock 取代。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@/services/tauri', () => ({ isTauri: mocks.isTauri }))

/** 讓 read_data_file 回傳指定內容，write_data_file 一律成功 */
function withFile(contents: string | null): void {
  mocks.invoke.mockImplementation((command: string) =>
    Promise.resolve(command === 'read_data_file' ? contents : undefined),
  )
}

function writtenPayload(): Record<string, string> | null {
  const call = mocks.invoke.mock.calls.find((args) => args[0] === 'write_data_file')
  if (!call) return null
  const { contents } = call[1] as { contents: string }
  return (JSON.parse(contents) as { keys: Record<string, string> }).keys
}

async function load() {
  return import('@/building/services/dataFile')
}

/** 攔截器裝在 Storage.prototype 上，測試之間必須還原，否則會一層層疊上去 */
const nativeStorage = {
  setItem: Storage.prototype.setItem,
  removeItem: Storage.prototype.removeItem,
  clear: Storage.prototype.clear,
}

beforeEach(() => {
  vi.resetModules()
  mocks.invoke.mockReset()
  mocks.isTauri.mockReturnValue(true)
  localStorage.clear()
})

afterEach(() => {
  Storage.prototype.setItem = nativeStorage.setItem
  Storage.prototype.removeItem = nativeStorage.removeItem
  Storage.prototype.clear = nativeStorage.clear
  vi.useRealTimers()
})

describe('initDataFile — 瀏覽器環境', () => {
  it('完全不作用，也不碰 Tauri', async () => {
    mocks.isTauri.mockReturnValue(false)
    const { initDataFile } = await load()

    expect(await initDataFile()).toBe(false)
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('不攔截 localStorage，寫入不會觸發寫檔', async () => {
    mocks.isTauri.mockReturnValue(false)
    const { initDataFile } = await load()
    await initDataFile()

    vi.useFakeTimers()
    localStorage.setItem('baseMain', '100')
    await vi.advanceTimersByTimeAsync(5000)

    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})

describe('initDataFile — 桌面版', () => {
  it('檔案有效時以檔案覆寫 localStorage', async () => {
    localStorage.setItem('staleKey', '舊資料')
    withFile(JSON.stringify({ version: 1, savedAt: '', keys: { baseMain: '999' } }))

    const { initDataFile } = await load()
    expect(await initDataFile()).toBe(true)

    expect(localStorage.getItem('baseMain')).toBe('999')
    // 檔案裡沒有的鍵必須被清掉，否則在別處刪掉的東西會復活
    expect(localStorage.getItem('staleKey')).toBeNull()
  })

  it('沒有檔案時，用現有 localStorage 播種一份', async () => {
    // 舊使用者升級上來的情境：原本的資料必須被收進檔案，不能憑空消失
    localStorage.setItem('mbInventoryV1', '[]')
    withFile(null)

    const { initDataFile } = await load()
    expect(await initDataFile()).toBe(false)

    expect(writtenPayload()).toEqual({ mbInventoryV1: '[]' })
  })

  it('檔案壞掉時不丟例外，改用現有資料播種', async () => {
    localStorage.setItem('mbInventoryV1', '[]')
    withFile('{ 這不是 JSON')

    const { initDataFile } = await load()
    await expect(initDataFile()).resolves.toBe(false)
    expect(writtenPayload()).toEqual({ mbInventoryV1: '[]' })
  })

  it('讀檔失敗時不丟例外，app 仍然要開得起來', async () => {
    mocks.invoke.mockRejectedValue(new Error('權限不足'))
    const { initDataFile } = await load()

    await expect(initDataFile()).resolves.toBe(false)
  })

  it('初始化後的寫入會延遲合併成一次寫檔', async () => {
    withFile(JSON.stringify({ version: 1, savedAt: '', keys: {} }))
    const { initDataFile } = await load()
    await initDataFile()
    mocks.invoke.mockClear()

    // 先確認攔截器真的裝上了，失敗時才分得出是「沒攔到」還是「計時器沒跑」
    expect(Storage.prototype.setItem).not.toBe(nativeStorage.setItem)

    vi.useFakeTimers()
    // 連續輸入不應該每個字都寫一次檔
    localStorage.setItem('baseMain', '1')
    localStorage.setItem('baseMain', '12')
    localStorage.setItem('baseMain', '123')
    await vi.advanceTimersByTimeAsync(2000)

    const writes = mocks.invoke.mock.calls.filter((args) => args[0] === 'write_data_file')
    expect(writes).toHaveLength(1)
    expect(writtenPayload()).toEqual({ baseMain: '123' })
  })

  it('移除鍵也會觸發寫檔', async () => {
    withFile(JSON.stringify({ version: 1, savedAt: '', keys: { doomed: '1' } }))
    const { initDataFile } = await load()
    await initDataFile()
    mocks.invoke.mockClear()

    vi.useFakeTimers()
    localStorage.removeItem('doomed')
    await vi.advanceTimersByTimeAsync(2000)

    expect(writtenPayload()).toEqual({})
  })
})
