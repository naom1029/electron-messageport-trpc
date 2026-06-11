# API設計メモ

## バージョン方針

このパッケージは現在 `0.x` 系です。SemVer上は、`0.4.x` から
`0.5.0` のような `0.x` minor release で破壊的変更を入れることは
許容されます。

ただし、`0.x` だから破壊的変更を雑に入れてよいわけではありません。
既存ユーザーがいる前提で、破壊的変更は changelog や release notes で
明示するべきです。

基本方針:

- `0.4.1` から `0.4.2` のような patch release では破壊的変更を避ける。
- `0.4.x` から `0.5.0` のような minor release では、API改善の価値が
  明確な場合に破壊的変更を許容する。
- `1.0.0` は主要APIの形が固まるまで待つ。

## 現在の設計上の圧力

現行APIは、1つの renderer-to-main 接続にはかなり使いやすいです。

```ts
exposePortReceiver();

const client = createTRPCClient<AppRouter>({
  links: [portLink({ port: getPort() })],
});
```

問題は、1つのrendererやmain processが複数の接続を持ち始めたときです。

- renderer to main
- renderer to utility
- 複数の utility process
- router type が異なる複数の utility process
- main to 1つの utility process
- main to 複数の utility process
- main to 複数種類の utility router

ここで単純な `name: string` APIを足すだけでは型安全になりません。

```ts
const port = getPort({ name: 'utility' });

createTRPCClient<AppRouter>({
  links: [portLink({ port })],
});
```

TypeScriptは、`'utility'` という名前のportが `UtilityRouter` に接続されて
いるのか、`AppRouter` に接続されているのかを知ることができません。

## 現行APIの評価

低レベルのtransport APIは妥当です。

- `portLink({ port })` は renderer 側の `MessagePort` 用 tRPC client link。
- `mainPortLink({ port })` は Electron `MessagePortMain` 用の同等API。
- `createPortHandler({ port, router })` は server 側の直接的なrequest handler。

これらは tRPC の link model に沿っていて、transport が転送済み
`MessagePort` であることも隠しません。escape hatch として残すべきです。

一方で、高レベルのセットアップAPIはかなり狭いです。

- `exposePortReceiver()` は固定の `window.electronTRPCPort` だけを公開する。
- `getPort()` は module-level の `portPromise` を1つだけ持つ。
- `createWindowMessagePortHandler()` は windowごとに1つのrouterを接続する。
- `createPortBroker().createRendererPort()` は channel名なしで内部IPC channelに
  portを流す。

この形は quickstart には良いですが、1つのrendererで renderer-to-main と
renderer-to-utility を同時に扱うには不十分です。router type が異なる
utility processを複数扱う場合も、ユーザーが手動でportを配線し、さらに
runtime名とrouter typeの対応を自力で維持する必要があります。

## electron-trpcライクに使えないポイント

`electron-trpc` のquickstartはかなり軽いです。

- preload: `exposeElectronTRPC()`
- main: `createIPCHandler({ router, windows })`
- renderer: `ipcLink()`

一方で、このライブラリの現行quickstartは renderer 側で `getPort()` を
明示する必要があります。

```ts
createTRPCClient<AppRouter>({
  links: [portLink({ port: getPort() })],
});
```

これはtransportが `MessagePort` であることを明示する点では正直ですが、
標準的な利用者にとっては余計な配線に見えます。特に単一の
renderer-to-main topologyでは、`getPort()` を利用者に見せる必要性は薄いです。

改善候補:

```ts
createTRPCClient<AppRouter>({
  links: [portLink()],
});
```

`portLink()` が引数なしで呼ばれた場合は、内部でdefault channelのportを
取得すればよいです。既存の `portLink({ port: getPort() })` は低レベル用途や
明示的なport指定用途として残します。

同じ発想で、preload側も名前を揃えられます。

```ts
exposeElectronTRPC();
```

