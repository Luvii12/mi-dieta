---
name: Mediterranean Culinary
colors:
  surface: '#fdf8f6'
  surface-dim: '#ddd9d7'
  surface-bright: '#fdf8f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f7f3f0'
  surface-container: '#f1edeb'
  surface-container-high: '#ece7e5'
  surface-container-highest: '#e6e2df'
  on-surface: '#1c1b1a'
  on-surface-variant: '#59413c'
  inverse-surface: '#31302f'
  inverse-on-surface: '#f4f0ee'
  outline: '#8c716b'
  outline-variant: '#e0bfb8'
  surface-tint: '#ac331b'
  primary: '#a93119'
  on-primary: '#ffffff'
  primary-container: '#cb492f'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb4a4'
  secondary: '#446735'
  on-secondary: '#ffffff'
  secondary-container: '#c2ecac'
  on-secondary-container: '#486c38'
  tertiary: '#825100'
  on-tertiary: '#ffffff'
  tertiary-container: '#a36700'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad3'
  primary-fixed-dim: '#ffb4a4'
  on-primary-fixed: '#3e0500'
  on-primary-fixed-variant: '#8b1b05'
  secondary-fixed: '#c5eeae'
  secondary-fixed-dim: '#a9d294'
  on-secondary-fixed: '#052100'
  on-secondary-fixed-variant: '#2d4f1f'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#fdf8f6'
  on-background: '#1c1b1a'
  surface-variant: '#e6e2df'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
  metric-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.03em
  metric-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 24px
    letterSpacing: -0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-sm: 0.75rem
  margin: 1rem
  margin-tablet: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system channels the warmth, conviviality, and sensory richness of Mediterranean food culture. Rather than treating nutrition as clinical tracking or restrictive calculation, it frames dietary planning as an appetizing, intentional ritual. The aesthetic blends contemporary editorial polish with tactile warmth—grounded in sun-drenched terracotta, cold-pressed olive oils, and unbleached linen tones.

The visual direction combines **Minimalism** with **Warm Tactile Nuances**:
- Generous breathable whitespace avoids data-dense anxiety.
- Soft, pillowed cards and warm-tinted ambient diffusion create an inviting, kitchen-table feel.
- High-legibility typography provides effortless scanning of portion weights, calories, and macronutrient targets on small touchscreens.
- The tone avoids neon fitness clichés; it prioritizes natural satiety, clarity, and Mediterranean rhythm.

## Colors

The palette balances culinary energy with functional categorization:

- **Primary (`#D95338`)**: Roasted Terracotta / Ripe Tomato. Used for primary CTAs, active tab indicators, high-emphasis highlights, and brand identity moments.
- **Secondary (`#5E834D`)**: Olive Grove. Designates completed meals, daily goal completions, checkmarks, and positive dietary adherence.
- **Tertiary (`#F59E0B`)**: Toasted Amber. Assigned specifically to Carbohydrates tracking and contextual prep timers.
- **Neutral (`#1F1E1D`)**: Warm Charcoal. Provides sharp contrast against pale parchment grounds without the harshness of pure black (`#000000`).

### Macronutrient Tokens
- **Protein**: `#3B82F6` (Clear Mediterranean Azure)
- **Carbohydrates**: `#F59E0B` (Golden Grain Amber)
- **Fats**: `#EC4899` (Cold-Pressed Rose Pink)

### Surface Hierarchies

**Light Mode (Default)**
- Canvas / App Background: `#FAF7F2` (Warm Bone)
- Card & Container Surface: `#FFFFFF` (Pure White for tactile lift)
- Subtle Inset Wells: `#F2ECE1` (Soft Sand)
- Borders / Hairlines: `#E8E1D5` (Warm Alabaster)
- Text Muted / Subtitle: `#706C66` (Sun-baked Clay)

**Dark Mode**
- Canvas / App Background: `#181716` (Deep Warm Charcoal)
- Card & Container Surface: `#232120` (Elevated Warm Slate)
- Inset Wells: `#121110` (Recessed Cavity)
- Borders / Hairlines: `#33302E` (Smoked Oak)
- Text High-Emphasis: `#FAF7F2`
- Text Muted / Subtitle: `#A39E96`

## Typography

**Plus Jakarta Sans** is the single typeface throughout, selected for its open counters, humanist warmth, and exceptional tabular numeric clarity.

### Implementation Principles
- **Tabular Figures**: Activate `font-variant-numeric: tabular-nums` for all nutritional values, gram weights, and calorie tallies to guarantee rigid alignment when stacked in meal plans.
- **Metric Roles**: `metric-lg` and `metric-md` are designated exclusively for rapid numeric assessment—such as remaining daily kcal and macro ratios.
- **Hierarchy Enforcement**: Avoid using bold weights for body copy. Rely on size differentiation and color contrast (`#1F1E1D` vs `#706C66`) to establish visual priority.

## Layout & Spacing

