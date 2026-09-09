import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportSaveData, type SaveDataV1 } from '@/services/saveData'
import { isTauri, saveExportFile } from '@/services/tauri'

vi.mock('@/services/tauri', () => ({
  isTauri: vi.fn(),
  saveExportFile: vi.fn(),
}))

const isTauriMock = vi.mocked(isTauri)
const saveExportFileMock = vi.mocked(saveExportFile)
const saveData: SaveDataV1 = {
  app: 'maplecombat',
  version: 2,
  selectedJob: 'normal',
  selectedJobName: '英雄',
  effSelectedJob: 'normal',
  values: { baseMain: '123' },
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('exportSaveData', () => {
  it('桌面版沿用 Tauri 另存命令', async () => {
    isTauriMock.mockReturnValue(true)
    saveExportFileMock.mockResolvedValue(true)

    await exportSaveData(saveData)

    expect(saveExportFileMock).toHaveBeenCalledOnce()
    const [fileName, contents] = saveExportFileMock.mock.calls[0]
    expect(fileName).toMatch(/^maplebuilding-save-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/)
    expect(JSON.parse(contents)).toEqual(saveData)
  })

  it('網頁版以瀏覽器下載同格式 JSON，不呼叫 Tauri', async () => {
    isTauriMock.mockReturnValue(false)
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:maplecombat-save')
    const revokeObjectURL = vi.fn<(url: string) => void>()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    let clickedDownload = ''
    let clickedHref = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clickedDownload = this.download
      clickedHref = this.href
    })

    await exportSaveData(saveData)

    expect(saveExportFileMock).not.toHaveBeenCalled()
    expect(createObjectURL).toHaveBeenCalledOnce()
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toBe('application/json;charset=utf-8')
    expect(await blob.text()).toContain('"baseMain": "123"')
    expect(clickedDownload).toMatch(
      /^maplebuilding-save-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/,
    )
    expect(clickedHref).toBe('blob:maplecombat-save')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:maplecombat-save')
  })
})
