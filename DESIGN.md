---
name: stealthnet-monitor
description: A dense graphite monitoring workspace with mint controls and contextual network geography.
colors:
  bg: "#111a22"
  sidebar: "#131d25"
  surface: "#151f28"
  line: "#2a3844"
  line-soft: "#202d37"
  text: "#edf2fa"
  muted: "#a5b6c9"
  mint: "#63f1b4"
  blue: "#5ca8fa"
  amber: "#f9c030"
  red: "#f55252"
  purple: "#a584eb"
  input-bg: "#111c25"
  input-border: "#354857"
  button-primary: "#65e7b4"
  button-primary-hover: "#8ff6d0"
  button-primary-ink: "#08231d"
  navigation-active: "#1c3235"
  navigation-active-ink: "#85f9d1"
  status-neutral: "#b1bfd0"
  status-online: "#74edbd"
  status-warning: "#f2bb44"
  status-critical: "#f75e61"
  status-info: "#71b9f4"
typography:
  headline:
    fontFamily: "Roboto, Arial, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: "34px"
    letterSpacing: "0.2px"
  title:
    fontFamily: "Roboto, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: "23px"
  subheading:
    fontFamily: "Roboto, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: "22px"
  metric:
    fontFamily: "Roboto, Arial, sans-serif"
    fontSize: "25px"
    fontWeight: 700
    lineHeight: "29px"
    letterSpacing: "0.3px"
  body:
    fontFamily: "Roboto, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  control:
    fontFamily: "Roboto, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "Roboto, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  table-heading:
    fontFamily: "Roboto, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 400
rounded:
  meter: "2px"
  compact-control: "4px"
  control: "5px"
  panel: "6px"
  dialog: "8px"
spacing:
  small: "8px"
  metric-gap: "9px"
  control-gap: "10px"
  grid-gap: "12px"
  split-gap: "14px"
  control-inline: "16px"
  field-bottom: "20px"
components:
  button-primary:
    backgroundColor: "{colors.button-primary}"
    textColor: "{colors.button-primary-ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.button-primary-hover}"
    textColor: "{colors.button-primary-ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-subtle:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.input-bg}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
  navigation-active:
    backgroundColor: "{colors.navigation-active}"
    textColor: "{colors.navigation-active-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 17px"
    height: "43px"
  badge-online:
    textColor: "{colors.status-online}"
    typography: "{typography.label}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "13px 14px"
---

# Design System: stealthnet-monitor

## Overview

**Creative North Star: "Graphite and Mint Monitoring Workspace"**

A precise, compact workspace for scanning network condition and moving into a node's details. Graphite backgrounds, thin borders, restrained mint accents, and Roboto establish the identity. Charts, geographic markers, tables, and inspectors carry the information; the surrounding interface stays quiet.

The approved overview and map images govern the visual direction. Preserve their density, proportions, and material character when extending the application. This document records the implemented system in `web/src`, including its responsive adaptations; it is not a claim of pixel-perfect equivalence to generated mockups. The superseded random direction seed does not govern future work. See [the fidelity contract](design/FIDELITY.md) for the reference hierarchy.

**Key Characteristics:**

- Dense, bordered graphite surfaces with narrow gaps.
- Mint actions and selection, with distinct colors for status and data series.
- One self-hosted font family with compact headings and prominent metric values.
- Geographic context, counted clusters, and an adjacent node inspector.
- Visible time controls, units, freshness, and demonstration labels.

The normative colors and type roles above are extracted from [the stylesheet](web/src/styles.css). Shared controls come from [ui.tsx](web/src/components/ui.tsx); [Chart.tsx](web/src/components/Chart.tsx), [NodeMap.tsx](web/src/components/NodeMap.tsx), and [Billing.tsx](web/src/components/Billing.tsx) define their specialized patterns. The [sidecar](.impeccable/design.json) contains preview snippets and schema extensions. Its generated tonal ramps are preview metadata, not additional application tokens.

## Colors

The palette combines cool graphite neutrals with luminous mint and clearly separated operational colors.

### Primary

- **Signal Mint** (`mint`) identifies active navigation edges, keyboard focus, healthy map nodes, incoming traffic, and completed steps.
- **Action Mint** (`button-primary`) is the actual filled-button color. Preserve its separate hover and dark-ink tokens; it is deliberately distinct from Signal Mint in the shipped CSS.
- **Navigation Mint** (`navigation-active-ink`) sits on the tinted active navigation surface.

