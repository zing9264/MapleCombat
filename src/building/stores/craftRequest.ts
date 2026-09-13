// 「做一件這個部位的裝備」的轉交狀態。
//
// 傳的是**部位**而不是某一件裝備：玩家要的是「看到所有手套的底（永恆、神秘、
// 航海…）再自己挑」，直接鎖定身上那件反而少了挑選這一步。
//
// 只是兩個分頁之間傳一個字串，不需要存檔 —— 所以不寫進 localStorage。
// 做成 store 而不是 props：裝備變更與製作台是平行的分頁，沒有父子關係可以傳。

import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'

export const useCraftRequestStore = defineStore('buildingCraftRequest', () => {
  /** 要預先篩選的部位；null 代表沒有待處理的請求 */
  const part = ref<string | null>(null)

  function request(name: string): void {
    part.value = name
  }

  /** 取走並清掉 —— 只該消費一次，不然每次切回製作台都會重設玩家當下的篩選 */
  function take(): string | null {
    const value = part.value
    part.value = null
    return value
  }

  return { part, request, take }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCraftRequestStore, import.meta.hot))
}
