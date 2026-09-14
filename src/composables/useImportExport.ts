// 匯入/儲存檔案邏輯 — 供 CompactToolbar 使用。
import { ref } from 'vue'
import { useCharacterStore } from '@/stores/character'
import { exportSaveData, parseImportedData } from '@/services/saveData'
import { applyBuildingData, collectBuildingData } from '@/building/services/saveBundle'

export function useImportExport() {
  const store = useCharacterStore()
  const fileInput = ref<HTMLInputElement | null>(null)

  async function onExport() {
    try {
      // MapleBuilding 的資料（裝備組、戰鬥力基準、萌獸、物品欄、裝備庫）不在上游的
      // 存檔格式裡。少了它們，這個檔案看起來像完整備份卻只有一半 —— 那比沒有備份
      // 更危險，因為玩家會以為自己備份過了。
      await exportSaveData({ ...store.collectSaveData(), maplebuilding: collectBuildingData() })
    } catch (error) {
      alert(`儲存失敗：${error}`)
    }
  }

  function onImportFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files && input.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = parseImportedData(String(reader.result)) as {
          maplebuilding?: unknown
        }
        store.applySaveData(parsed)

        // MapleBuilding 的 store 是在建立當下讀 localStorage 的，寫完得整頁重載
        // 才會生效。與其一個一個補 reload 方法，不如直接重載 —— 匯入本來就是
        // 「整份換掉」的操作。
        if (applyBuildingData(parsed.maplebuilding)) {
          alert('資料匯入完成，重新載入以套用。')
          window.location.reload()
          return
        }
        alert('資料匯入完成')
      } catch (error) {
        alert(`匯入失敗：${(error as Error).message}`)
      } finally {
        input.value = ''
      }
    }
    reader.onerror = () => {
      alert('讀取檔案失敗，請再試一次。')
      input.value = ''
    }
    reader.readAsText(file)
  }

  return { fileInput, onExport, onImportFileChange }
}