### Secondary

- **Connection Blue** (`blue`) distinguishes outgoing traffic, connection regions, links, and Telegram context.
- **User Violet** (`purple`) identifies the users chart. It is a data-series color, not a general action treatment.
- **Warning Amber** (`amber`) and **Critical Red** (`red`) mark operational urgency. Status text uses the corresponding softer `status-*` values; online/delivered/resolved share green, warning/new/retry share amber, critical/failed share red, and reviewed/queued share blue. Neutral badges include offline status.

### Neutral

- **Graphite Canvas** (`bg`) is the application background; **Sidebar Graphite** (`sidebar`) and **Panel Graphite** (`surface`) separate navigation and working surfaces.
- **Structural Line** (`line`) divides panels and records; **Soft Line** (`line-soft`) supports quieter shell boundaries.
- **Cool Foreground** (`text`) carries primary copy, and **Muted Steel** (`muted`) carries descriptions and secondary metadata.
- **Recessed Field** (`input-bg`) and **Field Border** (`input-border`) define editable areas.

**The Status Has Words Rule.** Pair the status dot or geographic color with a readable label, count, tooltip, or selected-node description; retain the meaning when color alone is insufficient.

## Typography

Roboto is the display, body, navigation, and data-label family, with Arial and sans-serif fallbacks. [The entry point](web/src/main.tsx) bundles Roboto weights 400, 500, and 700 through `@fontsource/roboto`, including the Cyrillic resources supplied by that package. Do not introduce a remote font dependency.

### Hierarchy

- **Headline:** page title, using the `headline` role. At the mobile breakpoint it becomes 25px with a 31px line height.
- **Title:** panel heading, using `title`; mobile panel headings become 16px. The selected-node title is 20px.
- **Subheading:** compact headings, using `subheading`. General `b` and `strong` use medium weight; page/panel headings and metrics explicitly use bold.
- **Metric:** bold primary KPI value, using `metric`; units are smaller. Values become 22px at narrower desktop and mobile widths, and 20px inside the compact inspector.
- **Body:** the root role is 14px. Paragraphs use a 1.5 line height; tables, forms, navigation, and metadata use their local compact roles.
- **Control and label:** controls are commonly 13px; badges, table values, descriptions, and period controls are commonly 12px. Table headings and chart axes use 11px. These are task labels, not decorative display copy.
- **Commands:** copyable command text and console output use monospace. Console output explicitly uses `ui-monospace, SFMono-Regular, monospace` at 12px/1.8.

**The Numeric Context Rule.** Keep a value's unit and scope visible. Unknown values remain an em dash or an explicit “Не указана” / “Не указан” state; a missing reading must not become a measured zero.

## Layout

The desktop shell has a fixed 228px sidebar, a matching workspace offset, and a 50px topbar. The main area fills the available width with padding of 18px 16px 12px. Page headings align their title and actions in a row. Working surfaces are composed from grids and vertical stacks rather than a centered marketing container.

Metric grids have two, three, four, or five columns, with 9px gaps. Standard metric cards are 94px high. Panel grids and stacks commonly use 12px gaps; split detail views use 14px gaps. Default panel padding is defined above. Form labels have 8px internal gaps and 20px bottom spacing.

The overview places the traffic area and its rail in a `minmax(0, 2.36fr) minmax(300px, 1fr)` grid. Its lower map/table grid uses 1.1fr/1fr. The map route places geography and the inspector in `minmax(0, 2fr) minmax(340px, 1fr)`. These are existing surface layouts, not a requirement to give every screen the overview composition.

### Responsive behavior

