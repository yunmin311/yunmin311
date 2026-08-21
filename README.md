<!--
  This page is generated, not hand-maintained.

  TO CHANGE ANY OF THE WORDS ON IT, edit scripts/config.json — in the browser is
  fine — and commit. The workflow redraws and pushes the images within a minute.
  Nothing here should ever be edited by hand. Step by step: docs/EDITING.md

  Every image under assets/generated/ comes out of `node scripts/build.mjs`.
  Each one exists in two versions — desktop and phone — and <picture> picks
  between them with ONE condition:

      <source media="(max-width: 500px)">   phone
      <img src>                             desktop

  Light and dark are NOT separate files. Both palettes live inside every SVG as
  custom properties behind a prefers-color-scheme block, which does work through
  <img> — verified by rendering a probe to a canvas and reading the pixels back.
  That removes the compound "(max-width) and (prefers-color-scheme)" query,
  which was the only construct here capable of handing a desktop the phone
  layout, and it means switching theme repaints rather than re-downloading.

  Phone versions are real narrow layouts, not the desktop file scaled: an 824px
  panel squeezed into a 288px column renders 11px type at 3.8px.

  Each <a> has to stay on ONE line. Broken across lines, the markdown parser
  closes the inline context and side-by-side cards stop flowing together.

  The design system these are built against — type ladder, spacing scale,
  colour budget, motion rules, and the measured values they came from — is
  written down in DESIGN.md. To change wording, edit scripts/config.json and
  rebuild; editing an SVG by hand will be overwritten by the next scheduled run.
-->

<div align="center">

<picture>
  <source media="(max-width: 500px)" srcset="assets/generated/hero-m.svg">
  <img alt="Building tools for thinking, creating, and working with AI. Turning messy ideas into systems that actually run. Always building something I wish already existed." title="Three sentences, typed" src="assets/generated/hero.svg">
</picture>

</div>

<!-- ═══ 01 // ABOUT ME ═══════════════════════════════════════════════════ -->

<picture>
  <source media="(max-width: 500px)" srcset="assets/generated/sec-01-m.svg">
  <img alt="01 // About me" title="01 // About me" src="assets/generated/sec-01.svg">
</picture>

<picture>
  <source media="(max-width: 500px)" srcset="assets/generated/about-m.svg">
  <img title="Qiyu Li — creative engineering" alt="Qiyu Li. I build AI-native tools and creative software around thinking, creating, and working with AI — mostly around human–AI interaction, visual systems, and turning messy ideas into things that actually work. Outside the editor you'll usually find me around photography, films, table tennis, and whatever I'm curious about next. Currently exploring: human–AI interaction, creative software, cinematography, visual systems. Principles: human judgment stays in the loop; build the tools I wish already existed." src="assets/generated/about.svg">
</picture>

<!-- ═══ 02 // THROUGH MY LENS ════════════════════════════════════════════
     Hidden until the real photographs are in assets/photography/. The section
     is deliberately absent rather than showing a placeholder or a "coming
     soon" card. sec-02 is already generated and waiting.
     ═══════════════════════════════════════════════════════════════════════ -->

<!-- ═══ 03 // SELECTED WORK ══════════════════════════════════════════════ -->

<picture>
  <source media="(max-width: 500px)" srcset="assets/generated/sec-03-m.svg">
  <img alt="03 // Selected work — tools I wanted to exist, so I built them." title="03 // Selected work" src="assets/generated/sec-03.svg">
</picture>

<a href="https://github.com/yunmin311/context-distiller"><picture><source media="(max-width: 500px)" srcset="assets/generated/work-context-distiller-m.svg"><img alt="Context Distiller — choosing what an AI gets to see is the step nobody built a tool for. TypeScript, React 19, WXT, Manifest V3." title="Open context-distiller on GitHub" src="assets/generated/work-context-distiller.svg"></picture></a>
<a href="https://github.com/yunmin311/governance-framework"><picture><source media="(max-width: 500px)" srcset="assets/generated/work-governance-framework-m.svg"><img alt="Governance Framework — one source of truth for working across several AI agents. Markdown, YAML, Python, validators." title="Open governance-framework on GitHub" src="assets/generated/work-governance-framework.svg"></picture></a>
<a href="https://github.com/yunmin311/window-annotator"><picture><source media="(max-width: 500px)" srcset="assets/generated/work-window-annotator-m.svg"><img alt="Window Annotator — hand-drawn annotations pinned to any Windows window, following move, resize and scroll. Electron, JavaScript, koffi FFI." title="Open window-annotator on GitHub" src="assets/generated/work-window-annotator.svg"></picture></a>
<a href="https://github.com/yunmin311/work-capsule"><picture><source media="(max-width: 500px)" srcset="assets/generated/work-work-capsule-m.svg"><img alt="Work Capsule — one-click, fast-forward-only Git sync for every folder you choose. Rust, egui, Windows." title="Open work-capsule on GitHub" src="assets/generated/work-work-capsule.svg"></picture></a>
<a href="https://github.com/yunmin311/DenseGPT"><picture><source media="(max-width: 500px)" srcset="assets/generated/work-densegpt-m.svg"><img alt="DenseGPT — a long answer you cannot scan is a long answer nobody reads. UserCSS, Stylus, typography, prompt spec." title="Open DenseGPT on GitHub" src="assets/generated/work-densegpt.svg"></picture></a>
<a href="https://github.com/yunmin311/pixel-panels"><picture><source media="(max-width: 500px)" srcset="assets/generated/work-pixel-panels-m.svg"><img alt="Pixel Panels — the components this page is built from, lifted out and documented. JavaScript, SVG, zero-dependency, MIT." title="Open pixel-panels on GitHub" src="assets/generated/work-pixel-panels.svg"></picture></a>

