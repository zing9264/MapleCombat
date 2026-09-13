import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { applyDensity } from '@/composables/useDensity'
import { applyCompactTheme } from '@/composables/useTheme'
import { setupAutoZoom } from '@/composables/useAutoZoom'
import { setupDesktopWindow } from '@/services/desktopWindow'
import { initDataFile } from '@/building/services/dataFile'

// 樣式載入順序固定（影響 CSS 覆寫優先級）
import '@/styles/base.css'
import '@/styles/layout.css'
import '@/styles/equipment.css'
import '@/styles/calculator.css'
import '@/styles/buffs.css'
import '@/styles/theme-web.css'
import '@/styles/density.css'
// 桌面緊湊版主題（必須最後載入，覆寫上方所有 :root 變數）
import '@/styles/compact-desktop.css'
// MapleBuilding 自有樣式（必須排在 compact-desktop.css 之後才蓋得過去）
import '@/building/styles/building.css'

applyDensity()
applyCompactTheme()

async function bootstrap(): Promise<void> {
  // 桌面版：先把資料檔灌進 localStorage 再建立 store。
  // store 在建立當下就會讀 localStorage，順序顛倒就會拿到舊資料。
  if (await initDataFile()) {
    // 上面那兩個設定在模組載入時已讀過一次 localStorage，資料換掉了要重套
    applyDensity()
    applyCompactTheme()
  }

  await setupDesktopWindow()
  setupAutoZoom()

  const app = createApp(App)
  app.use(createPinia())
  app.mount('#app')
}

void bootstrap()