| Media query | Shipped adaptation |
| --- | --- |
| `min-width: 1700px` | Main padding becomes 22px 24px; the overview map grows to a 310px frame with a 283px SVG; overview table rows become 59px. |
| `max-width: 1350px` | Metric values shrink and sparklines disappear. The overview top grid becomes 2fr with a minimum 290px rail; the bottom becomes 1fr/1.1fr. Telegram token controls wrap, putting the password field on a full row. |
| `max-width: 1100px` | Sidebar and workspace offset become 210px; search becomes 260px wide. Five metrics use three columns. Overview main grids and map/inspector stack. Inspector metrics use four columns. Telegram's form and preview columns stack, with preview/history temporarily sharing a two-column row. |
| `max-width: 760px` | The sidebar becomes a 228px off-canvas drawer with a scrim and menu button; workspace offset is zero. Topbar height is 54px and main padding is 17px 12px 12px. Headings and actions wrap; panels use 12px padding. Two-column forms and split layouts become single-column. Metrics use two columns, with the fifth metric spanning both; normal mobile metrics are 82px high and that fifth metric is 73px high. |

On mobile, general tables retain a minimum width of 650px inside a horizontal scroll container. The overview node table is a compact exception without that minimum. Filters wrap, with search taking a full row. Tabs scroll horizontally. The main map SVG is 440px high; the inspector follows it and returns to two metric columns. The overview map uses a 233px frame with a 207px SVG. The locator inset narrows from 132px to 86px.

**The Context Travels Rule.** Responsive stacking keeps the selected node, time period, forms, and actions available. Preserve the content hierarchy when changing columns; use the existing scroll containers for wide tables.

## Elevation & Depth

Ordinary panels and metric cards are flat, using tonal separation and one-pixel borders. Soft shadows identify overlays: search results, map tooltips, dialogs, and transient feedback. The Telegram message preview carries its own subtle message shadow. Geographic marker glow and translucent chart area fills are native to this visual world.

### Shadow Vocabulary

- **Search results:** `0 10px 35px #050b1199`.
- **Map tooltip:** `0 3px 16px #0005`.
- **Dialog:** `0 20px 70px #0007`; its backdrop uses a 3px blur.
- **Telegram preview message:** `0 4px 15px #020c1755`.
- **Toast:** `0 10px 40px #01090788`.

**The Flat Working Surface Rule.** Reuse flat bordered panels for persistent data; reserve overlay shadows for content that sits above or temporarily interrupts the workspace.

## Shapes

The geometry is restrained: softly squared fields and buttons, slightly rounder panels, compact controls, and rounded dialogs. The normative radius tokens above describe these families. Status dots, avatars, switches, and counted clusters are circular; single nodes use diamonds. Small circular geometry has meaning and is not a substitute for the rectangular working grid.

Table borders collapse into shared separators. Cards and fields use one-pixel strokes. Primary buttons remain compact rectangles. Map frames clip their geography and controls; tables own their horizontal overflow. Dialogs are at most 640px wide and 90vh high, with internal scrolling and 20px outer backdrop padding.

## Components

### Buttons, fields, and focus

Buttons have a 38px minimum height, a 10px content gap, and the normative padding/radius above. Filled primary actions use bold 13px text. Secondary actions use a transparent fill with a slate border; subtle actions start with a transparent border and muted text. Hover changes the background and border over 160ms. At widths up to 1100px, horizontal button padding becomes 12px. Disabled buttons use 0.45 opacity and a disabled cursor.

Inputs, selects, and textareas have a 37px minimum height, a recessed background, one-pixel border, and the normative field padding. Labels remain visible; placeholders supplement them. Textareas resize vertically. Native checkboxes are 19px square and use mint accent color.

Keyboard focus uses a 2px mint outline with a 3px offset on buttons, links, fields, and focusable elements. Search inputs use tighter local outline offsets. Keep semantic buttons and explicit labels for icon-only actions. The switch is 41px by 23px, with a 17px thumb that translates 17px in 150ms. Reduced-motion preference disables transitions and animation; the sidebar currently changes state without animation.

### Navigation and periods

Sidebar links are 43px high. The active item combines a tinted background, mint text, and a 3px mint leading bar. Hover adds a graphite fill. Bottom navigation and the account area are separated by lines.

Content tabs use a 2px mint underline and a shared baseline. Period controls in headers use a compact segmented container with 32px-high buttons and a 51px minimum width. Header choices are “1 ч”, “6 ч”, “24 ч”, and “7 д”. The map's labeled period select additionally exposes “15 мин”. Both feed the shared period state rather than a decorative local label.

### Panels, badges, and tables

Panel headings align a title/subtitle and optional trailing action. Metric panels pair a small line icon with a bold reading and secondary context. The inspector uses 72px-high compact metric cards.