<!-- ═══ 04 // HOW I WORK ═════════════════════════════════════════════════ -->

<picture>
  <source media="(max-width: 500px)" srcset="assets/generated/sec-04-m.svg">
  <img alt="04 // How I work — where the hours go, and what the code is actually made of." title="04 // How I work" src="assets/generated/sec-04.svg">
</picture>

<picture>
  <source media="(max-width: 500px)" srcset="assets/generated/rhythm-m.svg">
  <img alt="Coding rhythm — activity by hour and by weekday over the observed window of the public events feed." title="When I work — from the public events feed, aggregate only" src="assets/generated/rhythm.svg">
</picture>

<picture>
  <source media="(max-width: 500px)" srcset="assets/generated/languages-m.svg">
  <img alt="Language signal — lines I added in commits I authored, across the four selected repositories." title="Lines I wrote, from a real clone and git log --numstat" src="assets/generated/languages.svg">
</picture>

<a href="https://github.com/yunmin311?tab=stars"><picture><source media="(max-width: 500px)" srcset="assets/generated/stars-m.svg"><img alt="Recently starred repositories — opens my stars tab" title="Open my stars tab" src="assets/generated/stars.svg"></picture></a>
<picture><source media="(max-width: 500px)" srcset="assets/generated/activity-m.svg"><img alt="Recent activity — releases, repositories opened to the public, pull requests" title="Releases, repos opened to the public, pull requests" src="assets/generated/activity.svg"></picture>

<!-- ═══ 05 // CONTRIBUTIONS ══════════════════════════════════════════════ -->

<picture>
  <source media="(max-width: 500px)" srcset="assets/generated/sec-05-m.svg">
  <img alt="05 // Contributions" title="05 // Contributions" src="assets/generated/sec-05.svg">
</picture>

<picture>
  <source media="(max-width: 500px)" srcset="assets/generated/contributions-m.svg">
  <img alt="A year of contributions drawn as a filled field" title="A year of contributions" src="assets/generated/contributions.svg">
</picture>

<!-- ═══ 06 // AESTHETIC INPUTS ═══════════════════════════════════════════ -->
<!-- AESTHETIC_INPUTS_SLOT -->

<!-- ═══ 07 // CONTACT ════════════════════════════════════════════════════ -->

<picture>
  <source media="(max-width: 500px)" srcset="assets/generated/sec-07-m.svg">
  <img alt="07 // Contact" title="07 // Contact" src="assets/generated/sec-07.svg">
</picture>

<!-- A README cannot run script, so click-to-copy is not possible on this page.
     EMAIL hands the click to the reader's mail client without printing the
     address as text. WECHAT opens a QR with the avatar, display name and city
     stripped off it. WEBSITE stays out until yunmin311.github.io serves
     something — it currently 404s. -->
<a href="mailto:liqiyu311@gmail.com"><picture><img alt="Email me" title="Opens your mail client" src="assets/generated/btn-email.svg"></picture></a>
<a href="https://www.douyin.com/user/MS4wLjABAAAACCMGACneEnYcKlqMPe5wKvyxkUQTcX39bBzWcbGbpBSfWN4hHKN0dnZc64sV6SHR"><picture><img alt="Douyin" title="Opens my Douyin profile" src="assets/generated/btn-douyin.svg"></picture></a>
<a href="assets/contact/wechat-qr.png"><picture><img alt="WeChat — opens a QR to scan" title="Opens a QR to scan" src="assets/generated/btn-wechat.svg"></picture></a>

<!-- ═══ 08 // FORTUNE ════════════════════════════════════════════════════ -->

<picture>
  <source media="(max-width: 500px)" srcset="assets/generated/sec-08-m.svg">
  <img alt="08 // Fortune" title="08 // Fortune" src="assets/generated/sec-08.svg">
</picture>

<picture>
  <source media="(max-width: 500px)" srcset="assets/generated/fortune-m.svg">
  <img alt="A line that changes daily" title="Changes daily" src="assets/generated/fortune.svg">
</picture>