これは既存の `exposePortReceiver()` の別名、または新しい高レベルAPIとして
導入できます。`exposePortReceiver()` は低レベル名として残してよいです。

現行APIで electron-trpcライクに使いにくい点:

- rendererで `getPort()` を明示する必要がある。
- `portLink` に必ず `port` を渡す必要があり、`ipcLink()` と比べて重い。
- preload API名がtransport実装寄りで、アプリ利用者向けの名前ではない。
- `getPort()` がsingletonなので、同一renderer内の複数接続に拡張しにくい。
- `createWindowMessagePortHandler()` は renderer-to-main だけを自然に扱い、
  renderer-to-utility では手動broker配線になる。
- main-to-utilityも、`MessageChannelMain` 作成、`postMessage()`、
  `mainPortLink()` を利用者が手で組み合わせる必要がある。
- 同じrouter typeの複数utility instanceと、異なるrouter typeの複数utilityを
  API上で区別できていない。

## initTRPCで足りる部分と足りない部分

`initTRPC` で足りる部分:

- router定義。
- procedureのinput/output型。
- context型。
- middleware。
- error shape。
- transformer設定。
- tRPC client/proxy clientの型推論。

つまり、procedure modelそのものは tRPC に任せるべきです。このライブラリが
独自にprocedure clientを作り直す必要はありません。

`initTRPC` だけでは足りない部分:

- Electronのpreload/main/renderer/utility間でportをどう受け渡すか。
- どのrenderer/windowにどのrouter channelを接続するか。
- renderer-to-main と renderer-to-utility を同時に使うtopology。
- main-to-utility のclient setup。
- 複数utility instanceのruntime routing。
- channel名とrouter typeをcompile timeに結びつける契約。
- lifecycle cleanup。

ここはこのライブラリが担当する価値があります。ただし、担当すべきなのは
Electron topology と MessagePort setup であり、tRPC自体の抽象を上書きする
ことではありません。

## すぐ改善できるAPI候補

後方互換を保ちながら、electron-trpcライクな使い勝手に近づける候補です。

### `portLink()` のdefault port対応

```ts
// before
links: [portLink({ port: getPort() })]

// after
links: [portLink()]
```

`portLink()` の `opts` をoptionalにします。

```ts
interface PortLinkOptions {
  port?: RendererPortLike | Promise<RendererPortLike>;
  transformer?: DataTransformerOptions;
}
```

`opts.port` がなければ `getPort()` を内部で呼ぶ。これは単一channelの
quickstartを軽くできます。

注意点:

- renderer専用entryでのみ成立する。
- multi-channelでは `portLink({ port })` または typed registry APIを使う。
- `getPort()` 自体は低レベルAPIとして残す。

### `exposeElectronTRPC()` alias

```ts
// before
exposePortReceiver();

// after
exposeElectronTRPC();
```

`exposePortReceiver()` は実装寄りの名前です。quickstartでは
`exposeElectronTRPC()` の方が利用者にとって自然です。

互換性を保つなら、まずはaliasとして追加します。

```ts
export const exposeElectronTRPC = exposePortReceiver;
```

### `createElectronTRPCHandler()` alias

```ts
// before
createWindowMessagePortHandler({ router, windows: [win] });

// after
createElectronTRPCHandler({ router, windows: [win] });
```

`createWindowMessagePortHandler()` は正確ですが、quickstartの名前としては
transport詳細が強いです。高レベルaliasを足すと、electron-trpcの
`createIPCHandler()` に近い見た目になります。

ただし、MessagePort transportであることはこのライブラリの訴求点なので、
docsでは「高レベルAPI」と「MessagePort低レベルAPI」を分けて説明するのがよいです。

### main-to-utility helper

```ts
const client = createUtilityClient({
  router: utilityRouterType,
  utility: child,
});
```

