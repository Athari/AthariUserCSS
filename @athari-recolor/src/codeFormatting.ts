import {
  format as prettifyCode,
  Options as PrettierOptions,
} from 'prettier';
import { errorDetail } from './utils.ts';

const basePrettierOptions: PrettierOptions = {
  tabWidth: 2,
  endOfLine: 'cr',
  htmlWhitespaceSensitivity: 'ignore',
  trailingComma: 'all',
  bracketSpacing: true,
  semi: true,
};

export async function prettifyCodeSafe(filepath: string, source: string, options: Partial<PrettierOptions>): Promise<string> {
  try {
    const pretty = await prettifyCode(source, { filepath, ...basePrettierOptions, ...options });
    return pretty.trimEnd();
  } catch (ex: unknown) {
    console.log(`Failed to prettify ${filepath}, keeping formatting`);
    console.log(errorDetail(ex));
    return source.trimEnd();
  }
}

export async function prettifyCss(filepath: string, css: string): Promise<string> {
  return await prettifyCodeSafe(filepath, css, { printWidth: 999 });
}

export async function prettifyHtml(filepath: string, html: string): Promise<string> {
  return await prettifyCodeSafe(filepath, html, { printWidth: 160 });
}