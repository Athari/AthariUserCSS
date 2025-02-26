import S from 'string';
import { initializeLinq } from 'linq-to-typescript';

initializeLinq();
S.extendPrototype();

String.prototype.ellipsis = function (this: string, maxLength: number): string {
  return this.length > maxLength ? this.substring(0, maxLength - 3) + "..." : this;
};