<script setup lang="ts">
// 製作台：從裝備庫挑一個底，往上疊四層強化，存進物品欄。
//
// 四層對應 API 的四個欄位（實測逐數字吻合）：
//   白 base ＝ item_base_option、紫 etc ＝ 卷軸、黃 starforce ＝ 星力、藍綠 add ＝ 星火
// 成品資料與 API 抓下來的裝備同形，換裝比較引擎不需區分真實／自製。
import { computed, onMounted, reactive, ref } from 'vue'
import { useItemLibraryStore, type BaseItem } from '../stores/itemLibrary'
import { normalizeLayer, useInventoryStore, type AppliedScroll } from '../stores/inventory'
import { expectedOption, getScroll, scrollCategoryOf, scrollsFor } from '../data/scrolls'
import {
  computeStarforce,
  gearKindOf,
  inferItemJob,
  jobCategoryFromMainStat,
  maxStarFor,
  partGainsMaxHp,
  type NumericOption,
} from '../core/starforce'
import {
  FLAME_TYPE_LABELS,
  MAX_FLAME_LINES,
  flameValue,
  sumFlames,
  supportsFlameType,
  type FlameContext,
  type FlameGrade,
  type FlameLine,
} from '../core/flame'
import { useEquipmentSetsStore } from '../stores/equipmentSets'
import { getJobStatLabelsByName } from '@/data/jobs'
import {
  POTENTIAL_RANKS,
  RANK_LABELS,
  hasPotential,
  potentialLines,
  type PotentialRank,
  type PotentialSlot,
} from '../data/potentials'
import { subcategoryOf } from '../data/partSubcategory'
import { canFlame } from '../data/flameParts'
import { HAMMER_OPTIONS, expectedHammers } from '../data/hammer'
import { useCraftRequestStore } from '../stores/craftRequest'

const library = useItemLibraryStore()
const inventory = useInventoryStore()
const sets = useEquipmentSetsStore()
const craftRequest = useCraftRequestStore()

/** 星力的主副屬性依角色職業而定；沒有同步過的話預設戰士 */
const jobCategory = computed(() =>
  jobCategoryFromMainStat(getJobStatLabelsByName(sets.active?.data?.job ?? '').main),
)

// ── 挑底 ────────────────────────────────────────────
const keyword = ref('')
const partFilter = ref('')
const baseName = ref('')
const base = computed<BaseItem | null>(() => library.items[baseName.value] ?? null)

const candidates = computed(() => {
  const kw = keyword.value.trim()
  return library.all.filter(
    (i) =>
      (!partFilter.value || i.part === partFilter.value) &&
      (!kw || i.name.includes(kw) || i.sets.some((s) => s.includes(kw))),
  )
})

function pickBase(name: string): void {
  baseName.value = name
  scrolls.splice(0)
  clearManualEtc()
  scrollMode.value = 'scrolls'
  flames.splice(0)
  starCount.value = 0
  bossReward.value = false
  itemName.value = ''
  potentials.splice(0, 3, '', '', '')
  additionalPotentials.splice(0, 3, '', '', '')
  potRank.value = 'legendary'
  addPotRank.value = 'legendary'
  hammer.value = 0
}

/** 部位是不是武器 —— 卷軸分類已經判斷過，直接沿用 */
const isWeaponPart = computed(
  () =>
    base.value !== null &&
    scrollCategoryOf(base.value.part) === '武器' &&
    base.value.part !== '機器心臟',
)

// ── 卷軸層 ──────────────────────────────────────────
const scrolls = reactive<AppliedScroll[]>([])
const scrollChoice = ref('')

const scrollOptions = computed(() =>
  base.value ? scrollsFor(base.value.part, base.value.level) : [],
)
const scrollCategory = computed(() => (base.value ? scrollCategoryOf(base.value.part) : null))
/**
 * 白金鐵鎚加開的格數（0~5）。黃金鐵鎚已從遊戲移除，所以只給白金。
 *
 * 底的格數本身已經在收錄時扣掉鐵鎚還原成原始值（見 core/scrollSlots.ts），
 * 所以這裡是單純的「我要敲幾次」，不是校正歪掉的資料。
 */
const hammer = ref(0)

