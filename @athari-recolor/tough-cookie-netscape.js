import fs from 'fs/promises';
import { Cookie, Store, canonicalDomain, permuteDomain, permutePath } from 'tough-cookie';

// Based on https://www.npmjs.com/package/@root/file-cookie-store (MIT)

const NetscapeHeader = `# Netscape HTTP Cookie File
# https://everything.curl.dev/http/cookies/fileformat.html
# This is a generated file!  Do not edit.

`;

class NetscapeCookieStore extends Store {
  path
  writeMode = 0o666
  forceParse = false
  supportHttpOnly = true
  alwaysRead = false
  alwaysWrite = true

  #cookies = {}
  #isFileRead = false

  constructor(path, init = {}) {
    super();
    this.path = path;
    for (const prop of Object.getOwnPropertyNames(this))
      if (init[prop] !== undefined)
        this[prop] = init[prop];
  }

  inspect() {
    return `{ idx: ${JSON.stringify(this.#cookies, null, 2)} }`;
  }

  async readFile() {
    try {
      this.deserialize(await fs.readFile(this.path, 'utf8'));
      this.#isFileRead = true
    } catch (ex) {
      if (ex.code === 'ENOENT') {
        await fs.writeFile(this.path, NetscapeHeader);
        return;
      }
      throw ex;
    }
  }

  async #readFileIfNeeded() {
    if (this.#isFileRead && !this.alwaysRead)
      return;
    await this.readFile();
  }

  async writeFile() {
    await fs.writeFile(this.path, this.serialize(), { mode: this.writeMode });
  }

  async #writeFileIfNeeded() {
    if (!this.alwaysWrite)
      return;
    await this.writeFile();
  }

  async #update(updateFn) {
    await this.#readFileIfNeeded();
    updateFn();
    await this.#writeFileIfNeeded();
  }

  serialize() {
    const boolStr = b => b ? 'TRUE' : 'FALSE';
    let lines = [ NetscapeHeader ];
    for (const paths of this.#cookies) {
      for (const keys of paths) {
        for (const cookie of keys) {
          if (cookie) {
            const { domain, path, secure, expires, key, value, httpOnly } = cookie;
            const domainLine = this.supportHttpOnly && httpOnly ? `#HttpOnly_${domain}` : domain;
            const expiresLine = expires && expires !== 'Infinity' ? Math.round(expires.getTime() / 1000) : 0;
            const line = [ domainLine, boolStr(/^\./.test(domain)), path, boolStr(secure), expiresLine, key, value ].join("\t");
            lines.push(line);
          }
        }
      }
    }
    return lines.join("\n");
  }

  deserialize(text) {
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

      const [ domain, , path, secure, expires, key, value ] = parsedLineParts;
      const canDomain = canonicalDomain(domain);
      this.#addCookie(new Cookie({
        domain: canDomain,
        path,
        secure: secure === 'TRUE',
        expires: parseInt(expires) ? new Date(expires * 1000) : 'Infinity',
        key,
        value,
        httpOnly,
        hostOnly: !/^\./.test(domain),
      }));
    }
  }

  async findCookie(domain, path, key) {
    await this.#readFileIfNeeded();
    return this.#cookies[canonicalDomain(domain)]?.[path]?.[key] ?? null;
  }

  async findCookies(domain, path) {
    if (!domain)
      return [];

    const v = Object.values;

    await this.#readFileIfNeeded();
    const canDomain = canonicalDomain(domain);
    const matchedDomains = permuteDomain(canDomain) || [ canDomain ];

    const results = [];
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
        const matchedPaths = permutePath(path) || [ path ];
        for (const matchedPath of matchedPaths) {
          const pathCookies = domainCookies[matchedPath];
          if (pathCookies)
            results.push(...v(pathCookies).flatMap(v));
        }
      }
    }
    return results;
  }

  #addCookie(cookie) {
    const domain = cookie.canonicalizedDomain();
    this.#cookies[domain] ??= {};
    this.#cookies[domain][cookie.path] ??= {};
    this.#cookies[domain][cookie.path][cookie.key] = cookie;
  }

  async putCookie(cookie) {
    await this.#update(() =>
      this.#addCookie(cookie));
  }

  async updateCookie(oldCookie, newCookie) {
    await this.putCookie(newCookie);
  }

  async removeCookie(domain, path, key) {
    await this.#update(() => {
      delete this.#cookies[canonicalDomain(domain)]?.[path]?.[key];
    });
  }

  async removeCookies(domain, path) {
    await this.#update(() => {
      const canDomain = canonicalDomain(domain);
      // TODO: ?! WTF no cookie path permitations matching
      if (this.#cookies[canDomain]) {
        if (path) {
          delete this.#cookies[canDomain][path];
        } else {
          delete this.#cookies[canDomain];
        }
      }
    });
  }

  async getAllCookies() {
    const cookies = await this.export();
    cookies.sort((a, b) => (a.creationIndex || 0) - (b.creationIndex || 0));
    return cookies;
  }

  async export(cookieStore = []) {
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