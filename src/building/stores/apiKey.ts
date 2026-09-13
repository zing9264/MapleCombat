// NEXON API Key 的響應式狀態。
//
// 真正的儲存位置仍是 localStorage（nexonApi.ts 的 getApiKey() 直接讀它），
// 這個 store 只是讓「管理」選單裡的設定欄與各頁的同步按鈕能即時同步狀態。

import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getApiKey, setApiKey } from '../services/nexonApi'

export const useApiKeyStore = defineStore('buildingApiKey', () => {
  const key = ref(getApiKey())

  const hasKey = computed(() => Boolean(key.value))
  const masked = computed(() =>
    key.value ? `${key.value.slice(0, 8)}${'•'.repeat(12)}${key.value.slice(-4)}` : '',
  )

  function set(value: string): void {
    setApiKey(value)
    key.value = getApiKey()
  }

  function clear(): void {
    set('')
  }

  return { key, hasKey, masked, set, clear }
})

// 開發時熱更新這個檔案會重新執行模組，但 Pinia 仍持有舊的 store 實例 ——
// 新程式讀新欄位就會讀到 undefined 而整頁當掉（實際發生過，還連帶把使用者
// 已經輸入的值洗掉）。掛上 acceptHMRUpdate 讓 store 跟著模組一起換。
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useApiKeyStore, import.meta.hot))
}