実際には router value ではなく router type / channel 契約に寄せるべきです。
最低限、`MessageChannelMain` と `child.postMessage()` と `mainPortLink()` を
毎回手で組む状況は改善したいです。

これは単なるaliasより設計影響が大きいため、typed registry APIと一緒に検討します。

## 非目標

- `name: string` を中核APIにしない。runtime routingは解決できても、
  channel名とrouter typeを型で結びつけられない。
- tRPCを独自RPC clientで覆い隠さない。links、inference、middleware、
  errors、subscriptions など通常のtRPC modelを維持する。
- 単純な renderer-to-main setup を冗長にしない。quickstart は手動の
  Electron MessagePort wiring より短くあるべき。

## 後方互換を保ったまま改善できること

以下は現行APIを壊さないため、`0.4.x` の patch/minor release で入れられる
候補です。

### Context typing

`createContext` の型を `Promise<unknown>` から `MaybePromise<unknown>` に
広げる。実装はすでに `await` しているため、ほぼ型だけの改善です。

```ts
type MaybePromise<T> = T | Promise<T>;
```

対象:

- `createPortHandler({ createContext })`
- `createWindowMessagePortHandler({ createContext })`
- `createParentPortHandler({ createContext })`

### Handler lifecycle

`createParentPortHandler()` に lifecycle handle を持たせる。

```ts
interface ParentPortHandler {
  handlers: PortHandler[];
  destroy(): void;
}
```

既存の `{ handlers }` を残せば、既存ユーザーは壊れません。

### Additive named ports

named ports は互換性のある中間改善としてはありです。ただし、最終的な
top-level designにはしない方がよいです。

```ts
exposePortReceiver({ channels: ['main', 'utility'] });
getPort({ channel: 'main' });
getPort({ channel: 'utility' });
createPortBroker().createRendererPort(webContents, { channel: 'utility' });
```

これにより1つのrendererが複数portを受け取れるようになります。ただし、
router typingはまだユーザー側に残ります。

```ts
createTRPCClient<UtilityRouter>({
  links: [portLink({ port: getPort({ channel: 'utility' }) })],
});
```

これは段階的なescape hatchとしては許容できますが、主APIにするには弱いです。

## 破壊的変更を許す場合

ad hoc な named ports より、typed registry を優先します。

概念的にはこうです。

```ts
type ElectronTRPCRegistry = {
  main: AppRouter;
  utility: UtilityRouter;
};
```

公開APIでは、channel key と router type が一緒に動く必要があります。

```ts
const channels = defineElectronTRPC<{
  main: AppRouter;
  utility: UtilityRouter;
}>();
```

Renderer:

```ts
const trpc = createElectronTRPCClient(channels);

await trpc.main.greet.query();
await trpc.utility.heavyTask.mutate();
```

Main:

```ts
createElectronTRPCMain({
  channels,
  windows: [win],
  routers: {
    main: appRouter,
  },
});
```

Utility:

```ts
createElectronTRPCUtility({
  channel: channels.utility,
  router: utilityRouter,
  parentPort: process.parentPort,
});
```

関数名は仮です。重要なのは、任意のruntime名と無関係なrouter typeを
自由に組み合わせられない設計にすることです。

## `0.5.0` で実装する非互換API

`0.5.0` では、互換aliasを積む方向ではなく、typed registry をprimary APIに
します。既存の低レベルAPIはescape hatchとして残しますが、quickstartとdocsの
中心は新APIに寄せます。

### Root

```ts
import { defineElectronTRPC } from 'electron-messageport-trpc';

export const electronTRPC = defineElectronTRPC<{
  main: AppRouter;
  worker: WorkerRouter;
}>();
```

`defineElectronTRPC()` はruntimeではchannel名を持つだけです。routerの実体は
各process側で登録します。型上は、channel key と router type を結びつける
契約になります。

### Preload

```ts
import { exposeElectronTRPC } from 'electron-messageport-trpc/preload';
import { electronTRPC } from './trpc/electron';

exposeElectronTRPC(electronTRPC);
```

