// NEXON API Key 的響應式狀態。
//
// 真正的儲存位置仍是 localStorage（nexonApi.ts 的 getApiKey() 直接讀它），
// 這個 store 只是讓「管理」選單裡的設定欄與各頁的同步按鈕能即時同步狀態。

import { defineStore } from 'pinia'
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
