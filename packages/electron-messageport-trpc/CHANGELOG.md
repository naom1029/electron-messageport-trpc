# Changelog

## [0.5.0](https://github.com/naom1029/electron-messageport-trpc/compare/electron-messageport-trpc-v0.4.2...electron-messageport-trpc-v0.5.0) (2026-07-05)


### Features

* add main-process high-level API ([#25](https://github.com/naom1029/electron-messageport-trpc/issues/25)) ([4f6dbd3](https://github.com/naom1029/electron-messageport-trpc/commit/4f6dbd3a2396de764f8ca58ef7ded395b7b4faad))
* add message protocol types ([371abd2](https://github.com/naom1029/electron-messageport-trpc/commit/371abd2e4f04dec8b5df96a127b8b1730691fe42))
* add port broker and preload helpers ([ab271ef](https://github.com/naom1029/electron-messageport-trpc/commit/ab271ef421273ee60cdb19f0c04d878458a7dfda))
* add port handler, client link, and subscription support ([cf8cc71](https://github.com/naom1029/electron-messageport-trpc/commit/cf8cc710652ad6be5984cfae3e14420e63d1abf7))
* add utility process support ([90dfad1](https://github.com/naom1029/electron-messageport-trpc/commit/90dfad1a6a0f60c73ebceae1212032188aeb862c))
* add utility topology examples ([#26](https://github.com/naom1029/electron-messageport-trpc/issues/26)) ([ae79781](https://github.com/naom1029/electron-messageport-trpc/commit/ae79781fd603243c35cfb7448081fe6d6ed80791))
* align subscription envelopes with tRPC v11 ([#42](https://github.com/naom1029/electron-messageport-trpc/issues/42)) ([ffaf0e6](https://github.com/naom1029/electron-messageport-trpc/commit/ffaf0e6573086d26ed0807b2ecd2745217b08a0d))
* Support tRPC data transformers ([#74](https://github.com/naom1029/electron-messageport-trpc/issues/74)) ([e0fa54f](https://github.com/naom1029/electron-messageport-trpc/commit/e0fa54f3412de9d234e50b270694a671c4bb67b2))


### Bug Fixes

* avoid bundling tRPC peer subpaths ([#44](https://github.com/naom1029/electron-messageport-trpc/issues/44)) ([f1c36c6](https://github.com/naom1029/electron-messageport-trpc/commit/f1c36c6f2227b7bd564a868c603e34b59842c57e))
* biome v2 config, README versions, and CI auto-merge ([e25e578](https://github.com/naom1029/electron-messageport-trpc/commit/e25e5786aa7e927b5056e9e9346a11496680d125))
* forward message ports into renderer ([#23](https://github.com/naom1029/electron-messageport-trpc/issues/23)) ([89063d2](https://github.com/naom1029/electron-messageport-trpc/commit/89063d2438dbf05e30c452e6a27eda1cfb58699a))
* Guard MessagePort protocol messages ([#69](https://github.com/naom1029/electron-messageport-trpc/issues/69)) ([0684e3d](https://github.com/naom1029/electron-messageport-trpc/commit/0684e3d06aa425d87dd41f2d86a99712b1cfea0a))
* Handle MessagePort clone errors ([#72](https://github.com/naom1029/electron-messageport-trpc/issues/72)) ([0a4faac](https://github.com/naom1029/electron-messageport-trpc/commit/0a4faac91bc33d852293f68140d99f6da1b13f1a))
* propagate query aborts over MessagePort links ([#76](https://github.com/naom1029/electron-messageport-trpc/issues/76)) ([748d68b](https://github.com/naom1029/electron-messageport-trpc/commit/748d68b8d5797c693c6f0b9c36141d2ea7aacdc7))
* remove explicit any from portLink ([#17](https://github.com/naom1029/electron-messageport-trpc/issues/17)) ([2b7c6f2](https://github.com/naom1029/electron-messageport-trpc/commit/2b7c6f22caafbb2f2c64aacf1586e9c574efe33b))
* use release-please manifest mode and fix lint warnings ([1826203](https://github.com/naom1029/electron-messageport-trpc/commit/1826203a9fde11df477ae02e7ea0d5a85799c9b8))
* **utility:** pass transformer to parent port handler ([#84](https://github.com/naom1029/electron-messageport-trpc/issues/84)) ([2b690e0](https://github.com/naom1029/electron-messageport-trpc/commit/2b690e04257ec782047f4a3a2c26e80b7ff212a0))

## [0.4.2](https://github.com/naom1029/electron-messageport-trpc/compare/electron-messageport-trpc-v0.4.1...electron-messageport-trpc-v0.4.2) (2026-06-07)


### Bug Fixes

* **utility:** pass transformer to parent port handler ([#84](https://github.com/naom1029/electron-messageport-trpc/issues/84)) ([78e4eb0](https://github.com/naom1029/electron-messageport-trpc/commit/78e4eb0fb539cc590c86ed14f79403b1dfeecea2))

## [0.4.1](https://github.com/naom1029/electron-messageport-trpc/compare/electron-messageport-trpc-v0.4.0...electron-messageport-trpc-v0.4.1) (2026-05-30)


### Bug Fixes

* propagate query aborts over MessagePort links ([#76](https://github.com/naom1029/electron-messageport-trpc/issues/76)) ([c2eeeec](https://github.com/naom1029/electron-messageport-trpc/commit/c2eeeecf1ad2d59c8f26398ee3ab9d7356d57670))

## [0.4.0](https://github.com/naom1029/electron-messageport-trpc/compare/electron-messageport-trpc-v0.3.2...electron-messageport-trpc-v0.4.0) (2026-05-30)


### Features

* Support tRPC data transformers ([#74](https://github.com/naom1029/electron-messageport-trpc/issues/74)) ([f0cf6eb](https://github.com/naom1029/electron-messageport-trpc/commit/f0cf6eb964a03c47498e6d5d43da1fd898a61119))

## [0.3.2](https://github.com/naom1029/electron-messageport-trpc/compare/electron-messageport-trpc-v0.3.1...electron-messageport-trpc-v0.3.2) (2026-05-27)


### Bug Fixes

* Handle MessagePort clone errors ([#72](https://github.com/naom1029/electron-messageport-trpc/issues/72)) ([c4fbc58](https://github.com/naom1029/electron-messageport-trpc/commit/c4fbc588ba91a96e7b1a188581ff811bce995c23))

## [0.3.1](https://github.com/naom1029/electron-messageport-trpc/compare/electron-messageport-trpc-v0.3.0...electron-messageport-trpc-v0.3.1) (2026-05-26)


### Bug Fixes

* Guard MessagePort protocol messages ([#69](https://github.com/naom1029/electron-messageport-trpc/issues/69)) ([9fcdec4](https://github.com/naom1029/electron-messageport-trpc/commit/9fcdec49d49d5f6d5943541a666d9340b582381f))

## [0.3.0](https://github.com/naom1029/electron-messageport-trpc/compare/electron-messageport-trpc-v0.2.0...electron-messageport-trpc-v0.3.0) (2026-05-21)


### Features

* align subscription envelopes with tRPC v11 ([#42](https://github.com/naom1029/electron-messageport-trpc/issues/42)) ([284f8ce](https://github.com/naom1029/electron-messageport-trpc/commit/284f8ce44feaf3585d6dd5cadaeb88aa581f438d))


### Bug Fixes

* avoid bundling tRPC peer subpaths ([#44](https://github.com/naom1029/electron-messageport-trpc/issues/44)) ([1262d6b](https://github.com/naom1029/electron-messageport-trpc/commit/1262d6b77b442434e7216459b32a0ece3c9fb2cf))

## [0.2.0](https://github.com/naom1029/electron-messageport-trpc/compare/electron-messageport-trpc-v0.1.1...electron-messageport-trpc-v0.2.0) (2026-04-03)


### Features

* add main-process high-level API ([#25](https://github.com/naom1029/electron-messageport-trpc/issues/25)) ([dbc62ee](https://github.com/naom1029/electron-messageport-trpc/commit/dbc62ee87f41bb9f7f9123b169045634e9c90781))
* add utility topology examples ([#26](https://github.com/naom1029/electron-messageport-trpc/issues/26)) ([d2060ab](https://github.com/naom1029/electron-messageport-trpc/commit/d2060ab08cda6068f5ac157bfd16a6c3892631fc))


### Bug Fixes

* forward message ports into renderer ([#23](https://github.com/naom1029/electron-messageport-trpc/issues/23)) ([80c8637](https://github.com/naom1029/electron-messageport-trpc/commit/80c8637ef93e7e580a27b9070164f0001d523011))

## [0.1.1](https://github.com/naom1029/electron-messageport-trpc/compare/electron-messageport-trpc-v0.1.0...electron-messageport-trpc-v0.1.1) (2026-03-29)


### Bug Fixes

* remove explicit any from portLink ([#17](https://github.com/naom1029/electron-messageport-trpc/issues/17)) ([915cb08](https://github.com/naom1029/electron-messageport-trpc/commit/915cb080ab41e87aca401e8e6000ec8325474b1e))
* use release-please manifest mode and fix lint warnings ([467bd9a](https://github.com/naom1029/electron-messageport-trpc/commit/467bd9a4800507567a0426f2ab6c6280957d14ec))
