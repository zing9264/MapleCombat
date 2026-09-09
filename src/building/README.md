# src/building — 本專案自有程式碼

這個目錄是 MapleBuilding 相對於上游 [MapleCombat](https://github.com/centre173/MapleCombat)
新增的部分。**上游永遠不會碰到這裡的檔案**，所以 `git merge upstream/main` 不會在此產生衝突。

## 規則

1. **新功能一律放這裡。** 不要為了「跟現有的放一起比較整齊」而把新元件塞進 `src/components/`。
2. **CSS 只加不改。** 不要編輯 `src/styles/` 下的上游樣式表（共 8,000+ 行全域 CSS），
   改成在 `styles/building.css` 用後載入的優先級覆蓋。
3. **必要的接縫控制在 1–2 行**，並且記錄到根目錄的 `SEAMS.md`。
4. **大幅改寫上游元件時**，複製一份到 `components/` 改名使用，不要就地改。
   代價是之後要手動同步上游對該元件的修正，只在真的划算時才這樣做。

## 目錄

| 目錄          | 用途                                       |
| ------------- | ------------------------------------------ |
| `views/`      | 新頁面（裝備規劃、製作策略等）             |
| `core/`       | 新的計算與模擬邏輯（方塊成本、星力期望值） |
| `stores/`     | 新的 Pinia 狀態                            |
| `data/`       | 資料表（機率表、裝備資料、欄位擴充）       |
| `services/`   | 外部服務（NEXON Open API client）          |
| `components/` | 自有元件，以及不得已 vendored 的上游元件   |
| `styles/`     | 覆蓋樣式                                   |

## 不要放這裡的東西

上游既有功能的修正。那些應該直接改上游檔案並記錄到 `SEAMS.md`，
或是往上游送 PR — 修好的計算邏輯回饋回去，對雙方都好。
