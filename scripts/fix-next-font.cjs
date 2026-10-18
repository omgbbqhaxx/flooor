// Next 15.3 assumes Google font URLs end in an extension. Google also
// returns /l/font?kit=... URLs; identify those downloads by their signature.
const fs = require('node:fs');
const path = require.resolve('next/dist/compiled/@next/font/dist/google/loader.js');
const source = fs.readFileSync(path, 'utf8');
const original = "const ext = /\\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl)[1];";
const diagnostic = "const match = /\\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl); if (!match) throw new Error('Unexpected font URL: ' + googleFontFileUrl); const ext = match[1];";
const replacement = `// flooor: support extensionless Google font URLs
            const signature = fontFileBuffer.subarray(0, 4).toString('ascii');
            const ext = /\\.(woff|woff2|eot|ttf|otf)(?:\\?|$)/.exec(googleFontFileUrl)?.[1]
                ?? ({ wOF2: 'woff2', wOFF: 'woff', OTTO: 'otf' }[signature])
                ?? (fontFileBuffer.readUInt32BE(0) === 0x00010000 ? 'ttf' : null);
            if (!ext) throw new Error('Unsupported Google font format: ' + googleFontFileUrl);`;
if (!source.includes('flooor: support extensionless')) {
  const target = source.includes(original) ? original : diagnostic;
  if (!source.includes(target)) throw new Error('Next font loader changed; review compatibility patch.');
  fs.writeFileSync(path, source.replace(target, replacement));
}
