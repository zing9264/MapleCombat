<script setup lang="ts">
// 製作：裝備庫 ＋ 製作台 ＋ 物品欄 併成一頁。
//
// 這三頁是一條動線的三段 —— 挑底、疊上卷軸星力潛能、存進物品欄 —— 而且
// 實測分別只有 471 / 337 / 79px。物品欄 79px 自己佔一個分頁，點進去只為了看
// 一行字，那是最沒有道理的一次切頁。

import { onMounted, watch } from 'vue'
import ItemLibraryView from './ItemLibraryView.vue'
import WorkbenchView from './WorkbenchView.vue'
import InventoryView from './InventoryView.vue'
import { useAnchorNav } from '../composables/useAnchorNav'
import { useDashboardStore } from '../stores/dashboard'

const SECTIONS = ['mb-library', 'mb-workbench', 'mb-inventory'] as const

const dashboard = useDashboardStore()
const nav = useAnchorNav(SECTIONS)

watch(nav.current, (id) => {
  dashboard.current = id
})

function flush(): void {
  const id = dashboard.consume()
  if (!id) {
    // 沒有請求就給分頁列一個初始高亮，不然剛進來沒有任何標籤是亮的
    dashboard.current = nav.current.value
    return
  }
  // 這裡要自己寫一次 current：最後一段很短時捲不到它（頁面高度不夠），
  // IntersectionObserver 永遠不會把它標成「現在在看」，
  // 分頁列就會停在上一個標籤上 —— 實際踩過（點製作台，亮的卻是裝備庫）。
  dashboard.current = id
  requestAnimationFrame(() => nav.scrollTo(id))
}

onMounted(flush)
watch(() => dashboard.pending, flush)
</script>

<template>
  <div class="mb-dash">
    <section id="mb-library" class="mb-dash-section">
      <ItemLibraryView />
    </section>

    <section id="mb-workbench" class="mb-dash-section">
      <WorkbenchView />
    </section>

    <section id="mb-inventory" class="mb-dash-section">
      <InventoryView />
    </section>
  </div>
</template>

<style scoped>
.mb-dash {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mb-dash-section {
  scroll-margin-top: 64px;
}

/*
 * 最後一段撐滿一個視窗高。
 *
 * 不這樣做的話整頁不夠高，倒數幾段根本捲不到頂端 —— 點「製作台」實際會停在
 * 頁面底部，分頁列亮的是「物品欄」，跟使用者點的東西對不上（實際踩過）。
 * 底部多出來的空白是這種長捲頁面的常態，比導覽對不準好。
 */
.mb-dash-section:last-child {
  min-height: calc(100vh - 64px);
}
</style>
