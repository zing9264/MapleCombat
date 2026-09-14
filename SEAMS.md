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

### 存檔位置與 WebView2 設定檔（便攜版）

| 檔案                                              | 改動                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `src-tauri/src/lib.rs`                            | 存檔位置解析、三個 command、`pin_webview_data_dir()`                  |
| `src/components/layout/CompactToolbar.vue`        | import 一行 + `<DataLocationControl />` 一行（接在 ApiKeyControl 後） |
| `src/building/components/DataLocationControl.vue` | 自有元件                                                              |
| `tools/building/packPortable.mjs`                 | 自有打包腳本                                                          |

存檔位置的決定順序：**自訂路徑 → 執行檔旁邊 → `%APPDATA%`**。
預設放在執行檔旁邊，整個資料夾複製走就能帶著跑；寫不進去（Program Files）才退回
`%APPDATA%`。用「實際寫一個檔案測試」判斷，不看權限位元 —— Windows 上
UAC 虛擬化與防毒鎖定都會讓權限看起來正常卻寫不了，靜靜地存檔失敗最難查。

自訂路徑記在 `%APPDATA%\tw.maplebuilding.app\datadir.txt`，刻意不放執行檔旁邊：
「要存去哪」本身必須先讀得到，不能跟著它想指向的地方走。

#### `pin_webview_data_dir()` 為什麼非有不可

WebView2 以**應用程式識別碼**當 key，預設把 localStorage 放在
`%LOCALAPPDATA%\tw.maplebuilding.app\EBWebView`。這表示同一台機器上不管從哪個
資料夾啟動、甚至全新解壓的一份，讀到的都是**同一份 localStorage**。

實際踩過：全新解壓的空資料夾一開啟就長出 289KB 的 `mapledata.json`，
裡面有另一個安裝的角色資料與 API 金鑰 —— 因為 `initDataFile()` 看到「沒有檔案」
就拿當下的 localStorage 去建檔。便攜版的前提是「一個資料夾一份資料」，
所以在 `run()` 最前面把 `WEBVIEW2_USER_DATA_FOLDER` 指到執行檔旁邊的 `webview\`。

升級不會掉資料：`initDataFile()` 是**檔案優先**，webview 設定檔換新的之後
localStorage 是空的，但 `mapledata.json` 仍會被讀回來（實測 276,686 bytes 進出一致）。

#### 打包絕對不要手工做

`dataFile.ts` 的 `EXCLUDED_KEYS` 刻意留空（使用者要整台機器共用），所以快照裡
**有 API 金鑰、角色名、世界名、公會名與五組完整裝備**。手工 zip 等於把這些寄出去，
實際發生過三次。一律用：

```bash
npm run pack:portable
```

預設**不帶資料檔**。要帶自己的資料自己加 `--data`，腳本會剝掉憑證並把找到的
身分欄位印出來讓你有機會喊停。

---

### 寬視窗版面接縫

| 檔案                               | 改動                                                  |
| ---------------------------------- | ----------------------------------------------------- |
| `src/App.vue`                      | `.container` 加 `:data-view="ui.activeView"` 一個屬性 |
| `src/building/styles/building.css` | 夾上游三頁的寬度、分頁列換行、管理面板加寬            |

上游的計算機三頁照 **635px 設計寬** 排版（`composables/useAutoZoom.ts`：
`zoom = innerWidth / 635`，上限 1.5），`compact-desktop.css` 又把 `.container`
的 `max-width` 清成 `none` 讓內容恆滿寬。

原本 980 寬的視窗剛好成立：980 / 1.5 ≈ 653 ≈ 設計寬。視窗放寬之後 zoom 仍鎖在 1.5，
排版寬度變成 1067px（1600 視窗），同一排欄位被越拉越開 —— 看起來像跑版，
其實是設計寬的假設破了。

只夾 `characterInput` / `equipmentChange` / `valueConversion` 三頁；我們自己的分頁
本來就吃得下寬度，那正是把視窗放寬的理由。

**不要用 `layout.css` 裡的 `:has(#characterInputView.active)`** —— 那些 id 在現在的
`App.vue` 裡已經不存在，選擇器是死的（實測 `document.querySelectorAll('[id$="View"]')`
回空陣列）。

另外兩條同一批的修正：

- `.ct-tabs` 加 `flex-wrap: wrap`：分頁從 5 個變 10 個，980 寬時需要 727px 卻只有
  629px，最後兩個分頁會直接畫到「匯入／儲存」上面。
- `.ct-state-menu-panel` 從寫死的 154px 加寬到 280px：加了 API Key 與存檔位置之後
  內容要 197px，面板是 `right: 0` 定位，超出的部分會在視窗右緣被切掉。

---

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