const scrollSlots = computed(() => (base.value?.scrollSlots ?? 0) + hammer.value)

/** 敲到這個次數的成功率與期望鐵鎚成本，順便讓玩家知道自己在賭什麼 */
const hammerCost = computed(() => HAMMER_OPTIONS[hammer.value])
const scrollsUsed = computed(() => scrolls.reduce((n, s) => n + s.count, 0))
const scrollsLeft = computed(() => Math.max(0, scrollSlots.value - scrollsUsed.value))

function addScroll(): void {
  if (!scrollChoice.value || scrollsLeft.value <= 0) return
  const existing = scrolls.find((s) => s.scrollId === scrollChoice.value)
  if (existing) existing.count += 1
  else scrolls.push({ scrollId: scrollChoice.value, count: 1 })
}

function removeScroll(scrollId: string): void {
  const index = scrolls.findIndex((s) => s.scrollId === scrollId)
  if (index === -1) return
  scrolls[index].count -= 1
  if (scrolls[index].count <= 0) scrolls.splice(index, 1)
}

/** 卷軸層合計（期望值） */
/**
 * 卷軸層有兩種輸入方式。
 *
 * 疊卷軸是從零做一件；直接輸入是照抄別人已經做好的成品 —— 拍賣場上看到一件
 * 想試算換上去差多少，一張一張回推當初上了什麼卷根本不可能，而且隨機卷本來就
 * 只知道結果不知道過程。兩種都留著，不要逼玩家用不合用的那種。
 */
type ScrollMode = 'scrolls' | 'manual'
const scrollMode = ref<ScrollMode>('scrolls')

/** 直接輸入模式下的卷軸層數值（API 的底線命名，與四層其他資料同形） */
const manualEtc = reactive<Record<string, number>>({})

function onManualEtc(key: string, event: Event): void {
  manualEtc[key] = Number((event.target as HTMLInputElement).value) || 0
}

function clearManualEtc(): void {
  for (const key of Object.keys(manualEtc)) delete manualEtc[key]
}

const etcFromScrolls = computed<Record<string, number>>(() => {
  const total: Record<string, number> = {}
  for (const applied of scrolls) {
    const def = getScroll(applied.scrollId)
    if (!def) continue
    for (const [key, value] of Object.entries(expectedOption(def))) {
      total[key] = (total[key] ?? 0) + value * applied.count
    }
  }
  return total
})

const etc = computed<Record<string, number>>(() => {
  if (scrollMode.value === 'scrolls') return etcFromScrolls.value
  // 0 的欄位不要留在資料裡，不然預覽會多出一堆 +0 的列
  return Object.fromEntries(Object.entries(manualEtc).filter(([, value]) => value !== 0))
})

const scrollCost = computed(() =>
  scrolls.reduce((sum, s) => sum + (getScroll(s.scrollId)?.referencePrice ?? 0) * s.count, 0),
)

// ── 星力層 ──────────────────────────────────────────
const starCount = ref(0)
const maxStar = computed(() => (base.value ? maxStarFor(base.value.level) : 0))

const numericBase = computed<NumericOption>(() => {
  const b = base.value?.base
  const n = (v: unknown) => Number(v ?? 0)
  return b
    ? {
        str: n(b.str),
        dex: n(b.dex),
        int: n(b.int),
        luk: n(b.luk),
        attackPower: n(b.attack_power),
        magicPower: n(b.magic_power),
        armor: n(b.armor),
        maxHp: n(b.max_hp),
        maxMp: n(b.max_mp),
      }
    : {}
})

const starforce = computed<NumericOption>(() => {
  if (!base.value || starCount.value <= 0) return {}
  return computeStarforce({
    reqLevel: base.value.level,
    star: starCount.value,
    job: inferItemJob(base.value.part, jobCategory.value),
    kind: gearKindOf(base.value.part, isWeaponPart.value),
    gainsMaxHp: partGainsMaxHp(base.value.part),
    base: numericBase.value,
    // 卷軸層是底線命名，星力計算讀駝峰；不轉的話武器 15 星以下會讀不到卷軸魔攻
    upgrade: normalizeLayer(etc.value),
  })
})

