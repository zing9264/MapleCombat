<script setup lang="ts">
// 「管理」選單裡的存檔位置。
//
// 為什麼要讓人看得見：資料存在哪本來是猜的 —— 預設在執行檔旁邊，但安裝到
// Program Files 時會退回 %APPDATA%。使用者不該靠猜，尤其要備份或搬到隨身碟時。

import { onMounted, ref } from 'vue'
import {
  getDataLocation,
  pickDataDir,
  setDataLocation,
  type DataLocation,
} from '../services/dataFile'

const location = ref<DataLocation | null>(null)
const error = ref('')
const busy = ref(false)

const SOURCE_LABEL: Record<DataLocation['source'], string> = {
  custom: '自訂位置',
  exe: '執行檔旁邊',
  appdata: '使用者資料夾',
}

async function refresh(): Promise<void> {
  try {
    location.value = await getDataLocation()
  } catch (cause) {
    error.value = (cause as Error).message
  }
}

async function change(): Promise<void> {
  error.value = ''
  busy.value = true
  try {
    const dir = await pickDataDir()
    if (dir) location.value = await setDataLocation(dir)
  } catch (cause) {
    // 後端在「目標已有存檔」時會擋下來，那個訊息要原樣讓使用者看到
    error.value = String((cause as Error).message ?? cause)
  } finally {
    busy.value = false
  }
}

async function reset(): Promise<void> {
  error.value = ''
  busy.value = true
  try {
    location.value = await setDataLocation(null)
  } catch (cause) {
    error.value = String((cause as Error).message ?? cause)
  } finally {
    busy.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div v-if="location" class="mb-datadir">
    <div class="mb-datadir-head">
      存檔位置
      <span class="mb-datadir-source">{{ SOURCE_LABEL[location.source] }}</span>
    </div>
    <div class="mb-datadir-path" :title="location.file">{{ location.file }}</div>
    <p v-if="!location.writable" class="mb-datadir-warn">
      這個資料夾現在寫不進去，存檔不會成功。請改一個位置。
    </p>
    <p v-if="error" class="mb-datadir-warn">{{ error }}</p>
    <div class="mb-datadir-actions">
      <button type="button" :disabled="busy" @click="change">變更…</button>
      <button v-if="location.source === 'custom'" type="button" :disabled="busy" @click="reset">
        恢復預設
      </button>
    </div>
  </div>
</template>

<style scoped>
.mb-datadir {
  padding: 6px 8px;
  border-top: 1px solid var(--border-color);
}

.mb-datadir-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.mb-datadir-source {
  font-weight: 400;
  opacity: 0.7;
}

/* 路徑可能很長；截斷並靠尾端顯示，檔名比磁碟機代號有用 */
.mb-datadir-path {
  /* 面板寬度是固定的，沒有 min-width:0 的話 nowrap 會把整個面板撐開 */
  min-width: 0;
  max-width: 100%;
  direction: rtl;
  overflow: hidden;
  margin: 2px 0 4px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.8;
}

.mb-datadir-warn {
  margin: 2px 0 4px;
  color: var(--danger-color, #d33);
}

.mb-datadir-actions {
  display: flex;
  gap: 4px;
}
</style>
