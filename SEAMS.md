# 接縫清單（Seams）

本專案 fork 自 [centre173/MapleCombat](https://github.com/centre173/MapleCombat)。
自有程式碼集中在 `src/building/`，上游不會碰到那裡，因此不會衝突。

這份清單記錄**所有被修改過的上游檔案**。合併上游時照這張表檢查即可，
不必每次重新考古。

```bash
git fetch upstream && git merge upstream/main
```

## 原則

1. 新功能一律放 `src/building/`，不要動上游檔案。
2. 非動不可時，把改動壓在 1–2 行，並登記到下表。
3. 樣式只在 `src/building/styles/building.css` 覆蓋，不要編輯 `src/styles/`
   下的 8,000+ 行上游 CSS。
4. 要大幅改寫某個上游元件時，複製一份到 `src/building/components/` 改名使用，
   並在下表註明「vendored」— 之後上游對該元件的修正需要手動同步。

---

## 目前的接縫

### 識別字串改名（MapleCombat → MapleBuilding）

上游每次改到這些檔案就可能衝突，但都是單行，解法一律是「保留我方版本」。

| 檔案                        | 改動                                          |
| --------------------------- | --------------------------------------------- |
| `package.json`              | `name` → `maplebuilding-app`                  |
| `src-tauri/Cargo.toml`      | `package.name`、`lib.name`、`description`     |
| `src-tauri/Cargo.lock`      | 本地套件名稱                                  |
| `src-tauri/src/main.rs`     | `maplebuilding_app_lib::run()`                |
| `src-tauri/src/lib.rs`      | 註解措辭                                      |
| `src-tauri/tauri.conf.json` | `productName`、`identifier`、視窗 `title`     |
| `index.html`                | `<title>`                                     |
| `src/stores/character.ts`   | `collectSaveData()` 的 `app: 'maplebuilding'` |
| `src/services/saveData.ts`  | 匯出檔名 `maplebuilding-save-*.json`          |
| `README.md`                 | 全文重寫                                      |

`identifier` 必須與上游不同，否則兩個版本在 Windows 上會互相覆蓋安裝。

### 樣式接縫

| 檔案          | 改動                                                                          |
| ------------- | ----------------------------------------------------------------------------- |
| `src/main.ts` | 於 `compact-desktop.css` 之後加一行 `import '@/building/styles/building.css'` |

順序不可調換：上游的 `compact-desktop.css` 會覆寫所有 `:root` 變數，
本專案的樣式必須排在它後面。

---

### 資料檔接縫（桌面版整台機器共用一份）

| 檔案                   | 改動                                                                    |
| ---------------------- | ----------------------------------------------------------------------- |
| `src/main.ts`          | import 一行 + `bootstrap()` 開頭 `await initDataFile()` 區塊            |
| `src-tauri/src/lib.rs` | 新增 `read_data_file` / `write_data_file` 兩個 command 並註冊到 handler |

`await initDataFile()` **必須排在 `createApp()` 之前**：Pinia store 在建立當下就會讀
localStorage，順序顛倒的話 store 會拿到舊資料，之後再被檔案覆寫也來不及了。

因為 `applyDensity()` / `applyCompactTheme()` 在模組載入時就讀過一次 localStorage，
資料被檔案換掉後要重套一次 —— 所以 `initDataFile()` 回傳 true 時會再呼叫它們。

瀏覽器版完全不受影響：`initDataFile()` 第一行就是 `if (!isTauri()) return false`，
沙箱也不允許網頁讀寫本機檔案。網頁版仍然是 localStorage，跨裝置只能靠匯入／儲存。

---

### 分頁接縫

新增分頁最少要動三處上游檔案，每處一到兩行。目前本專案的分頁有：
「角色資料」`character`、「裝備變更」`gearCompare`、「裝備組」`equipmentSets`、
「裝備庫」`itemLibrary`、「製作台」`workbench`、「萌獸」`familiar`、「物品欄」`inventory`。

| 檔案                                       | 改動                                                         |
| ------------------------------------------ | ------------------------------------------------------------ |
| `src/stores/ui.ts`                         | `ViewKey` 型別與 `VALID_VIEWS` 各加一個 view id              |
| `src/components/layout/CompactToolbar.vue` | `tabs` 陣列加一列 `{ view: 'character', label: '角色資料' }` |
| `src/App.vue`                              | import 一行 + `<CharacterView v-if="…" />` 一行              |

之後再加分頁就照同樣三個位置擴充。

`ui.ts` 的 `restoreView()` 對未知 id 會退回 `characterInput`，所以移除分頁不會讓
使用者卡在空白頁，但**新分頁一定要同時加進 `VALID_VIEWS`**，否則重新整理後會被踢回去。

---

### 分頁改名

| 檔案                                       | 改動                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `src/components/layout/CompactToolbar.vue` | 上游的「裝備變更」分頁改名為「手動調整」，「裝備變更」這個名稱讓給本專案的換裝比較頁 |
| `src/components/layout/CompactToolbar.vue` | 上游的「角色資料」分頁改名為「手動覆寫」，「角色資料」讓給本專案的自動同步面板       |

上游分頁的程式碼完全沒動，只改顯示名稱。玩家要手動輸入數值時仍然用它。

---

### 功能旗標（關掉上游功能而不刪程式碼）

`src/building/featureFlags.ts` 匯出的常數被上游檔案引用，用來隱藏上游功能的入口。
刪掉上游程式碼會讓合併很痛，用旗標關掉則零衝突、想恢復改一個值即可。

| 檔案                                       | 改動                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `src/components/layout/CompactToolbar.vue` | import 旗標一行 + `.ct-state-tabs` 加 `v-if="SHOW_STATE_SLOTS"`                 |
| `src/App.vue`                              | import 旗標一行 + 加權短路條件改成 `SHOW_STATE_SLOTS && slots.isWeightedActive` |

`SHOW_STATE_SLOTS = false` 隱藏上游的「狀態 1~5 ／ 加權」。兩處必須**同時**改：

- 只藏工具列按鈕的話，先前正停在加權狀態的使用者會被 `App.vue` 的短路困在加權頁出不來。
- 只藏 `.ct-state-tabs` 這一層，不要藏外層的 `.ct-state-row` —— **API Key 控制項在同一列的
  「管理」選單裡**，連坐藏掉就沒有地方貼金鑰了。

`stateSlots` store、加權頁與其計算邏輯全部保留，未來要恢復只要把旗標改回 `true`。

### 桌面視窗大小接縫

| 檔案                               | 改動                                                   |
| ---------------------------------- | ------------------------------------------------------ |
| `src/services/desktopWindow.ts`    | 放大預設值、移除寬度硬上限與 `setMaxSize`、儲存鍵改 V2 |
| `tests/unit/desktopWindow.spec.ts` | 期望值跟著改，並加一條寬螢幕迴歸測試                   |

上游把視窗鎖死在 **980×960**：`resolveDesktopWindowSize()` 內 `availableWidth`
取 `Math.min(DEFAULT_MAX_WIDTH, ...)`，`setupDesktopWindow()` 又呼叫
`setMaxSize(980, 960)`。這對上游那個單欄計算機夠用，但 MapleBuilding 的裝備格、
製作台與分頁列需要更寬。

**只改 `src-tauri/tauri.conf.json` 是沒有用的** —— 那裡的 `maxWidth` 拿掉之後，
前端仍然在啟動時重新鎖上。踩過一次：設定檔已經是 1280×900，實際視窗卻還是 996×999
（= 980+邊框 / 960+標題列）。而且 `setMaxSize` **不套用在全螢幕**，所以症狀是
「全螢幕正常、視窗化拉不動」，很容易誤判成設定檔沒生效。

要確認目前生效的上限，對視窗送 `WM_GETMINMAXINFO`（0x0024）讀 `ptMaxTrackSize`
比看設定檔可靠。

儲存鍵從 `desktopWindowSizeV1` 改成 `V2`，是為了讓舊版存下來的窄尺寸作廢一次；
不然升級後視窗還是開在 980 寬，看起來像沒修好。

---

## 尚未使用但已規劃的接縫

新增輸入欄位時：

| 檔案                      | 改動                                                                |
| ------------------------- | ------------------------------------------------------------------- |
| `src/constants/fields.ts` | 一行 `concat(buildingFieldDefs)`，欄位定義寫在 `src/building/data/` |

**不要**把新欄位直接插進 `fields.ts` 的 150 筆陣列中間 — 那是上游會持續增修的地方。

---

## 存檔相容性

上游的存檔 JSON 可直接匯入：`app` 欄位只寫不讀，匯入流程完全不驗證它。
`tests/unit/stores.spec.ts` 與 `tests/unit/saveData.spec.ts` 中刻意保留
`app: 'maplecombat'` 的輸入 fixture，作為這項相容性的回歸測試，請勿改成新名稱。
