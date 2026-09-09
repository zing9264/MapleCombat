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

### 分頁接縫

新增分頁最少要動三處上游檔案，每處一到兩行。目前已加入「裝備組」分頁：

| 檔案                                       | 改動                                                           |
| ------------------------------------------ | -------------------------------------------------------------- |
| `src/stores/ui.ts`                         | `ViewKey` 型別與 `VALID_VIEWS` 各加 `'equipmentSets'`          |
| `src/components/layout/CompactToolbar.vue` | `tabs` 陣列加一列 `{ view: 'equipmentSets', label: '裝備組' }` |
| `src/App.vue`                              | import 一行 + `<EquipmentSetView v-if="…" />` 一行             |

之後再加分頁就照同樣三個位置擴充。

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
