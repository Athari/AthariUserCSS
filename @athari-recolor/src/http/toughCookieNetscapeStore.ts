import fs from 'fs/promises';
import { Cookie, Store, canonicalDomain, permuteDomain, permutePath } from 'tough-cookie';

// Based on https://www.npmjs.com/package/@root/file-cookie-store (MIT)

const NetscapeHeader = `# Netscape HTTP Cookie File
# https://everything.curl.dev/http/cookies/fileformat.html
# This is a generated file!  Do not edit.

`;

type PickByValue<T, V> = Pick<T, {
  [K in keyof T]-?: T[K] extends V ? K : never;
}[keyof T]>;
type NetscapeCookieStoreInit = Partial<Omit<
  PickByValue<NetscapeCookieStore, string | number | boolean>,
  keyof Store | 'path'
>>;

class NetscapeCookieStore extends Store {
  path: string;
  writeMode: number = 0o666;
  forceParse: boolean = false;
  supportHttpOnly: boolean = true;
  alwaysRead: boolean = false;
  alwaysWrite: boolean = true;

  #cookies: Record<string, Record<string, Record<string, Cookie>>> = {};
  #isFileRead: boolean = false;

  constructor(path: string, init: NetscapeCookieStoreInit = {}) {
    super();
    this.path = path;
    Object.assign(this, init);
  }

  inspect(): string {
    return `{ idx: ${JSON.stringify(this.#cookies, null, 2)} }`;
  }

  async readFile(): Promise<void> {
    try {
      this.deserialize(await fs.readFile(this.path, 'utf8'));
      this.#isFileRead = true;
    } catch (ex: unknown) {
      if (ex instanceof Error && 'code' in ex && ex.code === 'ENOENT') {
        await fs.writeFile(this.path, NetscapeHeader);
        return;
      }
      throw new Error("Failed to read Nestscape cookie store", { cause: ex });
    }
  }

  async #readFileIfNeeded(): Promise<void> {
    if (this.#isFileRead && !this.alwaysRead)
      return;
    await this.readFile();
  }

  async writeFile(): Promise<void> {
    await fs.writeFile(this.path, this.serialize(), { mode: this.writeMode });
  }

