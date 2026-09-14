import { LogicalSize, currentMonitor, getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '@/services/tauri'

const WINDOW_SIZE_STORAGE_KEY = 'desktopWindowSizeV2'
const WINDOW_EDGE_MARGIN = 24
const MIN_WIDTH = 580
const MIN_HEIGHT = 520
// 這四個只決定「第一次開啟時的預設大小」，不是可調整範圍的上限。
// 上限交給螢幕工作區，視窗才拉得動（MapleBuilding 的裝備格與製作台需要寬度）。
const DEFAULT_MIN_WIDTH = 1100
const DEFAULT_MIN_HEIGHT = 760
const DEFAULT_MAX_WIDTH = 1600
const DEFAULT_MAX_HEIGHT = 1200

export interface DesktopWindowSize {
  width: number
  height: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function validSize(value: unknown): value is DesktopWindowSize {
  if (!value || typeof value !== 'object') return false
  const size = value as Partial<DesktopWindowSize>
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    Number(size.width) > 0 &&
    Number(size.height) > 0
  )
}

export function resolveDesktopWindowSize(
  workArea: DesktopWindowSize,
  savedSize?: DesktopWindowSize,
): DesktopWindowSize {
  const availableWidth = Math.max(MIN_WIDTH, Math.floor(workArea.width - WINDOW_EDGE_MARGIN))
  const availableHeight = Math.max(MIN_HEIGHT, Math.floor(workArea.height - WINDOW_EDGE_MARGIN))

  if (savedSize) {
    return {
      width: clamp(Math.round(savedSize.width), MIN_WIDTH, availableWidth),
      height: clamp(Math.round(savedSize.height), MIN_HEIGHT, availableHeight),
    }
  }

  const defaultMinWidth = Math.min(DEFAULT_MIN_WIDTH, availableWidth)
  const defaultMinHeight = Math.min(DEFAULT_MIN_HEIGHT, availableHeight)
  const defaultMaxWidth = Math.min(DEFAULT_MAX_WIDTH, availableWidth)
  const defaultMaxHeight = Math.min(DEFAULT_MAX_HEIGHT, availableHeight)

  return {
    width: clamp(Math.round(workArea.width * 0.66), defaultMinWidth, defaultMaxWidth),
    height: clamp(Math.round(workArea.height * 0.88), defaultMinHeight, defaultMaxHeight),
  }
}

function readSavedSize(): DesktopWindowSize | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(WINDOW_SIZE_STORAGE_KEY) || 'null')
    return validSize(value) ? value : undefined
  } catch {
    return undefined
  }
}

function saveSize(size: DesktopWindowSize): void {
  localStorage.setItem(WINDOW_SIZE_STORAGE_KEY, JSON.stringify(size))
}

export async function setupDesktopWindow(): Promise<void> {
  if (!isTauri()) return

  try {
    const appWindow = getCurrentWindow()
    const monitor = await currentMonitor()
    if (!monitor) return

    const workArea = {
      width: monitor.workArea.size.width / monitor.scaleFactor,
      height: monitor.workArea.size.height / monitor.scaleFactor,
    }
    const size = resolveDesktopWindowSize(workArea, readSavedSize())

    await appWindow.setSize(new LogicalSize(size.width, size.height))
    await appWindow.center()

    let latestSize: DesktopWindowSize | undefined
    let saveTimer: ReturnType<typeof setTimeout> | undefined

    const persistLatestSize = (): void => {
      if (!latestSize) return
      saveSize(latestSize)
      latestSize = undefined
    }

    await appWindow.onResized(async ({ payload }) => {
      if (await appWindow.isMaximized()) return

      const scaleFactor = await appWindow.scaleFactor()
      latestSize = {
        width: Math.round(payload.width / scaleFactor),
        height: Math.round(payload.height / scaleFactor),
      }

      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(persistLatestSize, 250)
    })

    window.addEventListener('beforeunload', persistLatestSize, { once: true })
  } catch (error) {
    console.warn('Unable to restore desktop window size.', error)
  }
}