/**
 * 從「裝備變更」點「做一件○○」過來時，把底的清單篩成那個部位，讓玩家自己挑。
 *
 * 用 take() 取走而不是讀值：請求只該消費一次，不然每次切回製作台都會把玩家
 * 當下的篩選重設回去。
 */
onMounted(() => {
  const requested = craftRequest.take()
  if (!requested) return
  partFilter.value = requested
  keyword.value = ''
  baseName.value = ''
})

// ── 星火層 ──────────────────────────────────────────
const flames = reactive<FlameLine[]>([])
const bossReward = ref(false)

const flameCtx = computed<FlameContext>(() => ({
  reqLevel: base.value?.level ?? 0,
  isWeapon: isWeaponPart.value,
  bossReward: bossReward.value,
  baseAttackPower: Number(base.value?.base.attack_power ?? 0),
  baseMagicPower: Number(base.value?.base.magic_power ?? 0),
}))

const flameTypeOptions = computed(() =>
  FLAME_TYPE_LABELS.filter(([type]) => supportsFlameType(type, flameCtx.value)),
)

const add = computed<NumericOption>(() => sumFlames(flames, flameCtx.value))

function addFlame(): void {
  if (flames.length >= MAX_FLAME_LINES) return
  flames.push({ type: 'int', grade: 1 })
}

function removeFlame(index: number): void {
  flames.splice(index, 1)
}

function flamePreview(line: FlameLine): number {
  return flameValue(line.type, line.grade, flameCtx.value)
}

const FLAME_GRADES: FlameGrade[] = [1, 2, 3, 4, 5, 6, 7]

// ── 潛能 ────────────────────────────────────────────
//
// 改成下拉而不是讓玩家自己打：同一條詞條在不同裝備等級數值不同
// （INT% 151 級以上 13%、以下 12%），手打遲早會錯，而且打錯沒人會發現。
//
// 主潛能與附加潛能是兩組不同的詞條池，所以階級也各選各的。
const potentials = reactive(['', '', ''])
const additionalPotentials = reactive(['', '', ''])
const potRank = ref<PotentialRank>('legendary')
const addPotRank = ref<PotentialRank>('legendary')

/** 這件裝備在潛能表上的分類；null 代表遊戲裡就沒有潛能欄 */
const subcategory = computed(() =>
  base.value ? subcategoryOf(base.value.part, base.value.name) : null,
)

const showMainPot = computed(() => !!subcategory.value && hasPotential(subcategory.value, 'main'))
const showAddPot = computed(
  () => !!subcategory.value && hasPotential(subcategory.value, 'additional'),
)

/**
 * 星火有自己的部位表，不能借用潛能那份：口袋道具有星火卻沒有潛能欄，
 * 機器心臟有潛能卻不能上星火（遊戲內 tooltip 寫「追加屬性 無法強化」）。
 */
const showFlame = computed(() => !!base.value && canFlame(base.value.part))

/**
 * 某一條可選的詞條。
 *
 * 第 1 條只會是該階級；第 2、3 條有機率掉一階，所以多給低一階那組
 * （機率多少不重要，玩家是照自己實際的裝備挑）。
 */
function lineOptions(slot: PotentialSlot, rank: PotentialRank, index: number) {
  const sub = subcategory.value
  const level = base.value?.level ?? 0
  if (!sub) return []

  const ranks: PotentialRank[] = [rank]
  if (index > 0) {
    const lower = POTENTIAL_RANKS[POTENTIAL_RANKS.indexOf(rank) - 1]
    if (lower) ranks.push(lower)
  }

  return ranks.map((r) => ({
    label: RANK_LABELS[r],
    lines: potentialLines(sub, level, r, slot),
  }))
}

// ── 成品 ────────────────────────────────────────────
const itemName = ref('')

const STAT_LABELS: ReadonlyArray<[string, string]> = [
  ['str', 'STR'],
  ['dex', 'DEX'],
  ['int', 'INT'],
  ['luk', 'LUK'],
  ['max_hp', 'MaxHP'],
  ['max_mp', 'MaxMP'],
  ['attack_power', '攻擊力'],
  ['magic_power', '魔法攻擊力'],
  ['armor', '防禦力'],
  ['boss_damage', 'BOSS傷害'],
  ['ignore_monster_armor', '無視防禦'],
  ['all_stat', '全屬性'],
]

