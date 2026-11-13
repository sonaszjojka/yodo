# Changelog

## [1.7.0](https://github.com/sonaszjojka/yodo/compare/v1.6.0...v1.7.0) (2026-11-13)


### Features

* **mcp:** draw real images in render_drawing ([#210](https://github.com/sonaszjojka/yodo/issues/210)) ([1866d22](https://github.com/sonaszjojka/yodo/commit/1866d22beee3e96de7414d7f5d6280c3df09b9d7))


### Bug Fixes

* **web:** re-snap attached arrows when a shape's corners change ([#208](https://github.com/sonaszjojka/yodo/issues/208)) ([736dfe0](https://github.com/sonaszjojka/yodo/commit/736dfe04d22c5362e9939c78cb0002f1de95d91b))

## [1.6.0](https://github.com/sonaszjojka/yodo/compare/v1.5.0...v1.6.0) (2026-11-13)


### Features

* **mcp:** add create_diagram with dagre auto-layout ([#203](https://github.com/sonaszjojka/yodo/issues/203)) ([3e2b2da](https://github.com/sonaszjojka/yodo/commit/3e2b2da4060f12fd6695fa4e5fdc7d67ab425d59))
* **mcp:** add create, add, update, delete and connect write tools ([#201](https://github.com/sonaszjojka/yodo/issues/201)) ([3d134c5](https://github.com/sonaszjojka/yodo/commit/3d134c5aceee65a6e1370d8974de65d01fa36a86))
* **mcp:** add render_drawing with PNG and SVG output ([#198](https://github.com/sonaszjojka/yodo/issues/198)) ([cd98705](https://github.com/sonaszjojka/yodo/commit/cd98705e1c408b30460bf9c9dac524150cf8185f))
* **mcp:** ship yodo-mcp on npm, tested against the Go server ([#206](https://github.com/sonaszjojka/yodo/issues/206)) ([f82900a](https://github.com/sonaszjojka/yodo/commit/f82900afc9700e45b8f698c0460353d9cac9f89d))
* open drawings from #/open links, returned by the MCP file backend ([#205](https://github.com/sonaszjojka/yodo/issues/205)) ([e758ac9](https://github.com/sonaszjojka/yodo/commit/e758ac92f5fb5c3384b66b158526e01ab349c1fb))


### Bug Fixes

* resolve code scanning alerts ([#204](https://github.com/sonaszjojka/yodo/issues/204)) ([b61f756](https://github.com/sonaszjojka/yodo/commit/b61f756c2efbb3764149b8efef60d8ebe55d8160))

## [1.5.0](https://github.com/sonaszjojka/yodo/compare/v1.4.0...v1.5.0) (2026-11-11)


### Features

* **mcp:** add a standalone file backend ([#196](https://github.com/sonaszjojka/yodo/issues/196)) ([694c22e](https://github.com/sonaszjojka/yodo/commit/694c22efcb36e456bcb015a0896c9fd1a986f0be))

## [1.4.0](https://github.com/sonaszjojka/yodo/compare/v1.3.0...v1.4.0) (2026-11-10)


### Features

* **mcp:** add the yodo-mcp server with read-only drawing tools ([#194](https://github.com/sonaszjojka/yodo/issues/194)) ([1d13005](https://github.com/sonaszjojka/yodo/commit/1d13005e3abab261170d0fb062759e3224ee880e))

## [1.3.0](https://github.com/sonaszjojka/yodo/compare/v1.2.0...v1.3.0) (2026-11-10)


### Features

* **server:** optional API token for non-browser clients ([#192](https://github.com/sonaszjojka/yodo/issues/192)) ([81c9961](https://github.com/sonaszjojka/yodo/commit/81c99614ad288917f94a763ded433423dae688c0))

## [1.2.0](https://github.com/sonaszjojka/yodo/compare/v1.1.0...v1.2.0) (2026-11-10)


### Features

* safe concurrent saves with If-Match and conflicted copies ([#188](https://github.com/sonaszjojka/yodo/issues/188)) ([1761ed0](https://github.com/sonaszjojka/yodo/commit/1761ed0c3b18e309bd3d62a7c047f2792d85b2c1))

## [1.1.0](https://github.com/sonaszjojka/yodo/compare/v1.0.0...v1.1.0) (2026-11-09)


### Features

* **web:** attach arrows by dragging their ends and outline the target ([#146](https://github.com/sonaszjojka/yodo/issues/146)) ([fcc7fc8](https://github.com/sonaszjojka/yodo/commit/fcc7fc875271f11a6b0719921b7988c5c46eff62)), closes [#135](https://github.com/sonaszjojka/yodo/issues/135)
* **web:** attach arrows to lines and arrows, and edit arrowheads at both ends ([#148](https://github.com/sonaszjojka/yodo/issues/148)) ([3efcdae](https://github.com/sonaszjojka/yodo/commit/3efcdae286c5d3586390374e0314ea7aeecf0be9)), closes [#137](https://github.com/sonaszjojka/yodo/issues/137)
* **web:** bend lines and arrows with point handles and a mid-handle ([#147](https://github.com/sonaszjojka/yodo/issues/147)) ([7639e8b](https://github.com/sonaszjojka/yodo/commit/7639e8b8bb0ab5281e2640c27b9e0b442b73a74b)), closes [#136](https://github.com/sonaszjojka/yodo/issues/136)
* **web:** keep the drawing tool active after each element ([#140](https://github.com/sonaszjojka/yodo/issues/140)) ([6963058](https://github.com/sonaszjojka/yodo/commit/69630586c731ee9003b3fe051790e8a037092ec6))
* **web:** let the text tool place free text over shapes ([#144](https://github.com/sonaszjojka/yodo/issues/144)) ([6059555](https://github.com/sonaszjojka/yodo/commit/60595558186ff079b882cc94db50ccb0a57ce0e6))
* **web:** move theme to a sidebar switch and tidy the Home toolbar ([#143](https://github.com/sonaszjojka/yodo/issues/143)) ([561fa55](https://github.com/sonaszjojka/yodo/commit/561fa557cfabda9f1eda0115d1b3c5aad7dda64d))
* **web:** one Export button with a Yodo file tab in the export dialog ([#151](https://github.com/sonaszjojka/yodo/issues/151)) ([b231a91](https://github.com/sonaszjojka/yodo/commit/b231a91fcb02a0a7f7b8e2008521a1b7a9b06098)), closes [#139](https://github.com/sonaszjojka/yodo/issues/139)
* **web:** show a circle cursor for the eraser ([#141](https://github.com/sonaszjojka/yodo/issues/141)) ([664a6c9](https://github.com/sonaszjojka/yodo/commit/664a6c92df194bcc7db92c39bb54d24eefff03e2))


### Bug Fixes

* **web:** keep the shortcuts list's keys off its scrollbar ([#145](https://github.com/sonaszjojka/yodo/issues/145)) ([3e2be49](https://github.com/sonaszjojka/yodo/commit/3e2be49400a0570c87afc36470395fd2652bbb74))
* **web:** round a diamond's corners by its edge length ([#150](https://github.com/sonaszjojka/yodo/issues/150)) ([d56e1a0](https://github.com/sonaszjojka/yodo/commit/d56e1a0af5777460082a4cb499ae75d00b5c62b0)), closes [#138](https://github.com/sonaszjojka/yodo/issues/138)

## Changelog

All notable changes are listed here, generated from Conventional Commits by release-please ([ADR 0058](docs/adr/0058-release-please-for-versions-and-changelog.md)). Releases before this file are on the [releases page](https://github.com/sonaszjojka/yodo/releases).
