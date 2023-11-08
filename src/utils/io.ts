import fs from 'fs';
import path from 'path';
import { printError } from './print';

export function loadConfigFile(flie: string) {
  try {
    const json = fs.readFileSync(path.resolve(flie), { encoding: 'utf8' });
    const config = JSON.parse(json);
    return config;
  } catch (e) {
    printError('[Load Config Error]', e);
    process.exit();
  }
}