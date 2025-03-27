import S from 'string';
import { initializeLinq } from 'linq-to-typescript';
import { installIntoGlobal as installIteratorHelpersIntoGlobal } from 'iterator-helpers-polyfill';
import { Html } from './domUtils.ts';

// MARK: Hardcore prototype sex

initializeLinq();
S.extendPrototype();
installIteratorHelpersIntoGlobal();
Html.extendPrototype();

String.prototype.ellipsis = function (this: string, maxLength: number): string {
  return this.length > maxLength ? this.substring(0, maxLength - 3) + "..." : this;
};