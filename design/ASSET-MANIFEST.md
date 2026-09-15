# Implementation asset manifest

Independent Impeccable inventory, 2026-09-15. Reviewed `PRODUCT.md`, `IMPLEMENTATION-PLAN.md`, approved mocks 01–02, and new mocks 03–05. Scope: implementation media and fidelity; no application code or asset downloads performed. `DESIGN.md` was absent at inspection.

**Result:** no generated or sourced raster artwork is required by the inspected screens. All visible material is UI, typography, icons, or interactive data graphics. Mockup PNGs remain design references and must never become application backgrounds, cropped controls, or map tiles. Additional screens require the same inventory check when their mockups exist.

## Reference geometry

Measured source dimensions: `01-overview.png` and `02-map.png` are **1586 × 992**; `03-nodes.png`, `04-monitoring.png`, and `05-traffic.png` are **1584 × 993**. Use approved 01–02 for the shared shell and compare screenshots at matching viewport dimensions.

| Element | Commitment at approved reference size | Medium |
|---|---|---|
| Shell | Sidebar boundary x≈228; header bottom y≈50; main content begins x≈244–247. Navigation rows ≈44 px, active row ≈40 px with a 3 px mint left marker. | Semantic `aside`, `nav`, `header`, CSS |
| Navigation | Overview, Map, Servers and nodes, Monitoring, Traffic; Users, Connections, Devices; Incidents with count, Torrents and complaints; bottom Alerts, Settings, account. Preserve groups and icon alignment. | Links/buttons, icon SVGs, live badge text |
| Brand | ≈38 × 34 px mint pulse trace and two lines of text; use confirmed name **stealthnet-monitor**, subtitle Remnawave. | Authored SVG polyline and HTML text |
| Primary action | “Добавить сервер”, ≈185 × 40 px, 6 px radius, dark text, mint field, 20–24 px plus; map drawer action ≈245 × 46 px. | Native button, CSS, SVG icon |
| Overview hierarchy | Five ≈94 px high summaries. Main chart panel ≈927 px wide beside ≈390 px incident/region column. Bottom geography ≈692 px beside ≈628 px node table. | CSS layout, semantic cards/table |
| Map hierarchy | ≈877 px map column beside ≈440 px node details. Filters and summary remain above the map; legend remains below. Map search, controls and minimap overlay geographic content. | Semantic controls; SVG/Canvas geography |
| Panels and controls | Mostly 6–8 px corner radii, 1 px quiet borders, ≈12–16 px gutters, subtle tonal elevation. Glow concentrates on map markers and selected state. | CSS; no texture bitmap required |
| Type ramp | Compact, normal-to-slightly-narrow sans. Page titles ≈28/34 px, weight 650–700; KPI values ≈24–26/30 px, 600–700; panel headings ≈17–18/22 px, 600; body/sidebar ≈14/20 px; table ≈12–13/18 px; chart axes/legend ≈11–12/16 px. | Self-hosted webfont, HTML/SVG text; tabular numerals |

## Sampled palette

These are rounded arithmetic RGB means read with Pillow from the original PNGs. Coordinates are `(left, top, right, bottom)`, zero based, right/bottom exclusive. Field patches avoid text and edges. The small variation is present in the renders; values are measured targets, not an inferred exact original CSS palette.

| Region | Sample | RGB hex |
|---|---|---|
| Page ground | 01 `(780,100,830,120)` | `#111A22` |
| Sidebar ground | 01 `(75,685,170,730)` | `#131D25` |
| Header ground | 01 `(750,10,900,35)` | `#162028` |
| Chart panel field | 01 `(575,249,700,267)` | `#151F28` |
| Active navigation field | 01 `(150,139,190,148)` | `#1C3235` |
| Primary action upper / lower interior | 01 `(1470,76,1500,83)` / `(1470,102,1500,108)` | `#67E9B6` / `#65E7B4` |
| Mint / blue series legend interiors | 01 `(972,265,976,269)` / `(1069,265,1073,269)` | `#63F1B4` / `#5CA8FA` |
| Yellow status / orange count badge interiors | 01 `(1083,908,1087,912)` / `(184,585,189,594)` | `#F9C030` / `#F7A042` |
| Critical meter interior | 01 `(1330,910,1343,915)` | `#F55252` |
| Meter track interior | 01 `(1458,570,1478,578)` | `#313D4C` |
| Title glyph interior | 01 `(381,82,383,84)`, solid 2 × 2 px | `#FFFFFF` |
| Map ocean | 02 `(480,299,505,320)` | `#121C25` |
| Map land, two interior regions | 02 `(801,816,811,826)` / `(575,368,586,378)` | `#1F2E3B` / `#213240` |

Additional stroke measurements: straight panel border `#202B34`, 01 `(590,240,670,241)`; violet plot stroke `#A584EB`, 01 `(1072,534,1077,535)`. These one-pixel strokes have no larger flat interior; retain that sampling limitation rather than treating them as precise source tokens. Do not reproduce generation noise as a CSS texture.

## Media inventory and acquisition