The layout is built for fluid touch interaction on mobile devices with an 8pt-derived spacing rhythm:

- **Mobile Viewport (< 640px)**: 4-column fluid layout with `1rem` (16px) page margins and `1rem` column gutters. Bottom navigation bar anchors daily actions with safe area cushioning.
- **Tablet Viewport (640px - 1024px)**: 8-column layout with `2rem` (32px) margins and `1rem` gutters. Meal logs and daily macro summaries sit side-by-side.
- **Touch Targets**: Minimum interactive tap footprint is strictly 44x44px, despite compact visual label styling.
- **Vertical Rhythm**: Related elements (e.g., ingredient + calorie chip) use `space-xs` (4px) to `space-sm` (8px). Distinct meal items within a card use `space-md` (16px). Major day sections use `space-xl` (32px).

## Elevation & Depth

Visual hierarchy uses **warm ambient shadows** and **tonal contrast** instead of cold, sharp drop shadows.

### Light Mode Elevation
- **Level 0 (Canvas)**: `#FAF7F2` flat base.
- **Level 1 (Cards, Meal Panels)**: `#FFFFFF` with ambient shadow: `box-shadow: 0px 4px 16px -2px rgba(66, 48, 32, 0.05), 0px 1px 3px 0px rgba(66, 48, 32, 0.03)`. Subtle 1px perimeter border in `#E8E1D5`.
- **Level 2 (Floating Action Buttons, Menus, Modals)**: `#FFFFFF` with warm diffuse elevation: `box-shadow: 0px 12px 28px -4px rgba(66, 48, 32, 0.12), 0px 4px 8px -2px rgba(66, 48, 32, 0.04)`.

### Dark Mode Elevation
Shadows are absorbed on dark surfaces; depth is conveyed through progressive lightness steps and low-contrast perimeter rims:
- **Level 0 (Canvas)**: `#181716` flat base.
- **Level 1 (Cards)**: `#232120` with a `1px solid rgba(255, 255, 255, 0.06)` border.
- **Level 2 (Modals & Action Sheets)**: `#2C2928` with a `1px solid rgba(255, 255, 255, 0.1)`.

## Shapes

The interface embraces organic, culinary roundness without drifting into childish novelty:

- **Cards & Sheets**: Fixed at `16px` radius (`rounded-lg` / `rounded-2xl` equivalent in mobile tailwind scales) to reinforce comfort and tactile ease.
- **Buttons & Interactive Tags**: Built as full pills (`9999px`) or rounded blocks with `12px` (`rounded-md`).
- **Macro Badges & Progress Bars**: Segmented linear bars and circular rings utilize fully rounded caps (`round` line join/cap) to highlight physical softness.

## Components

### Buttons
- **Primary**: Terracotta background (`#D95338`), white text (`#FFFFFF`), `12px` border radius, `label-lg` typography. Active scale transition to `0.98` for tactile feedback.
- **Secondary / Ghost**: Warm bone surface (`#F2ECE1`), charcoal text (`#1F1E1D`), zero border. Dark mode: `#2C2928` with `#FAF7F2` text.
- **Done / Confirm**: Olive green (`#5E834D`), used when locking in meals or concluding days.

### Cards & Meal Containers
- Encapsulated in 16px rounded surfaces with Level 1 warm shadow.
- Feature a compact header row (e.g., "Almuerzo • 650 kcal") paired with an Olive Green circular check-trigger.
- Nested ingredient lists sit on subtle background wells (`#FAF7F2` in light mode, `#181716` in dark mode) with `8px` corner radiuses.

### Macronutrient Indicators
- **Macro Pills**: Mini badges displaying value and type (e.g., "120g Prot"). Backgrounds are set to 10% opacity tints of the respective macro color; typography uses the solid macro hue.
  - *Protein*: `rgba(59, 130, 246, 0.1)` base, `#2563EB` text.
  - *Carbs*: `rgba(245, 158, 11, 0.1)` base, `#D97706` text.
  - *Fats*: `rgba(236, 72, 153, 0.1)` base, `#DB2777` text.
- **Progress Trackers**: Tri-color segmented bar with curved capsule endings and subtle separation gaps between macronutrient segments.

### Inputs & Search Bars
- Background filled with `#F2ECE1` (Light) or `#1F1E1D` (Dark).
- Fully borderless at rest; focused state transitions into a crisp `1.5px` border in `#D95338`.
- Numeric weight inputs leverage `headline-md` tabular numerals with fixed trailing suffix labels (e.g., "g", "ml").

### Checkboxes & State Triggers
- Round radio-style check targets (24x24px hit area).
- Unchecked: 1.5px border in `#A39E96`, transparent fill.
- Checked: Spring-animated snap into solid Olive Green (`#5E834D`) fill with crisp white vector checkmark.

### Daily Timeline Calendar
- Horizontal calendar strip showing current week days.
- Active selected day: Terracotta pill with white numerals.
- Target adherence state indicated by an Olive dot beneath the date label.