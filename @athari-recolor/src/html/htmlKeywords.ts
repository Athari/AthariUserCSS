// MARK: Constants

import { isAssigned, isString, MostSpecific } from "../utils.ts";

export const kwh = new class {
  readonly tag = new class {
    readonly html = 'html';
  };
  readonly attr = new class {
    readonly style = 'style';
  };
};

// MARK: Types

// MARK: Utils

const equalityComparer = Intl.Collator('en-US', { usage: 'search', sensitivity: 'accent', ignorePunctuation: false });

export function equals<T extends string | null | undefined, V extends string>(kw: T, values: readonly V[] | V): kw is MostSpecific<T, V> {
  return isAssigned(kw) && isAssigned(values) &&
    (isString(values) ? !equalityComparer.compare(kw, values) : values.some(v => !equalityComparer.compare(kw, v)));
}