<script setup lang="ts">
// 總覽：同步裝備 ＋ 角色資料 ＋ 萌獸 併成一頁。
//
// 為什麼合併：這三頁是同一條動線的三段 —— 同步回來、看數字對不對、確認萌獸 ——
// 卻各自是一個分頁，每次都要切三次。而且同步裝備與角色資料各畫一張角色卡，
// 內容有一半重疊。實測三頁分別是 857 / 1202 / 334px，合起來一頁捲得完。
//
// 為什麼不連製作台也一起合：製作是另一條動線（挑底 → 疊卷軸 → 存進物品欄），
// 要反覆操作。塞在同一頁的尾巴，每次做一件都得先捲兩千像素。

import { onMounted, watch } from 'vue'
import EquipmentSetView from './EquipmentSetView.vue'
import CharacterView from './CharacterView.vue'
import FamiliarView from './FamiliarView.vue'
import { useAnchorNav } from '../composables/useAnchorNav'
import { useDashboardStore } from '../stores/dashboard'

const SECTIONS = ['mb-sync', 'mb-character', 'mb-familiar'] as const

const dashboard = useDashboardStore()
const nav = useAnchorNav(SECTIONS)

// 捲動時把「現在在哪一段」回報給分頁列，讓它同時當目錄用
watch(nav.current, (id) => {
  dashboard.current = id
})

/** 消化分頁列的捲動請求。放在 nextTick 之後：切 view 的當下區塊還沒掛上 DOM */
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
    <section id="mb-sync" class="mb-dash-section">
      <EquipmentSetView />
    </section>

    <section id="mb-character" class="mb-dash-section">
      <CharacterView embedded />
    </section>

    <section id="mb-familiar" class="mb-dash-section">
      <FamiliarView />
    </section>
  </div>
</template>

<style scoped>
.mb-dash {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* scroll-margin-top 是給瀏覽器自己的錨點跳轉用的備援；
   我們的 scrollTo 已經扣掉工具列高度，但鍵盤聚焦也會捲，那條路徑走這裡 */
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
