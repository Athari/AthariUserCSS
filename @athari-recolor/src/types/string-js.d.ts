declare module 'string' {
  interface StringJS {
  }

  const S: {
    //(o: unknown): StringJS;
    //VERSION: string;
    //TMPL_OPEN: string;
    //TMPL_CLOSE: string;
    extendPrototype(): void;
  };

  export = S;
}