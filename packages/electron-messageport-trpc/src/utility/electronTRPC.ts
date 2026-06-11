import type { ElectronTRPCChannel, RouterForChannel } from '../core/index';
import type { DataTransformerOptions } from '../shared/transformer';
import {
  createParentPortHandler,
  type ParentPortHandler,
  type ParentPortLike,
} from './parentPortHandler';

type MaybePromise<T> = T | Promise<T>;

export interface CreateElectronTRPCUtilityOptions<
  TChannel extends ElectronTRPCChannel,
> {
  channel: TChannel;
  router: RouterForChannel<TChannel>;
  parentPort: ParentPortLike;
  createContext?: () => MaybePromise<unknown>;
  transformer?: DataTransformerOptions;
}

export function createElectronTRPCUtility<TChannel extends ElectronTRPCChannel>(
  opts: CreateElectronTRPCUtilityOptions<TChannel>,
): ParentPortHandler {
  return createParentPortHandler({
    router: opts.router,
    parentPort: opts.parentPort,
    channel: opts.channel.name,
    createContext: opts.createContext,
    transformer: opts.transformer,
  });
}
