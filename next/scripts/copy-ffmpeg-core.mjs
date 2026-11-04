import {mkdir,copyFile} from 'node:fs/promises';
import {join} from 'node:path';

const source=join(process.cwd(),'node_modules','@ffmpeg','core','dist','esm');
const destination=join(process.cwd(),'public','ffmpeg');
await mkdir(destination,{recursive:true});
await Promise.all(['ffmpeg-core.js','ffmpeg-core.wasm'].map(file=>copyFile(join(source,file),join(destination,file))));
console.log('Bundled local FFmpeg single-thread core for offline-capable AAC export');