interface PreviewRow {
  label: string
  total: string
  base: number
  star: number
  etc: number
  add: number
}

/** 星力／星火用駝峰命名，對照到 API 的底線命名 */
const CAMEL_KEY: Record<string, keyof NumericOption> = {
  str: 'str',
  dex: 'dex',
  int: 'int',
  luk: 'luk',
  max_hp: 'maxHp',
  max_mp: 'maxMp',
  attack_power: 'attackPower',
  magic_power: 'magicPower',
  armor: 'armor',
}

/** 仿遊戲 tooltip：合計（白 +黃 +紫 +藍綠） */
const preview = computed<PreviewRow[]>(() => {
  if (!base.value) return []
  return STAT_LABELS.map(([key, label]) => {
    const camel = CAMEL_KEY[key]
    const b = Number(base.value?.base[key as keyof BaseItem['base']] ?? 0)
    const e = etc.value[key] ?? 0
    const st = camel ? (starforce.value[camel] ?? 0) : 0
    const ad = camel ? (add.value[camel] ?? 0) : (add.value[key as keyof NumericOption] ?? 0)
    return { label, base: b, star: st, etc: e, add: ad, total: fmt(b + e + st + ad) }
  }).filter((row) => row.base || row.etc || row.star || row.add)
})

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function formatMeso(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)} 億`
  if (n >= 10_000) return `${Math.round(n / 10_000)} 萬`
  return String(n)
}

function save(): void {
  if (!base.value) return
  inventory.add({
    name: itemName.value.trim() || base.value.name,
    baseName: base.value.name,
    part: base.value.part,
    level: base.value.level,
    icon: base.value.icon,
    sets: base.value.sets,
    base: base.value.base,
    etc: { ...etc.value },
    starforce: { ...starforce.value } as Record<string, number>,
    add: { ...add.value } as Record<string, number>,
    // 直接輸入模式沒有「上了哪幾張卷」這回事，存空的才不會誤導
    scrolls: scrollMode.value === 'scrolls' ? scrolls.map((s) => ({ ...s })) : [],
    starCount: starCount.value,
    flameTier: flames.reduce((max, f) => Math.max(max, f.grade), 0),
    potentials: potentials.filter(Boolean),
    additionalPotentials: additionalPotentials.filter(Boolean),
  })
  saved.value = `已存入物品欄：${itemName.value.trim() || base.value.name}`
}
const saved = ref('')
</script>

<template>
  <div class="mb-wb">
    <!-- 1. 挑底 -->
    <section class="mb-card">
      <h3 class="mb-card-title">
        1. 從裝備庫挑一個底
        <span class="mb-badge">{{ library.count }} 件可選</span>
      </h3>
      <div v-if="!library.count" class="mb-empty">裝備庫是空的。先到「裝備組」同步一次。</div>
      <template v-else>
        <div class="mb-row">
          <input v-model="keyword" class="mb-input mb-input--grow" placeholder="搜尋名稱或套裝" />
          <select v-model="partFilter" class="mb-input">
            <option value="">全部部位</option>
            <option v-for="part in library.parts" :key="part" :value="part">{{ part }}</option>
          </select>
        </div>
        <ul class="mb-pick-list">
          <li
            v-for="item in candidates"
            :key="item.name"
            class="mb-pick"
            :class="{ active: item.name === baseName }"
            @click="pickBase(item.name)"
          >
            <img v-if="item.icon" class="mb-thumb" :src="item.icon" alt="" loading="lazy" />
            <span v-else class="mb-thumb mb-thumb--empty"></span>
            <span class="mb-pick-part">{{ item.part }}</span>
            <span class="mb-pick-name">{{ item.name }}</span>
            <small>Lv.{{ item.level }} · 卷軸 {{ item.scrollSlots }} 格</small>
          </li>
        </ul>
      </template>
    </section>

    <template v-if="base">
      <!-- 2. 卷軸 -->
      <section class="mb-card">
        <h3 class="mb-card-title">
          2. 卷軸
          <span class="mb-badge">
            <template v-if="scrollMode === 'manual'">直接輸入卷軸層數值</template>
            <template v-else>
              {{ scrollCategory ?? '此部位無法上卷' }} · 已用 {{ scrollsUsed }} /
              {{ scrollSlots }} 格
            </template>
          </span>
        </h3>
        <label v-if="scrollMode === 'scrolls'" class="mb-row mb-slot-bonus">
          <span>白金鐵鎚</span>
          <select v-model.number="hammer" class="mb-input mb-slot-bonus-input">
            <option v-for="opt in HAMMER_OPTIONS" :key="opt.count" :value="opt.count">
              {{ opt.label }}
            </option>
          </select>
          <small v-if="hammer">
            一路成功 {{ (hammerCost.chance * 100).toFixed(4) }}%，期望要
            {{ Math.round(expectedHammers(hammer)) }} 支（約
            {{ Math.round(hammerCost.expectedCost / 100000000) }} 億）
          </small>
          <small v-else>失敗不會消耗強化次數，只消耗鐵鎚本身。</small>
        </label>

        <div class="mb-row mb-scroll-mode">
          <button
            class="mb-btn"
            :class="{ 'mb-btn--primary': scrollMode === 'scrolls' }"
            @click="scrollMode = 'scrolls'"
          >
            疊卷軸
          </button>
          <button
            class="mb-btn"
            :class="{ 'mb-btn--primary': scrollMode === 'manual' }"
            @click="scrollMode = 'manual'"
          >
            直接輸入數值
          </button>
          <small>要照抄別人做好的成品就用直接輸入 —— 隨機卷本來就看不出上了什麼。</small>
        </div>

        <template v-if="scrollMode === 'manual'">
          <div class="mb-etc-grid">
            <label v-for="[key, label] in STAT_LABELS" :key="key" class="mb-etc-cell">
              <span>{{ label }}</span>
              <input
                class="mb-input mb-etc-value"
                type="number"
                :value="manualEtc[key] ?? 0"
                @input="onManualEtc(key, $event)"
              />
            </label>
          </div>
          <p class="mb-hint">
            填的是<b>卷軸那一層</b>（遊戲 tooltip 括號裡的紫色數字），不是合計。
            星力與星火各有自己的區塊，不要重複填進來。
          </p>
        </template>

        <p v-else-if="!scrollSlots" class="mb-hint">
          這個基底沒有卷軸格數資料（舊版收錄）。到「裝備組」重新同步一次就會補上。
        </p>
        <p v-else-if="!scrollOptions.length" class="mb-hint">
          還沒有「{{ scrollCategory }}」類別的卷軸資料，等截圖補表。
        </p>
        <template v-else>
          <div class="mb-row">
            <select v-model="scrollChoice" class="mb-input mb-input--grow">
              <option value="">選擇卷軸</option>
              <option v-for="s in scrollOptions" :key="s.id" :value="s.id">
                {{ s.name }}
                <template v-if="s.referencePrice"
                  >（約 {{ formatMeso(s.referencePrice) }}）</template
                >
              </option>
            </select>
            <button
              class="mb-btn mb-btn--primary"
              :disabled="!scrollChoice || scrollsLeft <= 0"
              @click="addScroll"
            >
              +1 張
            </button>
          </div>
          <ul v-if="scrolls.length" class="mb-scroll-list">
            <li v-for="s in scrolls" :key="s.scrollId" class="mb-scroll">
              <span class="mb-scroll-name">{{ getScroll(s.scrollId)?.name }}</span>
              <span class="mb-scroll-count">× {{ s.count }}</span>
              <button class="mb-btn mb-btn--sm" @click="removeScroll(s.scrollId)">−1</button>
            </li>
          </ul>
          <p class="mb-hint">
            隨機卷（命運／星彩／救世）以期望值計算；卷軸參考價合計約
            <b>{{ formatMeso(scrollCost) }}</b> 楓幣。
          </p>
        </template>
      </section>

      <!-- 3. 星力 -->
      <section class="mb-card">
        <h3 class="mb-card-title">
          3. 星力
          <span class="mb-badge"
            >上限 {{ maxStar }} 星 · 職業 {{ sets.active?.data?.job ?? '未同步' }}</span
          >
        </h3>
        <div class="mb-row">
          <input v-model.number="starCount" type="range" min="0" :max="maxStar" class="mb-range" />
          <span class="mb-star-value">★ {{ starCount }}</span>
        </div>
        <p class="mb-hint">
          飾品與機器心臟是共用裝，四項屬性從 1 星就全加；防具武器只加該職業的主副屬性，其餘 16
          星後才加。
        </p>
      </section>

      <!-- 4. 星火 -->
      <section v-if="showFlame" class="mb-card">
        <h3 class="mb-card-title">
          4. 星火
          <span class="mb-badge">{{ flames.length }} / {{ MAX_FLAME_LINES }} 條</span>
        </h3>
        <label v-if="isWeaponPart" class="mb-check">
          <input v-model="bossReward" type="checkbox" />
          <span>BOSS 掉落武器（攻擊力星火係數完全不同）</span>
        </label>
        <ul v-if="flames.length" class="mb-flame-list">
          <li v-for="(line, i) in flames" :key="i" class="mb-flame">
            <select v-model="line.type" class="mb-input mb-input--grow">
              <option v-for="[type, label] in flameTypeOptions" :key="type" :value="type">
                {{ label }}
              </option>
            </select>
            <select v-model.number="line.grade" class="mb-input">
              <option v-for="g in FLAME_GRADES" :key="g" :value="g">{{ g }} 階</option>
            </select>
            <span class="mb-flame-value">+{{ flamePreview(line) }}</span>
            <button class="mb-btn mb-btn--sm" @click="removeFlame(i)">移除</button>
          </li>
        </ul>
        <div class="mb-row mb-flame-add">
          <button class="mb-btn" :disabled="flames.length >= MAX_FLAME_LINES" @click="addFlame">
            新增一條星火
          </button>
        </div>
      </section>

      <!-- 5. 潛能 -->
      <section v-if="showMainPot || showAddPot" class="mb-card">
        <h3 class="mb-card-title">5. 潛能</h3>
        <div class="mb-pot-grid">
          <div v-if="showMainPot" class="mb-pot-col">
            <label class="mb-pot-label">
              潛在能力
              <select v-model="potRank" class="mb-input mb-pot-rank">
                <option v-for="r in POTENTIAL_RANKS" :key="r" :value="r">
                  {{ RANK_LABELS[r] }}
                </option>
              </select>
            </label>
            <select
              v-for="(_, i) in potentials"
              :key="'p' + i"
              v-model="potentials[i]"
              class="mb-input"
            >
              <option value="">第 {{ i + 1 }} 行（空白）</option>
              <optgroup
                v-for="group in lineOptions('main', potRank, i)"
                :key="group.label"
                :label="group.label"
              >
                <option v-for="line in group.lines" :key="line.text" :value="line.text">
                  {{ line.text }}
                </option>
              </optgroup>
            </select>
          </div>
          <div v-if="showAddPot" class="mb-pot-col">
            <label class="mb-pot-label">
              附加潛在能力
              <select v-model="addPotRank" class="mb-input mb-pot-rank">
                <option v-for="r in POTENTIAL_RANKS" :key="r" :value="r">
                  {{ RANK_LABELS[r] }}
                </option>
              </select>
            </label>
            <select
              v-for="(_, i) in additionalPotentials"
              :key="'a' + i"
              v-model="additionalPotentials[i]"
              class="mb-input"
            >
              <option value="">第 {{ i + 1 }} 行（空白）</option>
              <optgroup
                v-for="group in lineOptions('additional', addPotRank, i)"
                :key="group.label"
                :label="group.label"
              >
                <option v-for="line in group.lines" :key="line.text" :value="line.text">
                  {{ line.text }}
                </option>
              </optgroup>
            </select>
          </div>
        </div>
        <p class="mb-hint">
          第 2、3 行有機率掉一階，所以也列了低一階的詞條。詞條清單依<b>部位與裝備等級</b>自動帶出。
        </p>
      </section>

      <!-- 預覽與存檔 -->
      <section class="mb-card">
        <h3 class="mb-card-title">
          {{ base.name }}
          <span class="mb-badge">{{ base.part }} · Lv.{{ base.level }}</span>
        </h3>
        <div class="mb-preview">
          <div v-for="row in preview" :key="row.label" class="mb-preview-row">
            <span class="mb-preview-label">{{ row.label }}</span>
            <span class="mb-preview-total">+{{ row.total }}</span>
            <span class="mb-preview-parts">
              (<span class="c-base">{{ row.base }}</span>
              <span v-if="row.star" class="c-star"> +{{ fmt(row.star) }}</span>
              <span v-if="row.etc" class="c-etc"> +{{ fmt(row.etc) }}</span>
              <span v-if="row.add" class="c-add"> +{{ fmt(row.add) }}</span
              >)
            </span>
          </div>
        </div>
        <div class="mb-row mb-save-row">
          <input
            v-model="itemName"
            class="mb-input mb-input--grow"
            :placeholder="`名稱（預設：${base.name}）`"
          />
          <button class="mb-btn mb-btn--primary" @click="save">存入物品欄</button>
        </div>
        <p v-if="saved" class="mb-hint">{{ saved }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.mb-wb {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0 24px;
}

.mb-save-row {
  margin-top: 8px;
}

.mb-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.mb-field .mb-input {
  width: 72px;
}

/* 圖示是 CDN 網址，清單可能有五百多列，交給瀏覽器 lazy load */
.mb-thumb {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  object-fit: contain;
  image-rendering: pixelated;
}

.mb-thumb--empty {
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
}

.mb-pick-list {
  max-height: 32vh;
  margin: 6px 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.mb-pick {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.mb-pick:hover {
  background: rgba(255, 255, 255, 0.05);
}

.mb-pick.active {
  background: rgba(255, 255, 255, 0.12);
}

.mb-pick-part {
  width: 78px;
  flex-shrink: 0;
  font-size: 11px;
  opacity: 0.6;
}

.mb-pick-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mb-pick small {
  font-size: 10px;
  opacity: 0.6;
}

.mb-scroll-mode {
  margin-bottom: 6px;
  gap: 6px;
}

.mb-scroll-mode small {
  font-size: 11px;
  opacity: 0.6;
}

/* 十二個欄位排成格線，比一長串輸入框好掃 */
.mb-etc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 4px 8px;
}

.mb-etc-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 11px;
}

.mb-etc-value {
  width: 72px;
  flex: 0 0 auto;
  text-align: right;
}

.mb-scroll-list {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}

.mb-scroll {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 12px;
}

.mb-scroll-name {
  flex: 1;
}

.mb-scroll-count {
  font-variant-numeric: tabular-nums;
}

.mb-pot-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.mb-pot-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mb-pot-rank {
  width: auto;
  min-width: 90px;
  margin-left: auto;
}

.mb-slot-bonus {
  margin-bottom: 6px;
  font-size: 11px;
  opacity: 0.8;
}

.mb-slot-bonus-input {
  width: 64px;
  text-align: right;
}

.mb-slot-bonus small {
  opacity: 0.7;
}

.mb-pot-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  opacity: 0.7;
}

.mb-pot-rank {
  width: auto;
  min-width: 84px;
  margin-left: auto;
}

/* 仿遊戲 tooltip：合計 (白 +紫 +黃 +藍綠) */
.mb-preview {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.mb-preview-row {
  display: flex;
  gap: 8px;
}

.mb-preview-label {
  width: 80px;
  opacity: 0.8;
}

.mb-preview-total {
  width: 60px;
  font-weight: 700;
}

.mb-preview-parts {
  opacity: 0.85;
}

.mb-range {
  flex: 1;
  min-width: 0;
}

.mb-star-value {
  width: 56px;
  color: #ffc857;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.mb-check {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 12px;
  cursor: pointer;
}

.mb-flame-list {
  margin: 0 0 6px;
  padding: 0;
  list-style: none;
}

.mb-flame {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
}

.mb-flame select {
  /* 上游全域樣式會把 select 設成 width:100%，兩個下拉互搶寬度，這裡明確指定 */
  width: auto;
}

.mb-flame select:first-child {
  flex: 1 1 auto;
  min-width: 120px;
}

.mb-flame select:nth-child(2) {
  flex: 0 0 72px;
  width: 72px;
}

.mb-flame-value {
  width: 52px;
  color: #7fe0d0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.mb-flame-add {
  margin-top: 4px;
}
</style>