preloadは複数channelのportを受け取れる必要があります。現行の
`window.electronTRPCPort.requestPort()` はdefault channel前提なので、0.5では
channel名を受け取れるbridgeに変えます。

### Renderer

```ts
import { createElectronTRPCClient } from 'electron-messageport-trpc/renderer';
import { electronTRPC } from './trpc/electron';

const trpc = createElectronTRPCClient(electronTRPC);

await trpc.main.ping.query();
await trpc.worker.render.mutate(input);
```

renderer利用者は基本的に `getPort()` を直接使いません。`getPort()` は
低レベルAPIとして残しますが、内部実装は `Map<channel, Promise<MessagePort>>`
に変えます。

### Main, renderer-to-main

```ts
import { createElectronTRPCMain } from 'electron-messageport-trpc/main';
import { electronTRPC } from './trpc/electron';
import { appRouter } from './router';

createElectronTRPCMain({
  channels: electronTRPC,
  windows: [win],
  routers: {
    main: appRouter,
  },
});
```

`routers` はregistryに存在するkeyだけを受け付け、各keyのrouter typeと一致する
routerだけを登録できるようにします。

### Main, main-to-utility

```ts
const worker = createElectronTRPCUtilityClient({
  channel: electronTRPC.worker,
  utility: child,
});

await worker.render.mutate(input);
```

main processからutility processへ呼び出す場合、利用者が毎回
`MessageChannelMain`、`child.postMessage()`、`mainPortLink()` を組み立てる
必要はありません。

### Main, renderer-to-utility

```ts
createElectronTRPCRendererUtilityBridge({
  window: win,
  channel: electronTRPC.worker,
  utility: child,
});
```

main processはbrokerとして、rendererに渡すportとutilityに渡すportを作ります。
request pathからmain processを外すtopologyを高レベルAPIで表現します。

### Main, utility pool

```ts
const workers = createElectronTRPCUtilityPool({
  channel: electronTRPC.worker,
  utilities: {
    a: workerA,
    b: workerB,
  },
});

await workers.get('a').render.mutate(input);
```

registry keyはrouter typeを表し、poolのkeyはruntime instance IDを表します。
この2つを混ぜません。

### Utility

```ts
import { createElectronTRPCUtility } from 'electron-messageport-trpc/utility';
import { electronTRPC } from './trpc/electron';
import { workerRouter } from './router';

createElectronTRPCUtility({
  channel: electronTRPC.worker,
  router: workerRouter,
  parentPort: process.parentPort,
});
```

utility側もchannelとrouter typeを一致させます。runtimeではchannel名で
connect messageをfilterできるようにします。

### 残す低レベルAPI

- `portLink({ port })`
- `mainPortLink({ port })`
- `createPortHandler({ port, router })`
- `createPortBroker()`

これらは手動topology、テスト、特殊なport管理のために残します。

### 0.5でlegacy扱いにするAPI

- `exposePortReceiver()`
- bare `getPort()`
- `createWindowMessagePortHandler()`
- `createParentPortHandler()`

削除まではしませんが、docs上の主APIからは外します。`getPort()` は
`getPort({ channel })` を推奨し、bare callはdefault channel用のescape hatchと
して扱います。

## 推奨する主APIの方向性

renderer-to-main だけの最小構成では、registryを要求しないdefault channel APIを
primaryにします。

```ts
createElectronTRPCMain({
  windows: [win],
  router: appRouter,
});

const client = createElectronTRPCClient<AppRouter>();
await client.ping.query();
```

typed channel registry は opt-in です。renderer-to-main と renderer-to-utilityを
同時に扱う場合や、複数utility routerを持つ場合にだけ使います。registryを契約
として扱い、main、renderer、utility の各コードが同じ契約をimportすることで、
channel名とrouter typeを結びつけます。

