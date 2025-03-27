import * as postCss from 'postcss';
import { Assigned, deepMerge } from '../utils.ts';
import { DeepRequired } from 'utility-types';

export namespace PostCss {

  // MARK: Types

  export import Processor = postCss.Processor;
  export import Result = postCss.Result;
  export import Warning = postCss.Warning;

  export type Plugin = postCss.Plugin;
  export type Processors = ReturnType<Assigned<Plugin['prepare']>>;
  export type PluginCreate<O> = ((opts?: O) => Plugin) & { postcss: true };

  // MARK: Plugins

  export function declarePlugin<O>(
    name: string,
    defaultOpts: DeepRequired<O>,
    processors: (opts: DeepRequired<O>) => Processors,
  ): PluginCreate<O> {
    return Object.assign(
      (opts?: O): Plugin => ({
        postcssPlugin: name,
        prepare() {
          const actualOpts = deepMerge(null, {}, defaultOpts, opts) as DeepRequired<O>;
          return processors(actualOpts);
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
    processors: (opts: O) => Processors,
  ): PluginCreate<O> {
    return Object.assign(
      (opts?: O): Plugin => ({
        postcssPlugin: name,
        prepare() {
          const actualOpts = Object.assign({}, defaultOptions, opts) as O;
          return processors(actualOpts);
        },
      }),
      {
        postcss: true as const,
      },
    );
  }
}