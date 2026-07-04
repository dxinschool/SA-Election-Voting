---
name: SBA Election
description: School Student Association election voting system

colors:
  background: "#111111"
  foreground: "#ffffff"
  card: "#09090b"
  border: "#262626"
  input: "#262626"
  muted: "#262626"
  muted-foreground: "#a3a3a3"
  border-focus: "#404040"
  primary: "#8A5DF4"
  primary-hover: "#7c3aed"
  destructive: "#ef4444"

typography:
  font-family: "'Inter', sans-serif"
  h1:
    fontSize: 1.5rem
    fontWeight: 600
    letterSpacing: -0.025em
  h2:
    fontSize: 1.25rem
    fontWeight: 600
  subtitle:
    fontSize: 0.875rem
    fontWeight: 400
  label:
    fontSize: 0.875rem
    fontWeight: 500
  body:
    fontSize: 0.875rem
    fontWeight: 400
  button:
    fontSize: 0.875rem
    fontWeight: 500
  muted:
    fontSize: 0.875rem
    color: "#a3a3a3"

rounded:
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px

shadows:
  sm: "0 1px 3px 0 rgb(0 0 0/0.1), 0 1px 2px -1px rgb(0 0 0/0.1)"
  md: "0 4px 6px -1px rgb(0 0 0/0.1), 0 2px 4px -2px rgb(0 0 0/0.1)"
  lg: "0 10px 15px -3px rgb(0 0 0/0.1), 0 4px 6px -4px rgb(0 0 0/0.1)"

components:
  card:
    backgroundColor: "{colors.card}"
    borderColor: "{colors.border}"
    borderWidth: 1px
    borderStyle: solid
    rounded: "{rounded.lg}"
    boxShadow: "{shadows.sm}"
    padding: 24px
  input:
    backgroundColor: "{colors.input}"
    borderColor: "{colors.border}"
    borderWidth: 1px
    borderStyle: solid
    textColor: "{colors.foreground}"
    placeholderColor: "{colors.muted-foreground}"
    rounded: "{rounded.md}"
    padding: 12px 16px
    height: 40px
  input-focus:
    borderColor: "{colors.border-focus}"
  button-primary:
    background: "{colors.primary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: 8px 16px
    height: 40px
    fontWeight: 500
  button-primary-hover:
    background: "{colors.primary-hover}"
  separator:
    background: "{colors.border}"
    height: 1px

## Overview

Dark, minimal UI inspired by modern gaming tool dashboards. Full-color background with card-based content panels. Purple accent (#8A5DF4) drives all interactions. Clean typography using Inter.

## Colors

The palette is dark and minimal with a single purple accent.

- **Background (#111111):** Near-black canvas.
- **Card (#09090b):** Slightly darker than background for card surfaces.
- **Border (#262626):** Subtle borders on cards and inputs.
- **Input (#262626):** Input field backgrounds.
- **Primary (#8A5DF4):** Purple accent for buttons, links, and focus states.
- **Muted foreground (#a3a3a3):** Secondary/muted text.

## Typography

Inter is the sole typeface. Body text is 0.875rem. Headings are semibold with tight letter spacing.

## Shapes

Border radius: md (6px) for inputs/buttons, lg (8px) for cards. Full (9999px) for pills/badges.

## Layout

Pages are centered with max-width containers. Cards stack vertically with 24px padding and subtle border + shadow.