| Ingredient | Implementation and fidelity | Status / concrete source |
|---|---|---|
| UI font | Self-host WOFF2 with Russian Cyrillic, Latin, punctuation and numerals; weights 400–700. **Roboto is the recommended starting candidate**, not an identification of the generated face. Compare “Обзор сети”, “stealthnet-monitor” and “24 831” against 01 before locking metrics; avoid horizontally scaling text. | Missing. [Google Fonts Roboto](https://fonts.google.com/specimen/Roboto); upstream [font project and OFL](https://github.com/googlefonts/roboto-3-classic). Preserve included license. |
| Interface icons | One consistent outline family: 18–20 px navigation, 20–24 px controls, 28–34 px KPI icons; round caps, ≈1.5–1.8 px displayed strokes. Lucide equivalents: LayoutGrid, Map, Server, Activity, ChartColumn, UserRound, Globe, Smartphone, TriangleAlert, ClipboardList, Bell, Settings, Search, Plus, Layers, Maximize, Cpu, MemoryStick, Database. | Missing. [Lucide](https://github.com/lucide-icons/lucide) SVGs or React package, preserving its [license notices](https://github.com/lucide-icons/lucide/blob/main/LICENSE). |
| Country flags | Small crisp inline/local SVGs ≈22 × 16 px in lists and ≈32 × 24 px in the drawer. Use one aspect treatment with country labels; no platform-dependent emoji flags. | Missing. [flag-icons upstream](https://github.com/lipis/flag-icons); vendor only used SVGs and retain its license. |
| World and Europe geography | Real longitude/latitude polygons rendered as paths; use Admin 0 countries/boundaries, optional Admin 1 lines at regional scale, and populated places/label points. Derive simplified overview and regional GeoJSON/TopoJSON from the same pinned release. | Missing. [Natural Earth 1:10m cultural vectors](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/) supplies these layers; data is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). Record source release and conversion in implementation provenance. |
| Nodes, connection regions, routes | SVG/Canvas points, diamond node markers, circle clusters, thin curved links, limited glow. Overview has roughly 30–40 visible points and three larger count clusters; regional screen roughly 20 nodes and a few links from the selected node. Cluster real counts according to zoom. | Code plus actual node coordinates and aggregated connection data. No image asset. Links show logical relationships, not measured physical network routes. |
| Charts, sparklines, meters, heatmap | Interactive SVG/Canvas with semantic title/summary and accessible values. Preserve dense irregular samples, faint grids, 1–2 px lines, transparent area fills, crosshairs and real tooltips. Wide 24 h plots visually contain hundreds of samples; heatmap in 04 is about 8 rows × 36 columns. | Code and time-series data. No chart PNGs. Downsample by display resolution while retaining peaks and missing-data gaps. |
| Tables, incidents, filters, tabs, legends, avatar | Native controls and text; CSS status dots/bars; neutral avatar silhouette in SVG. No stock photos needed. | Code. Mock figures, identities and timestamps remain explicitly demo data until connected. |
| Telegram and installer screens | Token form, event selection, delivery states and copyable Make/install commands remain semantic code. Use a neutral send/terminal icon unless an actual brand mark is required by a later comp. | No media dependency implied by product requirements. Additional comps are reviewed before implementation. |

Optional backend data dependency: connection geography needs an IP lookup source separate from map polygons. [MaxMind GeoLite documentation](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data/) documents account/license-key access, MMDB lookup data and accuracy radii. Treat this as a server integration candidate, not a bundled browser asset; preserve approximate-region wording and support unknown locations. Node coordinates should use configured locations when available.

## Fidelity risks to normalize in code

- **New screen drift:** 05 moves the sidebar boundary to x≈246 and the content origin to x≈262; restore the approved ≈228 px shell. 04 truncates the brand to “stealthnet-monito”; render the complete approved name with a fitted wordmark size and unchanged sidebar width. New PNG dimensions differ by 2 × 1 px, so normalize comparison viewports before judging spacing.
- **Font uncertainty:** generated Cyrillic labels are more compact than many default UI fonts. A generic fallback can change every column width. Acquire the real font and inspect representative heading, table and axis text before reproducing all screens.
- **Map truth:** generated shorelines, administrative subdivisions, labels and point locations are not factual data. Preserve framing, density and hierarchy with sourced vectors. The regional crop can use a Europe-fitted projection and the overview a world-fitted projection, but each map and its overlays must share the same projection/zoom transform and geographic coordinates. Preserve geographic detail at regional scale and review the source dataset's documented boundary worldview.
- **Operational density:** showing every user as a DOM point or every sample as a focusable element will not scale to tens of thousands of users. Aggregate/cluster data and maintain linked lists/details without reducing the approved composition to a few decorative marks.
- **Demo consistency:** chart tooltips and table aggregates must derive from the same data, not from independently copied mockup numbers. Dates and unavailable readings need real states; an unknown value must not become zero. All core text, hover states, zoom controls and actions must work as UI.

Raster production bucket: **empty**. Acquisition bucket: font, icon subset, flag subset, geographic vector data. None has been downloaded or installed by this inventory task.
