import S from 'string';
import * as Linq from 'linq-to-typescript';
import * as IteratorHelpersPolyfill from 'iterator-helpers-polyfill';
import { Html } from './html/index.ts';

// MARK: Hardcore prototype sex

Linq.initializeLinq();
S.extendPrototype();
IteratorHelpersPolyfill.installIntoGlobal();
Html.extendPrototype();

String.prototype.ellipsis = function (this: string, maxLength: number): string {
  return this.length > maxLength ? this.substring(0, maxLength - 3) + "..." : this;
};