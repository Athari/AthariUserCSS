import { format as prettifyCode } from 'prettier';

const basePrettierOptions = {
  tabWidth: 2, endOfLine: 'cr',
  htmlWhitespaceSensitivity: 'ignore',
  trailingComma: 'all', bracketSpacing: true, semi: true,
};

export async function prettifyCodeSafe(filepath, source, options) {
  try {
    const pretty = await prettifyCode(source, { filepath, ...basePrettierOptions, ...options });
    return pretty.trimEnd();
  } catch (ex) {
    console.log(`Failed to prettify ${filepath}, keeping formatting`);
    console.log(`${ex.message}\n${ex.stack}`);
    return source.trimEnd();
  }
}

export async function prettifyCss(filepath, css) {
  return await prettifyCodeSafe(filepath, css, { printWidth: 999 });
}

export async function prettifyHtml(filepath, html) {
  return await prettifyCodeSafe(filepath, html, { printWidth: 160 });
}