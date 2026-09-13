// 「拿這一格的底去製作」的轉交狀態。
//
// 只是兩個分頁之間傳一個底的名稱，不需要存檔 —— 所以不寫進 localStorage。
// 做成 store 而不是 props：裝備變更與製作台是平行的分頁，沒有父子關係可以傳。

import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'

export const useCraftRequestStore = defineStore('buildingCraftRequest', () => {
  /** 要預先挑好的底（裝備庫裡的名稱）；null 代表沒有待處理的請求 */
  const baseName = ref<string | null>(null)

  function request(name: string): void {
    baseName.value = name
  }

  /** 取走並清掉 —— 只該被消費一次，不然每次切回製作台都會重設玩家的挑選 */
  function take(): string | null {
    const name = baseName.value
    baseName.value = null
    return name
  }

  return { baseName, request, take }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCraftRequestStore, import.meta.hot))
}