Status badges are a text label preceded by an 8px dot and an 8px gap; they do not have a filled pill background. Standard tables use 40px header rows and 44px data rows, with 9px 13px cell padding. Sortable headings are buttons; interactive rows also expose a button in their first cell. The default page size is ten. Empty lists show an explicit empty state.

### Charts

Incoming traffic uses mint, outgoing traffic uses blue, and users use violet. Lines are 1.65px wide, lightly smoothed, and paired with translucent area fills. Time axes, restrained grid lines, and numeric units preserve the monitoring character. The y-axis begins at zero and scales to the displayed series.

Tooltips follow the time axis and stay within the chart, showing localized values and units. Ctrl+mouse-wheel zoom is supported; charts resize with their container and do not animate. The selected-node chart receives that node's identifier and shares the visible period control. Overview charts remain aggregate views. Demonstration series scale to their actual displayed node or aggregate; live periods without readings show “За этот период нет данных”. A chart's accessible image label describes its purpose; it does not imply full keyboard access to individual plotted samples.

### Geography and node inspector

Country shapes come from the local `countries-50m.json` asset. The overview uses a Natural Earth world projection; the detailed map starts in a Mercator view of Europe. Country boundaries, geographic labels, a locator inset, and a legend provide orientation. Single known-location nodes are diamonds; nearby nodes are counted rings. Connection regions and curves are separate symbols, currently shown with the demonstration data.

**The Count Every Located Node Rule.** Keep all nodes with known geography in projected-cell groups. Rank the group by critical, offline, warning, then online status, so its ring reveals the most urgent member. Opening a group shows the full urgency-sorted list; selecting a member updates the inspector. Do not silently sample nodes to reduce map clutter.

Group and node selection support click, Enter, and Space. Hover or focus reveals the node tooltip; selection is retained in the map URL. The cluster dialog uses the common modal: focus moves inside, Tab is contained, Escape closes it, and focus returns to the invoking control. Its node list scrolls at a maximum height of 60vh.

The main map supports drag-to-pan, zoom controls, reset, and labels. A selected node has an additional mint ring. Its inspector contains identity/status, overview/connections/events tabs, scoped metrics, the shared-period traffic chart, and contextual links. The map filter row displays freshness from `data.updated_at`. Approximate geography remains described as approximate; unknown-location nodes are not placed at invented coordinates.

### Billing and Telegram

Billing reuses the standard labeled fields in two-column grids: provider and UTC expiry, then monthly cost and currency. At the mobile breakpoint these fields stack. The expiry badge pairs a calendar icon with a date and relative days; it is amber within seven days and red after expiry. Missing dates and prices stay explicit. The date field represents the end of the chosen UTC day.

Telegram setup uses numbered panel titles for token, recipient, and event selection, followed by save/test actions. Masked token input, reveal control, validation state, chat-linking instructions, checkboxes, switch, error message, and delivery history are distinct states. Token controls wrap at the narrower desktop breakpoint; the whole flow stacks on mobile. Preserve the separation of a saved bot token and a linked recipient. The demonstration state explicitly says that the test preview does not send a Telegram message.

Rule icons are selected by the rule's metric, including expiry, disconnected agent, CPU, disk, RAM, and complaint, so sorting or inserting rules does not change their meaning.

## Do's and Don'ts

### Do:

- **Do** preserve the approved graphite-and-mint direction and the compact working density.
- **Do** reuse the self-hosted Roboto weights, shared controls, panel rhythm, and existing responsive breakpoints.
- **Do** keep status words, units, scope, period, freshness, and demonstration labels visible in their relevant contexts.
- **Do** retain every located node through counted clusters and make each cluster member selectable.
- **Do** keep node charts scoped to the selected node and the shared visible period.
- **Do** let forms stack and tables scroll using the shipped responsive patterns.

### Don't:

- **Don't** replace the approved visual world with the superseded random seed or a new unrelated style.
- **Don't** recreate interactive interface areas as background screenshots.
- **Don't** turn missing measurements into zero, fabricate coordinates, or present demonstration values as live readings.
- **Don't** use color alone to communicate a status or conflate a connection region with a node.
- **Don't** apply overlay shadows to every data panel or add decorative display typography.
- **Don't** treat generated preview tonal ramps or incidental one-off styles as additional normative application tokens.