```ts
// trpc/electron.ts
import { defineElectronTRPC } from 'electron-messageport-trpc';
import type { AppRouter } from './main-router';
import type { UtilityRouter } from './utility-router';

export const electronTRPC = defineElectronTRPC<{
  main: AppRouter;
  utility: UtilityRouter;
}>();
```

Renderer:

```ts
import { createElectronTRPCClient } from 'electron-messageport-trpc/renderer';
import { electronTRPC } from './trpc/electron';

const client = createElectronTRPCClient(electronTRPC);

await client.main.ping.query();
await client.utility.renderPreview.mutate(input);
```

Preload:

```ts
import { exposeElectronTRPC } from 'electron-messageport-trpc/preload';
import { electronTRPC } from './trpc/electron';

exposeElectronTRPC(electronTRPC);
```

Main, renderer-to-main:

```ts
import { createElectronTRPCMain } from 'electron-messageport-trpc/main';
import { electronTRPC } from './trpc/electron';
import { appRouter } from './main-router';

createElectronTRPCMain({
  channels: electronTRPC,
  windows: [win],
  routers: {
    main: appRouter,
  },
});
```

Main, renderer-to-utility broker:

```ts
createElectronTRPCRendererUtilityBridge({
  window: win,
  channel: electronTRPC.utility,
  utility: child,
});
```

Main, main-to-utility client:

```ts
const utilityClient = createElectronTRPCUtilityClient({
  channel: electronTRPC.utility,
  utility: child,
});

await utilityClient.renderPreview.mutate(input);
```

Main, 同じrouterを持つ複数utility instances:

```ts
const workers = createElectronTRPCUtilityPool({
  channel: electronTRPC.worker,
  utilities: {
    previewA: childA,
    previewB: childB,
  },
});

await workers.get('previewA').renderPreview.mutate(input);
```

Utility:

```ts
import { createElectronTRPCUtility } from 'electron-messageport-trpc/utility';
import { electronTRPC } from './trpc/electron';
import { utilityRouter } from './utility-router';

createElectronTRPCUtility({
  channel: electronTRPC.utility,
  router: utilityRouter,
  parentPort: process.parentPort,
});
```

このAPI案で守りたい条件:

- rendererが `utility` channelを要求したのに、誤って `AppRouter` として
  型付けできない。
- utility handlerが `utility` channelに `AppRouter` を登録できない。
- quickstartは1 channel / 1 routerのまま、手動port配線なしで書ける。

## tRPCとの互換性

高レベルAPIは内部で通常の tRPC client を作るべきです。別のprocedure call
modelを発明しない方がよいです。

renderer helper は channelごとの tRPC client を返す形にできます。ただし、
各channelは引き続き `createTRPCClient()` と `portLink()` によって支えられる
べきです。

```ts
const client = createElectronTRPCClient(electronTRPC, {
  transformer: superjson,
});
```

channelごとのoptionが必要になる可能性もあります。

```ts
const client = createElectronTRPCClient(electronTRPC, {
  channels: {
    main: { transformer: superjson },
    utility: { transformer: superjson },
  },
});
```

これが重すぎる場合は、transformer設定はrouter/link levelに残し、低レベルの
`portLink()` を明示的な逃げ道として残します。

## 複数utility process

複数utility processには2種類あります。

### 同じrouter typeの複数instances

1つのregistry keyとruntime instance IDで十分に型安全です。

```ts
type ElectronTRPCRegistry = {
  worker: WorkerRouter;
};
```

runtimeのinstance選択はruntime-onlyでよいです。

```ts
const worker = trpc.worker({ id: workerId });
await worker.renderFrame.mutate(input);
```

`workerId` の背後にある全workerは `WorkerRouter` を公開している必要があります。

重要なのは、registry key と instance ID を分けることです。

- `worker` は `WorkerRouter` を意味する。
- `{ id: workerId }` はどのworker processに送るかだけを選ぶ。

