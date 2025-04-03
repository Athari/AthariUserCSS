import * as postCss from 'postcss';
import { Assigned, deepMerge } from '../utils.ts';
import { DeepRequired } from 'utility-types';

// MARK: Types

export import Processor = postCss.Processor;
export import Result = postCss.Result;
export import Warning = postCss.Warning;

export type LazyResult = postCss.LazyResult;
export type Plugin = postCss.Plugin;
export type AcceptedPlugin = postCss.AcceptedPlugin;
export type Processors = ReturnType<Assigned<Plugin['prepare']>>;
export type PluginCreate<O> = ((opts?: O) => Plugin) & { postcss: true };

// MARK: Plugins

export function declarePlugin<O>(
  name: string,
  defaultOpts: DeepRequired<O>,
  processorsFn: (opts: DeepRequired<O>, result: Result) => Processors,
): PluginCreate<O> {
  return Object.assign(
    (opts?: O): Plugin => ({
      postcssPlugin: name,
      prepare(result: Result) {
        const actualOpts = deepMerge(null, {}, defaultOpts, opts) as DeepRequired<O>;
        return processorsFn(actualOpts, result);
      },
    }),
    {
      postcss: true as const,
    },
  );
}

export function declarePluginOpt<O>(
  name: string,
  defaultOptions: O,
  processorsFn: (opts: O, result: Result) => Processors,
): PluginCreate<O> {
  return Object.assign(
    (opts?: O): Plugin => ({
      postcssPlugin: name,
      prepare(result: Result) {
        const actualOpts = Object.assign({}, defaultOptions, opts) as O;
        return processorsFn(actualOpts, result);
      },
    }),
    {
      postcss: true as const,
    },
  );
}