  async #writeFileIfNeeded(): Promise<void> {
    if (!this.alwaysWrite)
      return;
    await this.writeFile();
  }

  async #update(updateFn: () => void): Promise<void> {
    await this.#readFileIfNeeded();
    updateFn();
    await this.#writeFileIfNeeded();
  }

  serialize(): string {
    const boolStr = (b: boolean): string => b ? 'TRUE' : 'FALSE';
    let lines = [ NetscapeHeader ];
    for (const paths of Object.values(this.#cookies)) {
      for (const keys of Object.values(paths)) {
        for (const cookie of Object.values(keys)) {
          if (cookie) {
            const { domain, path, expires, secure, key, value, httpOnly } = cookie;
            const line = [
              (this.supportHttpOnly && httpOnly ? `#HttpOnly_${domain}` : domain) ?? "",
              boolStr(domain != null && /^\./.test(domain)),
              path ?? "",
              boolStr(secure),
              expires && expires !== 'Infinity' ? Math.round(expires.getTime() / 1000) : 0,
              key,
              value,
            ].join("\t");
            lines.push(line);
          }
        }
      }
    }
    return lines.join("\n");
  }

  deserialize(text: string): void {
    const lines = text.split(/\r\n|\n/);
    const [ magic ] = lines;

    if ((!magic || !/^#(?: Netscape)? HTTP Cookie File/.test(magic)) && !this.forceParse)
      throw new Error(`${this.path} does not look like a Netscape cookies file`);

    for (const line of lines) {
      if (/^\s*$/.test(line) || /^\s*#/.test(line) && !/^#HttpOnly_/.test(line))
        continue;

      let httpOnly = false;
      let parsedLine = line;
      if (this.supportHttpOnly && /^#HttpOnly_/.test(line)) {
        httpOnly = true;
        parsedLine = line.replace(/^#HttpOnly_(.*)/, '$1');
      }

      const parsedLineParts = parsedLine.split("\t");
      if (parsedLineParts.length != 7 && !this.forceParse)
        throw new Error(`Invalid cookie line: ${line}`);

      const [ domain = null, , path = null, secure = "FALSE", expires = "", key = "", value = "" ] = parsedLineParts;
      this.#addCookie(new Cookie({
        domain: canonicalDomain(domain) ?? null,
        path,
        secure: secure === 'TRUE',
        expires: parseInt(expires) ? new Date(parseInt(expires) * 1000) : 'Infinity',
        key,
        value,
        httpOnly,
        hostOnly: !/^\./.test(domain ?? ""),
      }));
    }
  }

  override async findCookie(domain?: string, path?: string, key?: string): Promise<Cookie | undefined> {
    await this.#readFileIfNeeded();
    return this.#cookies[canonicalDomain(domain) ?? domain ?? ""]?.[path ?? ""]?.[key ?? ""];
  }

  override async findCookies(domain?: string, path?: string): Promise<Cookie[]> {
    if (!domain)
      return [];

    const v = Object.values;

    await this.#readFileIfNeeded();
    const canDomain = canonicalDomain(domain) ?? domain;
    const matchedDomains = permuteDomain(canDomain) || [ canDomain ];

    const results: Cookie[] = [];
    for (const matchedDomain of matchedDomains) {
      const domainCookies = this.#cookies[matchedDomain];
      if (!domainCookies)
        continue;

      if (!path) {
        results.push(...v(domainCookies).flatMap(pc => v(pc).flatMap(v)));
      } else if (path === '/') {
        const pathCookies = domainCookies['/'];
        if (pathCookies)
          results.push(...v(pathCookies).flatMap(v));
      } else {
        const matchedPaths = permutePath(path) || [path];
        for (const matchedPath of matchedPaths) {
          const pathCookies = domainCookies[matchedPath];
          if (pathCookies)
            results.push(...v(pathCookies).flatMap(v));
        }
      }
    }
    return results;
  }

  #addCookie(cookie: Cookie): void {
    const domain = cookie.canonicalizedDomain() ?? "";
    const path = cookie.path ?? "";
    const key = cookie.key ?? "";
    this.#cookies[domain] ??= {};
    this.#cookies[domain][path] ??= {};
    this.#cookies[domain][path][key] = cookie;
  }

  override async putCookie(cookie: Cookie): Promise<void> {
    await this.#update(() =>
      this.#addCookie(cookie));
  }

  override async updateCookie(oldCookie: Cookie, newCookie: Cookie): Promise<void> {
    await this.putCookie(newCookie);
  }

  override async removeCookie(domain?: string, path?: string, key?: string): Promise<void> {
    await this.#update(() => {
      delete this.#cookies[canonicalDomain(domain) ?? domain ?? ""]?.[path ?? ""]?.[key ?? ""];
    });
  }

  override async removeCookies(domain?: string, path?: string): Promise<void> {
    await this.#update(() => {
      const canDomain = canonicalDomain(domain) ?? domain ?? "";
      // TODO: ?! WTF no cookie path permitations matching
      if (this.#cookies[canDomain]) {
        if (path)
          delete this.#cookies[canDomain][path];
        else
          delete this.#cookies[canDomain];
      }
    });
  }

  override async getAllCookies(): Promise<Cookie[]> {
    const cookies = await this.export();
    cookies.sort((a, b) => (a.creationIndex || 0) - (b.creationIndex || 0));
    return cookies;
  }

  async export(cookieStore: Store): Promise<Store>
  async export(cookieStore?: Cookie[]): Promise<Cookie[]>
  async export(cookieStore: Cookie[] | Store = []): Promise<Cookie[] | Store> {
    await this.#readFileIfNeeded();
    for (const paths of Object.values(this.#cookies)) {
      for (const cookies of Object.values(paths)) {
        for (const cookie of Object.values(cookies)) {
          if (cookieStore instanceof Store) {
            await cookieStore.putCookie(cookie);
          } else {
            cookieStore.push(cookie);
          }
        }
      }
    }
    return cookieStore;
  }
}

export default NetscapeCookieStore;