型システムが全runtime worker IDを知ろうとする必要はありません。

これは renderer-to-utility だけでなく main-to-utility にも当てはまります。

main-to-utilityでは、main processが tRPC client になります。必要になる形は
以下です。

- 1つのrouterに対して1つのutility process。
- 同じrouterを公開する複数utility process。
- image processing、database work、build tasks など、router typeが異なる
  複数utility process。

APIでは router type と runtime instance selection を分けます。

```ts
const imageWorkers = createElectronTRPCUtilityPool({
  channel: electronTRPC.imageWorker,
  utilities: {
    a: imageWorkerA,
    b: imageWorkerB,
  },
});

await imageWorkers.get('a').resize.mutate(input);
await imageWorkers.get('b').resize.mutate(input);
```

utility typeが異なる場合は、registry keyを分けます。

```ts
const imageWorker = createElectronTRPCUtilityClient({
  channel: electronTRPC.imageWorker,
  utility: imageChild,
});

const dbWorker = createElectronTRPCUtilityClient({
  channel: electronTRPC.dbWorker,
  utility: dbChild,
});

await imageWorker.resize.mutate(input);
await dbWorker.vacuum.mutate();
```

以下のような単一のuntyped utility clientは避けます。

```ts
getUtilityClient('imageWorker');
```

これは `getPort(name)` と同じ弱点を持ちます。runtime string と router type が
ずれる可能性があります。

### 異なるrouter type

router typeが異なる場合は、別のregistry keyを使います。

```ts
type ElectronTRPCRegistry = {
  imageWorker: ImageWorkerRouter;
  dbWorker: DbWorkerRouter;
};
```

これにより、どのrouter typeなのかをcompile timeに保てます。

## API目標

- 単純な renderer-to-main path は小さく保つ。
- topologyを明示する。ただし、application codeに低レベルの `MessagePort`
  handlingを強制しない。
- `getPort(name)` を主抽象にしない。使う場合でも typed registry の裏側か
  escape hatchに留める。
- `portLink`、`mainPortLink`、`createPortHandler` は低レベルescape hatchとして
  残す。
- main、renderer、utility processで1つの高レベルmental modelを持てるようにする。

## ロードマップ案

### Patch line

- additiveなcorrectness fixesを完了する。
- `createContext` を `MaybePromise` に広げる。
- `createParentPortHandler().destroy()` を追加する。
- docsは現在の公開APIに絞る。

### `0.5.0` candidate

- main-only default channel APIをprimary quickstartとして追加する。
- typed registry APIをmulti-topology用のopt-in高レベルAPIとして追加する。
- 既存の低レベルlinks/handlersは残す。
- 現行のsingleton helpersは互換helperとして残す。新APIがquickstartをきれいに
  覆える場合のみlegacy扱いを検討する。
- examplesを追加する。
  - renderer-to-main only
  - main-to-utility
  - 1つのrendererで renderer-to-main と renderer-to-utility を同時に使う
  - 同じrouter typeの複数utility instances
  - router typeが異なる複数の main-to-utility clients

### `1.0.0` gate

以下が安定するまで `1.0.0` は出さない。

- 1 channel quickstart API。
- typed multi-channel renderer API。
- utility process topology API。
- lifecycle / cleanup behavior。
- transformer behavior。
- React Query smoke coverage。
- `Blob` など structured-clone edge cases の対応範囲とtransport behaviorを
  明確にdocumentする。

## Migration idea

`0.5.0` の破壊的変更にする場合:

1. typed registry APIをprimary APIとして導入する。
2. 低レベルlinks/handlersは可能な限り残す。
3. bare `getPort()` のようなsingleton renderer helpersは、新APIが基本の
   renderer-to-main caseを完全に覆える場合のみdeprecateする。
4. 以下から新しいtyped client shapeへのmigrationをdocumentする。

```ts
portLink({ port: getPort() })
```
